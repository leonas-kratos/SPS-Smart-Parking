#ifndef SENSOR_H
#define SENSOR_H

#include <Arduino.h>

#define NUM_SLOT 4

typedef struct {
  int id;
  bool isOccupied;
  bool isBookedWeb;
  String bookId;
} Slot;

typedef struct {
  int analogValue;
  String warning;
} Gas;

typedef struct {
  int analogValue;
  String warning;
} Water;

extern Slot slots[NUM_SLOT];
extern Gas gas;
extern Water water;
extern unsigned long webTime[NUM_SLOT];

void sensorInit();
void readSensor();
String slotPayload();
String gasPayload();
String waterPayload();
void updateBookSlot();
void processAndPublishSensors();
void syncRFID(String payload);
bool findBookedSlotById(String id);

#endif