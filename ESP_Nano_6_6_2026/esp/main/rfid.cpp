#include "rfid.h"
#include "wifi.h"
#include <SPI.h>
#include <MFRC522.h>
#include <Arduino.h>
#include <time.h>
#include <ArduinoJson.h>

#define NUM_SLOT 4
#define RST_PIN 255  // unused
#define SS_IN 15     // D8 (IN)
#define SS_OUT 2     // D4 (OUT)

MFRC522 rfid_in(SS_IN, RST_PIN);
MFRC522 rfid_out(SS_OUT, RST_PIN);

LocalSlot localSlots[NUM_SLOT];
String lastUID = "";
unsigned long lastScanTime = 0;
const unsigned long scanDelay = 3000;

byte lastVersionIn = 0x92;
byte lastVersionOut = 0x92;
unsigned long prevMillis_RFID = 0;
const unsigned long interval_RFID = 2000;

void timeInit() {
  Serial.println("Start time init");
  configTime(7 * 3600, 0, "pool.ntp.org");
  Serial.println("done config time");
  unsigned long startAttemptTime = millis();

  while (time(nullptr) < 100000) {
    if (millis() - startAttemptTime > 5000) {
      Serial.println("[time] Restarting ESP");
      ESP.restart();
    }
    delay(100);
  }
}

String getTimeString() {
  time_t now = time(nullptr);
  struct tm* t = localtime(&now);

  char buffer[30];
  strftime(buffer, sizeof(buffer), "%H:%M:%S", t);
  return String(buffer);
}

String getDateString() {
  time_t now = time(nullptr);
  struct tm* t = localtime(&now);

  char buffer[30];
  strftime(buffer, sizeof(buffer), "%d/%m/%Y", t);
  return String(buffer);
}

void syncSlot(String payload) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, payload);

  if (!error) {
    JsonArray slotsArr = doc["slots"];
    for (int i = 0; i < NUM_SLOT; i++) {
      localSlots[i].id = slotsArr[i]["id"];
      localSlots[i].isOccupied = slotsArr[i]["isOccupied"];
      localSlots[i].isBookedWeb = slotsArr[i]["isBookedWeb"];
      localSlots[i].bookId = slotsArr[i]["bookId"].as<String>();
    }
    Serial.println("syncSlot ok");
  }
}

int findAvailableSlotLocally() {
  for (int i = 0; i < NUM_SLOT; i++) {
    if (!localSlots[i].isOccupied && !localSlots[i].isBookedWeb) {
      return i;
    }
  }
  return -1;
}

int findBookedSlotByIdLocally(String id) {
  for (int i = 0; i < NUM_SLOT; i++) {
    if (localSlots[i].isBookedWeb && localSlots[i].bookId == id) {
      return i;
    }
  }
  return -1;
}

void RFIDInit() {
  SPI.begin();

  rfid_in.PCD_Init();
  rfid_in.PCD_SetAntennaGain(MFRC522::RxGain_max);
  rfid_in.PCD_DumpVersionToSerial();

  rfid_out.PCD_Init();
  rfid_out.PCD_SetAntennaGain(MFRC522::RxGain_max);
  rfid_out.PCD_DumpVersionToSerial();

  Serial.println("done rfid init");
  timeInit();
  Serial.println("full rfid init");
}

void checkRFIDStatus() {
  if (millis() - prevMillis_RFID > 2000) {
    prevMillis_RFID = millis();
    byte versionIn = rfid_in.PCD_ReadRegister(MFRC522::VersionReg);
    if (versionIn == 0x00 || versionIn == 0xFF || versionIn == 0x88) {
      if (lastVersionIn != versionIn) {
        Serial.println("Restart RFID in");
        rfid_in.PCD_DumpVersionToSerial();
      }
      rfid_in.PCD_Init();
    } else if (lastVersionIn == 0x00 || lastVersionIn == 0xFF || lastVersionIn == 0x88) {
      Serial.println("RFID in ok");
      rfid_in.PCD_DumpVersionToSerial();
    }
    lastVersionIn = versionIn;

    byte versionOut = rfid_out.PCD_ReadRegister(MFRC522::VersionReg);
    if (versionOut == 0x00 || versionOut == 0xFF || versionOut == 0x88) {
      if (lastVersionOut != versionOut) {
        Serial.println("Restart RFID out");
        rfid_out.PCD_DumpVersionToSerial();
      }
      rfid_out.PCD_Init();
    } else if (lastVersionOut == 0x00 || lastVersionOut == 0xFF || lastVersionOut == 0x88) {
      Serial.println("RFID out ok");
      rfid_out.PCD_DumpVersionToSerial();
    }
    lastVersionOut = versionOut;
  }
}

RFIDInfo readRFID() {
  RFIDInfo info;
  String RFID_IN_OUT = "";
  MFRC522* currentRFID = nullptr;

  if (rfid_in.PICC_IsNewCardPresent() && rfid_in.PICC_ReadCardSerial()) {
    currentRFID = &rfid_in;
    RFID_IN_OUT = "IN";
  } else if (rfid_out.PICC_IsNewCardPresent() && rfid_out.PICC_ReadCardSerial()) {
    currentRFID = &rfid_out;
    RFID_IN_OUT = "OUT";
  }
  if (currentRFID == nullptr) return info;

  String currentUID = "";
  for (byte i = 0; i < currentRFID->uid.size; i++) {
    if (currentRFID->uid.uidByte[i] < 0x10) currentUID += "0";
    currentUID += String(currentRFID->uid.uidByte[i], HEX);
  }
  // 579B8125
  // 1A022F35
  // C7CEF2A2
  // 07006DA3
  currentUID.toUpperCase();

  if (currentUID == lastUID && millis() - lastScanTime < scanDelay) {
    return info;
  }

  lastUID = currentUID;
  lastScanTime = millis();

  info.id = currentUID;

  if (RFID_IN_OUT == "IN") {
    info.type = "in";

    int bookedSlotIndex = findBookedSlotByIdLocally(currentUID);
    if (bookedSlotIndex == -1) {
      int slotIndex = findAvailableSlotLocally();
      if (slotIndex == -1) {
        info.id = "";
        return info;
      }
    }

    info.date = getDateString();
    info.checkin = getTimeString();
    info.servoOpen = "servoIn";
  } else if (RFID_IN_OUT == "OUT") {
    info.type = "out";
    info.checkout = getTimeString();
    info.servoOpen = "servoOut";
  }

  currentRFID->PICC_HaltA();

  return info;
}

String RFIDPayload(RFIDInfo& info) {
  String payload = "{";

  payload += "\"id\":\"" + info.id + "\",";
  payload += "\"type\":\"" + info.type + "\"";

  if (info.type == "in") {
    payload += ",\"date\":\"" + info.date + "\",";
    payload += "\"checkin\":\"" + info.checkin + "\"";
  } else if (info.type == "out") {
    payload += ",\"checkout\":\"" + info.checkout + "\"";
  }

  payload += ",\"servoOpen\":\"" + info.servoOpen + "\"";
  payload += "}";

  return payload;
}