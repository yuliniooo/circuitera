const STK_OK = 0x10;
const STK_INSYNC = 0x14;
const CRC_EOP = 0x20;
const FLASH_LIMIT = 32256;
const PAGE_SIZE = 128;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseIntelHex(hexText) {
  const flash = new Uint8Array(FLASH_LIMIT).fill(0xff);
  let upperAddress = 0;
  let highest = 0;
  let hasData = false;

  for (const [index, rawLine] of hexText.trim().split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!line.startsWith(":")) throw new Error(`Invalid HEX record on line ${index + 1}.`);
    const bytes = [];
    for (let i = 1; i < line.length; i += 2) {
      const value = Number.parseInt(line.slice(i, i + 2), 16);
      if (Number.isNaN(value)) throw new Error(`Invalid HEX data on line ${index + 1}.`);
      bytes.push(value);
    }
    const length = bytes[0];
    if (bytes.length !== length + 5) throw new Error(`Bad HEX length on line ${index + 1}.`);
    if ((bytes.reduce((sum, byte) => sum + byte, 0) & 0xff) !== 0) {
      throw new Error(`Bad HEX checksum on line ${index + 1}.`);
    }
    const address = (bytes[1] << 8) | bytes[2];
    const type = bytes[3];
    const data = bytes.slice(4, 4 + length);

    if (type === 0x00) {
      const absolute = upperAddress + address;
      if (absolute + length > FLASH_LIMIT) {
        throw new Error("Firmware exceeds the Arduino Uno R3 application flash area.");
      }
      flash.set(data, absolute);
      highest = Math.max(highest, absolute + length);
      hasData = hasData || length > 0;
    } else if (type === 0x04) {
      if (data.length !== 2) throw new Error("Invalid extended address record.");
      upperAddress = ((data[0] << 8) | data[1]) << 16;
    } else if (type === 0x02) {
      if (data.length !== 2) throw new Error("Invalid segment address record.");
      upperAddress = ((data[0] << 8) | data[1]) << 4;
    } else if (type === 0x01) {
      break;
    }
  }

  if (!hasData) throw new Error("The compiler returned an empty firmware file.");
  const paddedLength = Math.ceil(highest / PAGE_SIZE) * PAGE_SIZE;
  return flash.slice(0, paddedLength);
}

class Stk500Transport {
  constructor(port) {
    this.port = port;
    this.reader = null;
    this.writer = null;
    this.buffer = [];
  }

  async open() {
    await this.port.open({ baudRate: 115200, bufferSize: 1024 });
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
  }

  async close() {
    try { this.reader?.cancel(); } catch {}
    try { this.reader?.releaseLock(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    this.reader = null;
    this.writer = null;
    try { await this.port.close(); } catch {}
  }

  async write(bytes) {
    await this.writer.write(Uint8Array.from(bytes));
  }

  async readByte(timeoutMs = 1000) {
    if (this.buffer.length) return this.buffer.shift();
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("The Uno bootloader did not respond in time.")), timeoutMs);
    });
    const result = await Promise.race([this.reader.read(), timeout]);
    if (result.done) throw new Error("The serial connection closed unexpectedly.");
    this.buffer.push(...result.value);
    return this.buffer.shift();
  }

  async expectAck(timeoutMs = 1200) {
    const first = await this.readByte(timeoutMs);
    const second = await this.readByte(timeoutMs);
    if (first !== STK_INSYNC || second !== STK_OK) {
      throw new Error(`Unexpected bootloader reply: 0x${first.toString(16)} 0x${second.toString(16)}.`);
    }
  }

  async readBytes(length, timeoutMs = 1500) {
    const result = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      result[index] = await this.readByte(timeoutMs);
    }
    return result;
  }

  async command(bytes, timeoutMs) {
    await this.write([...bytes, CRC_EOP]);
    await this.expectAck(timeoutMs);
  }

  async readFlashPage(length) {
    await this.write([0x74, (length >> 8) & 0xff, length & 0xff, 0x46, CRC_EOP]);
    const first = await this.readByte(1500);
    if (first !== STK_INSYNC) throw new Error("The Uno did not acknowledge flash verification.");
    const data = await this.readBytes(length, 1500);
    const last = await this.readByte(1500);
    if (last !== STK_OK) throw new Error("The Uno reported a flash verification error.");
    return data;
  }

  async sync() {
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      try {
        await this.write([0x30, CRC_EOP]);
        const deadline = Date.now() + 450;
        let previous = -1;
        while (Date.now() < deadline) {
          const byte = await this.readByte(Math.max(40, deadline - Date.now()));
          if (previous === STK_INSYNC && byte === STK_OK) return;
          previous = byte;
        }
      } catch {}
      await delay(90);
    }
    throw new Error("Could not enter the Uno bootloader. Check the USB cable and make sure this is an Uno R3.");
  }
}

export async function uploadUno(port, hexText, { onProgress = () => {}, onLog = () => {} } = {}) {
  const firmware = parseIntelHex(hexText);
  const transport = new Stk500Transport(port);
  onLog(`Firmware ready: ${firmware.length} bytes including page padding.`);

  try {
    await transport.open();
    onLog("USB serial port opened at 115200 baud.");

    // Opening the port normally resets an Uno. The signal pulse also covers common Uno clones.
    try {
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await delay(80);
      await port.setSignals({ dataTerminalReady: true, requestToSend: true });
      await delay(280);
    } catch {
      await delay(350);
    }

    await transport.sync();
    onLog("Uno bootloader synchronized (STK500v1). ");
    await transport.command([0x50]);

    const pageCount = firmware.length / PAGE_SIZE;
    for (let page = 0; page < pageCount; page += 1) {
      const byteAddress = page * PAGE_SIZE;
      const wordAddress = byteAddress >> 1;
      await transport.command([0x55, wordAddress & 0xff, (wordAddress >> 8) & 0xff]);
      const pageData = firmware.slice(byteAddress, byteAddress + PAGE_SIZE);
      await transport.command([0x64, 0x00, PAGE_SIZE, 0x46, ...pageData], 1800);

      // Read each page back before continuing so a cable/flash error cannot be reported as success.
      await transport.command([0x55, wordAddress & 0xff, (wordAddress >> 8) & 0xff]);
      const verified = await transport.readFlashPage(PAGE_SIZE);
      for (let index = 0; index < PAGE_SIZE; index += 1) {
        if (verified[index] !== pageData[index]) {
          throw new Error(`Flash verification failed at address 0x${(byteAddress + index).toString(16).toUpperCase()}.`);
        }
      }
      onProgress(Math.round(((page + 1) / pageCount) * 100));
    }

    await transport.command([0x51]);
    onLog("Upload verified. The Uno is restarting with the new sketch.");
  } finally {
    await transport.close();
  }
}

export function describePort(port) {
  const info = port?.getInfo?.() || {};
  const hex = (value) => value == null ? "----" : value.toString(16).padStart(4, "0").toUpperCase();
  return `USB ${hex(info.usbVendorId)}:${hex(info.usbProductId)}`;
}
