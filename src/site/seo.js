export const homeTitle = 'Circuitera – Arduino IDE for Chromebook | Compile & Upload Online';
export const homeDescription = 'Program Arduino Uno R3 and Nano V3 directly from Chrome. Compile Arduino code, upload over USB, and use Serial Monitor without installing an IDE.';

// Factual application metadata; no invented ratings, reviews or usage figures.
export function applicationSchema(origin = 'https://circuitera.netlify.app') {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': origin + '/#application',
    name: 'Circuitera',
    url: origin + '/',
    description: homeDescription,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'ChromeOS, Windows, macOS',
    browserRequirements: 'Requires JavaScript and WebAssembly. USB uploading and Serial Monitor require desktop Chrome with Web Serial access.',
    isAccessibleForFree: true,
    inLanguage: 'en',
    featureList: [
      'Arduino C/C++ editor with local autocomplete',
      'Local AVR-GCC WebAssembly compilation and Intel HEX generation',
      'Arduino Uno R3 and classic Nano V3 ATmega328P targets',
      'Nano new and old bootloader configurations',
      'Web Serial USB upload with flash readback verification',
      'Serial Monitor and Serial Plotter',
      'Preinstalled Arduino libraries',
      'Local IndexedDB sketches, autosave, .ino import/export and ZIP export',
    ],
  };
}
