#include "wifi.h"
#include "servo.h"
#include <SPI.h>
#include <WiFiNINA.h>
#include <ArduinoJson.h>
#include "sensor.h"

#define MAX_WIFI_ATTEMPTS 5
#define MAX_MQTT_ATTEMPTS 3

const char* ssid_station = "YOUR_WIFI_SSID";
const char* password_station = "YOUR_WIFI_PASSWORD";

const char* mqtt = "YOUR_HIVEMQ_HOST";
const char* mqtt_user = "YOUR_MQTT_USERNAME";
const char* mqtt_pass = "YOUR_MQTT_PASSWORD";

WiFiSSLClient wifiSSLClient;
PubSubClient client(wifiSSLClient);

void wifiInit() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid_station, password_station);

  int wifi_attempts = 0;

  while (WiFi.status() != WL_CONNECTED) {
    Serial.print("Status: ");
    Serial.println(WiFi.status());
    delay(1000);
    wifi_attempts++;
    if (wifi_attempts > MAX_WIFI_ATTEMPTS) {
      Serial.println("[Wifi] Restarting Nano");
      NVIC_SystemReset();
    }
  }

  Serial.print("\nWiFi connected, IP address: ");
  Serial.println(WiFi.localIP());
}

void mqttReconnect() {
  int mqtt_attempts = 0;
  const int max_mqtt_attempts = 3;

  while (!client.connected()) {
    Serial.println("Connecting MQTT...");

    String clientId = "Nano33Client-";
    clientId += String(random(0xffff), HEX);

    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
      Serial.println("MQTT connected");
      publish("status/mqtt", "[Nano] MQTT connected");
      client.subscribe("parking/book");
      client.subscribe("parking/rfid");
    } else {
      Serial.print("MQTT failed, state: ");
      Serial.print(client.state());
      Serial.println(" try again in 2 seconds");
      delay(2000);
      mqtt_attempts++;
      if (mqtt_attempts > MAX_MQTT_ATTEMPTS) {
        Serial.println("[MQTT] Restarting Nano");
        NVIC_SystemReset();
      }
    }
  }
}

void mqttInit() {
  client.setServer(mqtt, 8883);
  client.setCallback(mqttCallback);
  client.setBufferSize(512);
}

void publish(String topic, const String& payload) {
  bool ok = client.publish(topic.c_str(), payload.c_str());
  Serial.println(ok ? "pub ok" : "pub fail");
}

void syncBook(String jsonPayload) {
  StaticJsonDocument<200> doc;
  DeserializationError error = deserializeJson(doc, jsonPayload);

  if (error) {
    Serial.println(error.f_str());
  }

  String id = doc["id"].as<String>();
  int slotIndex = doc["slot"].as<int>();
  String bookType = doc["bookType"].as<String>();

  if (bookType == "book") {
    slots[slotIndex].isBookedWeb = true;
    slots[slotIndex].bookId = id;
    webTime[slotIndex] = millis();
    Serial.println("Slot " + String(slotIndex) + " is booked by " + id);
  } else if (bookType == "cancel") {
    slots[slotIndex].isBookedWeb = false;
    slots[slotIndex].bookId = "";
    Serial.println("Slot " + String(slotIndex) + " is cancelled by " + id);
  }
  publish("parking/slots", slotPayload());
  Serial.println("syncBook ok");
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }

  if (String(topic) == "parking/book") {
    syncBook(msg);
  } else if (String(topic) == "parking/rfid") {
    syncRFID(msg);
    handleServo(msg);
  }
}
