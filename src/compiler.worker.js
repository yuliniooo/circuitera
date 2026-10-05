import { compileUno } from './compiler-engine.js';

let busy = false;
self.onmessage = async ({ data }) => {
  if (busy) return;
  busy = true;
  try {
    const result = await compileUno(data.source, {
      assetsBase: data.assetsBase,
      boardId: data.boardId,
      onProgress: progress => self.postMessage({ id: data.id, type: 'progress', progress }),
    });
    self.postMessage({ id: data.id, type: 'result', result });
  } catch(error) {
    self.postMessage({id:data.id,type:'result',result:{ok:false,board:data.boardId,output:`Worker exception: ${error?.message || error}\n${error?.stack || ''}`,diagnostics:[]}});
  } finally { busy = false; }
};
