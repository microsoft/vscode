import * as vscode from "vscode";

export async function buildContext(): Promise<string> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return "No active editor. The user is not currently editing a file.";
  }

  const document = editor.document;
  const selection = editor.selection;
  const selectedText = document.getText(selection);
  const fileName = document.fileName;
  const language = document.languageId;

  const workspace = vscode.workspace.workspaceFolders?.length
    ? vscode.workspace.workspaceFolders.map(folder => folder.uri.fsPath).join(", ")
    : "No workspace open";

  const preview = document.getText().slice(0, 5000);

  return `
Project context:
- Workspace: ${workspace}
- Active file: ${fileName}
- Language: ${language}
- Selected code:
${selectedText || "No code selected."}

File preview:
${preview}
`;
}
