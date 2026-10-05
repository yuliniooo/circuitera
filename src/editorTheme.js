import { EditorView } from "@uiw/react-codemirror";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// Presentation only: keep the C++ language, editing, and compiler pipeline intact.
const chrome = EditorView.theme({
  "&": { color: "#f2f4f8", backgroundColor: "var(--editor)", height: "100%" },
  ".cm-content": { caretColor: "#77dfff", padding: "16px 0 48px" },
  ".cm-line": { padding: "0 20px 0 14px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#77dfff" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "#234567",
  },
  ".cm-gutters": {
    backgroundColor: "var(--editor)", color: "#737d8b", border: "none",
    borderRight: "1px solid var(--border-soft)", minWidth: "54px",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 14px" },
  ".cm-activeLine": { backgroundColor: "#93c5fd08" },
  ".cm-activeLineGutter": { color: "#cceaff", backgroundColor: "#93c5fd0d" },
  ".cm-foldGutter": { width: "14px" },
  ".cm-foldPlaceholder": { backgroundColor: "#222933", borderColor: "#495766", color: "#77dfff" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "#a3e63520", outline: "1px solid #a3e63565", color: "#c2f67c" },
  ".cm-searchMatch": { backgroundColor: "#ffca5530", outline: "1px solid #ffca5570" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#ffca5550" },
  ".cm-panels": { backgroundColor: "var(--surface-2)", color: "#eef1f7" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)" },
  ".cm-tooltip": { border: "1px solid #424955", backgroundColor: "#191d24", color: "#eef1f7", borderRadius: "6px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#224861", color: "#ffffff" },
}, { dark: true });

const syntax = HighlightStyle.define([
  { tag: tags.keyword, color: "#bc9aff" },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "#6edff4" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#70b7ff" },
  { tag: [tags.number, tags.bool, tags.atom], color: "#ffb064" },
  { tag: [tags.string, tags.character], color: "#b4e67a" },
  { tag: [tags.operator, tags.operatorKeyword], color: "#7bdaea" },
  { tag: [tags.meta, tags.macroName, tags.processingInstruction], color: "#ffd16a" },
  { tag: [tags.constant(tags.name), tags.standard(tags.name)], color: "#ffd16a" },
  { tag: [tags.variableName, tags.propertyName], color: "#e3e8f0" },
  { tag: tags.comment, color: "#8c98a9", fontStyle: "italic" },
  { tag: tags.punctuation, color: "#bbc3cf" },
  { tag: tags.invalid, color: "#ff8579", textDecoration: "underline wavy" },
]);

export const workbenchTheme = [chrome, syntaxHighlighting(syntax)];

const lightChrome = EditorView.theme({
  '&': { color: '#273244', backgroundColor: '#ffffff', height: '100%' },
  '.cm-content': { caretColor: '#2164e8', padding: '14px 0 48px' },
  '.cm-line': { padding: '0 20px 0 14px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#2164e8' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: '#dbeafe' },
  '.cm-gutters': { backgroundColor: '#fff', color: '#89929f', border: 'none', borderRight: '1px solid #eef0f4', minWidth: '54px' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#f1f6ff' },
  '.cm-activeLineGutter': { color: '#3c67a4' },
  '.cm-foldGutter': { width: '14px' },
  '.cm-foldPlaceholder': { backgroundColor: '#eef2f7', borderColor: '#d7dfeb', color: '#2164e8' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: '#ddf8e3', outline: '1px solid #a0dcb1' },
  '.cm-searchMatch': { backgroundColor: '#fff0bb', outline: '1px solid #e9c654' },
  '.cm-panels, .cm-tooltip': { backgroundColor: '#fff', color: '#273244', borderColor: '#d9dee7' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#e7efff', color: '#164ec7' },
}, { dark: false });
const lightSyntax = HighlightStyle.define([
  { tag: tags.keyword, color: '#7550c9' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: '#8542bd' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#1764ce' },
  { tag: [tags.number, tags.bool, tags.atom], color: '#b95706' },
  { tag: [tags.string, tags.character], color: '#257b3c' },
  { tag: [tags.operator, tags.operatorKeyword], color: '#156ba5' },
  { tag: [tags.meta, tags.macroName, tags.processingInstruction], color: '#9a5d04' },
  { tag: [tags.constant(tags.name), tags.standard(tags.name)], color: '#b65508' },
  { tag: [tags.variableName, tags.propertyName], color: '#273244' },
  { tag: tags.comment, color: '#718174', fontStyle: 'italic' },
  { tag: tags.punctuation, color: '#637184' },
  { tag: tags.invalid, color: '#cf3e47', textDecoration: 'underline wavy' },
]);
export const lightWorkbenchTheme = [lightChrome, syntaxHighlighting(lightSyntax)];
