import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import {
  ArrowDownToLine,
  BookOpen,
  Check,
  ChevronDown,
  CircleStop,
  Code2,
  Cpu,
  FilePlus2,
  FolderOpen,
  Moon,
  Play,
  Save,
  Send,
  Sun,
  TerminalSquare,
  Upload,
  Usb,
  X,
  Zap,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronUp,
  Info,
  Settings2,
  Stethoscope,
} from "lucide-react";
import { DebugPanel, SystemCheckPanel, EditorSettings } from './ReliabilityPanels.jsx';
import { compilerFailureSummary, readLocalPreference, clampFontSize, uniqueDiagnostics, QUICKSTART_KEY, FONT_SIZE_KEY } from './localDebug.js';
import { examples, starterSketch } from "./examples.js";
import { libraryExamples } from "./libraryExamples.js";
import { WorkspaceSidebar, CompileSummary, DiagnosticsPanel } from './WorkspacePanels.jsx';
import SerialPlotter from './SerialPlotter.jsx';
import { workspaceExamples, exampleGroups } from './workspaceExamples.js';
import { explainDiagnostics, boardSerialFailure, serialPolicyMessage, parsePlotLine, lineEndings } from './workspaceSupport.js';
import { compileSketchInBrowser } from "./compiler.js";
import { describePort } from "./serial.js";
import { workbenchTheme, lightWorkbenchTheme } from "./editorTheme.js";
import { arduinoAutocomplete, AUTOCOMPLETE_KEY, readAutocompleteSetting } from './autocomplete.js';
import { useSketchWorkspace } from './useSketchWorkspace.js';
import { useSketchBuilds, artifactMatches } from './sketchBuilds.js';
import { exportSketchZip, sketchFilename } from './sketchZip.js';
import { historyField } from '@codemirror/commands';
import PwaPanel from './PwaPanel.jsx';
import { TestMyUno, Shortcuts } from './WorkbenchDialogs.jsx';
import ExampleUnlock from './ExampleUnlock.jsx';
import PinHelper from './PinHelper.jsx';
import { pinHoverForBoard } from './pinHover.js';
import ProjectFiles from './ProjectFiles.jsx';
import { editorSource, editorKey, activeFile, compilationSource, sourceIdentity } from './projectFiles.js';
import SketchTabs from './SketchTabs.jsx';

import { BOARD_PROFILES, BOARD_STORAGE_KEY, getBoard, readBoardSetting, boardDetails, librariesForBoard } from './boards.js';
import { diagnoseBoard } from './boardDiagnostic.js';
import { uploadForBoard } from './boardUpload.js';
const cppExtension = cpp();
const editorBasicSetup = { lineNumbers: true, foldGutter: true, highlightActiveLine: true, autocompletion: false, completionKeymap: false, bracketMatching: true };
const allExamples = { ...examples, ...libraryExamples, ...workspaceExamples };

function outputTone(line, compileFailed = false) {
  if (compileFailed && /^Sketch uses/.test(line)) return "log-error";
  if (/\b(error|failed|failure|fatal)\b/i.test(line)) return "log-error";
  if (/\bwarning\b/i.test(line)) return "log-warning";
  if (/^(✓ COMPILED|Sketch uses|Compiled locally|Compilation succeeded|Upload verified|(Uno|Nano) bootloader synchronized)/i.test(line)) return "log-success";
  if (/^(Target:|Firmware ready:|Starting Uno|USB serial port opened)/.test(line)) return "log-info";
  return "";
}


function policyMessage() {
  return serialPolicyMessage;
}



