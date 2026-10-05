#include <Adafruit_GFX.h>
GFXcanvas1 canvas(16, 16);
void setup() {
  Serial.begin(9600);
  canvas.fillScreen(0); canvas.drawLine(0, 0, 15, 15, 1);
  canvas.drawCircle(8, 8, 5, 1); canvas.setCursor(0, 0); canvas.print("A");
  Serial.println(canvas.getPixel(8, 8));
  Serial.println(canvas.getBuffer()[0], HEX);
}
void loop() {}
