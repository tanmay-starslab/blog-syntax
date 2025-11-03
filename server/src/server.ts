// server/src/server.ts
import {
  createConnection,
  ProposedFeatures,
  InitializeParams,
  TextDocuments,
  TextDocumentSyncKind,
  Diagnostic,
  DiagnosticSeverity,
  Hover,
  HoverParams,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

const connection = createConnection(ProposedFeatures.all);

// IMPORTANT: bind TextDocuments to the concrete TextDocument type
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams) => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
    },
  };
});

// ----------------------------- Helpers ---------------------------------

/** Preserve line breaks while stripping comments */
function stripCommentsPreserveLines(src: string): string {
  // 1) Block comments: replace content with spaces but preserve newlines
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => {
    // Count newlines and preserve them, replace other chars with spaces
    const newlineCount = (m.match(/\n/g) || []).length;
    return '\n'.repeat(newlineCount);
  });
  
  // 2) Line comments: remove from '//' to end-of-line, outside quotes (simple heuristic)
  const lines = noBlock.split(/\r?\n/);
  const result: string[] = [];
  
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let inS = false, inD = false, escaped = false;
    let commentStart = -1;
    
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (c === '\\') {
        escaped = true;
        continue;
      }
      
      if (c === "'" && !inD) inS = !inS;
      else if (c === '"' && !inS) inD = !inD;
      else if (!inS && !inD && c === "/" && i + 1 < line.length && line[i + 1] === "/") {
        commentStart = i;
        break;
      }
    }
    
    result.push(commentStart >= 0 ? line.slice(0, commentStart) : line);
  }
  
  return result.join("\n");
}

function isIgnorableLine(line: string): boolean {
  const t = line.trim();
  if (t === "") return true;
  if (/^[{}]+$/.test(t)) return true; // braces-only lines
  if (/^(case\b|then\b|else\b)$/i.test(t)) return true;
  return false;
}

function looksLikeStatementHeader(block: string): boolean {
  const t = block.trim();
  // BLOG top-level starts
  if (/^(type|distinct|fixed|random|origin|obs|query)\b/i.test(t)) return true;
  // number statements with leading '#Name(...) ~' etc.
  if (/^#\w+\s*\(.*\)\s*~/.test(t)) return true;
  // function application with "~" at top-level
  if (/^[A-Za-z_][A-Za-z0-9_]*\s*\(.*\)\s*~/.test(t)) return true;
  return false;
}

function isSemicolonTerminated(stmt: string): boolean {
  return /;\s*$/.test(stmt);
}

/** Fold logical statements across lines until a top-level semicolon is seen. */
function foldLogicalStatements(code: string): Array<{ text: string; lineStart: number; lineEnd: number }> {
  const lines = code.split(/\r?\n/);
  const out: Array<{ text: string; lineStart: number; lineEnd: number }> = [];
  let buf: string[] = [];
  let start = 0;
  let depthParen = 0,
    depthBrace = 0,
    depthBracket = 0;

  const pushStmt = (endIdx: number) => {
    if (buf.length) {
      out.push({ text: buf.join("\n"), lineStart: start, lineEnd: endIdx });
      buf = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (buf.length === 0) start = i;

    // track bracket/brace/paren nesting to detect top-level ';'
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === "(") depthParen++;
      else if (c === ")") depthParen = depthParen > 0 ? depthParen - 1 : 0;
      else if (c === "{") depthBrace++;
      else if (c === "}") depthBrace = depthBrace > 0 ? depthBrace - 1 : 0;
      else if (c === "[") depthBracket++;
      else if (c === "]") depthBracket = depthBracket > 0 ? depthBracket - 1 : 0;
    }

    buf.push(line);

    // if we are at top level and this line ends with ';', close the statement
    if (depthParen === 0 && depthBrace === 0 && depthBracket === 0 && /;\s*$/.test(line)) {
      pushStmt(i);
    }
  }

  // trailing unterminated buffer (e.g., last stmt missing ';')
  if (buf.length) out.push({ text: buf.join("\n"), lineStart: start, lineEnd: lines.length - 1 });
  return out;
}

function shouldWarnMissingSemicolon(stmt: string): boolean {
  const trimmed = stmt.trim();
  if (trimmed === "") return false;
  if (isSemicolonTerminated(trimmed)) return false;
  // If the block is only ignorable lines (e.g., braces), skip
  const onlyIgnorable = trimmed
    .split(/\r?\n/)
    .every((ln) => isIgnorableLine(ln));
  if (onlyIgnorable) return false;
  // If it looks like a top-level BLOG statement header and isn't ';' terminated, warn
  if (looksLikeStatementHeader(trimmed)) return true;
  return false;
}

/** Simple word extractor for hover - optimized to search only around the offset */
function wordAt(text: string, offset: number): string | null {
  // Search backwards for word start
  let start = offset;
  while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) {
    start--;
  }
  
  // Check if we're at a valid word start (must start with letter or underscore)
  if (start >= text.length || !/[A-Za-z_]/.test(text[start])) {
    return null;
  }
  
  // Search forwards for word end
  let end = offset;
  while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) {
    end++;
  }
  
  // Return the word if offset is within it (end points past the last character)
  if (start <= offset && offset < end) {
    return text.slice(start, end);
  }
  
  return null;
}

