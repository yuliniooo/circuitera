# Circuitera library compatibility

Tested: 2026-10-05T00:51:55.751Z

Build: `f8d3d433a68a28f956a7b5da9b58b5ab795b250b4e3b41dec5f539607fd05090`

Compile, assemble, link, AVR ELF validation, Intel HEX checksum and flash-size validation. No physical device is attached; electrical behavior is not tested.

Every PASS uses a real sketch, upstream library sources, the shipped AVR-GCC WebAssembly compiler/assembler/linker and objcopy. The generated ELF identifies AVR5; Intel HEX records have valid checksums and nonempty data. These are compile/link compatibility results, not a claim that every library API or library combination has been physically tested.

| Library | Version | Result | Flash bytes | Static SRAM bytes | Test sketch |
|---|---|---|---:|---:|---|
| Servo | 1.3.0 | PASS | 2522 | 50 | Servo sweep |
| Wire | 1.0 | PASS | 4494 | 408 | I2C scanner |
| SPI | 1.0 | PASS | 2728 | 192 | SPI transfer |
| EEPROM | 2.0 | PASS | 2424 | 188 | EEPROM read-write |
| SoftwareSerial | 1.0 | PASS | 3466 | 301 | SoftwareSerial |
| LiquidCrystal | 1.0.7 | PASS | 2232 | 59 | LCD Hello World |
| DHT | 1.4.7 | PASS | 5610 | 219 | DHT temperature-humidity |
| Adafruit Unified Sensor | 1.1.15 | PASS | 9226 | 302 | Unified sensor |
| Adafruit GFX | 1.12.6 | PASS | 10952 | 533 | GFX canvas |
| Adafruit SSD1306 | 2.5.17 | PASS | 13868 | 399 | OLED Hello World |
| Adafruit BusIO | 1.17.4 | PASS | 7140 | 438 | BusIO register |
| Adafruit NeoPixel | 1.15.5 | PASS | 3270 | 41 | NeoPixel |
| NewPing | 1.9.7 | PASS | 3304 | 209 | Ultrasonic distance |
| IRremote | 4.7.1 | PASS | 12096 | 491 | IR remote |
| Keypad | 3.1.1 | PASS | 3922 | 327 | Keypad |
| AccelStepper | 1.64 | PASS | 6118 | 119 | Stepper motor |
| LiquidCrystal_I2C | 1.1.2 | PASS | 4006 | 275 | I2C LCD Hello World |

No library compilation failures in this pinned test set.

## Additional checks

- OLED sensor display: PASS
- Safe object-cache reuse produces identical firmware: PASS

## Constraints

- The original package provides cc1plus, not a separate C frontend. Bundled C-compatible files (Wire twi.c and GFX glcdfont.c) are compiled through AVR C++ with C linkage, using unmodified source contents. Arbitrary C libraries are not promised.
- The existing Uno core and avr-libc are pinned prebuilt toolchain runtime objects; all selected library translation units and the current sketch are compiled from source. Core objects are in a standard indexed archive so unused interrupt handlers are not linked.
- IRremote and the EEPROM C++ interface compile as part of the real sketch translation unit. EEPROM additionally compiles all 12 matching upstream avr-libc 2.0.0 EEPROM assembly files; the missing runtime functions are not mocked.
- Libraries are fetched only when selected by includes or transitive dependencies. Compiled objects have bounded in-Worker caching keyed by exact build, source/dependency hashes and flags.
- Servo uses Timer1; IRremote receive, NewPing timer mode and tone can compete for Timer2. Pin, interrupt and timing conflicts remain real hardware constraints.
- SSD1306 128×64 allocates another 1024 SRAM bytes at runtime. Static SRAM figures exclude heap, stack and sensor buffers.
- LiquidCrystal_I2C is the johnrickman 1.1.2 variant, not every similarly named API.
- Uno R3 is the default. Nano V3 new/old bootloader compile results are recorded separately in nano-compatibility.json. Upload, flash verification and Serial Monitor require a real matching board and permission from Chrome/school IT. No physical Uno or Nano is connected in this environment. Browser checks, when performed, are recorded separately in the release report; these results certify compilation and linking only.

See compatibility.json for exact outputs, hashes, dependency selections and test timings, and sketches/ for every test source. Firmware fixtures are evidence only, not shipped as compiler substitutes.