export default function App({ siteControls, registerLeaveGuard, initialExample = '', onExampleOpened } = {}) {
  const [boardId, setBoardId] = useState(readBoardSetting);
  const board = getBoard(boardId), boardRef = useRef(boardId);
  boardRef.current = boardId;
  const { workspace: sketchWorkspace, sketches: savedSketches, activeId: sketchId, openIds, theme, ready: workspaceReady, pending, failedIds, error: saveError } = useSketchWorkspace();
  const activeSketch = savedSketches.find(s => s.id === sketchId);
  const name = activeSketch?.name || 'No sketch', code = editorSource(activeSketch);
  const sessionKey = editorKey(activeSketch), currentSource = activeSketch ? sourceIdentity(activeSketch) : '';
  const currentFile = activeFile(activeSketch)?.name;
  const setName = next => sketchWorkspace.rename(sketchId, next);
  const setTheme = update => sketchWorkspace.setTheme(typeof update === 'function' ? update(theme) : update);
  const { output, setOutput, diagnostics, setDiagnostics, compiled, setCompiled, compileState, setCompileState,
    compileProgress, setCompileProgress, compileResult, setCompileResult, lastUpload, setLastUpload,
    uploadStage, setUploadStage, uploadProgress, setUploadProgress } = useSketchBuilds(sketchId, boardId);
  const [activePanel, setActivePanel] = useState("output");
  const [busy, setBusy] = useState("");
  const [busySketch, setBusySketch] = useState(null);
  const [serialSupported] = useState(() => typeof navigator !== "undefined" && "serial" in navigator);
  const [boardStatus, setBoardStatus] = useState(() =>
    typeof navigator !== "undefined" && "serial" in navigator ? "No board selected" : "USB serial unavailable",
  );
  const [selectedPort, setSelectedPort] = useState(null);
  const [monitoring, setMonitoring] = useState(false);
  const [serialText, setSerialText] = useState("");
  const [baudRate, setBaudRate] = useState(9600);
  const [serialInput, setSerialInput] = useState("");
  const [connectionActivity, setConnectionActivity] = useState("");
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [libraryCatalog, setLibraries] = useState([]);
  const libraries = useMemo(() => librariesForBoard(libraryCatalog, boardId), [libraryCatalog, boardId]);
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(readAutocompleteSetting);
  const [autocompleteSaveError, setAutocompleteSaveError] = useState('');
  const editorExtensions = useMemo(() => [cppExtension, pinHoverForBoard(boardId), ...(autocompleteEnabled ? arduinoAutocomplete(libraries, boardId) : [])], [autocompleteEnabled, libraries, boardId]);
  const [libraryError, setLibraryError] = useState('');
  const [showLibraries, setShowLibraries] = useState(true);
  const [catalog, setCatalog] = useState(null);
  const [sidebarSection, setSidebarSection] = useState('sketch');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showSystemCheck, setShowSystemCheck] = useState(false);
  const [systemChecks, setSystemChecks] = useState([]);
  const [systemOutput, setSystemOutput] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState(()=>clampFontSize(readLocalPreference(FONT_SIZE_KEY,15)));
  const [preferenceError, setPreferenceError] = useState('');
  const [showGuidance, setShowGuidance] = useState(()=>readLocalPreference(QUICKSTART_KEY,'')!=='yes');
  const [sessionStats, setSessionStats] = useState({compiles:0,uploads:0,lastSeconds:null});
  const [pausedMonitorView, setPausedMonitorView] = useState(null);
  const [showHardware, setShowHardware] = useState(false);
  const examplesUnlocked = useRef(false);
  const [pendingExample, setPendingExample] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showOffline,setShowOffline] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(250);
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);
  const [autoscroll, setAutoscroll] = useState(true);
  const [timestamps, setTimestamps] = useState(false);
  const [lineEnding, setLineEnding] = useState('nl');
  const [serialEntries, setSerialEntries] = useState([]);
  const [plotPoints, setPlotPoints] = useState([]);
  const [plotPaused,setPlotPaused] = useState(false);
  const plotPausedRef = useRef(false);
  const [plotWindowSeconds,setPlotWindowSeconds] = useState(30);
  const [plotTimestamps,setPlotTimestamps] = useState(false);
  useEffect(()=>{setSystemChecks([]);setSystemOutput('');},[boardId]);
  const shownDiagnostics = useMemo(() => uniqueDiagnostics(diagnostics), [diagnostics]);
  const explanations = useMemo(() => explainDiagnostics(shownDiagnostics), [shownDiagnostics]);
  const availableExamples = useMemo(() => Object.keys(allExamples).filter(name =>
    name in examples || name in workspaceExamples || libraries.some(lib => lib.status === 'PASS' && lib.examples.includes(name)),
  ), [libraries]);

  const editorViewRef = useRef(null);
  const editorIdRef = useRef(null);
  const editorSessions = useRef(new Map());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const rememberEditor = () => {
    const view = editorViewRef.current;
    if (editorIdRef.current && view?.state?.toJSON) editorSessions.current.set(editorIdRef.current, { json: view.state.toJSON({ history: historyField }), fields: { history: historyField }, scrollTop: view.scrollDOM.scrollTop });
    editorViewRef.current = null;
  };
  const fileInputRef = useRef(null);
  const portRef = useRef(null);
  const serialReaderRef = useRef(null);
  const serialWriteRef = useRef(null);
  const monitorRunRef = useRef(false);
  const monitorTaskRef = useRef(null);
  const operationRef = useRef(false);
  const serialOutputRef = useRef(null);
  const serialLineRef = useRef('');
  const pendingSerialRef = useRef('');
  const serialFlushRef = useRef(null);
  const skipLFRef = useRef(false);
  const dirty = pending.has(sketchId) || failedIds.has(sketchId);
  const updateEditorCode = useCallback(value => {
    if (currentFile) sketchWorkspace.editFile(sketchId, currentFile, value);
    else sketchWorkspace.edit(sketchId, { code: value });
    setCompiled(current => artifactMatches(current, sketchWorkspace.active(), boardId) ? current : null);
  }, [sketchWorkspace, sketchId, currentFile, setCompiled, boardId]);
  const updateEditorCursor = useCallback(update => {
    if (update.selectionSet || update.docChanged) {
      const position = update.state.selection.main.head;
      const line = update.state.doc.lineAt(position);
      setCursor({ line: line.number, column: position - line.from + 1 });
    }
  }, []);
  const toggleAutocomplete = () => {
    const enabled = !autocompleteEnabled;
    setAutocompleteEnabled(enabled);
    try { localStorage.setItem(AUTOCOMPLETE_KEY, enabled ? 'on' : 'off'); setAutocompleteSaveError(''); }
    catch { setAutocompleteSaveError('Preference could not be saved; this choice applies to this tab.'); }
  };

  const appendOutput = useCallback((line) => {
    setOutput((current) => `${current}${current ? "\n" : ""}${line}`);
  }, [setOutput]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    const url = new URL('avr/curated/manifest.json', document.baseURI);
    fetch(url, { cache: 'no-cache' })
      .then(response => { if (!response.ok) throw new Error(`Library catalog unavailable (${response.status}): ${url}`); return response.json(); })
      .then(catalog => { if (!cancelled) { setLibraries(catalog.libraries); setCatalog(catalog); } })
      .catch(error => { if (!cancelled) setLibraryError(`${error.message}\nAsset: ${url}`); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!serialSupported) return undefined;
    const disconnected = (event) => {
      if ((event.port || event.target) === portRef.current) {
        setBoardStatus("Board disconnected");
        setSelectedPort(null);
        portRef.current = null;
        setMonitoring(false);
        monitorRunRef.current = false;
        serialReaderRef.current?.cancel().catch(() => {});
        appendOutput(`BOARD DISCONNECTED\nThe USB connection was lost. Reconnect the ${getBoard(boardRef.current).shortName} to continue.`);
      }
    };
    navigator.serial.addEventListener("disconnect", disconnected);
    return () => navigator.serial.removeEventListener("disconnect", disconnected);
  }, [serialSupported, appendOutput]);

  const saveSketch = useCallback(async () => {
    if (await sketchWorkspace.save(sketchId)) appendOutput(`Saved “${name}” in this browser.`);
  }, [sketchWorkspace, sketchId, appendOutput, name]);

  useEffect(() => {
    if (autoscroll && pausedMonitorView === null && serialOutputRef.current) serialOutputRef.current.scrollTop = serialOutputRef.current.scrollHeight;
  }, [serialText, serialEntries, timestamps, autoscroll, activePanel, pausedMonitorView]);
  useEffect(() => () => {
    monitorRunRef.current = false;
    serialReaderRef.current?.cancel().catch(() => {});
    clearTimeout(serialFlushRef.current);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (pendingExample || deleteTarget || showHardware || showShortcuts || showOffline || showSystemCheck || showDebug || showSettings) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveSketch();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) uploadSketch(); else compileSketch();
      }
      if (!event.shiftKey && (event.ctrlKey || event.metaKey || event.altKey) && ['n', 'w'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        if (event.key.toLowerCase() === 'n') newSketch(); else closeSketch(sketchId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const newSketch = () => {
    if (!workspaceReady) return;
    rememberEditor(); sketchWorkspace.create();
  };

  const openExample = (exampleName) => {
    if (!workspaceReady || !Object.hasOwn(allExamples, exampleName)) return;
    rememberEditor(); sketchWorkspace.create(exampleName, allExamples[exampleName]);
  };
  // Local classroom prompt, not a security boundary for bundled example source.
  // Never persist the unlock or gate the compiler, uploader or saved sketches.
  const loadExample = (exampleName) => {
    if (!workspaceReady || !Object.hasOwn(allExamples, exampleName)) return;
    if (!examplesUnlocked.current) { setPendingExample(exampleName); return; }
    openExample(exampleName);
  };
  const unlockExamples = () => {
    examplesUnlocked.current = true;
    openExample(pendingExample);
    setPendingExample('');
  };

  // Public project links open a NEW sketch through the existing workspace API.
  const openedSiteExample = useRef('');
  useEffect(() => {
    if (!workspaceReady || !initialExample || openedSiteExample.current === initialExample) return;
    openedSiteExample.current = initialExample;
    if (Object.hasOwn(allExamples, initialExample)) loadExample(initialExample);
    else appendOutput(`Example not available: ${initialExample}`);
    onExampleOpened?.();
  }, [workspaceReady, initialExample, onExampleOpened]);

  const importSketch = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!workspaceReady || !file) return;
    if (!file.name.toLowerCase().endsWith(".ino")) {
      setOutput("Import failed: choose an Arduino .ino file.");
      return;
    }
    try { const text = await file.text(); rememberEditor(); sketchWorkspace.create(file.name.replace(/\.ino$/i, ''), text); }
    catch (error) { appendOutput(`Import failed: ${error.message}`); }
  };

  const exportSketch = () => {
    if (!activeSketch) return;
    const safeName = currentFile || sketchFilename(name);
    const blob = new Blob([code], { type: "text/x-arduino;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    appendOutput(`Exported ${safeName}.`);
  };

  const exportAll = () => {
    try {
      const blob = exportSketchZip(sketchWorkspace.state.sketches);
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'uno-sketches.zip'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      appendOutput(`Exported ${savedSketches.length} sketches as uno-sketches.zip.`);
    } catch (error) { appendOutput(`Export All failed: ${error.message}`); }
  };

  const measuredCompile = async (source, progress) => {
    const start=performance.now();
    setSessionStats(s=>({...s,compiles:s.compiles+1}));
    try { return await compileSketchInBrowser(source,progress,boardId); }
    finally { setSessionStats(s=>({...s,lastSeconds:(performance.now()-start)/1000})); }
  };
  const performCompile = async (snapshot) => {
    const started = performance.now();
    setBusy("compile");
    setCompileState("running");
    setActivePanel("output");
    setConsoleCollapsed(false);
    setUploadStage('');
    setDiagnostics([]);
    setCompileProgress({ stage: 'PREPARING', detail: 'Loading required compiler assets' });
    setOutput(boardDetails(board) + "\n\nLoading AVR-GCC WebAssembly and compiling locally…\nThe first compile downloads the bundled AVR tools; later builds can reuse them.");
    try {
      const result = await measuredCompile(compilationSource(snapshot), progress => {
        if (progress.stage === 'COMPILING LIBRARIES' && progress.detail === 'No libraries required') return;
        setCompileProgress(progress);
      });
      setCompileResult({ ...result, sketchId: snapshot.id, source: sourceIdentity(snapshot), seconds: (performance.now() - started) / 1000 });
      setCompileState(result.ok ? "ok" : "error");
      if (!result.ok) setCompileProgress({ stage: 'FAILED', detail: 'See compiler output below' });
      setOutput(result.output || (result.ok ? "Compilation succeeded." : "Compilation failed."));
      setDiagnostics(result.diagnostics || []);
      if (!result.ok) {
        setCompiled(null);
        return null;
      }
      const artifact = { hex: result.hex, sketchId: snapshot.id, source: sourceIdentity(snapshot), board: result.board };
      setCompiled(artifact);
      return artifact;
    } catch (error) {
      setCompileState("error");
      setCompileResult({ ok: false, sketchId: snapshot.id, source: sourceIdentity(snapshot), seconds:(performance.now()-started)/1000 });
      setCompileProgress({ stage: 'FAILED', detail: error.message });
      setCompiled(null);
      setOutput(`${boardDetails(board)}\nLocal compiler failed: ${error.message}\n${error.stack || ''}\n\nNo firmware was produced.`);
      return null;
    } finally {
      setBusy("");
    }
  };

  const compileSketch = async () => {
    const snapshot = sketchWorkspace.active();
    if (busy || operationRef.current || !snapshot || snapshot.id !== sketchId) return;
    operationRef.current = true;
    setBusySketch({ id: snapshot.id, name: snapshot.name });
    try { await performCompile(snapshot); } finally { operationRef.current = false; setBusySketch(null); }
  };

  const selectPort = async () => {
    if (!serialSupported) throw new DOMException(policyMessage(), "SecurityError");
    setConnectionActivity("Selecting board…");
    try {
      const port = await navigator.serial.requestPort();
      portRef.current = port;
      setSelectedPort(port);
      setBoardStatus(`${board.shortName} selected · ${describePort(port)}`);
      return port;
    } finally {
      setConnectionActivity("");
    }
  };

  const stopMonitor = useCallback(async () => {
    try { await serialWriteRef.current; } catch {}
    monitorRunRef.current = false;
    const reader = serialReaderRef.current;
    try { await reader?.cancel(); } catch {}
    await monitorTaskRef.current;
    setMonitoring(false);
    if (portRef.current) setBoardStatus(`${getBoard(boardRef.current).shortName} selected · ${describePort(portRef.current)}`);
  }, []);

  const friendlySerialError = error => { const port=portRef.current; return boardSerialFailure(error, boardId, port ? `${describePort(port)} selected · ${port.readable ? 'serial stream available' : 'port closed/released'}` : 'No USB port selected / board disconnected'); };
  const changeBoard = async nextId => {
    if (operationRef.current || busy || showHardware || connectionActivity) return;
    const next = getBoard(nextId);
    operationRef.current = true; setConnectionActivity('Changing board…');
    try {
      await stopMonitor();
      if (next.family !== board.family) { portRef.current = null; setSelectedPort(null); setBoardStatus('No board selected'); }
      else setBoardStatus(portRef.current ? `${next.shortName} selected · ${describePort(portRef.current)}` : 'No board selected');
      boardRef.current = next.id; setBoardId(next.id);
      try { localStorage.setItem(BOARD_STORAGE_KEY, next.id); } catch { appendOutput('Board preference could not be saved; this choice applies to this tab.'); }
    } finally { operationRef.current = false; setConnectionActivity(''); }
  };

  const connectBoard = async () => {
    if (busy || operationRef.current) return;
    operationRef.current = true; setConnectionActivity('Selecting board…');
    try {
      // Keep the picker within this user gesture. Close any old monitor afterward.
      const port = await navigator.serial.requestPort();
      if (monitoring) await stopMonitor();
      operationRef.current = true;
      portRef.current = port; setSelectedPort(port);
      setBoardStatus(`${board.shortName} selected · ${describePort(port)}`);
    } catch (error) { appendOutput(friendlySerialError(error)); if (['SecurityError', 'NotAllowedError'].includes(error.name)) setBoardStatus('USB blocked by policy'); }
    finally { operationRef.current = false; setConnectionActivity(''); }
  };
  const checkBoard = async () => {
    if (busy || operationRef.current || !portRef.current) return;
    operationRef.current = true; setConnectionActivity('Checking bootloader…');
    try {
      await stopMonitor(); operationRef.current = true;
      await diagnoseBoard(portRef.current, boardId, {onLog: appendOutput});
    } catch(error) { appendOutput(friendlySerialError(error)); }
    finally { operationRef.current = false; setConnectionActivity(''); }
  };
  const disconnectBoard = async () => {
    if (busy || operationRef.current) return;
    operationRef.current = true;
    try { await stopMonitor(); portRef.current = null; setSelectedPort(null); setBoardStatus('No board selected'); }
    finally { operationRef.current = false; }
  };

  const uploadSketch = async () => {
    const snapshot = sketchWorkspace.active();
    if (busy || operationRef.current || !snapshot || snapshot.id !== sketchId) return;
    operationRef.current = true;
    setBusySketch({ id: snapshot.id, name: snapshot.name });
    setBusy('connect');
    setUploadStage('CONNECT BOARD');
    setLastUpload('In progress');
    setActivePanel("output");
    setConsoleCollapsed(false);
    setOutput("");
    setUploadProgress(0);
    try {
      if (monitoring) await stopMonitor();
      operationRef.current = true;
      // Port selection happens first so Chrome sees it directly inside the button click.
      const port = selectedPort || await selectPort();
      if (sketchWorkspace.active()?.id !== snapshot.id) throw new Error('Active sketch changed during board selection. Select the intended tab and click Upload again.');
      const artifact = artifactMatches(compiled, snapshot, boardId) ? compiled : await performCompile(snapshot);
      if (!artifact) { setLastUpload('Not attempted — compilation failed'); setUploadStage(''); return; }
      if (boardRef.current !== boardId || !artifactMatches(artifact, sketchWorkspace.active(), boardId)) throw new Error('Active sketch changed before flashing. No firmware was sent; click Upload in the intended tab.');
      setBusy("upload");
      setBoardStatus(`Uploading to ${board.shortName}…`);
      setOutput(`${boardDetails(board)}\nStarting ${board.shortName} upload…`);
      await uploadForBoard(port, artifact.hex, {
        onProgress: percent => { setUploadProgress(percent); setUploadStage('FLASHING + VERIFYING'); },
        onLog: line => {
          appendOutput(line);
          if (line.startsWith('Firmware ready:')) setUploadStage('PREPARING');
          if (line.startsWith('USB serial port opened')) setUploadStage('SYNCING');
          if (/^(Uno|Nano) bootloader synchronized/.test(line)) setUploadStage('FLASHING + VERIFYING');
        },
      }, boardId);
      setUploadStage('✓ UPLOAD COMPLETE');
      setLastUpload('Success');
      setSessionStats(s=>({...s,uploads:s.uploads+1}));
      dismissGuidance();
      setBoardStatus(`Upload complete · ${describePort(port)}`);
    } catch (error) {
      const message = friendlySerialError(error);
      appendOutput(`Upload failed: ${message}`);
      setUploadStage('UPLOAD FAILED'); setLastUpload('Failed');
      setBoardStatus(['SecurityError', 'NotAllowedError'].includes(error.name) ? "USB blocked by policy" : "Upload failed");
    } finally {
      setBusy("");
      operationRef.current = false;
      setBusySketch(null);
    }
  };

  const flushSerial = useCallback(() => {
    serialFlushRef.current = null;
    const chunk = pendingSerialRef.current;
    pendingSerialRef.current = '';
    if (!chunk) return;
    setSerialText(text => (text + chunk).slice(-65536));
    const entries = [], points = [];
    const finishLine = () => {
      const line = serialLineRef.current;
      serialLineRef.current = '';
      const time = new Date().toLocaleTimeString();
      entries.push({ text: line, time });
      const values = parsePlotLine(line);
      if (values && !plotPausedRef.current) points.push({ values, timeMs: Date.now() });
    };
    for (const char of chunk) {
      if (char === '\n' && skipLFRef.current) { skipLFRef.current = false; continue; }
      skipLFRef.current = char === '\r';
      if (char === '\r' || char === '\n') finishLine();
      else serialLineRef.current = (serialLineRef.current + char).slice(-4096);
    }
    if (entries.length) setSerialEntries(current => [...current, ...entries].slice(-500));
    if (points.length) setPlotPoints(current => [...current, ...points].slice(-300));
  }, []);

  const startMonitor = () => {
    if (monitoring || busy || operationRef.current) return;
    operationRef.current = true;
    setConnectionActivity('Connecting…');
    const task = (async () => {
      let reader, port;
      let opened = false;
      try {
        port = selectedPort || await selectPort();
        setConnectionActivity('Opening serial…');
        await port.open({ baudRate: Number(baudRate), bufferSize: 1024 });
        opened = true;
        portRef.current = port;
        monitorRunRef.current = true;
        setMonitoring(true); setConnectionActivity(''); operationRef.current = false;
        setBoardStatus(`Serial monitor · ${baudRate} baud`);
        serialLineRef.current = ''; skipLFRef.current = false;
        setSerialText(text => `${text}\n[Connected at ${baudRate} baud]\n`.slice(-65536));
        const decoder = new TextDecoder();
        reader = port.readable.getReader(); serialReaderRef.current = reader;
        while (monitorRunRef.current) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            pendingSerialRef.current = (pendingSerialRef.current + decoder.decode(value, { stream: true })).slice(-65536);
            if (!serialFlushRef.current) serialFlushRef.current = setTimeout(flushSerial, 50);
          }
        }
      } catch (error) {
        const message = friendlySerialError(error);
        setSerialText(text => `${text}\n[${message}]\n`.slice(-65536));
        setBoardStatus(['SecurityError', 'NotAllowedError'].includes(error.name) ? 'USB blocked by policy' : 'Serial monitor disconnected');
      } finally {
        clearTimeout(serialFlushRef.current); flushSerial();
        try { reader?.releaseLock(); } catch {}
        if (opened) { try { await port.close(); } catch {} }
        if (serialReaderRef.current === reader) serialReaderRef.current = null;
        monitorRunRef.current = false; setMonitoring(false); setConnectionActivity('');
        operationRef.current = false;
      }
    })();
    monitorTaskRef.current = task;
    return task;
  };

  const sendSerial = async () => {
    if (!monitoring || !serialInput || serialWriteRef.current || operationRef.current) return;
    let writer;
    try {
      writer = portRef.current.writable.getWriter();
      serialWriteRef.current = writer.write(new TextEncoder().encode(serialInput + lineEndings[lineEnding]));
      await serialWriteRef.current;
      setSerialInput("");
    } catch (error) {
      setSerialText((text) => `${text}\n[Send failed: ${error.message}]\n`);
    } finally { try { writer?.releaseLock(); } catch {} serialWriteRef.current = null; }
  };

  const openSaved = sketch => {
    if (sketch.id === sketchId) return;
    rememberEditor(); sketchWorkspace.open(sketch.id);
  };
  const duplicateSketch = () => {
    if (!activeSketch) return;
    rememberEditor(); sketchWorkspace.duplicate(sketchId);
  };
  const closeSketch = id => { if (id === sketchId) rememberEditor(); sketchWorkspace.close(id); editorSessions.current.delete(id); };
  const confirmDelete = async () => {
    if (!deleteTarget || deleting || busySketch?.id === deleteTarget.id) return;
    setDeleting(true);
    try {
      if (await sketchWorkspace.remove(deleteTarget.id)) { editorSessions.current.delete(deleteTarget.id); setDeleteTarget(null); }
    } finally { setDeleting(false); }
  };
  const chooseSidebar = section => { setSidebarSection(section); setShowLibraries(true); };
  const choosePanel = panel => { setActivePanel(panel); setConsoleCollapsed(false); };
  const resizeConsole = event => {
    event.preventDefault();
    const start = event.clientY, height = consoleHeight;
    const move = e => setConsoleHeight(Math.max(150, Math.min(window.innerHeight * .6, height + start - e.clientY)));
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end);
  };

  const pendingDiagnostic = useRef(null);
  const focusDiagnostic = (view, diagnostic) => {
    if (!view) return;
    const line = view.state.doc.line(Math.max(1, Math.min(diagnostic.line, view.state.doc.lines)));
    view.dispatch({ selection: { anchor: Math.min(line.to, line.from + Math.max(0, diagnostic.column - 1)) }, scrollIntoView: true });
    view.focus();
  };
  const selectProjectFile = filename => { if (filename !== currentFile) { rememberEditor(); sketchWorkspace.selectFile(sketchId, filename); } };
  const jumpToDiagnostic = diagnostic => {
    if (activeSketch?.project?.files.some(f => f.name === diagnostic.file) && diagnostic.file !== currentFile) {
      pendingDiagnostic.current = diagnostic; selectProjectFile(diagnostic.file); return;
    }
    focusDiagnostic(editorViewRef.current, diagnostic);
  };
  const exportProject = () => {
    const blob = exportSketchZip([activeSketch]);
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = sketchFilename(name).slice(0,-4)+'.zip'; link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const projectMutation = action => {
    const priorView=editorViewRef.current;rememberEditor();
    try { action(); if(editorKey(sketchWorkspace.active())===sessionKey)editorViewRef.current=priorView; } catch(error) { editorViewRef.current=priorView;throw error; }
  };
  const projectTools = <ProjectFiles sketch={activeSketch} onConvert={()=>{rememberEditor();sketchWorkspace.convertToProject(sketchId);}} onSelect={selectProjectFile} onAdd={filename=>projectMutation(()=>sketchWorkspace.addFile(sketchId,filename))} onRename={(before,next)=>projectMutation(()=>sketchWorkspace.renameFile(sketchId,before,next))} onRemove={filename=>projectMutation(()=>sketchWorkspace.removeFile(sketchId,filename))} onExport={exportProject}/>;

  const hardwareOperation = async operation => {
    if (operationRef.current || busy) throw new Error('Wait for the active compiler or serial operation to finish.');
    operationRef.current = true; setBusy('hardware');
    try { return await operation(); }
    finally { operationRef.current = false; setBusy(''); }
  };
  const openHardwareTest = async () => {
    if (operationRef.current || busy) return;
    operationRef.current=true;setBusy('preparing test');
    try { await stopMonitor(); setShowHardware(true); } finally { operationRef.current=false;setBusy(''); }
  };
  const setPreference = (key,value) => {
    try { localStorage.setItem(key,String(value));setPreferenceError(''); }
    catch { setPreferenceError('The preference could not be saved; it applies to this tab only.'); }
  };
  const changeFontSize = value => { const size=clampFontSize(value);setFontSize(size);setPreference(FONT_SIZE_KEY,size); };
  const dismissGuidance = () => { setShowGuidance(false);setPreference(QUICKSTART_KEY,'yes'); };
  const resetLayout = () => {setShowLibraries(true);setSidebarSection('sketch');setConsoleHeight(250);setConsoleCollapsed(false);setActivePanel('output');changeFontSize(15);};
  const runSystemCheck = async () => {
    if (operationRef.current || busy) return;
    operationRef.current=true;setBusy('system check');setSystemOutput('');
    const names=['WebAssembly','Compiler worker','Compiler','Arduino core','Required assets','Web Serial','Serial system','Local sketches'];
    setSystemChecks(names.map(name=>({name,status:'pending',detail:'Not checked'})));
    const record=(name,status,detail)=>setSystemChecks(rows=>rows.map(row=>row.name===name?{name,status,detail}:row));
    record('WebAssembly',typeof WebAssembly==='object'?'pass':'fail',typeof WebAssembly==='object'?'Available':'WebAssembly is unavailable in this browser.');
    record('Web Serial',serialSupported?'pass':'fail',serialSupported?'API available; permission checked below':policyMessage());
    try {
      try {
        if(!workspaceReady)throw new Error(saveError||'Sketch storage has not finished restoring.');
        const active=sketchWorkspace.active();
        if(active&&!await sketchWorkspace.save(active.id))throw new Error('Saving the current sketch failed.');
        if(!await sketchWorkspace.flush())throw new Error('Pending local writes failed.');
        record('Local sketches','pass','IndexedDB restored; current edits saved');
      } catch(error){record('Local sketches','fail',error.message);}
      if(serialSupported) {
        try { const ports=await navigator.serial.getPorts();record('Serial system','pass',`API responds · ${ports.length} previously authorized port(s). Physical communication not tested.`); }
        catch(error){record('Serial system','fail',`${error.name}: ${error.message}. ${policyMessage()}`);}
      } else record('Serial system','fail',policyMessage());
      const result=await measuredCompile('void setup(){ pinMode(LED_BUILTIN, OUTPUT); }\nvoid loop(){ digitalWrite(LED_BUILTIN, HIGH); delay(100); }',progress=>{
        record('Compiler worker','pass','Worker responded');record('Compiler','pending',`${progress.stage} · ${progress.detail||''}`);
      });
      setSystemOutput(result.output);
      record('Compiler',result.ok?'pass':'fail',result.ok?`Real AVR compile/link succeeded · ${result.flashBytes} flash bytes`:'Compilation failed. See Technical details.');
      for(const name of ['Arduino core','Required assets'])record(name,result.ok?'pass':'fail',result.ok?'Loaded and used by the successful test build':'Could not verify; see the actual failed stage and path below.');
      // Deliberately do not call setCompiled or setCompileResult: this probe is
      // never an artifact that Upload can use for the student's active sketch.
    } catch(error) {
      setSystemOutput(`${error.message}\n${error.stack||''}`);
      record('Compiler','fail','Worker did not complete. See Technical details.');
      setSystemChecks(rows=>rows.map(row=>row.status==='pending'?{...row,status:'fail',detail:'Could not finish this check; see Technical details.'}:row));
    } finally { operationRef.current=false;setBusy(''); }
  };
  const uploadComplete = boardStatus.startsWith("Upload complete");
  useEffect(() => {
    if (!registerLeaveGuard) return;
    return registerLeaveGuard(async () => {
      if (operationRef.current || busy || connectionActivity) throw new Error('Wait for compilation, board connection or upload to finish before leaving the IDE.');
      if (!workspaceReady) throw new Error('Your sketches are still restoring. Please wait a moment.');
      const state = sketchWorkspace.state;
      for (const id of new Set([...state.pending, ...state.failedIds])) {
        if (!await sketchWorkspace.save(id)) throw new Error('Your latest edits could not be saved. Export your sketches or retry saving before leaving the IDE.');
      }
      if (!await sketchWorkspace.flush()) throw new Error('Local saving failed. Export your sketches or retry saving before leaving the IDE.');
      await stopMonitor();
    });
  }, [registerLeaveGuard, busy, connectionActivity, workspaceReady, sketchWorkspace, stopMonitor]);
  const serialBlocked = !serialSupported || boardStatus === "USB blocked by policy";
  const boardIssue = /failed|disconnected|blocked|unavailable/i.test(boardStatus);
  const compilerLabel = busy === "compile" ? "Compiling" : compiled?.source === currentSource ? "Verified" : compileState === "error" ? "Error" : compileState === "ok" ? "Needs compile" : "Ready";
  const compilerTone = busy === "compile" ? "blue working" : compiled?.source === currentSource ? "green" : compileState === "error" ? "orange" : "blue";
  const connectionLabel = connectionActivity || (busy === "upload" ? "Flashing" : monitoring ? "Serial open" : uploadComplete ? "Upload verified" : boardIssue ? "Not connected" : "Port closed");

  return (
    <div className="app-shell" style={{'--editor-font-size':`${fontSize}px`}} data-activity={busy || (connectionActivity ? "connecting" : "idle")}>
      <header className="topbar">
        <div className="brand circuitera-brand" aria-label="Circuitera" title="Build hardware from your browser.">
          <picture className="circuitera-mark" aria-hidden="true"><img src={theme === 'dark' ? '/brand/circuitera-icon-dark.svg' : '/brand/circuitera-icon.svg'} width="32" height="32" alt="" /></picture>
          <span className="circuitera-wordmark">Circuitera</span>
          <span className="board-tag">{board.shortName.toUpperCase()} <span className="brand-target">• {board.mcu==='atmega328pb'?'ATmega328PB':'ATmega328P'} · 16 MHz</span></span>
        </div>

        <div className="primary-actions">
          <label className="board-selector" title={boardDetails(board)}><span>{board.family==='nano' ? `${board.baudRate===57600?'OLD':'NEW'} BOOTLOADER · ${board.baudRate} BAUD` : 'BOARD · 16 MHz'}</span><select aria-label="Target board" value={boardId} onChange={event => changeBoard(event.target.value)} disabled={Boolean(busy || connectionActivity || showHardware)}>{BOARD_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label>
          <button className="action-button compile" onClick={compileSketch} disabled={Boolean(busy || connectionActivity) || !activeSketch || deleting || typeof WebAssembly !== 'object' || typeof Worker !== 'function'} aria-busy={busy === "compile"} title={`Compile ${name}.ino · Ctrl/⌘ + Enter`}>
            {busy === "compile" ? <span className="spinner" /> : <Check size={19} />}
            {busy === "compile" ? "Compiling…" : "Verify"}
          </button>
          <button className="action-button upload" onClick={uploadSketch} disabled={Boolean(busy || connectionActivity) || !serialSupported || !activeSketch || deleting || typeof WebAssembly !== 'object' || typeof Worker !== 'function'} aria-busy={busy === "upload"} title={`Upload ${name}.ino to ${board.shortName} and verify flash`}>
            {busy === "upload" ? <span className="spinner" /> : <Upload size={19} />}
            {busy === "upload" ? busySketch?.id === sketchId ? `Uploading ${uploadProgress}%` : 'Uploading…' : "Upload"}
          </button>
        </div>

        <div className={`board-pill ${serialBlocked ? "blocked" : ""} ${uploadComplete ? "upload-complete" : ""}`} title={boardStatus} role="status">
          {connectionActivity || busy === "upload" ? <span className="spinner" /> : uploadComplete ? <Check size={16} /> : <Usb size={16} />}
          <span className={`status-dot ${selectedPort ? 'green' : 'muted'}`} />
          <span>{connectionActivity || (busy==='upload'?'UPLOADING':uploadComplete?'UPLOAD COMPLETE':boardStatus==='Board disconnected'?'CONNECTION LOST':selectedPort ? `${board.family.toUpperCase()} CONNECTED` : 'NO BOARD')}</span>
        </div>
        <div className="board-controls">
          <button className="test-uno-button" onClick={openHardwareTest} disabled={Boolean(busy) || Boolean(connectionActivity)}>Test My {board.family==='pb'?'ATmega328PB':board.family === 'nano' ? 'Nano' : 'Uno'}</button>
          <button onClick={connectBoard} disabled={Boolean(busy) || !serialSupported || Boolean(connectionActivity)}>{selectedPort ? 'Reconnect' : 'Connect board'}</button>
          {selectedPort && <button onClick={checkBoard} disabled={Boolean(busy || connectionActivity || showHardware)} title="Resets the board and queries its bootloader without writing flash">Check board</button>}
          {selectedPort && <button onClick={disconnectBoard} disabled={Boolean(busy) || Boolean(connectionActivity)} aria-label="Disconnect board"><X size={14} /></button>}
        </div>
      </header>

      {serialBlocked && (
        <div className="policy-banner" role="alert">
          <Zap size={18} />
          <span>{policyMessage()}</span>
        </div>
      )}

      <nav className="filebar" aria-label="Sketch tools">
        <button onClick={newSketch} disabled={!workspaceReady} title="New sketch · Alt+N (Ctrl/⌘+N when the browser permits)"><FilePlus2 size={16} />New</button>
        <button onClick={saveSketch} disabled={!activeSketch} title="Save in this browser · Ctrl/⌘ + S"><Save size={16} />Save locally</button>
        <span className="toolbar-divider" aria-hidden="true" />
        <button onClick={() => fileInputRef.current?.click()} disabled={!workspaceReady}><FolderOpen size={16} />Import .ino</button>
        <button onClick={exportSketch} disabled={!activeSketch}><ArrowDownToLine size={16} />Export .ino</button>
        <button onClick={exportAll} disabled={!savedSketches.length} title="Download all local sketches as a ZIP"><ArrowDownToLine size={16} />Export All</button>
        <button onClick={() => chooseSidebar('libraries')} aria-pressed={showLibraries && sidebarSection === 'libraries'} aria-controls="libraries-pane"><BookOpen size={16} />Libraries</button>
        <input ref={fileInputRef} type="file" accept=".ino,text/plain" onChange={importSketch} hidden />
        <span className="toolbar-divider" aria-hidden="true" />
        <label className="example-picker" title="Open an example sketch">
          <Play size={16} />
          <span>Examples</span>
          <select aria-label="Open example" defaultValue="" onChange={(event) => { loadExample(event.target.value); event.target.value = ""; }}>
            <option value="" disabled>Choose…</option>
            {Object.entries(exampleGroups).map(([group, names]) => <optgroup label={group} key={group}>{names.filter(n => availableExamples.includes(n)).map(example => <option value={example} key={example}>{example}</option>)}</optgroup>)}
          </select>
          <ChevronDown size={14} />
        </label>
        <span className="filebar-spacer" />
        <button onClick={()=>setShowSystemCheck(true)} disabled={Boolean(busy || connectionActivity)} title="Check compiler, assets, serial and local storage">System Check</button>
        <button className="offline-button" onClick={()=>setShowOffline(true)} title="Offline cache and optional app installation">Offline</button>
        <button className="shortcut-help" onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts" aria-label="Keyboard shortcuts">?</button>
        {siteControls && <div className="ide-site-tools">{siteControls}</div>}
        <button onClick={() => setShowDiagnostics(value => !value)} title="IDE diagnostics" aria-label="Open diagnostics"><Info size={16} /></button>
        <button onClick={() => setShowLibraries(value => !value)} aria-label={showLibraries ? 'Collapse sidebar' : 'Expand sidebar'}>{showLibraries ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
        <button onClick={()=>setShowDebug(true)} aria-label="Help me debug" title="Local code checks" disabled={!activeSketch}><Stethoscope size={16}/></button>
        <button onClick={()=>setShowSettings(true)} aria-label="Editor settings" title="Font size, layout and session statistics"><Settings2 size={16}/></button>
        <button className="theme-button" onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")} aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`} title={`Use ${theme === "dark" ? "light" : "dark"} theme`}>
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </nav>

      {showGuidance && <aside className="first-run-guide" aria-label="Getting started"><span><b>1</b> Connect <i>→</i> <b>2</b> Write or choose code <i>→</i> <b>3</b> Verify <i>→</i> <b>4</b> Upload <i>→</i> <b>5</b> See it run</span><button onClick={()=>loadExample('Blink')} disabled={!workspaceReady}>Try Blink</button><button onClick={dismissGuidance} aria-label="Dismiss getting started"><X size={13}/></button></aside>}
      <div className="workbench">
      {showLibraries && <div id="libraries-pane"><WorkspaceSidebar boardId={boardId} section={sidebarSection} onSection={chooseSidebar} name={name} activeId={sketchId} savedSketches={savedSketches} pending={pending} failedIds={failedIds} onOpen={openSaved} onRename={setName} onDuplicate={duplicateSketch} onDelete={setDeleteTarget} onNew={newSketch} ready={workspaceReady} libraries={libraries} libraryError={libraryError} availableExamples={availableExamples} onExample={loadExample} projectTools={projectTools} pinPanel={<PinHelper key={boardId} boardId={boardId}/>} /></div>}
      <section aria-label="Sketch workspace" className={`workspace ${consoleCollapsed ? 'console-collapsed' : ''}`} style={{ '--console-height': `${consoleHeight}px` }}>
        <section className="editor-card" aria-label="Arduino code editor">
          <div className="editor-tabbar">
            <SketchTabs sketches={savedSketches} openIds={openIds} activeId={sketchId} pending={pending} failedIds={failedIds} ready={workspaceReady} onOpen={openSaved} onClose={closeSketch} onNew={newSketch} onBrowse={() => chooseSidebar('sketch')} />
            <div className="editor-meta"><button className="autocomplete-toggle" aria-label="Autocomplete" aria-pressed={autocompleteEnabled} onClick={toggleAutocomplete} title={autocompleteSaveError || 'Local suggestions · ↑ ↓ to choose · Enter/Tab to insert · Esc to dismiss · Ctrl+Space to open'}>Autocomplete: {autocompleteEnabled ? 'On' : 'Off'}</button><span className="language-label">C++ / ARDUINO</span><span className="shortcut"><kbd>Ctrl/⌘</kbd> + <kbd>Enter</kbd> to compile</span></div>
          </div>
          {activeSketch?.project && <nav className="project-editor-tabs" aria-label="Open project files">{activeSketch.project.files.map(file=><button key={file.name} aria-current={file.name===currentFile?'page':undefined} onClick={()=>selectProjectFile(file.name)}>{file.name}</button>)}</nav>}
          {(busy || connectionActivity) && <div className={`activity-track ${busy === "upload" ? "upload-track" : "indeterminate"}`} aria-hidden="true"><span style={busy === "upload" ? { width: `${uploadProgress}%` } : undefined} /></div>}
          {activeSketch ? <CodeMirror
            key={sessionKey}
            id="sketch-editor-pane"
            initialState={editorSessions.current.get(sessionKey)}
            value={code}
            height="100%"
            theme={theme === 'light' ? lightWorkbenchTheme : workbenchTheme}
            readOnly={Boolean(busy) || deleting}
            extensions={editorExtensions}
            onChange={updateEditorCode}
            onCreateEditor={(view) => {
              editorViewRef.current = view; editorIdRef.current = sessionKey;
              if (pendingDiagnostic.current) { const diagnostic=pendingDiagnostic.current;pendingDiagnostic.current=null;requestAnimationFrame(()=>focusDiagnostic(view,diagnostic)); }
              const saved = editorSessions.current.get(sessionKey);
              if (saved && view.scrollDOM) view.scrollDOM.scrollTop = saved.scrollTop;
              if (view.state.selection) { const pos = view.state.selection.main.head, line = view.state.doc.lineAt(pos); setCursor({ line: line.number, column: pos - line.from + 1 }); }
            }}
            onUpdate={updateEditorCursor}
            basicSetup={editorBasicSetup}
            aria-label="Arduino sketch editor"
          /> : <div className="empty-editor" id="sketch-editor-pane"><Code2 size={28} /><strong>{workspaceReady ? 'Start building' : saveError ? 'Sketch storage unavailable' : 'Restoring your sketches…'}</strong><span>{workspaceReady ? 'Your saved sketches are in My Sketches.' : saveError || 'Loading local browser storage.'}</span>{workspaceReady && <div><button onClick={newSketch}>New Sketch</button><button onClick={() => chooseSidebar('examples')}>Open Example</button><button onClick={() => fileInputRef.current?.click()}>Import .ino</button><button onClick={() => chooseSidebar('sketch')}>My Sketches</button></div>}</div>}
        </section>

        <div className="console-resizer" role="separator" aria-label="Resize console" aria-orientation="horizontal" aria-valuemin={150} aria-valuemax={460} aria-valuenow={consoleHeight} tabIndex={0} onPointerDown={resizeConsole} onKeyDown={event => { if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); setConsoleHeight(h => Math.max(150, Math.min(460, h + (event.key === 'ArrowUp' ? 20 : -20)))); } }} />
        <section className={`console-card panel-${activePanel}`} aria-label="Output and serial monitor">
          <div className="console-header">
            <div className="console-tabs" role="tablist" aria-label="Console panels">
              <button id="output-tab" role="tab" aria-controls="output-panel" aria-selected={activePanel === "output"} className={`output-tab ${activePanel === "output" ? "active" : ""}`} onClick={() => choosePanel("output")}>
                <TerminalSquare size={16} />Output
                {shownDiagnostics.length > 0 && <span className="error-count">{shownDiagnostics.length}</span>}
              </button>
              <button id="serial-tab" role="tab" aria-controls="serial-panel" aria-selected={activePanel === "serial"} className={`serial-tab ${activePanel === "serial" ? "active" : ""}`} onClick={() => choosePanel("serial")}>
                <Usb size={16} />Serial Monitor
                {monitoring && <span className="status-dot cyan working" aria-label="Serial monitor connected" />}
              </button>
              <button id="plotter-tab" role="tab" aria-controls="plotter-panel" aria-selected={activePanel === 'plotter'} className={`serial-tab ${activePanel === 'plotter' ? 'active' : ''}`} onClick={() => choosePanel('plotter')}><Activity size={16} />Serial Plotter</button>
            </div>
            <span className="console-meta">{activePanel === "serial" ? "TX / RX" : "AVR-GCC · WASM"}</span>
            <button className="clear-button" onClick={() => { if (activePanel === 'output') setOutput(''); else { clearTimeout(serialFlushRef.current); serialFlushRef.current = null; pendingSerialRef.current = ''; serialLineRef.current = ''; setSerialText(''); setSerialEntries([]); setPlotPoints([]); setPausedMonitorView(current=>current===null?null:''); } }}><X size={14} />Clear</button>
            <button className="clear-button" onClick={() => setConsoleCollapsed(value => !value)} aria-label={consoleCollapsed ? 'Expand console' : 'Collapse console'}>{consoleCollapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
          </div>

          {activePanel === "output" ? (
            <div id="output-panel" className="output-panel" role="tabpanel" aria-labelledby="output-tab">
              {busySketch && <button className="busy-sketch-label" onClick={() => openSaved(busySketch)}>{busy === 'upload' ? 'Uploading' : busy === 'connect' ? 'Selecting board for' : 'Compiling'} {busySketch.name}.ino {busySketch.id !== sketchId ? '· View tab' : ''}</button>}
              {compileProgress && <div className={`compile-stage ${compileProgress.stage === 'FAILED' ? 'failed' : compileProgress.stage === 'COMPILED' ? 'complete' : ''}`} role="status" aria-live="polite">
                {busy === 'compile' ? <span className="spinner" /> : compileProgress.stage === 'COMPILED' ? <Check size={14} /> : <TerminalSquare size={14} />}
                <strong>{compileProgress.stage}</strong><span>{compileProgress.detail}</span>
              </div>}
              {uploadStage && <div className="upload-stage" role="status"><Upload size={14} /><strong>{uploadStage}</strong>{uploadStage === 'FLASHING + VERIFYING' && <><progress aria-label="Upload verified pages" max={100} value={uploadProgress} /><span>{uploadProgress}% · each page read back</span></>}</div>}
              <CompileSummary boardId={boardId} result={compileResult} current={compileResult?.sketchId === sketchId && compileResult?.source === currentSource} />
              {explanations.length > 0 && <div className="friendly-errors">{explanations.map((item, i) => <button key={i} onClick={() => jumpToDiagnostic(item)}><strong>{item.title}</strong><span>{item.explanation}</span><small>{activeSketch?.project ? `${item.file} · ` : ''}Go to line {item.line}</small></button>)}<p>Original compiler diagnostics and output follow:</p></div>}
              {shownDiagnostics.length > 0 && (
                <div className="diagnostics-list">
                  {shownDiagnostics.map((item, index) => (
                    <button key={`${item.line}-${item.column}-${index}`} className={`diagnostic ${item.severity}`} onClick={() => jumpToDiagnostic(item)}>
                      <span>{item.severity}</span><strong>{activeSketch?.project ? `${item.file} · ` : ''}Line {item.line}:{item.column}</strong>{item.message}
                    </button>
                  ))}
                </div>
              )}
              {compileState==='error' && !explanations.length && <p className="compiler-failure-summary" role="alert">{compilerFailureSummary(output)}</p>}
              <details className="compiler-technical" open key={`${sketchId}:${boardId}:${compileState}`}><summary>Technical details · complete compiler / upload output</summary><pre aria-label="Compiler and upload output">{(output || "No output.").split("\n").map((line, index) => <span className={`log-line ${outputTone(line, compileState === "error")}`} key={index}>{line || "\u00a0"}{"\n"}</span>)}</pre></details>
            </div>
          ) : (
            <div id={activePanel === 'plotter' ? 'plotter-panel' : 'serial-panel'} className="serial-panel" role="tabpanel" aria-labelledby={activePanel === 'plotter' ? 'plotter-tab' : 'serial-tab'}>
              <div className="serial-toolbar">
                <select value={baudRate} disabled={monitoring} onChange={(event) => setBaudRate(Number(event.target.value))} aria-label="Serial baud rate">
                  {[300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((baud) => <option key={baud} value={baud}>{baud} baud</option>)}
                </select>
                {!monitoring ? (
                  <button className="monitor-button" onClick={startMonitor} disabled={!serialSupported || Boolean(busy) || Boolean(connectionActivity)} aria-busy={Boolean(connectionActivity)}>{connectionActivity ? <span className="spinner" /> : <Usb size={15} />}{connectionActivity ? "Connecting…" : "Connect"}</button>
                ) : (
                  <button className="monitor-button stop" onClick={stopMonitor}><CircleStop size={15} />Disconnect</button>
                )}
                {activePanel === 'serial' && <><button className="monitor-button" aria-pressed={pausedMonitorView!==null} onClick={()=>setPausedMonitorView(current=>current===null?(timestamps ? serialEntries.map(entry=>`[${entry.time}] ${entry.text}`).join('\n')+(serialLineRef.current?'\n'+serialLineRef.current:'') : serialText):null)}>{pausedMonitorView===null?'Pause output':'Resume output'}</button><label><input type="checkbox" checked={autoscroll} onChange={event => setAutoscroll(event.target.checked)} />Autoscroll</label><label><input type="checkbox" checked={timestamps} onChange={event => setTimestamps(event.target.checked)} />Timestamps</label></>}
                <span className={`monitor-state ${monitoring ? "live" : ""}`}>{monitoring ? "Connected" : "Disconnected"}</span>
              </div>
              {activePanel === 'plotter' ? <SerialPlotter points={plotPoints} paused={plotPaused} onTogglePause={()=>{plotPausedRef.current=!plotPausedRef.current;setPlotPaused(plotPausedRef.current);}} windowSeconds={plotWindowSeconds} onWindow={setPlotWindowSeconds} timestamps={plotTimestamps} onTimestamps={setPlotTimestamps} onClear={()=>setPlotPoints([])} /> : <pre className="serial-output" ref={serialOutputRef}>{pausedMonitorView!==null ? pausedMonitorView || 'Output paused. Serial data continues to be received.' : timestamps ? (serialEntries.map(entry => `[${entry.time}] ${entry.text}`).join('\n') + (serialLineRef.current ? '\n' + serialLineRef.current : '') || 'Timestamps appear when a complete line arrives.') : serialText || "Connect to view messages from Serial.print()."}</pre>}
              <div className="serial-send">
                <input value={serialInput} onChange={(event) => setSerialInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendSerial()} disabled={!monitoring} placeholder={`Send text to the ${board.shortName}`} aria-label="Serial message" />
                <select aria-label="Serial line ending" value={lineEnding} onChange={event => setLineEnding(event.target.value)}><option value="none">No line ending</option><option value="nl">Newline</option><option value="cr">Carriage return</option><option value="crlf">Both NL &amp; CR</option></select>
                <button onClick={sendSerial} disabled={!monitoring || !serialInput}><Send size={16} />Send</button>
              </div>
            </div>
          )}
        </section>
      </section>
      </div>
      {pendingExample && <ExampleUnlock key={pendingExample} exampleName={pendingExample} onClose={()=>setPendingExample('')} onUnlock={unlockExamples}/>}
      {showHardware && <TestMyUno boardId={boardId} selectedPort={selectedPort} onClose={()=>setShowHardware(false)} onConnect={()=>hardwareOperation(()=>selectPort())} onCompile={(source,progress)=>hardwareOperation(()=>measuredCompile(source,progress))} onUpload={(port,hex,callbacks)=>hardwareOperation(async()=>{if(port!==portRef.current)throw new Error(`Board disconnected. Select the ${board.shortName} again.`);await uploadForBoard(port,hex,callbacks,boardId);setSessionStats(s=>({...s,uploads:s.uploads+1}));setBoardStatus(`Hardware test verified · ${describePort(port)}`);})}/>}
      {showSystemCheck && <SystemCheckPanel onClose={()=>setShowSystemCheck(false)} onRun={runSystemCheck} running={busy==='system check'} checks={systemChecks} output={systemOutput} boardId={boardId}/>}
      {showDebug && <DebugPanel onClose={()=>setShowDebug(false)} sketch={activeSketch} boardId={boardId} baudRate={baudRate} libraries={libraries} diagnostics={diagnostics} result={compileResult} currentBuild={compileResult?.sketchId===sketchId&&compileResult?.source===currentSource} onJump={jumpToDiagnostic}/>}
      {showSettings && <EditorSettings onClose={()=>setShowSettings(false)} fontSize={fontSize} onFontSize={changeFontSize} onReset={resetLayout} stats={sessionStats} sketchBytes={new TextEncoder().encode(activeSketch?.project?activeSketch.project.files.map(f=>f.code).join(''):code).length} storageError={preferenceError} onGuidance={()=>{setShowGuidance(true);setPreference(QUICKSTART_KEY,'');setShowSettings(false);}}/>}
      {showOffline && <PwaPanel onClose={()=>setShowOffline(false)}/>}
      {showShortcuts && <Shortcuts onClose={()=>setShowShortcuts(false)}/>}
      {showDiagnostics && <DiagnosticsPanel boardId={boardId} onClose={() => setShowDiagnostics(false)} serialSupported={serialSupported} serialBlocked={serialBlocked} catalog={catalog} libraryError={libraryError} compileResult={compileResult} compileState={compileState} selectedPort={selectedPort} lastUpload={lastUpload} />}
      {saveError && <div role="alert" className="save-error">{saveError}{workspaceReady && <button onClick={async () => { for (const sketch of savedSketches) await sketchWorkspace.save(sketch.id); }}>Retry saving</button>}</div>}
      {deleteTarget && <div className="dialog-backdrop"><section role="alertdialog" aria-modal="true" aria-labelledby="delete-sketch-title" className="delete-sketch-dialog" onKeyDown={event => {
        if (event.key === 'Escape' && !deleting) { event.preventDefault(); setDeleteTarget(null); }
        if (event.key === 'Tab') {
          const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
          const index = buttons.indexOf(document.activeElement);
          if (buttons.length) { event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus(); }
        }
      }}>
        <h2 id="delete-sketch-title">Delete {deleteTarget.name}.ino?</h2><p>This removes the sketch from this browser and closes its tab. Export it first if you want a backup.</p>
        <div><button autoFocus disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</button><button className="danger-button" disabled={deleting || busySketch?.id === deleteTarget.id} onClick={confirmDelete}>{deleting ? 'Deleting…' : 'Delete sketch'}</button></div>
      </section></div>}

      <footer className="statusbar">
        <span className="status-item" title={`Compiler: ${compilerLabel}`}><span className={`status-dot ${compilerTone}`} />Compiler <strong>{compilerLabel}</strong></span>
        <span className="status-item" title={serialBlocked ? policyMessage() : "Chrome Web Serial API available"}><span className={`status-dot ${serialBlocked ? "orange" : "cyan"}`} />Web Serial <strong>{serialBlocked ? "Blocked" : "Available"}</strong></span>
        <span className="status-item" title={boardStatus}><span className={`status-dot ${boardIssue ? "orange" : selectedPort ? "green" : "muted"}`} />Board <strong>{selectedPort ? `${board.shortName.toUpperCase()} selected` : "Not selected"}</strong></span>
        <span className="status-item connection-status" title={boardStatus}><span className={`status-dot ${busy === "upload" || connectionActivity ? "yellow working" : monitoring ? "purple" : uploadComplete ? "green" : "muted"}`} />Connection <strong>{connectionLabel}</strong></span>
        {compileResult?.ok && <span className="status-memory" title={compileResult.source===currentSource?'Current build':'Previous build — source changed'}>Flash {(compileResult.flashBytes/1024).toFixed(1)} KB / {(board.flashLimit/1024).toFixed(1)} KB · RAM {compileResult.ramBytes} B / 2 KB · {compileResult.seconds.toFixed(1)} s{compileResult.source!==currentSource?' · stale':''}</span>}
        <span className="statusbar-spacer" />
        <span className={`save-status ${pending.size || saveError ? "unsaved" : ""}`}>{saveError ? 'Save failed' : !workspaceReady ? 'Restoring…' : pending.size ? "Saving…" : "Saved locally ✓"}</span>
        <span className="cursor-position">Ln {cursor.line}, Col {cursor.column}</span>
      </footer>
    </div>
  );
}
