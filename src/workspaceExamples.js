// Extra sketches for the existing compiler. Original examples remain unchanged.
export const workspaceExamples = {
  'Analog Input': `// Potentiometer: outer pins to 5V/GND, middle pin to A0.
void setup() { Serial.begin(9600); }
void loop() {
  Serial.println(analogRead(A0));
  delay(50);
}
`,
  'PWM Fade': `// LED + 220 ohm resistor on PWM pin 9 to GND.
int brightness = 0;
int stepSize = 5;
void setup() { pinMode(9, OUTPUT); }
void loop() {
  analogWrite(9, brightness);
  brightness += stepSize;
  if (brightness <= 0 || brightness >= 255) stepSize = -stepSize;
  delay(30);
}
`,
  Serial: `void setup() { Serial.begin(9600); }
void loop() {
  Serial.print(F("time:"));
  Serial.println(millis() / 1000.0, 1);
  delay(100);
}
`,
  'Light Sensor': `// Voltage divider: 5V -> LDR -> A0 -> 10k resistor -> GND.
void setup() { Serial.begin(9600); }
void loop() {
  Serial.print(F("light:"));
  Serial.println(analogRead(A0));
  delay(100);
}
`,
  'Servo + Potentiometer': `#include <Servo.h>
// Servo signal: D9. Potentiometer middle pin: A0; outer pins: 5V/GND.
Servo arm;
void setup() { arm.attach(9); }
void loop() {
  int angle = map(analogRead(A0), 0, 1023, 0, 180);
  arm.write(constrain(angle, 0, 180));
  delay(15);
}
`,
  'Traffic Light': `// Red D8, yellow D9, green D10; each LED needs a 220 ohm resistor.
const int RED = 8, YELLOW = 9, GREEN = 10;
void setup() {
  pinMode(RED, OUTPUT); pinMode(YELLOW, OUTPUT); pinMode(GREEN, OUTPUT);
}
void loop() {
  digitalWrite(RED, HIGH); delay(3000); digitalWrite(RED, LOW);
  digitalWrite(GREEN, HIGH); delay(3000); digitalWrite(GREEN, LOW);
  digitalWrite(YELLOW, HIGH); delay(1000); digitalWrite(YELLOW, LOW);
}
`,
  'Reaction Game': `// Button between D2 and GND. Press when the onboard LED turns on.
enum GameState { WAIT_RELEASE, WAIT_SIGNAL, WAIT_PRESS };
GameState state = WAIT_RELEASE;
unsigned long signalAt = 0, startedAt = 0;
void setup() {
  pinMode(2, INPUT_PULLUP); pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(9600); randomSeed(analogRead(A0));
  Serial.println(F("Release the button to begin."));
}
void loop() {
  bool pressed = digitalRead(2) == LOW;
  unsigned long now = millis();
  if (state == WAIT_RELEASE && !pressed) {
    signalAt = now + random(1500, 4500); state = WAIT_SIGNAL;
    Serial.println(F("Wait for the LED..."));
  } else if (state == WAIT_SIGNAL && pressed) {
    Serial.println(F("Too soon! Release to retry.")); state = WAIT_RELEASE;
  } else if (state == WAIT_SIGNAL && (long)(now - signalAt) >= 0) {
    digitalWrite(LED_BUILTIN, HIGH); startedAt = now; state = WAIT_PRESS;
  } else if (state == WAIT_PRESS && pressed) {
    digitalWrite(LED_BUILTIN, LOW);
    Serial.print(F("Reaction ms: ")); Serial.println(now - startedAt);
    state = WAIT_RELEASE; delay(30);
  }
}
`,
  'Parking Sensor': `// HC-SR04 TRIG D9, ECHO D10. Passive piezo on D3 and GND.
void setup() {
  pinMode(9, OUTPUT); pinMode(10, INPUT); pinMode(3, OUTPUT);
  Serial.begin(9600);
}
void loop() {
  digitalWrite(9, LOW); delayMicroseconds(2);
  digitalWrite(9, HIGH); delayMicroseconds(10); digitalWrite(9, LOW);
  unsigned long echo = pulseIn(10, HIGH, 30000);
  float cm = echo * 0.0343 / 2;
  Serial.print(F("distance:")); Serial.println(cm);
  if (echo > 0 && cm < 50) { tone(3, 1000, 60); delay((int)constrain(cm * 8, 80, 400)); }
  else { noTone(3); delay(200); }
}
`,
  'Automatic Door': `#include <Servo.h>
// Small model door: servo signal D6; HC-SR04 TRIG D9, ECHO D10.
Servo door;
unsigned long lastSeen = 0;
bool opened = false;
void setup() {
  door.attach(6); door.write(0); pinMode(9, OUTPUT); pinMode(10, INPUT);
}
void loop() {
  digitalWrite(9, LOW); delayMicroseconds(2);
  digitalWrite(9, HIGH); delayMicroseconds(10); digitalWrite(9, LOW);
  unsigned long echo = pulseIn(10, HIGH, 30000);
  if (echo > 0 && echo < 1160) { lastSeen = millis(); opened = true; door.write(90); }
  if (opened && millis() - lastSeen > 3000) { door.write(0); opened = false; }
  delay(80);
}
`,
  'Motion Alarm': `// PIR sensor OUT to D2; passive piezo to D3; common GND.
// Allow your PIR module to settle after power-on.
void setup() {
  pinMode(2, INPUT); pinMode(LED_BUILTIN, OUTPUT); Serial.begin(9600);
}
void loop() {
  bool motion = digitalRead(2) == HIGH;
  digitalWrite(LED_BUILTIN, motion);
  if (motion) tone(3, 880); else noTone(3);
  Serial.print(F("motion:")); Serial.println(motion ? 1 : 0);
  delay(100);
}
`,
};

