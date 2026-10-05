// Uno R3 / ATmega328P pin capabilities. Source: official Uno R3 pinout.
export const pinoutReference = 'https://docs.arduino.cc/resources/pinouts/A000066-full-pinout.pdf';
export const unoPins = [
  ...Array.from({length:14},(_,n)=>({name:'D'+n,number:n,capabilities:['DIGITAL',...([3,5,6,9,10,11].includes(n)?['PWM']:[]),...([0,1].includes(n)?['UART']:[]),...([10,11,12,13].includes(n)?['SPI']:[]),...([2,3].includes(n)?['INTERRUPT']:[])],detail:n===0?'RX · shared with the USB serial connection':n===1?'TX · shared with the USB serial connection':n===13?'SCK · also connected to the onboard LED':n===10?'SS · SPI chip select':n===11?'MOSI · SPI data to peripherals':n===12?'MISO · SPI data from peripherals':n===2?'External interrupt INT0':n===3?'External interrupt INT1 · PWM':`Digital input/output${[5,6,9].includes(n)?' · PWM with analogWrite()':''}`})),
  ...Array.from({length:6},(_,n)=>({name:'A'+n,number:14+n,capabilities:['ANALOG','DIGITAL',...(n>=4?['I2C']:[])],detail:`10-bit analog input (0–1023). Also digital pin ${14+n}.${n===4?' SDA · shared with the SDA header.':n===5?' SCL · shared with the SCL header.':''}`})),
  {name:'5V',capabilities:['POWER'],detail:'5 V power rail, not a programmable I/O pin.'},
  {name:'3.3V',capabilities:['POWER'],detail:'3.3 V regulated output, up to 50 mA. Not a programmable pin.'},
  {name:'GND',capabilities:['GROUND'],detail:'Common ground reference. Join the ground of connected modules to GND.'},
  {name:'VIN',capabilities:['POWER'],detail:'External power input before the regulator. For first projects, power the Uno through USB.'},
  {name:'RESET',capabilities:['RESET'],detail:'Pulling RESET low restarts the microcontroller. The reset button does the same.'},
  {name:'SDA',number:18,capabilities:['I2C','DIGITAL','ANALOG'],detail:'I2C data. Electrically the same pin as A4, not an extra independent pin.'},
  {name:'SCL',number:19,capabilities:['I2C','DIGITAL','ANALOG'],detail:'I2C clock. Electrically the same pin as A5, not an extra independent pin.'},
];
export function findUnoPin(value) {
  if(value==='LED_BUILTIN')return unoPins.find(p=>p.name==='D13');
  if(/^\d+$/.test(String(value)))return unoPins.find(p=>p.number===Number(value));
  return unoPins.find(p=>p.name===value);
}
