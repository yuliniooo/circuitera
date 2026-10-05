#include <Wire.h>
void setup() { Wire.begin(); Serial.begin(9600); }
void loop() {
  Serial.println(F("Scanning I2C: SDA=A4, SCL=A5"));
  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      Serial.print(F("Found 0x")); Serial.println(address, HEX);
    }
  }
  delay(3000);
}
