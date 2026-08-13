#ifndef WIFI_H
#define WIFI_H

#include <WiFiNINA.h>
#include <PubSubClient.h>
#include <SPI.h>

extern WiFiSSLClient wifiSSLClient; 
extern PubSubClient client;

void wifiInit();
void mqttReconnect();
void mqttInit();
void publish(String topic, const String& payload);
void syncBook(String jsonPayload);
void mqttCallback(char* topic, byte* payload, unsigned int length);

#endif