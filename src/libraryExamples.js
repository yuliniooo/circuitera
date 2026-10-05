export const libraryExamples = {
  'Servo sweep': `#include <Servo.h>
Servo arm;
void setup() { arm.attach(9); }
void loop() {
  for (int angle = 0; angle <= 180; angle++) { arm.write(angle); delay(15); }
  for (int angle = 180; angle >= 0; angle--) { arm.write(angle); delay(15); }
}
`,
  'I2C scanner': `#include <Wire.h>
void setup() { Wire.begin(); Serial.begin(9600); }
void loop() {
  Serial.println(F("Scanning I2C: SDA=A4, SCL=A5"));
  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      Serial.print(F("Found 0x")); Serial.println(address, HEX);
    }
  }
  delay(3000);
}
`,
  'SPI transfer': `#include <SPI.h>
void setup() { pinMode(10, OUTPUT); digitalWrite(10, HIGH); SPI.begin(); Serial.begin(9600); }
void loop() {
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
  digitalWrite(10, LOW);
  byte response = SPI.transfer(0x55);
  digitalWrite(10, HIGH);
  SPI.endTransaction();
  Serial.println(response, HEX);
  delay(1000);
}
`,
  'EEPROM read-write': `#include <EEPROM.h>
void setup() {
  Serial.begin(9600);
  // update() writes only when the value changes. Avoid repeated EEPROM writes.
  EEPROM.update(0, 42);
  Serial.print(F("Stored value: ")); Serial.println(EEPROM.read(0));
  int calibration = 1234;
  EEPROM.put(4, calibration);
  int restored = 0;
  EEPROM.get(4, restored);
  Serial.println(restored);
}
void loop() {}
`,
  'SoftwareSerial': `#include <SoftwareSerial.h>
SoftwareSerial device(10, 11); // RX, TX; connect to a compatible serial device.
void setup() { Serial.begin(9600); device.begin(9600); }
void loop() {
  if (device.available()) Serial.write(device.read());
  if (Serial.available()) device.write(Serial.read());
}
`,
  'LCD Hello World': `#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 5, 4, 3, 2); // RS, E, D4, D5, D6, D7
void setup() { lcd.begin(16, 2); lcd.print("Hello, maker!"); }
void loop() { lcd.setCursor(0, 1); lcd.print(millis() / 1000); }
`,
  'DHT temperature-humidity': `#include <DHT.h>
DHT sensor(2, DHT22); // Change DHT22 to DHT11 for that sensor.
void setup() { Serial.begin(9600); sensor.begin(); }
void loop() {
  delay(2000);
  float temperature = sensor.readTemperature();
  float humidity = sensor.readHumidity();
  if (isnan(temperature) || isnan(humidity)) { Serial.println(F("Check DHT wiring")); return; }
  Serial.print(temperature); Serial.print(F(" C, "));
  Serial.print(humidity); Serial.println(F(" % RH"));
}
`,
  'Unified sensor': `#include <Adafruit_Sensor.h>
#include <DHT_U.h>
DHT_Unified sensor(2, DHT22);
void setup() {
  Serial.begin(9600); sensor.begin();
  sensor.temperature().printSensorDetails();
  sensor_t metadata;
  sensor.temperature().getSensor(&metadata);
  Serial.println(metadata.name);
}
void loop() {
  sensors_event_t event;
  sensor.temperature().getEvent(&event);
  if (!isnan(event.temperature)) Serial.println(event.temperature);
  delay(2000);
}
`,
  'GFX canvas': `#include <Adafruit_GFX.h>
GFXcanvas1 canvas(16, 16);
void setup() {
  Serial.begin(9600);
  canvas.fillScreen(0); canvas.drawLine(0, 0, 15, 15, 1);
  canvas.drawCircle(8, 8, 5, 1); canvas.setCursor(0, 0); canvas.print("A");
  Serial.println(canvas.getPixel(8, 8));
  Serial.println(canvas.getBuffer()[0], HEX);
}
void loop() {}
`,
  'OLED Hello World': `#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
void setup() {
  // Uno: SDA=A4, SCL=A5. Verify your display's I2C address.
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { for (;;) {} }
  display.clearDisplay(); display.setTextSize(1); display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0); display.println(F("Hello, maker!"));
  display.drawRect(0, 20, 100, 30, SSD1306_WHITE); display.display();
}
void loop() {}
`,
  'OLED sensor display': `#include <Adafruit_SSD1306.h>
#include <DHT.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
DHT sensor(2, DHT22);
void setup() {
  sensor.begin();
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { for (;;) {} }
  display.setTextColor(SSD1306_WHITE); display.setTextSize(1);
}
void loop() {
  delay(2000);
  float temperature = sensor.readTemperature();
  float humidity = sensor.readHumidity();
  display.clearDisplay(); display.setCursor(0, 0);
  if (isnan(temperature) || isnan(humidity)) display.println(F("Check DHT wiring"));
  else {
    display.print(F("Temp: ")); display.print(temperature, 1); display.println(F(" C"));
    display.print(F("Humidity: ")); display.print(humidity, 1); display.println(F(" %"));
  }
  display.display();
}
`,
  'BusIO register': `#include <Adafruit_I2CDevice.h>
#include <Adafruit_BusIO_Register.h>
Adafruit_I2CDevice device(0x40, &Wire);
Adafruit_BusIO_Register deviceRegister(&device, 0x00, 1);
void setup() { Serial.begin(9600); Serial.println(device.begin()); }
void loop() {
  // Use the address and register map specified by your sensor's datasheet.
  Serial.println(deviceRegister.read(), HEX);
  delay(1000);
}
`,
  'NeoPixel': `#include <Adafruit_NeoPixel.h>
Adafruit_NeoPixel pixels(8, 6, NEO_GRB + NEO_KHZ800);
void setup() { pixels.begin(); pixels.setBrightness(20); }
void loop() {
  for (uint16_t i = 0; i < pixels.numPixels(); i++) {
    pixels.clear(); pixels.setPixelColor(i, pixels.Color(0, 80, 180));
    pixels.show(); delay(120);
  }
}
`,
  'Ultrasonic distance': `#include <NewPing.h>
NewPing sonar(9, 10, 200); // trigger, echo, maximum cm
void setup() { Serial.begin(9600); }
void loop() {
  unsigned int duration = sonar.ping_median(3);
  Serial.print(sonar.convert_cm(duration)); Serial.println(F(" cm"));
  delay(100);
}
`,
  'IR remote': `#include <IRremote.hpp>
void setup() { Serial.begin(9600); IrReceiver.begin(2, DISABLE_LED_FEEDBACK); }
void loop() {
  if (IrReceiver.decode()) {
    IrReceiver.printIRResultShort(&Serial);
    Serial.println();
    IrReceiver.resume();
  }
}
`,
  'Keypad': `#include <Keypad.h>
const byte ROWS = 4, COLS = 3;
char keys[ROWS][COLS] = {{'1','2','3'}, {'4','5','6'}, {'7','8','9'}, {'*','0','#'}};
byte rowPins[ROWS] = {9, 8, 7, 6};
byte colPins[COLS] = {5, 4, 3};
Keypad keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);
void setup() { Serial.begin(9600); }
void loop() { char key = keypad.getKey(); if (key) Serial.println(key); }
`,
  'Stepper motor': `#include <AccelStepper.h>
// Use a suitable motor driver; do not connect motor windings to Uno pins.
AccelStepper motor(AccelStepper::DRIVER, 3, 2); // step, direction
void setup() { motor.setMaxSpeed(400); motor.setAcceleration(100); motor.moveTo(200); }
void loop() {
  if (motor.distanceToGo() == 0) motor.moveTo(-motor.currentPosition());
  motor.run();
}
`,
  'I2C LCD Hello World': `#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2); // johnrickman 1.1.2 API; scan for your address.
void setup() { lcd.init(); lcd.backlight(); lcd.setCursor(0, 0); lcd.print("Hello, maker!"); }
void loop() { lcd.setCursor(0, 1); lcd.print(millis() / 1000); }
`,
};
