// Arduino AVR Boards 1.8.6, vendor/arduino-core/boards.txt.
// Classic 5 V / 16 MHz ATmega328P boards only; other Nano families differ.
export const DEFAULT_BOARD = 'arduino:avr:uno';
export const BOARD_STORAGE_KEY = 'circuitera:board';
export const PB_BOARD = 'circuitera:avr:atmega328pb';
export const BOARD_PROFILES = Object.freeze([
  Object.freeze({id:DEFAULT_BOARD,name:'Arduino Uno R3',shortName:'Uno R3',family:'uno',label:'Arduino Uno R3 — ATmega328P',bootloader:'Optiboot',baudRate:115200,flashLimit:32256,ramLimit:2048,macro:'ARDUINO_AVR_UNO',variant:'standard',analogInputs:6}),
  Object.freeze({id:'arduino:avr:nano:cpu=atmega328',name:'Arduino Nano V3',shortName:'Nano V3',family:'nano',label:'Arduino Nano V3 — ATmega328P (new bootloader)',bootloader:'New bootloader · Optiboot',baudRate:115200,flashLimit:30720,ramLimit:2048,macro:'ARDUINO_AVR_NANO',variant:'eightanaloginputs',analogInputs:8}),
  Object.freeze({id:'arduino:avr:nano:cpu=atmega328old',name:'Arduino Nano V3',shortName:'Nano V3',family:'nano',label:'Arduino Nano V3 — ATmega328P (old bootloader)',bootloader:'Old bootloader · ATmegaBOOT',baudRate:57600,flashLimit:30720,ramLimit:2048,macro:'ARDUINO_AVR_NANO',variant:'eightanaloginputs',analogInputs:8}),
  Object.freeze({id:PB_BOARD,name:'ATmega328PB — 16 MHz',shortName:'ATmega328PB',family:'pb',label:'ATmega328PB — 16 MHz',mcu:'atmega328pb',clock:16000000,protocol:'STK500v1',uart:0,bootloader:'Compatible serial bootloader · UART0',baudRate:115200,flashLimit:28672,ramLimit:2048,macro:'ARDUINO_AVR_ATmega328PB',variant:'standard',analogInputs:6,signature:[0x1e,0x95,0x16]}),
].map(board=>Object.freeze({mcu:'atmega328p',clock:16000000,protocol:'STK500v1',uart:0,signature:[0x1e,0x95,0x0f],...board})));
export function getBoard(id=DEFAULT_BOARD) {
  const board=BOARD_PROFILES.find(board=>board.id===id);
  if(!board)throw new Error(`Unsupported board profile: ${String(id)}. Select a supported Uno, Nano V3, or ATmega328PB profile.`);
  return board;
}
export function readBoardSetting() {
  try{return getBoard(localStorage.getItem(BOARD_STORAGE_KEY)||DEFAULT_BOARD).id;}catch{return DEFAULT_BOARD;}
}
export const boardDetails = board => `Board: ${board.name} / ${board.mcu.toUpperCase()} · 16 MHz · 5 V\nBootloader: ${board.bootloader}\nUpload baud: ${board.baudRate}\nApplication flash: ${board.flashLimit} bytes${board.family==='pb'?'\nPB: 4 KB reserved for an unknown bootloader; tries 115200 then 57600 baud. Uno-style header mapping only; confirm your clone wiring.':''}`;
export const librariesForBoard=(libraries,boardId)=>libraries.map(lib=>boardId===DEFAULT_BOARD?lib:{...lib,status:lib.boardTests?.[boardId]?.status||'UNTESTED',test:lib.boardTests?.[boardId]||null});
