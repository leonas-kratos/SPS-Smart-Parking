#ifndef SERVO_H
#define SERVO_H

#include <Arduino.h>
#include <Servo.h>

typedef struct {
  Servo servo;
  int irPin;
} Sv;

extern Sv servoIn;
extern Sv servoOut;

void servoInit();
void servoInOpen();
void servoInClose();
void servoOutOpen();
void servoOutClose();
void handleServoIn();
void handleServoOut();
void processGateIn();
void processGateOut();
void handleServo(String msg);
#endif