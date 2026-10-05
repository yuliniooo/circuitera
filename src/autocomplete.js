import { DEFAULT_BOARD, getBoard } from './boards.js';
import { autocompletion, acceptCompletion, completionKeymap, pickedCompletion } from '@codemirror/autocomplete';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { coreCompletions, serialCompletions, libraryAPIs } from './arduinoCompletions.js';
import { libraryDefinitions } from './libraryDefinitions.js';

export const AUTOCOMPLETE_KEY = 'uno-web-ide:autocomplete';
export function readAutocompleteSetting() {
  try { return localStorage.getItem(AUTOCOMPLETE_KEY) !== 'off'; } catch { return true; }
}

// Reuse CodeMirror's incremental C++ syntax tree. Cache only while that tree lives.
// Work is bounded for unusually large pasted files; there is no full C++ language server.
const indexes = new WeakMap();
const nameNodes = new Set(['Identifier', 'FieldIdentifier', 'TypeIdentifier']);
const scopes = new Set(['CompoundStatement', 'ForStatement', 'ForRangeLoop', 'FunctionDefinition', 'ClassSpecifier', 'StructSpecifier', 'NamespaceDefinition', 'LambdaExpression']);
const declarators = new Set(['InitDeclarator', 'FunctionDeclarator', 'ArrayDeclarator', 'PointerDeclarator', 'ReferenceDeclarator', 'ParenthesizedDeclarator']);
function declaredName(node) {
  if (nameNodes.has(node.name)) return node;
  if (!declarators.has(node.name)) return null;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const name = declaredName(child);
    if (name) return name;
  }
  return null;
}
function indexSketch(state, tree) {
  const cached = indexes.get(tree);
  if (cached) return cached;
  const records = [], includes = new Set();
  const cursor = tree.cursor();
  const deadline = performance.now() + 8;
  let visited = 0;
  do {
    if (++visited > 18000 || records.length >= 1500 || (visited % 64 === 0 && performance.now() > deadline)) break;
    const node = cursor.node;
    if (node.name === 'PreprocDirective') {
      const text = state.sliceDoc(node.from, Math.min(node.to, node.from + 256));
      const header = text.match(/^\s*#\s*include\s*[<"]([^>"\n]+)[>"]/);
      if (header) includes.add(header[1]);
    }
    if (!['Declaration', 'ParameterDeclaration', 'FunctionDefinition'].includes(node.name)) continue;
    const type = node.getChild('TypeIdentifier') || node.getChild('PrimitiveType');
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === 'TypeIdentifier') continue;
      const name = declaredName(child);
      if (!name || name.name === 'FieldIdentifier') continue;
      let scope = node.parent;
      while (scope && !scopes.has(scope.name) && scope.name !== 'Program') scope = scope.parent;
      // Parameters belong to their function, not the surrounding file.
      if (node.name === 'ParameterDeclaration' && scope?.name !== 'FunctionDefinition') continue;
      const isFunction = child.name === 'FunctionDeclarator';
      const label = state.sliceDoc(name.from, name.to);
      const prefix = state.sliceDoc(node.from, child.from).trim();
      const params = isFunction ? child.getChild('ParameterList') : null;
      records.push({
        label, type: isFunction ? 'function' : 'variable',
        detail: `${prefix} ${label}${params ? state.sliceDoc(params.from, Math.min(params.to, params.from + 220)) : ''}`.replace(/\s+/g, ' ').trim(),
        info: `${isFunction ? 'Function' : node.name === 'ParameterDeclaration' ? 'Parameter' : 'Variable'} declared in this sketch on line ${state.doc.lineAt(name.from).number}.`,
        boost: 15, declaredAt: name.from, valueType: type ? state.sliceDoc(type.from, type.to) : '',
        scopeFrom: scope?.from || 0, scopeTo: scope?.to ?? state.doc.length,
        global: !scope || scope.name === 'Program',
      });
    }
  } while (cursor.next());
  const result = { records, includes };
  indexes.set(tree, result);
  return result;
}

