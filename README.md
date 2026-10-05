> **Cloudflare Pages / GitHub:** See [CLOUDFLARE_PAGES.md](CLOUDFLARE_PAGES.md) for current deployment settings and verification. The Netlify instructions below describe the existing deployment and remain available for that host.

# Circuitera — build hardware from your browser

Circuitera is a static Arduino Uno R3 and classic Nano V3 / ATmega328P IDE. It opens directly into the editor, compiles the current Arduino source locally with AVR-GCC WebAssembly, generates genuine Intel HEX, and uploads through Chrome Web Serial using STK500v1 with flash readback. Students need Chrome, an Uno R3 or Nano V3 and a USB data cable. No account, compiler server, desktop IDE, Terminal, Linux or extension is required.

## This release

The current application is extended in place. The original WASM binaries, Arduino core, pinned library sources, Worker message protocol, Intel HEX parser, autocomplete and STK500v1 uploader remain unchanged. Multi-file compilation extends the existing compiler orchestration; it does not substitute a compiler or firmware. Original Blink, Button, Servo and Ultrasonic firmware is checked against the previous release and remains byte-identical.

The warm-white workspace, vibrant accents and saved dark theme remain. New features include optional project files, Uno pinout and code hover, a real Test My Uno workflow, clearer upload errors, plotter controls and CSV export, an optional offline cache, installable PWA metadata and useful public help pages. The editor is still the homepage.

## Sketches and optional projects

My Sketches supports creation, rename, duplication, confirmed deletion, independent tabs, autosave, local restoration, .ino import/export and Export All. Closing a tab keeps its sketch. All records remain in the existing `uno-web-ide` IndexedDB database, on the same origin. No migration clears or replaces existing records. A pending dot clears only after the latest transaction commits; failed writes keep edits visible with retry/export guidance.

**Convert to Project** preserves the sketch ID and source as `main.ino`. Add, rename, edit and remove `.ino`, `.cpp`, `.c` and `.h` files in the sidebar. Projects use at most 64 flat source files and 500 KB of source text. Their complete contents save atomically in the original sketch record. The selected project file restores after refresh. Duplicate preserves all files; project ZIP and Export All preserve source filenames in separate project folders.

All project .ino files form one Arduino translation unit, with the main file first. Every .cpp and .c implementation is compiled to a separate AVR object and genuinely linked. Headers and library dependencies are available across the virtual project directory. Missing implementations cause real linker errors; source errors preserve filenames and line numbers, with clickable editor navigation. Include your own headers and Arduino.h where required in C++ files.

**C limitation:** the shipped toolchain contains `cc1plus` but no standalone C frontend. `.c` files support C-compatible syntax compiled by the actual AVR C++ frontend with C linkage. Full C99/C11 is not supported. Unsupported constructs fail with the original compiler output. Nothing is stubbed or replaced to claim compatibility.

Each compile captures the active sketch/project ID and every source/header byte. All project translation units are rebuilt; modifying a header or secondary source invalidates previous firmware. Merely changing the selected file does not. Late results stay with the initiating project. Changing projects during USB selection cancels before flashing. An upload already in progress finishes with its captured firmware. Only one compile/upload operation owns the pipeline at a time.

## Nano V3 support — additive update

Uno R3 remains the default. Choose the board beside Verify; the selection persists locally and does not alter IndexedDB sketches.

| Target | Build macro / variant | Upload | Application flash |
| --- | --- | --- | --- |
| Uno R3 | ARDUINO_AVR_UNO / standard | STK500v1 · 115200 baud | 32,256 bytes |
| Nano V3 new bootloader | ARDUINO_AVR_NANO / eightanaloginputs | STK500v1 Optiboot · 115200 baud | 30,720 bytes |
| Nano V3 old bootloader | ARDUINO_AVR_NANO / eightanaloginputs | STK500v1 ATmegaBOOT · 57600 baud | 30,720 bytes |

All three target ATmega328P / avr5, 16 MHz, 5 V and 2 KiB SRAM. Profiles match vendored Arduino AVR Boards 1.8.6 `boards.txt`. The original Uno uploader, WASM executables, standard pin header and Arduino core archive stay byte-identical. Nano mounts the actual upstream eightanaloginputs variant, sharing the same digital pin tables/core binary and overriding NUM_ANALOG_INPUTS to 8. Sketch/library objects are keyed by board and variant hashes. Different bootloader profiles can correctly produce the same Nano HEX: they change upload baud, not the MCU instruction set.

