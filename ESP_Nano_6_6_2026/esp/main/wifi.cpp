#include <algorithm>
#include "wifi.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include "rfid.h"

#define MAX_WIFI_ATTEMPTS 5
#define MAX_MQTT_ATTEMPTS 3

const char* ssid_station = "YOUR_WIFI_SSID";
const char* password_station = "YOUR_WIFI_PASSWORD";

const char* mqtt = "YOUR_HIVEMQ_HOST";
const char* mqtt_user = "YOUR_MQTT_USERNAME";
const char* mqtt_pass = "YOUR_MQTT_PASSWORD";

String logBuffer = "";

WiFiClientSecure espClient; 
PubSubClient client(espClient);

void wifiInit() {
  WiFi.mode(WIFI_STA);
  
  WiFi.begin(ssid_station, password_station);
  Serial.print("Connecting to WiFi");

  int wifi_attempts = 0;

  while (WiFi.status() != WL_CONNECTED) {
    Serial.print("Status: ");
    Serial.println(WiFi.status());
    delay(1000);
    wifi_attempts++;
    if (wifi_attempts > MAX_WIFI_ATTEMPTS) {
      Serial.println("[Wifi] Restarting ESP");
      ESP.restart();
    }
  }
  
  Serial.print("\nWiFi connected, IP address: ");
  Serial.println(WiFi.localIP());
}

void mqttReconnect() {
  int mqtt_attempts = 0;

  while (!client.connected()) {
    String clientId = "ESP8266Client-";
    clientId +=  WiFi.macAddress();

    Serial.println("Connecting MQTT");
    
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
      Serial.println("MQTT connected");
      publish("status/mqtt", "[ESP] MQTT connected");
      client.subscribe("parking/slots");
    } else {
      Serial.println("MQTT failed, try again in 2 seconds");
      delay(2000);
      mqtt_attempts++;
      if (mqtt_attempts > MAX_MQTT_ATTEMPTS) {
        Serial.println("[MQTT] Restarting ESP");
        ESP.restart();
      }
    }
  }
}

void mqttInit() {
  espClient.setInsecure();
  client.setServer(mqtt, 8883);
  client.setCallback(mqttCallback);
  client.setBufferSize(512);
}

void publish(String topic, const String& payload) {
  bool ok = client.publish(topic.c_str(), payload.c_str());
  Serial.println(ok ? "pub ok" : "pub fail");
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }

  if (String(topic) == "parking/slots") {
    syncSlot(msg);
  }
}

void webPrint(String msg) {
  Serial.print(msg);
  logBuffer += msg;
}

void webPrintln(String msg) {
  Serial.println(msg);
  logBuffer += msg;

  if (client.connected()) {
    publish("ESP8266/log", logBuffer);
  }

  logBuffer = "";
}
