import * as vscode from 'vscode';
import type { Awareness } from 'y-protocols/awareness';

interface AwarenessUser {
	id: string;
	name: string;
	color: string;
	cursor?: { line: number; character: number };
	selection?: { start: { line: number; character: number }; end: { line: number; character: number } };
}

const cursorDecorations = new Map<string, vscode.TextEditorDecorationType>();

export function setupPresence(
	doc: vscode.TextDocument,
	awareness: Awareness,
	localColor: string
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	// Track cursor/selection changes and broadcast
	const selectionListener = vscode.window.onDidChangeTextEditorSelection(e => {
		if (e.textEditor.document.uri.toString() !== doc.uri.toString()) {
			return;
		}

		const cursor = e.selections[0].active;
		const selection = e.selections[0];

		awareness.setLocalStateField('cursor', {
			line: cursor.line,
			character: cursor.character
		});

		if (!selection.isEmpty) {
			awareness.setLocalStateField('selection', {
				start: { line: selection.start.line, character: selection.start.character },
				end: { line: selection.end.line, character: selection.end.character }
			});
		} else {
			awareness.setLocalStateField('selection', null);
		}
	});

	disposables.push(selectionListener);

	// Listen to awareness changes (other users' cursors)
	const awarenessListener = () => {
		updateCursorDecorations(doc, awareness);
	};

	awareness.on('change', awarenessListener);

	// Cleanup
	disposables.push(new vscode.Disposable(() => {
		awareness.off('change', awarenessListener);
		cursorDecorations.forEach(decoration => decoration.dispose());
		cursorDecorations.clear();
	}));

	return disposables;
}

function updateCursorDecorations(doc: vscode.TextDocument, awareness: Awareness) {
	const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === doc.uri.toString());
	if (!editor) {
		return;
	}

	const states = awareness.getStates();
	const localClientId = awareness.clientID;

	// Clear old decorations
	cursorDecorations.forEach(decoration => decoration.dispose());
	cursorDecorations.clear();

	// Create decorations for each remote user
	states.forEach((state, clientId) => {
		if (clientId === localClientId) {
			return; // Skip self
		}

		const user = state.user as AwarenessUser | undefined;
		if (!user || !user.cursor) {
			return;
		}

		const cursor = user.cursor;
		const position = new vscode.Position(cursor.line, cursor.character);

		// Create cursor decoration
		const decorationType = vscode.window.createTextEditorDecorationType({
			borderWidth: '0 0 0 2px',
			borderStyle: 'solid',
			borderColor: user.color,
			backgroundColor: `${user.color}33`, // 20% opacity
			after: {
				contentText: ` ${user.name}`,
				color: user.color,
				backgroundColor: user.color + '22',
				border: `1px solid ${user.color}`,
				margin: '0 0 0 4px',
				fontWeight: 'bold'
			}
		}); const range = new vscode.Range(position, position.translate(0, 1));
		editor.setDecorations(decorationType, [range]);

		cursorDecorations.set(`${clientId}`, decorationType);
	});
}