export const exampleGroups = {
  BASICS: ['Blink', 'Button', 'Analog Input', 'PWM Fade', 'Serial'],
  SENSORS: ['Ultrasonic', 'Ultrasonic distance', 'DHT temperature-humidity', 'Light Sensor'],
  MOTION: ['Servo', 'Servo sweep', 'Servo + Potentiometer', 'Stepper motor'],
  DISPLAYS: ['LCD Hello World', 'OLED Hello World', 'OLED sensor display', 'I2C LCD Hello World', 'GFX canvas', 'NeoPixel'],
  PROJECTS: ['Traffic Light', 'Reaction Game', 'Parking Sensor', 'Automatic Door', 'Motion Alarm'],
  'LIBRARY EXAMPLES': ['I2C scanner', 'SPI transfer', 'EEPROM read-write', 'SoftwareSerial', 'Unified sensor', 'BusIO register', 'IR remote', 'Keypad'],
};

export const challenges = [
  ['Blink an LED', 'Blink', 'Upload Blink and watch the onboard LED. Find the two lines that set it HIGH and LOW.'],
  ['Change the blink speed', 'Blink', 'Try a different delay for on and off. Compile and upload your changes.'],
  ['Control an LED with a button', 'Button', 'Use a button between D2 and GND. Can you make the LED turn off while pressed?'],
  ['Build a traffic light', 'Traffic Light', 'Build three LEDs with resistors. Change the timing of the red, yellow, and green phases.'],
  ['Read a potentiometer', 'Analog Input', 'Open Serial Plotter at 9600 baud and turn the knob. What range of numbers do you see?'],
  ['Use an ultrasonic sensor', 'Ultrasonic', 'Measure three known distances. Compare the readings with a ruler.'],
  ['Control a servo', 'Servo sweep', 'Change the angle range and speed. Keep the mechanism free to move.'],
  ['Build your own project', null, 'Combine an input and an output. Decide what the code should do, then build and test one part at a time.'],
];
