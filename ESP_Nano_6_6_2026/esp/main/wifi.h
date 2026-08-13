#ifndef WIFI_H
#define WIFI_H

#include <ESP8266WiFi.h>
#include <PubSubClient.h>

extern WiFiClientSecure espClient; 
extern PubSubClient client;

void wifiInit();
void mqttReconnect();
void mqttInit();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void publish(String topic, const String& payload);
void webPrint(String msg);
void webPrintln(String msg);

#endif