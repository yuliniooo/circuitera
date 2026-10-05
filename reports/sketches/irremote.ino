#include <IRremote.hpp>
void setup() { Serial.begin(9600); IrReceiver.begin(2, DISABLE_LED_FEEDBACK); }
void loop() {
  if (IrReceiver.decode()) {
    IrReceiver.printIRResultShort(&Serial);
    Serial.println();
    IrReceiver.resume();
  }
}
