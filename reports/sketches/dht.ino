#include <DHT.h>
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
