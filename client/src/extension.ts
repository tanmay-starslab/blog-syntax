import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
  const serverModule = context.asAbsolutePath(path.join("server", "out", "server.js"));
  const serverOptions: ServerOptions = {
    run:   { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ["--inspect=6009"] } }
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "blog" }]
  };

  client = new LanguageClient("blogLanguageServer", "BLOG Language Server", serverOptions, clientOptions);
  // context.subscriptions.push(client.start());
  client.start();
  // Dispose by stopping the client when the extension unloads
  context.subscriptions.push({ dispose: () => client.stop() });
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
