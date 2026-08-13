import time
import cv2
import paho.mqtt.client as mqtt
from ultralytics import YOLO
import json
import ssl
import os
from collections import deque

# ==========================================
# Cáº¤U HÃŒNH â€” chá»‰nh sá»­a táº¡i Ä‘Ã¢y
# ==========================================

# --- ThÃ´ng sá»‘ thá»i gian (giÃ¢y) ---
TIMEOUT_OVERLAP  = 10    # Rule 1: Ä‘Ã¨ 2 váº¡ch liÃªn tá»¥c bao lÃ¢u thÃ¬ pháº¡t
TIMEOUT_PARKING  = 30    # Rule 2: lang thang khÃ´ng Ä‘á»— bao lÃ¢u thÃ¬ pháº¡t
TIMEOUT_R3       = 10    # Rule 3: Ä‘á»— vÃ o chá»— ngÆ°á»i khÃ¡c bao lÃ¢u má»›i báº¯t Ä‘áº§u tÃ­nh

# --- Biá»ƒu phÃ­ ---
RATE_PER_SECOND     = 1.0   # Ä‘Æ¡n vá»‹ tiá»n / giÃ¢y (thá»i gian bÃ¬nh thÆ°á»ng)
RATE_MULTIPLIER_R3  = 3.0   # há»‡ sá»‘ nhÃ¢n phÃ­ khi vi pháº¡m Rule 3

# --- Káº¿t ná»‘i MQTT ---
MQTT_HOST     = os.getenv("MQTT_HOST", "your-cluster.s1.eu.hivemq.cloud")
MQTT_PORT     = int(os.getenv("MQTT_PORT", "8883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "your_mqtt_username")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "your_mqtt_password")
MQTT_TOPIC_RFID  = "parking/rfid"
MQTT_TOPIC_SLOTS = "parking/slots"

# --- Camera ---
CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))

# --- VÃ¹ng & Ã´ Ä‘á»— (pixel) ---
ENTRY_ZONE = [125, 41, 581, 443]   # [x1, y1, x2, y2]

PARKING_SLOTS = {
    "A1": [440, 353, 566, 436],
    "A2": [440, 241, 566, 320],
    "A3": [142, 353, 268, 436],
    "A4": [142, 241, 268, 320],
}

ID_TO_SLOT = {0: "A1", 1: "A2", 2: "A3", 3: "A4"}

# ==========================================
# TRáº NG THÃI TOÃ€N Cá»¤C
# ==========================================

pending_rfid_queue = deque()

slot_data = {
    "A1": {"isOccupied": False, "bookId": ""},
    "A2": {"isOccupied": False, "bookId": ""},
    "A3": {"isOccupied": False, "bookId": ""},
    "A4": {"isOccupied": False, "bookId": ""},
}

active_cars = {}

# ==========================================
# HÃ€M TIá»†N ÃCH
# ==========================================

def is_in_zone(box, zone):
    cx = (box[0] + box[2]) / 2
    cy = (box[1] + box[3]) / 2
    return zone[0] < cx < zone[2] and zone[1] < cy < zone[3]


def is_overlapping(box, zone):
    return not (box[2] < zone[0] or box[0] > zone[2] or
                box[3] < zone[1] or box[1] > zone[3])


