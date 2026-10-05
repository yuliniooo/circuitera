import { useEffect, useState } from 'react';
import { FileCode, Plus, Pencil, X, FolderCode } from 'lucide-react';
export default function ProjectFiles({ sketch, onConvert, onSelect, onAdd, onRename, onRemove, onExport }) {
  const [action,setAction]=useState(null), [name,setName]=useState(''), [error,setError]=useState('');
  useEffect(()=>{setAction(null);setError('');},[sketch?.id]);
  if (!sketch) return null;
  if (!sketch.project) return <button className="convert-project" onClick={onConvert} title="Optional: keep this sketch and add separate C++ source/header files"><FolderCode size={14}/>Convert to Project</button>;
  const selected=sketch.project.activeFile;
  const submit=event=>{event.preventDefault();try{if(action==='add')onAdd(name.trim());else onRename(action.rename,name.trim());setAction(null);setError('');}catch(e){setError(e.message);}};
  return <section className="project-files" aria-label="Project files">
    <header><strong>PROJECT FILES</strong><button aria-label="Add project file" title="Add .ino, .cpp, .c or .h file" onClick={()=>{setAction('add');setName('motor.h');setError('');}}><Plus size={14}/></button></header>
    {sketch.project.files.map(file=><div className={selected===file.name?'project-file selected':'project-file'} key={file.name}>
      <button onClick={()=>onSelect(file.name)} aria-label={`Edit ${file.name}`} aria-current={selected===file.name?'page':undefined}><FileCode size={13}/><span>{file.name}</span></button>
      <button aria-label={`Rename file ${file.name}`} onClick={()=>{setAction({rename:file.name});setName(file.name);setError('');}}><Pencil size={12}/></button>
      {file.name!==sketch.project.entry&&<button aria-label={`Remove file ${file.name}`} onClick={()=>{setAction({remove:file.name});setError('');}}><X size={12}/></button>}
    </div>)}
    {action?.remove ? <div className="file-confirm" role="alert"><p>Delete {action.remove} from this project?</p><button onClick={()=>{onRemove(action.remove);setAction(null);}}>Delete file</button><button onClick={()=>setAction(null)}>Cancel</button></div> : action && <form className="file-form" onSubmit={submit}><input autoFocus aria-label="Project filename" value={name} maxLength={80} onChange={e=>setName(e.target.value)}/><button type="submit">{action==='add'?'Add file':'Rename file'}</button><button type="button" onClick={()=>setAction(null)}>Cancel</button></form>}
    {error&&<p role="alert" className="project-error">{error}</p>}
    <button className="project-export" onClick={onExport}>Export project ZIP</button>
    <p className="sidebar-note">All project sources compile together. .cpp files need their own includes. .c supports C-compatible syntax with C linkage; full C99/C11 is unavailable.</p>
  </section>;
}
