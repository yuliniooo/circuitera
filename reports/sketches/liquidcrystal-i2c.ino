#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2); // johnrickman 1.1.2 API; scan for your address.
void setup() { lcd.init(); lcd.backlight(); lcd.setCursor(0, 0); lcd.print("Hello, maker!"); }
void loop() { lcd.setCursor(0, 1); lcd.print(millis() / 1000); }
