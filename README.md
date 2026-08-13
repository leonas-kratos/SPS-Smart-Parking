# Smart Parking System — Group 9

## Members

- Nguyễn Đức Anh Tuấn
- Đặng Minh Đức
- Đinh Trọng Hiếu
- Tăng Quang Dũng
- Vũ Nhật Quang

## Overview

This repository contains Group 9's IoT smart-parking prototype for **ELT3244 - IoT and Applications** at VNU University of Engineering and Technology. The project received a **score of 9/10** for the course. The system combines RFID access control, AI computer vision, infrared occupancy sensing, gas safety monitoring, MQTT messaging, automated barriers, and a web dashboard with online reservations.

The central contribution is Vehicle-to-Slot Association (VSA): RFID identifies a vehicle at the gate, YOLOv8/BotSORT tracks it inside the parking area, and IR sensors confirm the physical slot. Together these signals map a vehicle ID to a concrete slot (A1–A4) in real time.

## Features

- RFID check-in/check-out with automatic ESP8266 servo barriers.
- Four-slot occupancy monitoring using IR sensors and an Arduino Nano 33 IoT.
- YOLOv8 vehicle detection and BotSORT tracking on the processing computer.
- FIFO RFID-to-track matching and camera/IR dual confirmation.
- Online booking and cancellation from the web interface.
- Three camera rules: double-parking/line crossing, excessive roaming, and occupying another vehicle's reserved slot.
- Violation-aware fee calculation and real-time UI updates.
- MQ-2 gas warnings and parking-state synchronization through MQTT.
- Backend authentication, MongoDB vehicle logs, sensor status, and revenue APIs.
- Admin dashboard for parking status, vehicle history, and revenue.

## Architecture

`Perception → Processing → Communication → Application`

- **Perception:** RC522 RFID readers, ESP8266 gate node, Nano 33 IoT, IR slot sensors, MQ-2, servo barriers, and camera.
- **Processing:** `ai_camera/camera_parking.py` runs YOLO tracking, VSA, slot association, violation timers, and camera event publishing.
- **Communication:** HiveMQ Cloud MQTT connects devices, camera, backend, and browser clients.
- **Application:** `web/backend` provides the Express/MongoDB API; `web/frontend` provides the browser dashboard.

## Repository layout

- `ai_camera/` — Python camera tracker, coordinate helper, and YOLO model (`best.pt`).
- `ESP_Nano_6_6_2026/esp/` — ESP8266 RFID/barrier firmware.
- `ESP_Nano_6_6_2026/nano/` — Arduino Nano 33 IoT slot/sensor firmware.
- `web/backend/` — Express API, MongoDB models, authentication, and MQTT bridge.
- `web/frontend/` — HTML/CSS/JavaScript user and admin dashboard.
- `Báo_cáo_IOT_Cuối_kì.pdf` — detailed Vietnamese technical report.
- `Slide_Smart_Parking_System.pdf` — presentation slides.
- `Video_SPS.mp4` — demonstration video.

## MQTT topics

- `parking/rfid` — gate RFID events and entry/exit logs.
- `parking/slots` — occupancy, booking, and slot state.
- `parking/book` — web booking commands.
- `camera/slots` — camera events (`park_in`, `left_out`, `park_out`, `steal`).
- `warning/gas` and `warning/flood` — safety warnings.

## Setup

### 1. Backend

```powershell
cd web/backend
npm install
Copy-Item .env.example .env
# Edit .env with MongoDB, JWT, and HiveMQ credentials
npm run dev
```

The API listens on `PORT` (5000 by default). Do not commit `.env`.

### 2. Frontend

Edit `web/frontend/js/config.js` with the backend URL and HiveMQ WebSocket credentials. Serve `web/frontend` from a static HTTP server; ES modules and MQTT WebSockets should not be opened directly with `file://`.

### 3. AI camera

Install Python dependencies for OpenCV, Paho MQTT, and Ultralytics YOLO. Copy the example environment values into your shell, then run:

```powershell
cd ai_camera
$env:MQTT_HOST = "your-cluster.s1.eu.hivemq.cloud"
$env:MQTT_PORT = "8883"
$env:MQTT_USERNAME = "your_mqtt_username"
$env:MQTT_PASSWORD = "your_mqtt_password"
python camera_parking.py
```

Adjust `CAMERA_INDEX`, `ENTRY_ZONE`, and `PARKING_SLOTS` for the installed camera and physical model. `best.pt` must be present beside the script.

### 4. Firmware

Open each `.ino` project in Arduino IDE, install the board/library dependencies used by the source, and replace the `YOUR_*` Wi-Fi and MQTT placeholders in the corresponding `wifi.cpp`. Flash the ESP8266 gate node and Nano 33 IoT sensor node separately.

## Security

Credentials from the original local project were removed from tracked files and replaced with placeholders. Create fresh MQTT, Wi-Fi, MongoDB, and JWT credentials for deployment, and rotate any credentials that were previously embedded in the original files.

## Limitations and future work

The prototype was evaluated on a four-slot model and camera performance depends on lighting and occlusion. Planned improvements include license-plate recognition, multi-camera/multi-floor hand-off, low-light robustness, integrated payment, and traffic prediction.

## License

See `LICENSE`.

