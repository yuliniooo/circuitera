// Static reading below the workbench. No editor, storage or serial state.
export const homeHeading = 'Arduino IDE for Chromebook — Compile & Upload in Your Browser';

export const homeFaq = [
  ['Can I program an Arduino on a Chromebook?', 'Yes. Open Circuitera in Chrome, choose your Uno R3 or Nano V3, write a sketch and compile it locally. Connect the board with a USB data cable and allow Chrome to access its serial port when you upload.'],
  ['Do I need to install Arduino IDE?', 'No desktop Arduino IDE, extension, Terminal or Linux setup is required. The editor and AVR-GCC WebAssembly compiler run in your browser.'],
  ['Can Circuitera upload code to a real Arduino?', 'Yes. Circuitera sends the firmware generated from your current sketch to a connected physical board over USB using Web Serial and STK500v1. It reads the flash back to verify the upload before reporting success.'],
  ['Does Circuitera support Arduino Uno R3?', 'Yes. Arduino Uno R3 with ATmega328P is the default target. Select it in the board dropdown before compiling and uploading.'],
  ['Does Circuitera support Arduino Nano V3?', 'Yes. The classic Nano V3 with ATmega328P has separate new and old bootloader options. The new setting uploads at 115200 baud and the old setting at 57600 baud. Nano Every, Nano 33 and other Nano families are not supported.'],
  ['Does it work with Chrome Web Serial?', 'Yes. USB uploading and Serial Monitor require desktop Chrome with Web Serial enabled and your permission to use the selected device. If school policy blocks serial access, ask your teacher or school IT administrator to allow serial-device access for this site.'],
  ['Do I need an account?', 'No. The IDE opens immediately. Sketches, tabs and autosaves stay locally in this browser using IndexedDB. Export .ino files or use Export All for a backup or to move your work to another device.'],
];

export default function HomeGuide() {
  return <section className="ide-guide" aria-labelledby="circuitera-guide-title" id="circuitera-guide">
    <div className="ide-guide-inner">
      <header className="ide-guide-header">
        <p className="ide-guide-label"><span aria-hidden="true" /> CIRCUITERA / BROWSER TO HARDWARE</p>
        <h1 id="circuitera-guide-title">{homeHeading}</h1>
        <p>Build hardware from your browser. A local coding workspace for your next circuit.</p>
      </header>
      <div className="ide-guide-grid">
        <section aria-labelledby="program-from-chromebook" className="ide-guide-intro">
          <h2 id="program-from-chromebook">Program Arduino Directly From Your Chromebook</h2>
          <p>Circuitera is an online Arduino IDE for writing normal Arduino C/C++ code in Chrome. Its AVR-GCC WebAssembly compiler runs locally, turning your current sketch and required libraries into genuine Intel HEX firmware.</p>
          <p>Program a physical Arduino Uno R3 or Nano V3 over USB using Chrome Web Serial, then open Serial Monitor to read sensor values or send commands. You can get started without installing the desktop Arduino IDE.</p>
          <p>Keep multiple sketches in local tabs with autosave, import an existing <code>.ino</code> file, or export individual sketches and ZIP backups. Your source code stays on your device; compilation does not send it to a server.</p>
          <nav className="ide-guide-links" aria-label="Explore Circuitera"><a href="/features" data-route>Explore features</a><a href="/examples" data-route>Try an example</a><a href="/supported-libraries" data-route>Preinstalled libraries</a></nav>
        </section>
        <section aria-labelledby="supported-arduino-boards" className="ide-guide-boards">
          <h2 id="supported-arduino-boards">Supported Arduino Boards</h2>
          <dl>
            <div><dt><span aria-hidden="true" />Arduino Uno R3</dt><dd><span className="ide-guide-spec">ATmega328P · 5V · 16 MHz</span><p>The default board. Select Uno R3 for its standard bootloader and upload configuration.</p></dd></div>
            <div><dt><span aria-hidden="true" />Arduino Nano V3</dt><dd><span className="ide-guide-spec">ATmega328P · 5V · 16 MHz</span><p>Choose <strong>new bootloader</strong> (115200 baud) or <strong>old bootloader</strong> (57600 baud) to match your board. If a compatible Nano cannot synchronize, check the bootloader selection.</p></dd></div>
          </dl>
          <p className="ide-guide-note">These are the classic AVR boards. Other Uno and Nano models use different processors and are not supported by this IDE.</p>
        </section>
        <section aria-labelledby="chromebook-how-to" className="ide-guide-how">
          <h2 id="chromebook-how-to">How to Program an Arduino From a Chromebook</h2>
          <ol>
            <li>Connect your Arduino to your Chromebook with a <strong>USB data cable</strong>.</li>
            <li>Open <strong>Circuitera in Chrome</strong>.</li>
            <li>Select your <strong>Arduino board</strong> and, for Nano, the correct bootloader.</li>
            <li>Write or import your <strong>Arduino sketch</strong>.</li>
            <li>Click <strong>Compile</strong> — the blue <strong>Verify</strong> button in the toolbar.</li>
            <li>Click <strong>Upload</strong>.</li>
            <li>Select the Arduino when Chrome asks for a <strong>serial device</strong>.</li>
            <li>Open <strong>Serial Monitor</strong> if your project uses serial communication. Match its baud rate to <code>Serial.begin(...)</code>.</li>
          </ol>
          <p className="ide-guide-note">Chrome with Web Serial support is required for USB access. A charging-only cable will not work. On a managed Chromebook, school IT may need to allow serial-device access.</p>
          <a href="/getting-started" data-route>Read the getting started guide →</a>
        </section>
        <section aria-labelledby="circuitera-faq" className="ide-guide-faq">
          <h2 id="circuitera-faq">Frequently Asked Questions</h2>
          {homeFaq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
        </section>
      </div>
      <footer className="ide-guide-footer">
        <nav aria-label="Circuitera guides"><a href="/about" data-route>About</a><a href="/arduino-on-chromebook" data-route>Arduino on Chromebook</a><a href="/how-it-works" data-route>How Circuitera works</a><a href="/troubleshooting" data-route>Troubleshooting</a><a href="#circuitera-editor">Back to editor ↑</a></nav>
        <p>Circuitera is an independent project and is not affiliated with Arduino. Arduino is a trademark of Arduino SA.</p>
      </footer>
    </div>
  </section>;
}
