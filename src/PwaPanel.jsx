import { useEffect, useState } from 'react';
import { WorkbenchDialog } from './WorkbenchDialogs.jsx';
let registrationPromise;
export function registerOfflineWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return Promise.resolve(null);
  if(!registrationPromise)registrationPromise=navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(error=>{registrationPromise=null;throw error;});
  return registrationPromise;
}
function askWorker(worker,type,onProgress) {
  return new Promise((resolve,reject)=>{
    if(!worker){reject(new Error('The offline shell is still installing. Try Check cache in a moment.'));return;}
    const channel=new MessageChannel();
    const timeout=setTimeout(()=>{channel.port1.close();reject(new Error('Offline preparation is taking longer than expected. Check the cache again to see completed assets.'));},180000);
    channel.port1.onmessage=({data})=>{if(data.done){clearTimeout(timeout);channel.port1.close();resolve(data);}else onProgress?.(data);};
    worker.postMessage({type},[channel.port2]);
  });
}
export default function PwaPanel({onClose}) {
  const [registration,setRegistration]=useState(null),[status,setStatus]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[install,setInstall]=useState(null);
  useEffect(()=>{let stopped=false;registerOfflineWorker().then(r=>{if(!stopped)setRegistration(r);}).catch(e=>{if(!stopped)setError(e.message);});return()=>{stopped=true;};},[]);
  useEffect(()=>{const prompt=e=>{e.preventDefault();setInstall(e);};window.addEventListener('beforeinstallprompt',prompt);return()=>window.removeEventListener('beforeinstallprompt',prompt);},[]);
  const check=async type=>{if(busy)return;setBusy(true);setError('');try{const r=registration||await registerOfflineWorker();setRegistration(r);const reply=await askWorker(r?.active,type,p=>setProgress(`${p.progress}/${p.total} · ${p.path.split('/').pop()}`));setStatus(reply);if(reply.error)setError(reply.error);}catch(e){setError(e.message);}finally{setBusy(false);}};
  return <WorkbenchDialog title="Offline & install" onClose={onClose} busy={busy}><p className="dialog-note">Your sketches always stay in IndexedDB. An offline copy lets Circuitera open when the connection drops. Installing the app is optional.</p>
    <dl className="offline-status"><div><dt>IDE shell</dt><dd>{status?.shellReady?'✓ Cached':registration?'Installing / not checked':'Requires a production HTTPS site and service workers'}</dd></div><div><dt>Compiler & libraries</dt><dd>{status?.compilerReady?'✓ All required assets cached':status?`${status.compilerCached}/${status.compilerTotal} assets cached`:'Not checked'}</dd></div></dl>
    <div className="offline-actions"><button disabled={busy||!registration} onClick={()=>check('STATUS')}>Check cache</button><button disabled={busy||!registration} onClick={()=>check('PREPARE_COMPILER')}>Prepare offline compiler</button>{install&&<button onClick={async()=>{await install.prompt();await install.userChoice;setInstall(null);}}>Install Circuitera</button>}</div>
    {busy&&<p role="status" className="dialog-note">Downloading and checking assets… {progress}</p>}{error&&<p role="alert" className="offline-error">{error}</p>}
    <p className="dialog-note">After the first offline preparation, close and reopen Circuitera once so its offline worker controls the page. Without cached compiler assets you can still edit and export sketches, but compilation needs internet access.</p>
    <p className="dialog-note">To install, use Chrome’s Install app option when available. School policy may disable installation or offline storage. No installation is needed for normal use.</p>
    {registration?.waiting&&<p className="dialog-note">A new version is ready. Save your work, close all Circuitera tabs, then reopen. Updates never interrupt an active upload.</p>}
    <p className="dialog-note">Browser storage can be cleared or evicted. Export All remains the portable backup of your work.</p>
  </WorkbenchDialog>;
}
