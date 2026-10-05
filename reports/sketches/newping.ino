#include <NewPing.h>
NewPing sonar(9, 10, 200); // trigger, echo, maximum cm
void setup() { Serial.begin(9600); }
void loop() {
  unsigned int duration = sonar.ping_median(3);
  Serial.print(sonar.convert_cm(duration)); Serial.println(F(" cm"));
  delay(100);
}
