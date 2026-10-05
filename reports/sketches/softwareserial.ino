#include <SoftwareSerial.h>
SoftwareSerial device(10, 11); // RX, TX; connect to a compatible serial device.
void setup() { Serial.begin(9600); device.begin(9600); }
void loop() {
  if (device.available()) Serial.write(device.read());
  if (Serial.available()) device.write(Serial.read());
}
