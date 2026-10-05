#include <Adafruit_NeoPixel.h>
Adafruit_NeoPixel pixels(8, 6, NEO_GRB + NEO_KHZ800);
void setup() { pixels.begin(); pixels.setBrightness(20); }
void loop() {
  for (uint16_t i = 0; i < pixels.numPixels(); i++) {
    pixels.clear(); pixels.setPixelColor(i, pixels.Color(0, 80, 180));
    pixels.show(); delay(120);
  }
}
