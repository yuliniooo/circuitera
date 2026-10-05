#include <EEPROM.h>
void setup() {
  Serial.begin(9600);
  // update() writes only when the value changes. Avoid repeated EEPROM writes.
  EEPROM.update(0, 42);
  Serial.print(F("Stored value: ")); Serial.println(EEPROM.read(0));
  int calibration = 1234;
  EEPROM.put(4, calibration);
  int restored = 0;
  EEPROM.get(4, restored);
  Serial.println(restored);
}
void loop() {}
