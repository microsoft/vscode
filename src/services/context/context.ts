const MAX_LINES = 200;

interface TextEditorLike {
  document: {
    fileName: string;
    getText(range?: any): string;
  };
  selection?: any;
}

/**
 * Collects a summary of the currently open editors in the workspace.
 * The summary includes each file's name, the first {@link MAX_LINES} lines
 * of its content, and any selected text.
 */
export async function collectWorkspaceContext(editors?: readonly TextEditorLike[]): Promise<string> {
  if (!editors) {
    try {
      const vscode = await import('vscode');
      editors = vscode.window.visibleTextEditors as readonly TextEditorLike[];
    } catch {
      editors = [];
    }
  }

  const parts: string[] = [];
  for (const editor of editors ?? []) {
    const fileName = editor.document.fileName;
    const fullText = editor.document.getText();
    const lines = fullText.split(/\r?\n/);
    let snippet = lines.slice(0, MAX_LINES).join('\n');
    if (lines.length > MAX_LINES) {
      snippet += '\n...';
    }
    let section = `Filename: ${fileName}\n${snippet}`;
    const selected = editor.document.getText(editor.selection);
    if (selected) {
      section += `\nSelected Text:\n${selected}`;
    }
    parts.push(section);
  }
  return parts.join('\n\n');
}

/**
 * Builds a prompt by appending workspace context to the user's input.
 */
export async function buildPromptWithContext(userPrompt: string, editors?: readonly TextEditorLike[]): Promise<string> {
  const context = await collectWorkspaceContext(editors);
  if (!context) {
    return userPrompt;
  }
  return `${userPrompt}\n\nContext:\n${context}`;
}

