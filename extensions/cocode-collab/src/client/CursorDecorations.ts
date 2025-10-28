import * as vscode from 'vscode';

export type RemoteSelection = {
  clientId: string;
  username: string;
  color: string;
  selectionStart: number;
  selectionEnd: number;
};

export class CursorDecorations {
  private readonly activeDecorations = new Map<string, Map<string, vscode.TextEditorDecorationType>>();

  apply(editor: vscode.TextEditor, selections: RemoteSelection[]) {
    const key = editor.document.uri.toString();
    const decorationsForEditor = this.activeDecorations.get(key) ?? new Map<string, vscode.TextEditorDecorationType>();
    const seen = new Set<string>();

    for (const selection of selections) {
      const start = editor.document.positionAt(selection.selectionStart);
      const end = editor.document.positionAt(selection.selectionEnd);
      const range = new vscode.Range(start, end);
      const existing = decorationsForEditor.get(selection.clientId);
      const decoration = existing ?? this.createDecoration(selection);
      if (!existing) {
        decorationsForEditor.set(selection.clientId, decoration);
      }
      editor.setDecorations(decoration, [range]);
      seen.add(selection.clientId);
    }

    for (const [clientId, decoration] of decorationsForEditor.entries()) {
      if (!seen.has(clientId)) {
        decoration.dispose();
        decorationsForEditor.delete(clientId);
      }
    }

    if (decorationsForEditor.size === 0) {
      this.activeDecorations.delete(key);
    } else {
      this.activeDecorations.set(key, decorationsForEditor);
    }
  }

  clear() {
    for (const decorations of this.activeDecorations.values()) {
      for (const deco of decorations.values()) {
        deco.dispose();
      }
    }
    this.activeDecorations.clear();
  }

  dispose() {
    this.clear();
  }

  private createDecoration(selection: RemoteSelection) {
    const baseColor = selection.color;
    const border = `color-mix(in srgb, ${baseColor} 70%, transparent)`;
    const background = `color-mix(in srgb, ${baseColor} 25%, var(--cocode-collab-surface, transparent))`;
    const labelColor = `var(--cocode-collab-label, ${baseColor})`;
    return vscode.window.createTextEditorDecorationType({
      border: `1px solid ${border}`,
      backgroundColor: background,
      overviewRulerColor: baseColor,
      overviewRulerLane: vscode.OverviewRulerLane.Full,
      after: {
        contentText: ` ${selection.username}`,
        color: labelColor,
        margin: '0 0 0 6px'
      }
    });
  }
}
