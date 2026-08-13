#ifndef RFID_H
#define RFID_H

#include <MFRC522.h> 

extern MFRC522 rfid_in;
extern MFRC522 rfid_out;

typedef struct {
  int id;
  bool isOccupied;
  bool isBookedWeb;
  String bookId;
} LocalSlot;

typedef struct {
  String id;
  String type;
  String date;
  String checkin;
  String checkout;
  String servoOpen;
} RFIDInfo;

void timeInit();
String getTimeString();
String getDateString();
void syncSlot(String payload);
int findAvailableSlotLocally();
int findBookedSlotByIdLocally(String id);
void RFIDInit();
void checkRFIDStatus();
RFIDInfo readRFID();
String RFIDPayload(RFIDInfo& info);

#endif