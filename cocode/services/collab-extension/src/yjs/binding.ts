import * as vscode from 'vscode';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { getColorForUser } from './colors';
import { setupPresence } from './presence';

const documentBindings = new Map<string, {
	doc: Y.Doc;
	provider: WebsocketProvider;
	disposables: vscode.Disposable[];
}>();

export function setupCollaboration(context: vscode.ExtensionContext, yjsUrl: string): vscode.Disposable {
	// Get user info (from context storage or generate random)
	const userId = context.globalState.get<string>('userId') || `user_${Math.random().toString(36).substr(2, 9)}`;
	const userName = context.globalState.get<string>('userName') || 'Anonymous';

	// Save userId for future sessions
	if (!context.globalState.get<string>('userId')) {
		context.globalState.update('userId', userId);
	}

	const userColor = getColorForUser(userId);

	console.log(`[CoCode Collab] User: ${userName} (${userId}), Color: ${userColor}`);

	// Handle already-open documents
	vscode.workspace.textDocuments.forEach(doc => {
		if (shouldSync(doc)) {
			bindDocument(doc, yjsUrl, userId, userName, userColor);
		}
	});

	// Handle newly-opened documents
	const openListener = vscode.workspace.onDidOpenTextDocument(doc => {
		if (shouldSync(doc)) {
			bindDocument(doc, yjsUrl, userId, userName, userColor);
		}
	});

	// Handle closed documents
	const closeListener = vscode.workspace.onDidCloseTextDocument(doc => {
		unbindDocument(doc);
	});

	// Cleanup on dispose
	return new vscode.Disposable(() => {
		openListener.dispose();
		closeListener.dispose();
		documentBindings.forEach((_, uri) => {
			unbindDocument({ uri: vscode.Uri.parse(uri) } as vscode.TextDocument);
		});
	});
}

function shouldSync(doc: vscode.TextDocument): boolean {
	// Only sync files (not untitled, output, etc.)
	if (doc.uri.scheme !== 'file') {
		return false;
	}

	// Only sync C/C++/Python files
	const language = doc.languageId;
	return ['c', 'cpp', 'python'].includes(language);
}

function bindDocument(
	doc: vscode.TextDocument,
	yjsUrl: string,
	userId: string,
	userName: string,
	userColor: string
) {
	const uri = doc.uri.toString();

	if (documentBindings.has(uri)) {
		return; // Already bound
	}

	console.log(`[CoCode Collab] Binding document: ${uri}`);

	// Create Yjs document
	const ydoc = new Y.Doc();
	const ytext = ydoc.getText('content');

	// Create WebSocket provider
	const roomName = `cocode:${uri}`;
	const provider = new WebsocketProvider(yjsUrl, roomName, ydoc);

	provider.on('status', (event: { status: string }) => {
		console.log(`[CoCode Collab] Connection status: ${event.status}`);
		if (event.status === 'connected') {
			vscode.window.showInformationMessage('Collaboration connected');
		}
	});

	provider.on('sync', (isSynced: boolean) => {
		if (isSynced) {
			console.log(`[CoCode Collab] Document synced: ${uri}`);
		}
	});

	// Set awareness (presence)
	provider.awareness.setLocalStateField('user', {
		id: userId,
		name: userName,
		color: userColor
	});

	// Setup presence UI (cursors, selections)
	const presenceDisposables = setupPresence(doc, provider.awareness, userColor);

	// Sync initial content to Yjs
	const initialContent = doc.getText();
	if (ytext.length === 0 && initialContent.length > 0) {
		ytext.insert(0, initialContent);
	}

	// Listen to Yjs changes and update VS Code
	const yObserver = (event: Y.YTextEvent) => {
		if (event.transaction.local) {
			return; // Skip local changes
		}

		const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri);
		if (!editor) {
			return;
		}

		// Apply remote changes
		event.changes.delta.forEach((change: any) => {
			if (change.retain !== undefined) {
				// Position update
			} else if (change.insert !== undefined) {
				const content = change.insert;
				const pos = editor.document.positionAt(change.offset || 0);
				editor.edit(editBuilder => {
					editBuilder.insert(pos, content);
				});
			} else if (change.delete !== undefined) {
				const pos = editor.document.positionAt(change.offset || 0);
				const endPos = editor.document.positionAt((change.offset || 0) + change.delete);
				editor.edit(editBuilder => {
					editBuilder.delete(new vscode.Range(pos, endPos));
				});
			}
		});
	};

	ytext.observe(yObserver);

	// Listen to VS Code changes and update Yjs
	const changeListener = vscode.workspace.onDidChangeTextDocument(e => {
		if (e.document.uri.toString() !== uri) {
			return;
		}

		e.contentChanges.forEach(change => {
			const offset = e.document.offsetAt(change.range.start);

			// Delete old content
			if (change.rangeLength > 0) {
				ytext.delete(offset, change.rangeLength);
			}

			// Insert new content
			if (change.text.length > 0) {
				ytext.insert(offset, change.text);
			}
		});
	});

	// Store binding
	documentBindings.set(uri, {
		doc: ydoc,
		provider,
		disposables: [changeListener, ...presenceDisposables]
	});
}

function unbindDocument(doc: { uri: vscode.Uri }) {
	const uri = doc.uri.toString();
	const binding = documentBindings.get(uri);

	if (!binding) {
		return;
	}

	console.log(`[CoCode Collab] Unbinding document: ${uri}`);

	// Cleanup
	binding.disposables.forEach(d => d.dispose());
	binding.provider.destroy();
	binding.doc.destroy();

	documentBindings.delete(uri);
}
