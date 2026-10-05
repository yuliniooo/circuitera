#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
void setup() {
  // Uno: SDA=A4, SCL=A5. Verify your display's I2C address.
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { for (;;) {} }
  display.clearDisplay(); display.setTextSize(1); display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0); display.println(F("Hello, maker!"));
  display.drawRect(0, 20, 100, 30, SSD1306_WHITE); display.display();
}
void loop() {}