export function applyFunction(view, completion, from, to) {
  const next = view.state.sliceDoc(to, Math.min(view.state.doc.length, to + 80));
  const hasParenthesis = /^\s*\(/.test(next);
  const insert = completion.label + (hasParenthesis ? '' : '()');
  view.dispatch({ changes: { from, to, insert },
    selection: { anchor: from + completion.label.length + (hasParenthesis ? 0 : 1) },
    annotations: pickedCompletion.of(completion), userEvent: 'input.complete',
  });
}
const asCompletion = entry => entry.type === 'function' ? { ...entry, apply: applyFunction } : entry;
const blockedNodes = new Set(['LineComment', 'BlockComment', 'String', 'RawString', 'CharLiteral', 'SystemLibString']);
function inLiteral(tree, pos) {
  for (let node = tree.resolveInner(pos, -1); node; node = node.parent) {
    if (blockedNodes.has(node.name)) return true;
  }
  return false;
}

export function createArduinoCompletionSource(libraries = [], boardId=DEFAULT_BOARD) {
  const supported = libraries.filter(lib => lib.status === 'PASS').map(lib => ({ ...lib,
    headers: (libraryDefinitions.find(def => def.id === lib.id)?.headers || []).filter(header => lib.headers.includes(header)),
  }));
  const headers = supported.flatMap(lib => lib.headers.map(header => ({
    label: header, type: 'type', detail: `${lib.name} · preinstalled`,
    info: `${lib.description} Version ${lib.version}. Already bundled; no install needed.`,
  })));
  const libraryNames = supported.flatMap(lib => {
    const api = libraryAPIs[lib.id] || {};
    return [
      ...(api.types || []).map(label => ({ label, type: 'class' })),
      ...(api.globals || []).map(label => ({ label, type: 'variable' })),
      ...(api.constants || []).map(label => ({ label, type: 'constant' })),
    ].map(entry => ({ ...entry, detail: lib.name,
      info: `${lib.description} Preinstalled. Requires the appropriate ${lib.headers.join(' / ')} header; autocomplete does not add includes.`,
    }));
  });
  const extraPins = getBoard(boardId).family === 'nano' ? [6,7].map(n => ({label: 'A'+n, type:'constant', detail:'Nano analog-only pin', info:'Use analogRead(). No digital I/O or PWM on A6/A7.'})) : [];
  const defaults = [...coreCompletions, ...extraPins, ...libraryNames].map(asCompletion);
  return context => {
    const { state, pos } = context;
    if (state.readOnly || !state.selection.main.empty) return null;
    // Parsing has a strict per-request time budget; never force a whole-file parse.
    const tree = ensureSyntaxTree(state, pos, 6) || syntaxTree(state);
    const line = state.doc.lineAt(pos);
    const prefix = state.sliceDoc(line.from, pos);
    const include = prefix.match(/^\s*#\s*include\s*([<"])([\w./-]*)$/);
    if (include) {
      // An include-looking line inside a block comment is still a comment.
      for (let node = tree.resolveInner(line.from, 1); node; node = node.parent) {
        if (node.name === 'BlockComment' || node.name === 'RawString') return null;
      }
      const from = pos - include[2].length;
      const closing = include[1] === '<' ? '>' : '"';
      return { from, options: headers.map(entry => ({ ...entry, apply: (view, completion, start, end) => {
        const suffix = view.state.sliceDoc(end, view.state.doc.lineAt(end).to);
        view.dispatch({ changes: { from: start, to: end, insert: completion.label + (suffix.startsWith(closing) ? '' : closing) },
          annotations: pickedCompletion.of(completion), userEvent: 'input.complete' });
      } })), validFor: /^[\w./-]*$/ };
    }
    if (inLiteral(tree, pos) || /^\s*#/.test(prefix)) return null;
    const word = context.matchBefore(/[A-Za-z_]\w*$/);
    const member = prefix.match(/([A-Za-z_]\w*)\s*(\.|->)\s*([A-Za-z_]\w*)?$/);
    if (!word && !member && !context.explicit) return null;
    const { records, includes } = indexSketch(state, tree);
    const visible = records.filter(r => (r.type === 'function' && r.global || r.declaredAt < pos)
      && pos >= r.scopeFrom && pos <= r.scopeTo);
    if (member) {
      const receiver = member[1];
      const variable = visible.filter(r => r.label === receiver).sort((a, b) => b.scopeFrom - a.scopeFrom || b.declaredAt - a.declaredAt)[0];
      let methods = receiver === 'Serial' && !variable ? serialCompletions : [];
      for (const lib of supported) {
        if (!lib.headers.some(header => includes.has(header))) continue;
        const api = libraryAPIs[lib.id];
        if (!api) continue;
        if (!variable && (api.memberGlobals || api.globals || []).includes(receiver)
          || variable && (api.memberTypes || api.types || []).includes(variable.valueType)) methods = api.methods || [];
      }
      // Unknown member expressions should not show unrelated Arduino globals.
      return methods.length ? { from: pos - (member[3]?.length || 0), options: methods.map(asCompletion), validFor: /^\w*$/ } : null;
    }
    const options = new Map(defaults.map(option => [option.label, option]));
    for (const entry of visible) options.set(entry.label, asCompletion(entry));
    return { from: word?.from ?? pos, options: [...options.values()], validFor: /^\w*$/ };
  };
}

export function arduinoAutocomplete(libraries, boardId=DEFAULT_BOARD) {
  return [
    autocompletion({ override: [createArduinoCompletionSource(libraries, boardId)], activateOnTyping: true,
      activateOnTypingDelay: 120, maxRenderedOptions: 35, defaultKeymap: false }),
    // Precede Tab indentation only while a completion is actually selectable.
    Prec.highest(keymap.of([...completionKeymap, { key: 'Tab', run: acceptCompletion }])),
  ];
}