def calculate_fee(car, now):
    """
    Tráº£ vá» (fee, r3_duration, normal_time, violation_duration)
    - r3_duration      : tá»•ng thá»i gian vi pháº¡m Rule 3 (tÃ­nh phÃ­ x3)
    - normal_time      : thá»i gian khÃ´ng vi pháº¡m R3
    - violation_duration: tá»•ng thá»i gian ANY rule Ä‘ang active (hiá»ƒn thá»‹ "Sai:Xs")
    """
    total_time  = now - car["session_start"]

    # Thá»i gian vi pháº¡m R3 (tÃ­nh phÃ­ nhÃ¢n 3)
    r3_duration = car["rule3_duration"]
    if car["rule3_start"] is not None and car["rule3_active"]:
        r3_duration += now - car["rule3_start"]

    normal_time = max(0.0, total_time - r3_duration)
    fee = (normal_time * RATE_PER_SECOND
           + r3_duration * RATE_PER_SECOND * RATE_MULTIPLIER_R3)

    # Tá»•ng thá»i gian vi pháº¡m báº¥t ká»³ rule nÃ o (hiá»ƒn thá»‹ Ä‘á»“ng há»“ "Sai")
    vio_dur = car["violation_duration"]
    if car["violation_start"] is not None:
        vio_dur += now - car["violation_start"]

    return round(fee, 2), round(r3_duration, 1), round(normal_time, 1), round(vio_dur, 1)


def new_car_state(rfid, now):
    return {
        "rfid":              rfid,
        "session_start":     now,
        "entry_time":        now,
        "parked_at":         None,
        # Rule 1
        "double_park_start": None,
        "overlap_logged":    False,
        # Rule 2  (tracked qua entry_time + violations dict)
        # Rule 3
        "rule3_start":       None,
        "rule3_active":      False,
        "rule3_duration":    0.0,
        # Äá»“ng há»“ vi pháº¡m tá»•ng há»£p (báº¥t ká»³ rule nÃ o active)
        "violation_start":   None,
        "violation_duration": 0.0,
        # Danh sÃ¡ch vi pháº¡m Ä‘Ã£ kÃ­ch hoáº¡t
        "violations":        {},
    }


def publish_camera_slot(rfid_id, slot_name, status):
    payload = {
        "id":     rfid_id,
        "slot":   slot_name,
        "status": status   # park_in / left_out / park_out / steal
    }
    mqtt_client.publish("camera/slots", json.dumps(payload))
    print(f"[MQTT Publish] {payload}")

# ==========================================
# MQTT RECEIVER
# ==========================================

def on_message(client, userdata, msg):
    try:
        topic = msg.topic
        data  = json.loads(msg.payload.decode("utf-8"))

        if topic == MQTT_TOPIC_RFID:
            rfid_id    = data.get("id")
            event_type = data.get("type")
            if rfid_id and event_type == "in":
                pending_rfid_queue.append(rfid_id)
                print(f"[MQTT] RFID vao: {rfid_id}")

        elif topic == MQTT_TOPIC_SLOTS:
            changed = False
            for slot in data.get("slots", []):
                slot_name = ID_TO_SLOT.get(slot.get("id"))
                if not slot_name:
                    continue
                new_occupied = slot.get("isOccupied", False)
                new_book_id  = slot.get("bookId", slot_data[slot_name]["bookId"])
                if (slot_data[slot_name]["isOccupied"] != new_occupied or
                        slot_data[slot_name]["bookId"] != new_book_id):
                    changed = True
                slot_data[slot_name]["isOccupied"] = new_occupied
                slot_data[slot_name]["bookId"]     = new_book_id
            if changed:
                print(f"[MQTT] Slot update: {slot_data}")

    except json.JSONDecodeError:
        print(f"[MQTT] Payload loi: {msg.payload}")


def on_disconnect(client, userdata, rc):
    print(f"[MQTT] Mat ket noi (rc={rc}), dang thu lai...")
    while True:
        try:
            client.reconnect()
            print("[MQTT] Ket noi lai thanh cong")
            break
        except Exception as e:
            print(f"[MQTT] Reconnect that bai: {e}, thu lai sau 5s")
            time.sleep(5)


mqtt_client = mqtt.Client()
mqtt_client.on_message    = on_message
mqtt_client.on_disconnect = on_disconnect
mqtt_client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
mqtt_client.tls_set(tls_version=ssl.PROTOCOL_TLS)
mqtt_client.connect(MQTT_HOST, MQTT_PORT, 60)
mqtt_client.subscribe(MQTT_TOPIC_RFID)
mqtt_client.subscribe(MQTT_TOPIC_SLOTS)
mqtt_client.loop_start()

