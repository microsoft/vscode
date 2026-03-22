import * as vscode from 'vscode';

export interface ForgeMdSession {
	readonly documentUri: vscode.Uri;
	refresh(): void;
	showSource(): Promise<void>;
	revealNextOpenThread(fromThreadId?: string): void;
}

const registry = new Map<string, ForgeMdSession>();

export function registerForgeMdSession(session: ForgeMdSession): vscode.Disposable {
	const key = session.documentUri.toString();
	registry.set(key, session);
	return new vscode.Disposable(() => {
		if (registry.get(key) === session) {
			registry.delete(key);
		}
	});
}

export function getActiveForgeMdSession(): ForgeMdSession | undefined {
	const doc = vscode.window.activeTextEditor?.document;
	if (!doc) {
		return undefined;
	}
	return registry.get(doc.uri.toString());
}
