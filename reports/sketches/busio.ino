#include <Adafruit_I2CDevice.h>
#include <Adafruit_BusIO_Register.h>
Adafruit_I2CDevice device(0x40, &Wire);
Adafruit_BusIO_Register deviceRegister(&device, 0x00, 1);
void setup() { Serial.begin(9600); Serial.println(device.begin()); }
void loop() {
  // Use the address and register map specified by your sensor's datasheet.
  Serial.println(deviceRegister.read(), HEX);
  delay(1000);
}
