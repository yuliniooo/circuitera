#include <Keypad.h>
const byte ROWS = 4, COLS = 3;
char keys[ROWS][COLS] = {{'1','2','3'}, {'4','5','6'}, {'7','8','9'}, {'*','0','#'}};
byte rowPins[ROWS] = {9, 8, 7, 6};
byte colPins[COLS] = {5, 4, 3};
Keypad keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);
void setup() { Serial.begin(9600); }
void loop() { char key = keypad.getKey(); if (key) Serial.println(key); }
