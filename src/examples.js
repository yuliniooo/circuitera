export const examples = {
  Blink: `// Blink — Arduino Uno R3\nconst int LED_PIN = LED_BUILTIN;\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  delay(1000);\n  digitalWrite(LED_PIN, LOW);\n  delay(1000);\n}\n`,
  Button: `// Button — connect a pushbutton between pin 2 and GND\nconst int BUTTON_PIN = 2;\nconst int LED_PIN = LED_BUILTIN;\n\nvoid setup() {\n  pinMode(BUTTON_PIN, INPUT_PULLUP);\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  bool pressed = digitalRead(BUTTON_PIN) == LOW;\n  digitalWrite(LED_PIN, pressed ? HIGH : LOW);\n}\n`,
  Servo: `#include <Servo.h>\n\nServo arm;\n\nvoid setup() {\n  arm.attach(9);\n}\n\nvoid loop() {\n  arm.write(0);\n  delay(800);\n  arm.write(90);\n  delay(800);\n  arm.write(180);\n  delay(800);\n}\n`,
  Ultrasonic: `// HC-SR04: TRIG to pin 9, ECHO to pin 10\nconst int TRIG_PIN = 9;\nconst int ECHO_PIN = 10;\n\nvoid setup() {\n  pinMode(TRIG_PIN, OUTPUT);\n  pinMode(ECHO_PIN, INPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  digitalWrite(TRIG_PIN, LOW);\n  delayMicroseconds(2);\n  digitalWrite(TRIG_PIN, HIGH);\n  delayMicroseconds(10);\n  digitalWrite(TRIG_PIN, LOW);\n\n  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);\n  float centimeters = duration * 0.0343 / 2.0;\n  Serial.print("Distance: ");\n  Serial.print(centimeters);\n  Serial.println(" cm");\n  delay(250);\n}\n`,
};

export const starterSketch = examples.Blink;
