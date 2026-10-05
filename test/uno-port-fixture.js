// Software protocol fixture ONLY. Never imported by the production application.
// It verifies the unmodified uploader; it is not a claim of physical USB testing.
import assert from 'node:assert/strict';
export class UnoPortFixture {
  constructor({ corruptRead = false, uploadBaud = 115200, usbVendorId = 0x2341, usbProductId = 0x0043, ignoreSync = 0, signature = [0x1e,0x95,0x0f], disconnectOnRead = false } = {}) {
    this.signature=signature; this.uploadBaud=uploadBaud; this.usbInfo={usbVendorId,usbProductId}; this.ignoreSync=ignoreSync; this.disconnectOnRead=disconnectOnRead;
    this.memory = new Uint8Array(32768).fill(255);
    this.address = 0;
    this.commands = [];
    this.signals = [];
    this.corruptRead = corruptRead;
    this.closed = false;
    this.writtenSerial = [];
  }
  getInfo() { return this.usbInfo; }
  async open(options) {
    assert.ok(!this.isOpen, 'Serial port must be closed before the next owner opens it');
    this.isOpen = true;
    assert.ok([this.uploadBaud, 9600].includes(options.baudRate));
    this.options = options;
    this.readable = new ReadableStream({ start: controller => { this.controller = controller; } });
    this.writable = new WritableStream({ write: packet => {
      if (options.baudRate !== this.uploadBaud) { this.writtenSerial.push(new TextDecoder().decode(packet)); return; }
      assert.equal(packet[packet.length - 1], 0x20);
      const command = packet[0];
      this.commands.push(command);
      if(command===0x30&&this.ignoreSync-->0)return;
      if(command===0x74&&this.disconnectOnRead){this.controller.error(new Error('The device has been lost (disconnected)'));return;}
      let response = [0x14, 0x10];
      if(command===0x75)response=[0x14,...this.signature,0x10];
      else if (command === 0x55) this.address = (packet[1] | (packet[2] << 8)) * 2;
      else if (command === 0x64) {
        const count = (packet[1] << 8) | packet[2];
        assert.equal(count, 128);
        this.memory.set(packet.slice(4, 4 + count), this.address);
      } else if (command === 0x74) {
        const count = (packet[1] << 8) | packet[2];
        const bytes = this.memory.slice(this.address, this.address + count);
        if (this.corruptRead) bytes[0] ^= 1;
        response = [0x14, ...bytes, 0x10];
      } else assert.ok([0x30, 0x50, 0x51].includes(command), `Unexpected command ${command}`);
      // Split acknowledgements and data to exercise real stream buffering.
      this.controller.enqueue(Uint8Array.from(response.slice(0, 1)));
      this.controller.enqueue(Uint8Array.from(response.slice(1)));
    } });
  }
  async setSignals(value) { this.signals.push(value); }
  async close() { assert.equal(this.readable.locked,false,'Reader lock released before close'); assert.equal(this.writable.locked,false,'Writer lock released before close'); this.closed = true; this.isOpen = false; }
  receive(text) { this.controller.enqueue(new TextEncoder().encode(text)); }
}
