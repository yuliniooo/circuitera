#include <SPI.h>
void setup() { pinMode(10, OUTPUT); digitalWrite(10, HIGH); SPI.begin(); Serial.begin(9600); }
void loop() {
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
  digitalWrite(10, LOW);
  byte response = SPI.transfer(0x55);
  digitalWrite(10, HIGH);
  SPI.endTransaction();
  Serial.println(response, HEX);
  delay(1000);
}
