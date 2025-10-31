# BLOG Bayesian Logic Language Support

VS Code extension for the **BLOG (Bayesian Logic)** probabilistic programming language. Provides TextMate grammar, language configuration, snippets, and a minimal Language Server (hover + diagnostics).

---

## Features

- **Syntax Highlighting (TextMate)**
  - `type`, `distinct`, `random`, `fixed`, `origin`, `obs`, `query`, control keywords, operators.
  - Unique scopes for `distinct` object identifiers and `#` number statements.
- **Language Configuration**
  - Line comments (`//`), block comments (`/* … */`), brackets, basic indentation.
- **Snippets**
  - Common declarations and statement templates.
- **Minimal LSP**
  - **Hover**: short glossaries for core BLOG constructs.
  - **Diagnostics**: missing semicolons (line-level heuristic), brace-balance checks.
  - Ignores diagnostics inside `//` and `/* … */` comments.
- **Markdown/LaTeX Injection**
  - Fenced code blocks (```blog) in Markdown and LaTeX are highlighted using BLOG grammar.

---

## Installation

### Option A — VS Code Marketplace (recommended)

1. Open **VS Code → Extensions** (`Cmd+Shift+X` on macOS / `Ctrl+Shift+X` on Linux/Windows).
2. Search: `BLOG Bayesian Logic`.
3. Install the extension published by **TanmaySingh97**.

Or via CLI:

```bash
code --install-extension TanmaySingh97.blog-bayesian-logic-syntax
```

### Option B — Local VSIX

```bash
# after packaging (see Packaging)
code --install-extension blog-syntax-0.2.0.vsix
```

---

## Quick start (development)

```bash
npm install -w client -w server
npm run compile
# Press F5 in VS Code to launch an Extension Development Host
```

Open a `.blog` file in the dev host to verify highlighting, hovers, and diagnostics.

---

## Packaging

```bash
npm i -g @vscode/vsce
npx vsce package
# produces blog-syntax-0.2.0.vsix
```

### Publish to Marketplace (CLI)

```bash
# one-time login for your Publisher ID (requires Azure DevOps PAT with Marketplace → Manage scope)
npx vsce login <YourPublisherID>
npx vsce publish 0.2.0
```

---

## Manual install from source

```bash
git clone https://github.com/tanmay-starslab/blog-syntax.git
cd blog-syntax
npm install -w client -w server
npm run compile
npx vsce package
code --install-extension blog-syntax-0.2.0.vsix
```

---

## Notes on scopes (for theming)

- **Distinct objects**: `variable.other.distinct.blog`
- **Number statements (`#`)**: `keyword.operator.hashcount.blog`
- **BLOG keywords**: `keyword.control.blog`
- **Types**: `storage.type.blog`
- **Function names**: `entity.name.function.blog`
- **Operators**: `keyword.operator.blog`
- **Comments**: `comment.*.blog`

Adjust your theme or add a custom `editor.tokenColorCustomizations` block to style these scopes.

---

## Version History

### v0.2.0
- Added dedicated scopes:
  - `variable.other.distinct.blog` for identifiers in `distinct` declarations.
  - `keyword.operator.hashcount.blog` for `#` number statements.
- Hover help for `distinct`, `random`, `fixed`, `origin`, `obs`, `query`, and number statements.
- Diagnostics ignore commented regions; reduced false positives for semicolons.
- Markdown/LaTeX fenced code block injection for ```blog.

---

## Links

- **Marketplace**: https://marketplace.visualstudio.com/publishers/TanmaySingh97
- **Repository**: https://github.com/tanmay-starslab/blog-syntax
- **BLOG reference**: Milch et al., “BLOG: Probabilistic Models with Unknown Objects,” IJCAI 2005; https://bayesianlogic.github.io

---

## License

MIT
