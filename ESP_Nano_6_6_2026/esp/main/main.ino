#include "wifi.h"
#include "rfid.h"
#include <Arduino.h>

unsigned long prevMillis = 0;
const unsigned long interval = 200;

void setup() {
  Serial.begin(115200);

  wifiInit();
  mqttInit();
  RFIDInit();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("start loop wifi init");
    wifiInit();
  }
  
  if (!client.connected()) {
    Serial.println("start mqtt init");
    mqttReconnect();
  }
  
  client.loop();
  checkRFIDStatus();

  RFIDInfo info = readRFID();
  if (info.id != "") {
    String RFIDMsg = RFIDPayload(info);
    publish("parking/rfid", RFIDMsg);
    Serial.println(RFIDMsg);
  }
}