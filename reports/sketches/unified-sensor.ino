#include <Adafruit_Sensor.h>
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