Nano uses an adapter around the existing STK500v1 flash/readback loop. It selects the real baud, retains the DTR/RTS reset pulse, handles pending sync reads without swallowing retry ACKs, and releases reader/writer locks before closing. Uno calls the original uploader directly. The picker is unfiltered: CH340/CH340G, FTDI, CP210x and other USB serial bridges are selectable when Chrome/ChromeOS exposes them and school policy allows access. No USB ID is treated as proof of board identity. If synchronization fails, try the other Nano bootloader option; the Output console retains actual errors, target, baud, USB status and retry logs.

Artifacts belong to one sketch/project and one board profile. Target changes are locked during compilation, USB selection and upload. Switching Uno/Nano families releases the monitor and clears the selected port; switching Nano bootloaders keeps the port available for retry. Upload compiles stale source for the captured active target and verifies every 128-byte flash page. Port permission selection happens inside the Upload click before any long compile, as Chrome requires a user gesture.

Nano adds analog-only A6/A7 to pin help, hover and local autocomplete. Core APIs, Serial, Wire, SPI and Servo are compile-tested. All 17 bundled libraries pass genuine WASM compile/link/HEX tests on both Nano profiles. `reports/nano-compatibility.json` contains exact-build evidence. `test/nano.test.js` exercises both baud rates, reset, readback, sync retries, disconnects, flash bounds and monitor reopening using software serial streams. These are **not physical hardware tests**. Use Test My Nano on a real board to finish physical validation.

## Uno, serial and pin tools

The unchanged uploader communicates at 115200 baud and writes and reads back every 128-byte page. Success requires actual STK500v1 completion and matching flash verification. Clear explanations retain the original exception and stack. Web Serial permissions are requested only after a user action. School policies are respected.

**Test My Uno** is optional: check browser support, explicitly select a USB device, compile the displayed LED test with the real Worker, and explicitly upload it. It replaces the program on the connected Uno, never the student's saved sketch. The result is successful only after bootloader communication and readback verification. A selected USB port alone is not proof of the correct board.

Serial Monitor retains nine baud rates (300–115200), send field, four line endings, timestamps, clear and autoscroll. Upload waits for the monitor and pending writes to release the port. Serial Plotter shares the same reader and supports `23.7`, `temperature:23.7` and `temperature:23.7 humidity:51`. It retains up to 300 samples and eight series, with pause/resume, 5–120 second windows, optional time labels, clear and timestamped CSV export. Pausing the plot does not pause serial reception. A busy stream may fill 300 samples before the selected window spans its full duration.

