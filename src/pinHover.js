import { hoverTooltip } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { findBoardPin } from './boardPins.js';
import { DEFAULT_BOARD, getBoard } from './boards.js';
export function pinReferenceAt(state,pos,boardId=DEFAULT_BOARD) {
  let node=syntaxTree(state).resolveInner(pos,-1);
  while(node){if(/Comment|String|CharLiteral/.test(node.name))return null;node=node.parent;}
  const line=state.doc.lineAt(pos); if(line.length>2000)return null;
  const pattern=/\b(pinMode|digitalWrite|digitalRead|analogRead|analogWrite|pulseIn|tone|noTone)\s*\(\s*(LED_BUILTIN|A[0-7]|\d+)\b/g;
  for(const match of line.text.matchAll(pattern)){
    const from=line.from+match.index+match[0].length-match[2].length,to=from+match[2].length;
    const reference=match[1]==='analogRead'&&/^\d$/.test(match[2])&&Number(match[2])<getBoard(boardId).analogInputs?'A'+match[2]:match[2];
    if(pos>=from&&pos<=to){const pin=findBoardPin(reference,boardId);return pin?{from,to,pin}:null;}
  }
  return null;
}
export const pinHoverForBoard=(boardId=DEFAULT_BOARD)=>hoverTooltip((view,pos)=>{
  const result=pinReferenceAt(view.state,pos,boardId);if(!result)return null;
  return {pos:result.from,end:result.to,above:true,create(){const dom=document.createElement('div');dom.className='pin-tooltip';const title=document.createElement('strong');title.textContent=result.pin.name;const detail=document.createElement('span');detail.textContent=result.pin.capabilities.join(' · ')+' — '+result.pin.detail;dom.append(title,detail);return{dom};}};
},{hoverTime:250});

export const unoPinHover=pinHoverForBoard();
