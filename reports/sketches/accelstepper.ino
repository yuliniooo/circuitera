#include <AccelStepper.h>
// Use a suitable motor driver; do not connect motor windings to Uno pins.
AccelStepper motor(AccelStepper::DRIVER, 3, 2); // step, direction
void setup() { motor.setMaxSpeed(400); motor.setAcceleration(100); motor.moveTo(200); }
void loop() {
  if (motor.distanceToGo() == 0) motor.moveTo(-motor.currentPosition());
  motor.run();
}