UNO PINOUT shows digital, analog, PWM, UART, I2C, SPI, interrupt and power capabilities. Code hover recognizes literal pins in common Arduino calls, including analogRead channel numbers. SDA/SCL share A4/A5. Data is based on the [official Uno R3 pinout](https://docs.arduino.cc/resources/pinouts/A000066-full-pinout.pdf).

## Compiler and libraries

The persistent module Worker uses the existing @horang-corp/avr-gcc-wasm 0.2.0 compiler, assembler, linker and objcopy. It detects supported library includes, loads only selected bundles and dependencies, verifies their hashes, mounts genuine source files, compiles each required unit, links the Arduino core for avr5/ATmega328P, validates ELF architecture and static SRAM, generates Intel HEX, and validates checksums and the selected board’s application-flash limit (32,256 Uno; 30,720 Nano).

The Arduino core is built-in. LIBRARIES shows 17 curated, preinstalled libraries with pinned versions, descriptions, dependencies and examples. A checkmark requires passing real compile/link/HEX tests for the exact build identity. Examples always open as a new sketch. There is no arbitrary online installer. See `reports/compatibility.md` for versions, complete results and constraints.

Core objects are reused from the pinned core archive. An 8 MiB Worker LRU cache reuses unchanged library objects, keyed by compiler/build identity, source hashes, flags, include paths and project-source context. Time-dependent macros disable reuse. Student source is never replaced with cached or precompiled sketch firmware. Build progress, memory usage and elapsed time come from actual work.

Local autocomplete uses CodeMirror's C++ parser and bundled Arduino/library reference data. Suggestions include signatures, concise descriptions and in-file declarations. It has no network or AI service. Arrows choose, Enter/Tab insert, Escape dismisses and Ctrl+Space requests suggestions. The setting remains optional and saved locally; pin hover works independently. It is a lightweight helper, not a complete C++ language server.

## Offline and installation

Circuitera registers a release-specific Service Worker on HTTPS production builds. After installation and reopening the site, the cached shell lets students open and edit locally saved sketches during a network outage. The Offline panel reports actual cache readiness.

Choose **Prepare offline compiler** while online to download the 28 required compiler/core/library catalog assets, verifying their SHA-256 hashes. All source bundles may be cached on disk, but each compilation still mounts only the required libraries into WASM memory. Offline compilation is available when the complete compiler cache is ready. Missing or failed assets show their paths and an honest error. Browser storage eviction can remove caches; readiness can be checked again.

Chrome's Install option can install the PWA where supported; installation is never required. Service Worker updates wait for old Circuitera tabs to close and never force a reload during compilation or upload. Close all Circuitera tabs and reopen to use a newly deployed version. The Google verification HTML, robots.txt and sitemap.xml always use ordinary static network serving. Cache cleanup never touches IndexedDB sketches or unrelated caches. This lifecycle follows the [Chrome Service Worker update guidance](https://developer.chrome.com/docs/workbox/handling-service-worker-updates).

## Help, shortcuts and SEO

Small IDE links lead to optional, prerendered public pages: About, Features, Examples, Getting Started, Arduino on Chromebook, Supported Libraries, Arduino Uno Pinout, Troubleshooting and How It Works. The root remains instant access. Old authentication URLs redirect to `/`; no Supabase packages, sessions, credentials or auth requests are needed.

Ctrl/Command+S saves, Ctrl/Command+Enter verifies and Ctrl/Command+Shift+Enter uploads. New/close handlers support Ctrl/Command+N/W when Chrome delivers them; Chrome normally reserves these browser shortcuts. Alt+N/W and toolbar buttons are reliable alternatives. The `?` button lists shortcuts.

The production origin remains `https://circuitera.netlify.app/`, preserving origin-bound sketches. Existing title, descriptions, canonicals, Open Graph/Twitter metadata, favicon remain. Public routes appear in sitemap.xml; robots.txt allows normal crawling. The exact original `public/googleb22ad35e0875e1ed.html` is copied unchanged to the production and ZIP root. Its SHA-256 is `972b00d6171c5d708d436db7ceb05a24f942744c78e898f29e678ee3fb0d8f46`. Keep it in all builds.

## Validation and limits

Reports distinguish actual browser checks, genuine WASM tests and software serial fixtures. Every library PASS means real source → AVR WASM compile → AVR link → valid nonempty Intel HEX. Tests cover all 17 libraries and 32 examples, baseline firmware equality, different firmware for changed code, actual multi-file linkage, changed headers, missing implementations, filename diagnostics, independent workspace restoration, autocomplete, serial/plotter integration, wizard failure handling, PWA checksums and offline asset serving.

The offline test harness executes the generated Service Worker with network access disabled and compiles a real Servo sketch using its cached WASM/core/library bytes. Node loads the identical verified .mjs modules from disk. This is not a claim that a disconnected physical Chromebook was tested. Production Chrome checks are recorded separately in `reports/capability-production.json` when completed.

**No physical Uno or Nano was connected during this revision.** The unchanged uploader and flash verification are exercised with software protocol fixtures, including corrupt readback. Physical hardware/peripheral behavior should be checked on the user's Uno and both Nano bootloader variants. USB bridge fixture tests do not prove OS driver or physical hardware compatibility.

Uno limits still apply: 2 KiB SRAM, runtime stack/heap beyond reported static RAM, timer conflicts between libraries, and shared pins. SSD1306 128×64 allocates another 1024 bytes at runtime. LiquidCrystal_I2C is the pinned johnrickman API. Complex .ino declarations may need explicit prototypes. Full C99/C11, arbitrary libraries, and untested API combinations are not promised.

## Netlify release

Upload `circuitera-netlify.zip` to the existing site. It contains the complete static application, source bundles, compiler assets, manifest, Service Worker, headers, redirects, metadata, favicon and unchanged Google verification file at the top level. No backend is used. Keep the existing domain to retain local sketches; Export All before moving domains or clearing browser storage.

Maintainers can reproduce the release with the existing lockfile and vendored sources (students do not run these commands):

```sh
npm ci
npm run build
npm run test:libraries
npm run test:nano
npm run build
npm test
npm run test:examples
npm run test:workspace
npm run test:projects
npm run test:ui
npm run test:editor
npm run test:site
npm run test:offline
npm run check:site
node scripts/package-release.mjs
```

The second build copies matching compile evidence into the catalog. Changed compiler/library inputs invalidate old checkmarks. Test HEX under source reports is evidence only and is excluded from the static release.

Circuitera is an independent project and is not affiliated with Arduino. Arduino is a trademark of Arduino SA. Upstream notices and pinned source checksums remain in vendor sources and `avr/THIRD_PARTY_NOTICES.md`. Original circuit-trace logo assets retain their light/dark variants and favicon sizes.
