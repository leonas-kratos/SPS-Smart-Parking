#include "wifi.h"
#include "sensor.h"
#include "servo.h"
#include <Arduino.h>

#define LED_BUITLIN 13

unsigned long prevMillis = 0;
const unsigned long interval = 200;

unsigned long prevMillis_led = 0;
const unsigned long interval_led = 500;
bool ledState = LOW;

void blinkLed() {
  if (millis() - prevMillis_led >= interval_led) {
    prevMillis_led = millis();
    ledState = !ledState;
    digitalWrite(LED_BUILTIN, ledState);
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(LED_BUILTIN, OUTPUT);

  wifiInit();
  mqttInit();
  servoInit();
  sensorInit();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    wifiInit();
  }

  if (!client.connected()) {
    mqttReconnect();
  }

  client.loop();
  blinkLed();

  long long currMillis = millis();
  if (currMillis - prevMillis >= interval) {
    prevMillis = currMillis;
    processAndPublishSensors();
  }

  processGateIn();
  processGateOut();
}