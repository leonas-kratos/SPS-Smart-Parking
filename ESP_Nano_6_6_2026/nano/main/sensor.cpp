#include "sensor.h"
#include "wifi.h"
#include <Arduino.h>
#include <ArduinoJson.h>

#define IR_PINS \
  { 2, 3, 4, 5 }      // D2, D3, D4, D5
#define GAS_PIN A0    // A0
#define WATER_PIN A1  // A1
#define WEB_TIMEOUT 120000
#define GAS_MAX 1
#define WATER_MAX 20

Slot slots[NUM_SLOT];
Gas gas;
Water water;

static int irPins[NUM_SLOT] = IR_PINS;
static bool lastOccupied[NUM_SLOT] = { false, false, false, false };
static bool lastBookedWeb[NUM_SLOT] = { false, false, false, false };
unsigned long webTime[NUM_SLOT] = { 0, 0, 0, 0 };

static bool enoughGas = false;
static int gasCnt = 0;
static int gasValues[GAS_MAX] = { 0 };
static String lastGasWarning = "";

static bool enoughWater = false;
static int waterCnt = 0;
static int waterValues[WATER_MAX] = { 0 };
static String lastWaterWarning = "";

void sensorInit() {
  for (int i = 0; i < NUM_SLOT; i++) {
    pinMode(irPins[i], INPUT_PULLUP);
    slots[i].id = i;
    slots[i].isBookedWeb = false;
  }
}

void readSensor() {
  for (int i = 0; i < NUM_SLOT; i++) {
    slots[i].isOccupied = !digitalRead(irPins[i]);
    if (slots[i].isOccupied) {
      slots[i].isBookedWeb = false;
    }
  }

  gasValues[gasCnt++] = analogRead(GAS_PIN);
  waterValues[waterCnt++] = analogRead(WATER_PIN);
  if (gasCnt >= GAS_MAX) enoughGas = true;
  if (waterCnt >= WATER_MAX) enoughWater = true;
  gasCnt %= GAS_MAX;
  waterCnt %= WATER_MAX;
}

String slotPayload() {
  String payload = "{\"slots\":[";

  for (int i = 0; i < NUM_SLOT; i++) {
    payload += "{";
    payload += "\"id\":" + String(slots[i].id) + ",";
    payload += "\"isOccupied\":" + String(slots[i].isOccupied ? "true" : "false") + ",";
    payload += "\"isBookedWeb\":" + String(slots[i].isBookedWeb ? "true" : "false") + ",";
    payload += "\"bookId\":\"" + slots[i].bookId + "\"";

    payload += "}";
    if (i < NUM_SLOT - 1) payload += ",";
  }

  payload += "]}";
  return payload;
}

String gasPayload() {
  if (!enoughGas) return "";

  int sum = 0;
  for (int i = 0; i < GAS_MAX; i++) {
    sum += gasValues[i];
  }
  gas.analogValue = sum / GAS_MAX;

  if (gas.analogValue <= 135) {
    gas.warning = "GAS!";
  } else {
    gas.warning = "No gas";
  }

  String payload = "{";
  payload += "\"analog\":" + String(gas.analogValue) + ",";
  payload += "\"warning\":\"" + gas.warning + "\"";
  payload += "}";

  return payload;
}

String waterPayload() {
  if (!enoughWater) return "";

  int sum = 0;
  for (int i = 0; i < WATER_MAX; i++) {
    sum += waterValues[i];
  }
  water.analogValue = sum / WATER_MAX;

  if (water.analogValue > 400) {
    water.warning = "FLOOD!";
  } else {
    water.warning = "No flood";
  }

  String payload = "{";
  payload += "\"analog\":" + String(water.analogValue) + ",";
  payload += "\"warning\":\"" + water.warning + "\"";
  payload += "}";

  return payload;
}

void updateBookSlot() {
  for (int i = 0; i < NUM_SLOT; i++) {
    if (slots[i].isBookedWeb && !slots[i].isOccupied) {
      if (millis() - webTime[i] > WEB_TIMEOUT) {  // 2p
        slots[i].isBookedWeb = false;
        slots[i].bookId = "";
      }
    }
  }
}

void processAndPublishSensors() {
  readSensor();
  updateBookSlot();
  bool occupiedChanged = false;
  bool bookedWebChanged = false;

  for (int i = 0; i < NUM_SLOT; i++) {

    if (slots[i].isOccupied != lastOccupied[i]) {
      occupiedChanged = true;
      lastOccupied[i] = slots[i].isOccupied;
    }

    if (slots[i].isBookedWeb != lastBookedWeb[i]) {
      bookedWebChanged = true;
      lastBookedWeb[i] = slots[i].isBookedWeb;
    }
  }

  if (occupiedChanged || bookedWebChanged) {
    String slotMsg = slotPayload();
    publish("parking/slots", slotMsg);
    Serial.println(slotMsg);
  }

  String gasMsg = gasPayload();
  if (gasMsg != "" && gas.warning != lastGasWarning) {
    publish("warning/gas", gasMsg);
    Serial.println(gasMsg);
    lastGasWarning = gas.warning;
  }

  String waterMsg = waterPayload();
  if (waterMsg != "" && water.warning != lastWaterWarning) {
    publish("warning/flood", waterMsg);
    Serial.println(waterMsg);
    lastWaterWarning = water.warning;
  }
}

void syncRFID(String jsonPayload) {
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, jsonPayload);

  if (!error) {
    String type = doc["type"].as<String>();

    if (type == "in") {
      publish("parking/log", "Doi camera xac nhan vi tri do");
      Serial.println("Doi camera xac nhan vi tri do");
    } else if (type == "out") {
      String id = doc["id"].as<String>();
      bool found = findBookedSlotById(id);

      if (found) {
        String slotMsg = slotPayload();
        publish("parking/slots", slotMsg);
        Serial.println(slotMsg);

        String log = "syncRFID ok (out). Da huy slot cua ID: " + id;
        publish("parking/log", log.c_str());
        Serial.println(log);
      }
    }
  }
}

bool findBookedSlotById(String id) {
  for (int i = 0; i < NUM_SLOT; i++) {
    if (slots[i].isBookedWeb && slots[i].bookId == id) {
      slots[i].isBookedWeb = false;
      slots[i].bookId = "";
      return true;
    }
  }
  return false;
}