import { useState } from 'react';
import { pinsForBoard, pinoutForBoard } from './boardPins.js';
import { getBoard, DEFAULT_BOARD } from './boards.js';
export default function PinHelper({boardId=DEFAULT_BOARD}) {
  const board=getBoard(boardId), unoPins=pinsForBoard(boardId), pinoutReference=pinoutForBoard(boardId);
  const [selected,setSelected]=useState('D9'),[filter,setFilter]=useState('ALL');
  const pin=unoPins.find(p=>p.name===selected);
  return <section className="pin-helper" aria-label={`${board.family==='pb'?'ATmega328PB':board.family === 'nano' ? 'Nano' : 'Uno'} pinout`}><h2>{board.family.toUpperCase()} PINOUT <span>{board.family==='pb'?'Uno-style':board.family==='nano'?'V3':'R3'}</span></h2><p>{board.mcu==='atmega328pb'?'ATmega328PB':'ATmega328P'} · 16 MHz · 5 V logic</p>
    {board.family==='pb'&&<p className="sidebar-note">Standard Uno header mapping; check your clone’s wiring. Extra PB pins and board-specific power outputs are not verified.</p>}
    <select aria-label="Filter pin capabilities" value={filter} onChange={e=>setFilter(e.target.value)}>{['ALL','DIGITAL','ANALOG','PWM','UART','I2C','SPI','INTERRUPT','POWER'].map(c=><option key={c}>{c}</option>)}</select>
    <div className="pin-grid">{unoPins.filter(p=>filter==='ALL'||p.capabilities.includes(filter)).map(p=><button key={p.name} aria-pressed={selected===p.name} onClick={()=>setSelected(p.name)} title={`${p.name}: ${p.capabilities.join(' · ')}`} className={p.capabilities.includes('POWER')?'power-pin':p.capabilities.includes('ANALOG')?'analog-pin':p.capabilities.includes('PWM')?'pwm-pin':''}><i/>{p.name}{p.capabilities.includes('PWM')&&<small>~</small>}</button>)}</div>
    <div className="pin-details"><h3>{pin.name}</h3><div>{pin.capabilities.map(c=><span key={c}>{c}</span>)}</div><p>{pin.detail}</p></div>
    <p className="sidebar-note">PWM pins: 3, 5, 6, 9, 10, 11. PWM switches between HIGH and LOW; it is not a true analog voltage output.</p><p className="sidebar-note">Keep D0/D1 free while uploading or using USB Serial. Hover over a literal pin argument in code for a quick reminder.</p>
    <a href={pinoutReference} target="_blank" rel="noopener">{board.family==='pb'?'Uno header mapping reference':'Official '+board.shortName+' pinout'} ↗</a>
  </section>;
}
