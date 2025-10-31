# BLOG language support

VS Code language pack for the BLOG (Bayesian Logic) language.

## Features
- TextMate grammar for BLOG
- Language configuration (comments, brackets, indentation)
- Snippets for common statements
- Minimal LSP (hover + diagnostics; missing semicolons / brace balance)
- Markdown/LaTeX fenced code-block injection (```blog)

## Quick start
```bash
npm install -w client -w server
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

## Packaging
```bash
npm i -g @vscode/vsce
vsce package
code --install-extension blog-syntax-0.2.0.vsix
```
