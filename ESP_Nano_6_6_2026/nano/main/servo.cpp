#include <Arduino.h>
#include <ArduinoJson.h>
#include <Servo.h>
#include "servo.h"
#include "wifi.h"

#define SERVO_PIN_IN 7   // D7
#define IR_PIN_IN 8      // D8
#define SERVO_PIN_OUT 9  // D9
#define IR_PIN_OUT 10    // D10
#define OPEN_ANGLE 90
#define CLOSE_ANGLE 0

Sv servoIn;
Sv servoOut;

int gateInState = 0;  // 0: close, 1: cho xe vao, 2: dang qua, 3: delay dong
unsigned long gateInTimer = 0;
int gateOutState = 0;  // 0: close, 1: cho xe ra, 2: dang ra, 3: delay dong
unsigned long gateOutTimer = 0;
const unsigned long DELAY = 1500;

void servoInit() {
  servoIn.servo.attach(SERVO_PIN_IN);
  servoIn.servo.write(CLOSE_ANGLE);
  servoIn.irPin = IR_PIN_IN;
  pinMode(servoIn.irPin, INPUT_PULLUP);

  servoOut.servo.attach(SERVO_PIN_OUT);
  servoOut.servo.write(CLOSE_ANGLE);
  servoOut.irPin = IR_PIN_OUT;
  pinMode(servoOut.irPin, INPUT_PULLUP);
}

void servoInOpen() {
  servoIn.servo.write(OPEN_ANGLE);
  Serial.println("servo in open");
}

void servoInClose() {
  servoIn.servo.write(CLOSE_ANGLE);
  Serial.println("servo in close");
}

void servoOutOpen() {
  servoOut.servo.write(OPEN_ANGLE);
  Serial.println("servo out open");
}

void servoOutClose() {
  servoOut.servo.write(CLOSE_ANGLE);
  Serial.println("servo out close");
}

void handleServoIn() {
  servoInOpen();
  gateInState = 1;
  Serial.println(gateInState);
}

void handleServoOut() {
  servoOutOpen();
  gateOutState = 1;
  Serial.print("gateOutState:");
  Serial.println(gateOutState);
}

void processGateIn() {
  bool carDetected = (digitalRead(servoIn.irPin) == LOW);

  switch (gateInState) {
    case 0:
      break;

    case 1:
      if (carDetected) {
        gateInState = 2;
        Serial.print("GateInState:");
        Serial.println(gateInState);
      }
      break;

    case 2:
      if (!carDetected) {
        gateInState = 3;
        Serial.print("GateInState:");
        Serial.println(gateInState);
        gateInTimer = millis();
      }
      break;

    case 3:
      if (carDetected) {
        gateInState = 2;
        Serial.print("GateInState:");
        Serial.println(gateInState);
      } else if (millis() - gateInTimer > DELAY) {
        servoInClose();
        gateInState = 0;
        Serial.print("GateInState:");
        Serial.println(gateInState);
      }
      break;
  }
}

void processGateOut() {
  bool carDetected = (digitalRead(servoOut.irPin) == LOW);
  
  switch (gateOutState) {
    case 0:
      break;

    case 1:
      if (carDetected) {
        gateOutState = 2;
        Serial.print("gateOutState:");
        Serial.println(gateOutState);
      }
      break;

    case 2:
      if (!carDetected) {
        gateOutState = 3;
        Serial.print("gateOutState:");
        Serial.println(gateOutState);
        gateOutTimer = millis();
      }
      break;

    case 3:
      if (carDetected) {
        gateOutState = 2;
        Serial.print("gateOutState:");
        Serial.println(gateOutState);
      } else if (millis() - gateOutTimer > DELAY) {
        servoOutClose();
        gateOutState = 0;
        Serial.print("gateOutState:");
        Serial.println(gateOutState);
      }
      break;
  }
}

void handleServo(String jsonPayload) {
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, jsonPayload);

  if (!error) {
    String servoOpen = doc["servoOpen"].as<String>();
    if (servoOpen == "servoIn") {
      handleServoIn();
    } else if (servoOpen == "servoOut") {
      handleServoOut();
    }
  }
}