# ==========================================
# CAMERA & YOLO MAIN LOOP
# ==========================================

model = YOLO("best.pt")
cap   = cv2.VideoCapture(CAMERA_INDEX)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    results = model.track(frame, persist=True, tracker="botsort.yaml", verbose=False)

    current_ids = set()

    if results[0].boxes.id is not None:
        boxes     = results[0].boxes.xyxy.cpu().numpy()
        track_ids = results[0].boxes.id.cpu().numpy()
        now       = time.time()

        for box, track_id in zip(boxes, track_ids):
            x1, y1, x2, y2 = map(int, box)
            current_ids.add(track_id)

            # --------------------------------------------------
            # BÆ¯á»šC 1 â€” GÃ¡n RFID cho xe má»›i vÃ o Entry Zone
            # --------------------------------------------------
            if track_id not in active_cars:
                if is_in_zone(box, ENTRY_ZONE) and pending_rfid_queue:
                    rfid = pending_rfid_queue.popleft()
                    active_cars[track_id] = new_car_state(rfid, now)
                    print(f"[*] Gan RFID {rfid} -> Track {track_id}")

            if track_id not in active_cars:
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                cv2.putText(frame, "Unknown", (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                continue

            car      = active_cars[track_id]
            car_rfid = car["rfid"]

            # --------------------------------------------------
            # BÆ¯á»šC 2 â€” TÃ¬m cÃ¡c Ã´ Ä‘ang bá»‹ xe Ä‘Ã¨ lÃªn
            # --------------------------------------------------
            overlapping_slots = [
                name for name, coords in PARKING_SLOTS.items()
                if is_overlapping(box, coords)
            ]

            # --------------------------------------------------
            # RULE 1 â€” ÄÃ¨ 2 váº¡ch liÃªn tá»¥c > TIMEOUT_OVERLAP
            # --------------------------------------------------
            r1_active = False

            if len(overlapping_slots) >= 2:
                if car["double_park_start"] is None:
                    car["double_park_start"] = now
                    if not car["overlap_logged"]:
                        print(f"[R1] {car_rfid} bat dau de: {overlapping_slots}")
                        car["overlap_logged"] = True
                elif now - car["double_park_start"] >= TIMEOUT_OVERLAP:
                    r1_active = True
                    err = "Phat: De 2 vach"
                    if err not in car["violations"]:
                        car["violations"][err] = now
                        print(f"[R1] {car_rfid} de 2 vach qua {TIMEOUT_OVERLAP}s")
            else:
                car["double_park_start"] = None
                car["overlap_logged"]    = False

            # --------------------------------------------------
            # BÆ¯á»šC 3 â€” XÃ¡c Ä‘á»‹nh Ã´ Ä‘ang Ä‘á»— thá»±c táº¿ (IR bÃ¡o occupied)
            # --------------------------------------------------
            parked_in_slot = None
            for slot_name in overlapping_slots:
                if slot_data[slot_name]["isOccupied"]:
                    parked_in_slot = slot_name
                    break

            prev_slot = car["parked_at"]

            # --- KIá»‚M TRA Sá»° THAY Äá»”I CHá»– Äá»– ---
            if parked_in_slot != prev_slot:
                if prev_slot is not None:
                    publish_camera_slot(car_rfid, prev_slot, "left_out")
                    if slot_data[prev_slot]["bookId"] == car_rfid:
                        slot_data[prev_slot]["bookId"] = ""
                        print(f"[*] Giai phong bookId {car_rfid} khoi {prev_slot}")

                if parked_in_slot is not None:
                    book_id = slot_data[parked_in_slot]["bookId"]
                    if book_id == "":
                        slot_data[parked_in_slot]["bookId"] = car_rfid
                        print(f"[*] Gan bookId tu dong {car_rfid} -> {parked_in_slot}")
                        publish_camera_slot(car_rfid, parked_in_slot, "park_in")
                    elif book_id == car_rfid:
                        publish_camera_slot(car_rfid, parked_in_slot, "park_in")
                    else:
                        print(f"[Canh bao] {car_rfid} dang chiem cho cua {book_id} tai {parked_in_slot}")

                car["parked_at"] = parked_in_slot

            # --------------------------------------------------
            # RULE 3 â€” CÆ°á»›p chá»— (Steal) sau TIMEOUT_R3
            # --------------------------------------------------
            currently_r3_violate = False
            r3_active = False

            if parked_in_slot:
                book_id = slot_data[parked_in_slot]["bookId"]
                if book_id != "" and book_id != car_rfid:
                    currently_r3_violate = True

                    if car["rule3_start"] is None:
                        car["rule3_start"]  = now
                        car["rule3_active"] = False
                        print(f"[R3] {car_rfid} vao cho cua {book_id}. Cho {TIMEOUT_R3}s...")

                    elif not car["rule3_active"] and now - car["rule3_start"] >= TIMEOUT_R3:
                        car["rule3_active"] = True
                        err = "Phat: Cuop cho"
                        if err not in car["violations"]:
                            car["violations"][err] = now
                        publish_camera_slot(car_rfid, parked_in_slot, "steal")
                        print(f"[STEAL EFFECT] Huy bookId cua {book_id}. Slot {parked_in_slot} thuoc ve {car_rfid}")
                        slot_data[parked_in_slot]["bookId"] = car_rfid

                    if car["rule3_active"]:
                        r3_active = True

            if not currently_r3_violate and car["rule3_start"] is not None:
                if car["rule3_active"]:
                    car["rule3_duration"] += now - car["rule3_start"]
                    print(f"[R3] {car_rfid} roi cho sai â€” ngung tinh gio phat x3")
                else:
                    print(f"[R3] {car_rfid} lui ra kip thoi truoc {TIMEOUT_R3}s â€” Khong phat")
                car["rule3_start"]  = None
                car["rule3_active"] = False

            # --------------------------------------------------
            # RULE 2 â€” Lang thang > TIMEOUT_PARKING
            # Bá» qua (reset timer) náº¿u R1 Ä‘ang active
            # --------------------------------------------------
            r2_active = False

            if parked_in_slot:
                # Äang Ä‘á»— há»£p lá»‡ â†’ reset timer lang thang
                car["entry_time"] = now
            elif r1_active:
                # Äang vi pháº¡m R1 (Ä‘Ã¨ 2 váº¡ch) â†’ khÃ´ng tÃ­nh lang thang
                car["entry_time"] = now
            else:
                time_moving = now - car["entry_time"]
                if time_moving >= TIMEOUT_PARKING:
                    err = "Phat: Lang thang"
                    if err not in car["violations"]:
                        car["violations"][err] = now
                        print(f"[R2] {car_rfid} lang thang qua {TIMEOUT_PARKING}s")
                    r2_active = True

            # --------------------------------------------------
            # VIOLATION TIMER Tá»”NG Há»¢P â€” báº¥t ká»³ rule nÃ o active
            # --------------------------------------------------
            any_violation_active = r1_active or r2_active or r3_active

            if any_violation_active:
                if car["violation_start"] is None:
                    car["violation_start"] = now
                    print(f"[VIO] {car_rfid} bat dau tinh gio vi pham tong hop")
            else:
                if car["violation_start"] is not None:
                    car["violation_duration"] += now - car["violation_start"]
                    car["violation_start"] = None
                    print(f"[VIO] {car_rfid} ket thuc vi pham â€” tong: {car['violation_duration']:.1f}s")

            # --------------------------------------------------
            # UI DRAWING
            # --------------------------------------------------
            fee, r3_dur, normal_dur, vio_dur = calculate_fee(car, now)

            # MÃ u box
            if r1_active or r2_active or r3_active:
                box_color = (0, 0, 255)      # Ä‘á» â€” Ä‘ang vi pháº¡m
            elif currently_r3_violate and not car["rule3_active"]:
                box_color = (0, 165, 255)    # cam â€” cáº£nh bÃ¡o sáº¯p cÆ°á»›p chá»—
            elif parked_in_slot:
                box_color = (0, 255, 0)      # xanh lÃ¡ â€” Ä‘á»— há»£p lá»‡
            else:
                box_color = (0, 165, 255)    # cam â€” Ä‘ang di chuyá»ƒn

            # NhÃ£n tráº¡ng thÃ¡i
            if r1_active:
                parking_status = "Vi pham: De 2 vach"
            elif r2_active:
                parking_status = "Vi pham: Lang thang"
            elif parked_in_slot:
                parking_status = f"Da do: {parked_in_slot}"
            elif r1_active is False and car["double_park_start"] is not None:
                parking_status = "Canh bao: De 2 vach"
            else:
                time_moving = now - car["entry_time"]
                if time_moving >= TIMEOUT_PARKING / 2:
                    parking_status = f"Canh bao: {int(TIMEOUT_PARKING - time_moving)}s"
                else:
                    parking_status = f"Di chuyen: {int(time_moving)}s"

            cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
            cv2.putText(frame, f"ID:{car_rfid} | {parking_status}",
                        (x1, y1 - 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, box_color, 2)
            cv2.putText(frame, f"Sai:{vio_dur}s",
                        (x1, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 0), 1)

            # Cáº£nh bÃ¡o sáº¯p bá»‹ tÃ­nh R3
            if currently_r3_violate and not car["rule3_active"] and car["rule3_start"]:
                wait_left = TIMEOUT_R3 - (now - car["rule3_start"])
                cv2.putText(frame, f"Canh bao cuop cho: {int(wait_left)}s",
                            (x1, y1 - 40), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 1)

            # Danh sÃ¡ch vi pháº¡m
            y_off = y2 + 20
            for v in car["violations"]:
                cv2.putText(frame, v, (x1, y_off),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255), 2)
                y_off += 22

    # --------------------------------------------------
    # Xá»¬ LÃ XE Rá»œI KHá»ŽI BÃƒI â€” PUBLISH PARK_OUT
    # --------------------------------------------------
    vanished = [tid for tid in active_cars if tid not in current_ids]
    for tid in vanished:
        car      = active_cars.pop(tid)
        car_rfid = car["rfid"]

        publish_camera_slot(car_rfid, "", "park_out")

        if car["parked_at"]:
            slot_name = car["parked_at"]
            publish_camera_slot(car_rfid, slot_name, "left_out")
            if slot_data[slot_name]["bookId"] == car_rfid:
                slot_data[slot_name]["bookId"] = ""

        print(f"[*] Track {tid} (RFID {car_rfid}) roi khung hinh â€” Da gui park_out.")

    # --------------------------------------------------
    # Váº¼ ENTRY ZONE & 4 Ã” Äá»– CHI TIáº¾T
    # --------------------------------------------------
    cv2.rectangle(frame,
                  (ENTRY_ZONE[0], ENTRY_ZONE[1]),
                  (ENTRY_ZONE[2], ENTRY_ZONE[3]),
                  (255, 0, 0), 2)
    cv2.putText(frame, "Entry Zone",
                (ENTRY_ZONE[0], ENTRY_ZONE[1] - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)

    for spot_name, coords in PARKING_SLOTS.items():
        occupied   = slot_data[spot_name]["isOccupied"]
        book_id    = slot_data[spot_name]["bookId"]
        spot_color = (0, 0, 255) if occupied else (255, 255, 255)

        cv2.rectangle(frame,
                      (coords[0], coords[1]),
                      (coords[2], coords[3]),
                      spot_color, 1)
        cv2.putText(frame, spot_name,
                    (coords[0], coords[1] + 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, spot_color, 1)
        if book_id:
            cv2.putText(frame, book_id,
                        (coords[0], coords[1] + 38),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1)

    cv2.imshow("Parking System", frame)
    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()
mqtt_client.loop_stop()
