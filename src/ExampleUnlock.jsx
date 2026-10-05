import { useRef, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { WorkbenchDialog } from './WorkbenchDialogs.jsx';

export default function ExampleUnlock({ exampleName, onClose, onUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submitted = useRef(false);
  const submit = event => {
    event.preventDefault();
    if (submitted.current) return;
    if (password !== 'trading') {
      setError('Incorrect password. Passwords are case-sensitive.');
      return;
    }
    submitted.current = true;
    onUnlock();
  };
  return <WorkbenchDialog title="Unlock examples" onClose={onClose}>
    <form className="example-unlock" onSubmit={submit}>
      <p><LockKeyhole size={18} aria-hidden="true"/> Open <strong>{exampleName}</strong> as a new sketch.</p>
      <label htmlFor="example-password">Examples password</label>
      <input id="example-password" type="password" value={password} autoComplete="off" spellCheck={false}
        aria-invalid={Boolean(error)} aria-describedby={error ? 'example-password-error' : 'example-password-help'}
        onChange={event=>{setPassword(event.target.value);setError('');}}/>
      <p id="example-password-help">Unlocks examples until the IDE is reloaded. Your own sketches remain available.</p>
      {error && <p id="example-password-error" role="alert">{error}</p>}
      <div className="example-unlock-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit">Unlock examples</button></div>
    </form>
  </WorkbenchDialog>;
}
