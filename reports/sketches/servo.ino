#include <Servo.h>
Servo arm;
void setup() { arm.attach(9); }
void loop() {
  for (int angle = 0; angle <= 180; angle++) { arm.write(angle); delay(15); }
  for (int angle = 180; angle >= 0; angle--) { arm.write(angle); delay(15); }
}
