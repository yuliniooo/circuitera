export const informationRoutes = ['/about', '/features', '/how-it-works', '/examples', '/getting-started', '/arduino-on-chromebook', '/supported-libraries', '/uno-pinout', '/troubleshooting'];
import { homeTitle, homeDescription } from './seo.js';
export const publicRoutes = ['/', ...informationRoutes];
export const normalizePath = pathname => pathname.replace(/\/+$/, '') || '/';
export const examplePath = name => '/?example=' + encodeURIComponent(name);

// Retire old entry points without loading a gate or touching local sketches.
export function routeHref(value, origin) {
  const url = new URL(value, origin);
  const path = normalizePath(url.pathname);
  if (path === '/' || path === '/ide') {
    const example = url.searchParams.get('example');
    return '/' + (example ? '?example=' + encodeURIComponent(example.slice(0, 100)) : '');
  }
  return informationRoutes.includes(path) ? path : '/';
}
export const pageMetadata = {
  '/': [homeTitle, homeDescription],
  '/getting-started': ['Getting Started – Circuitera Arduino Web IDE', 'Write your first Arduino sketch, compile locally, connect an Uno R3 and upload with Circuitera. Keep sketches and project files saved on your device.'],
  '/arduino-on-chromebook': ['Arduino IDE for Chromebook – Circuitera Guide', 'Program Arduino Uno on Chromebook in Chrome with no desktop IDE or extension. Learn about USB serial permissions, local compilation and offline preparation.'],
  '/supported-libraries': ['Supported Arduino Uno Libraries – Circuitera', 'Explore Circuitera’s preinstalled Arduino libraries, tested versions, dependencies and working examples for sensors, displays, servos and more.'],
  '/uno-pinout': ['Arduino Uno R3 Pinout – Circuitera', 'Find Arduino Uno digital, analog, PWM, UART, I2C, SPI, interrupt and power pins. Learn which pins share functions before wiring your project.'],
  '/troubleshooting': ['Arduino Upload and Compiler Troubleshooting – Circuitera', 'Understand real Arduino compiler errors, USB permission issues, Uno bootloader sync failures and flash verification messages in Circuitera.'],
  '/about': ['About Circuitera – Arduino IDE for Chromebook', 'Build hardware from your browser. Circuitera is a free Arduino Uno IDE with local compilation, physical uploading and no account required.'],
  '/features': ['Features – Circuitera Arduino Web IDE', 'Explore local WebAssembly compilation, Arduino Uno uploading, preinstalled libraries, autocomplete and local sketches in Circuitera.'],
  '/how-it-works': ['How It Works – Program Arduino on Chromebook', 'Write Arduino C++, compile locally in Chrome, and upload real firmware to an Arduino Uno R3 using Web Serial.'],
  '/examples': ['Arduino Uno Examples – Circuitera', 'Start with working Arduino Uno examples for LEDs, sensors, servos and displays. Open each project in the Circuitera browser IDE.'],
};