// ----------------------------- Diagnostics ---------------------------------

// Debounce map for validation
const validationTimers = new Map<string, NodeJS.Timeout>();

documents.onDidChangeContent((change) => {
  const uri = change.document.uri;
  
  // Clear existing timer for this document
  const existingTimer = validationTimers.get(uri);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  
  // Set new timer - validate after 300ms of no changes
  const timer = setTimeout(() => {
    validate(change.document);
    validationTimers.delete(uri);
  }, 300);
  
  validationTimers.set(uri, timer);
});

async function validate(doc: TextDocument) {
  try {
    const fullText = doc.getText();

    // Strip comments but preserve line count
    const text = stripCommentsPreserveLines(fullText);

    const diags: Diagnostic[] = [];

    // 1) Semicolon diagnostics on folded logical statements
    const statements = foldLogicalStatements(text);
    for (const s of statements) {
      const { text: block, lineStart, lineEnd } = s;

      if (!shouldWarnMissingSemicolon(block)) continue;

      // report at last non-empty line of the block
      const lines = block.split(/\r?\n/);
      let relLine = lines.length - 1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim() !== "") {
          relLine = i;
          break;
        }
      }
      const reportLine = lineStart + relLine;
      const lastLineText = lines[relLine] ?? "";
      diags.push({
        message: "Potential missing ';' at end of statement",
        severity: DiagnosticSeverity.Warning,
        source: "BLOG",
        range: {
          start: { line: reportLine, character: 0 },
          end: { line: reportLine, character: lastLineText.length },
        },
      });
    }

    // 2) Brace balance check (on comment-stripped text). If imbalanced, issue a doc-level diagnostic.
    let bal = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "{") bal++;
      else if (ch === "}") bal--;
      if (bal < 0) {
        diags.push({
          message: "Unmatched '}'",
          severity: DiagnosticSeverity.Error,
          source: "BLOG",
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        });
        bal = 0; // reset so we don't spam
      }
    }
    if (bal !== 0) {
      diags.push({
        message: "Unbalanced '{' '}' in document",
        severity: DiagnosticSeverity.Error,
        source: "BLOG",
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      });
    }

    connection.sendDiagnostics({ uri: doc.uri, diagnostics: diags });
  } catch (error) {
    // Log error but don't crash the server - send empty diagnostics
    console.error('Error during validation:', error);
    connection.sendDiagnostics({ uri: doc.uri, diagnostics: [] });
  }
}

function numberStmtAt(doc: TextDocument, posOffset: number): { name: string } | null {
  // Use the document's line API for efficiency
  const position = doc.positionAt(posOffset);
  // Get the full line text - TextDocument handles bounds automatically
  const line = doc.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 }
  });
  // Remove trailing newline if present
  const lineText = line.replace(/[\r\n]+$/, '');

  const m = lineText.match(/^\s*#([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  if (!m) return null;
  return { name: m[1] };
}

// ----------------------------- Hover ---------------------------------

connection.onHover((params: HoverParams): Hover | null => {
  try {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;

    const offset = doc.offsetAt(params.position);
    const numberHdr = numberStmtAt(doc, offset);
    if (numberHdr) {
      const nm = numberHdr.name;
      const md =
        `**#${nm}(… )** — BLOG *number statement*.\n\n` +
        `Defines the count of objects (or a discrete choice) via a distribution. ` +
        `Typically followed by \`~\` and a distribution or a case expression. ` +
        `Example:\n\n` +
        "```blog\n" +
        `#${nm}(Src = SourceCreator) ~\n` +
        `  case SourceCreator in {\n` +
        `    AGN_creator -> Categorical({0 -> 0.5, 1 -> 0.5}),\n` +
        `    SNe_creator -> Categorical({0 -> 0.4, 1 -> 0.4, 2 -> 0.2})\n` +
        `  };\n` +
        "```\n";
      return { contents: { kind: "markdown", value: md } };
    }

    const text = doc.getText();
    const word = wordAt(text, offset);
    if (!word) return null;

    const glossary: Record<string, string> = {
      type: "Declare a BLOG type; statements end with ';'.",
      distinct: "Declare distinct symbols for a type.",
      fixed: "Fixed (deterministic) function declaration.",
      random: "Random function declaration with a distribution using '~'.",
      origin: "Origin function for number statements.",
      obs: "Evidence statement asserting an observed value.",
      query: "Query statement returning posterior distribution of an expression."
    };

    if (glossary[word]) {
      return { contents: { kind: "markdown", value: `**${word}** — ${glossary[word]}` } };
    }
    return null;
  } catch (error) {
    // Log error but don't crash the server
    console.error('Error in hover provider:', error);
    return null;
  }
});

// ----------------------------------------------------------------------

// Clean up validation timers when documents are closed
documents.onDidClose((event) => {
  const timer = validationTimers.get(event.document.uri);
  if (timer) {
    clearTimeout(timer);
    validationTimers.delete(event.document.uri);
  }
  // Clear diagnostics for closed document
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

documents.listen(connection);
connection.listen();