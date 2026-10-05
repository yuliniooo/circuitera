import { unoPins, pinoutReference } from './unoPins.js';
import { getBoard, DEFAULT_BOARD } from './boards.js';
export const nanoPinoutReference='https://docs.arduino.cc/resources/pinouts/A000005-full-pinout.pdf';
const nanoPins=[...unoPins.map(pin=>({...pin,detail:pin.name==='3.3V'?'3.3 V output from the USB interface where fitted. Availability and current limit depend on the Nano-compatible board. Not a programmable pin.':pin.name==='VIN'?'External power input before the regulator. For first projects, power the Nano through USB.':pin.detail.replace('shared with the SDA header','same signal as SDA').replace('shared with the SCL header','same signal as SCL')})),
  ...[6,7].map(n=>({name:'A'+n,number:14+n,capabilities:['ANALOG'],detail:'10-bit analog input (0–1023), analog-only. Use analogRead(). This pin cannot use digitalRead(), digitalWrite(), pinMode() or PWM.'}))];
export function pinsForBoard(boardId=DEFAULT_BOARD){return getBoard(boardId).family==='nano'?nanoPins:unoPins;}
export function pinoutForBoard(boardId=DEFAULT_BOARD){return getBoard(boardId).family==='nano'?nanoPinoutReference:pinoutReference;}
export function findBoardPin(value,boardId=DEFAULT_BOARD){const pins=pinsForBoard(boardId);return pins.find(pin=>value==='LED_BUILTIN'?pin.name==='D13':/^\d+$/.test(String(value))?pin.number===Number(value):pin.name===value);}
