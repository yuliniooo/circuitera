#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 5, 4, 3, 2); // RS, E, D4, D5, D6, D7
void setup() { lcd.begin(16, 2); lcd.print("Hello, maker!"); }
void loop() { lcd.setCursor(0, 1); lcd.print(millis() / 1000); }
