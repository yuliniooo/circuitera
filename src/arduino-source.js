const CONTROL_WORDS = new Set(["if", "for", "while", "switch", "catch"]);

function maskCommentsAndStrings(source) {
  let result = "";
  let state = "code";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "code" && char === "/" && next === "/") {
      result += "  ";
      index += 1;
      state = "line-comment";
    } else if (state === "code" && char === "/" && next === "*") {
      result += "  ";
      index += 1;
      state = "block-comment";
    } else if (state === "code" && (char === '"' || char === "'")) {
      result += " ";
      state = char === '"' ? "string" : "character";
    } else if (state === "line-comment") {
      result += char === "\n" ? "\n" : " ";
      if (char === "\n") state = "code";
    } else if (state === "block-comment") {
      if (char === "*" && next === "/") {
        result += "  ";
        index += 1;
        state = "code";
      } else {
        result += char === "\n" ? "\n" : " ";
      }
    } else if (state === "string" || state === "character") {
      if (char === "\\") {
        result += "  ";
        index += 1;
      } else if ((state === "string" && char === '"') || (state === "character" && char === "'")) {
        result += " ";
        state = "code";
      } else {
        result += char === "\n" ? "\n" : " ";
      }
    } else {
      result += char;
    }
  }

  return result;
}

// Arduino's desktop build inserts forward declarations into .ino sketches.
// This handles ordinary top-level functions while leaving classes and templates alone.
export function generateArduinoPrototypes(source) {
  const masked = maskCommentsAndStrings(source);
  const prototypes = [];
  const seen = new Set();
  let depth = 0;
  let boundary = 0;

  for (let index = 0; index < masked.length; index += 1) {
    const char = masked[index];
    if (char === "{" && depth === 0) {
      const candidate = masked.slice(boundary, index).trim();
      if (!/\btemplate\s*</.test(candidate)) {
        const match = candidate.match(/([A-Za-z_][\w:\s<>,*&~]*?)\s+([A-Za-z_]\w*)\s*\(([^{};]*)\)\s*(?:const\s*)?$/);
        if (match && !CONTROL_WORDS.has(match[2])) {
          const returnType = match[1].replace(/^.*(?:\n|#.*\n)/s, "").replace(/\s+/g, " ").trim();
          const name = match[2];
          const params = match[3].replace(/\s+/g, " ").trim();
          if (returnType && !returnType.startsWith("class ") && !returnType.startsWith("struct ")) {
            const prototype = `${returnType} ${name}(${params});`;
            if (!seen.has(prototype)) {
              seen.add(prototype);
              prototypes.push(prototype);
            }
          }
        }
      }
      depth += 1;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) boundary = index + 1;
    } else if (char === ";" && depth === 0) {
      boundary = index + 1;
    }
  }

  return prototypes;
}

export function prepareArduinoSource(source) {
  return [
    "#include <Arduino.h>",
    ...generateArduinoPrototypes(source),
    '#line 1 "sketch.ino"',
    source,
  ].join("\n");
}

export function diagnosticsFromCompiler(output) {
  const diagnostics = [];
  const pattern = /(?:\/project\/)?([A-Za-z_][\w.-]*\.(?:ino|cpp|c|h)):(\d+):(\d+):\s*(?:(fatal error|error|warning):\s*)?([^\n]+)/gi;
  for (const match of String(output || "").matchAll(pattern)) {
    diagnostics.push({
      ...(['sketch.ino', 'HorangFirmware.cpp'].includes(match[1]) ? {} : { file: match[1] }),
      line: Number(match[2]),
      column: Number(match[3]),
      severity: String(match[4] || "error").toLowerCase().includes("warning") ? "warning" : "error",
      message: match[5].trim(),
    });
  }
  return diagnostics.slice(0, 50);
}
