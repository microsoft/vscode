/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

async function getSessionContent(id: string, _token: vscode.CancellationToken): Promise<vscode.ChatSession> {
	const sessionManager = JoshBotSessionManager.getInstance();
	return await sessionManager.getSessionContent(id, _token);
}

export function activate(context: vscode.ExtensionContext) {
	console.log('JoshBot extension is now active!');

	const disposable = vscode.commands.registerCommand('joshbot.hello', () => {
		vscode.window.showInformationMessage('Hello from JoshBot!');
	});

	const sessionManager = JoshBotSessionManager.getInstance();
	sessionManager.initialize(context);

	context.subscriptions.push(vscode.chat.registerChatSessionItemProvider(
		'joshbot',
		{
			label: vscode.l10n.t('JoshBot'),
			provideChatSessionItems: async (_token: vscode.CancellationToken) => {
				return await sessionManager.getSessionItems(_token);
			},
			provideChatSessionContent: async (id: string, token: vscode.CancellationToken) => {
				return await getSessionContent(id, token);
			},
			// Events not used yet, but required by interface.
			onDidChangeChatSessionItems: new vscode.EventEmitter<void>().event,
		}
	));

	context.subscriptions.push(disposable);
}

interface JoshBotSession {
	id: string;
	name: string;
	iconPath?: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri };
	history: ReadonlyArray<vscode.ChatRequestTurn | vscode.ChatResponseTurn>;
	requestHandler?: vscode.ChatRequestHandler;
	activeResponseCallback?: (stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => Thenable<void>;
}

class JoshBotSessionManager {
	private static instance: JoshBotSessionManager;
	private _sessions: Map<string, JoshBotSession>;

	private constructor() {
		this._sessions = new Map<string, JoshBotSession>();
	}

	static getInstance(): JoshBotSessionManager {
		if (!JoshBotSessionManager.instance) {
			JoshBotSessionManager.instance = new JoshBotSessionManager();
		}
		return JoshBotSessionManager.instance;
	}

	initialize(_context: vscode.ExtensionContext): void {
		// Create a default session
		this.createDemoSession();
	}

	private createDemoSession(): void {
		const defaultSession: JoshBotSession = {
			id: 'default-session',
			name: 'JoshBot Chat',
			history: [],
			requestHandler: async (request, _context, stream, _token) => {
				// Simple echo bot for demo purposes
				stream.markdown(`You said: "${request.prompt}"`);
				return { metadata: { command: '', sessionId: 'default-session' } };
			}
		};
		this._sessions.set(defaultSession.id, defaultSession);
	}

	async getSessionContent(id: string, _token: vscode.CancellationToken): Promise<vscode.ChatSession> {
		const session = this._sessions.get(id);
		if (!session) {
			throw new Error(`Session with id ${id} not found`);
		}

		return {
			history: session.history,
			requestHandler: session.requestHandler,
			activeResponseCallback: session.activeResponseCallback
		};
	}

	async createNewSession(name?: string): Promise<string> {
		const sessionId = `session-${Date.now()}`;
		const newSession: JoshBotSession = {
			id: sessionId,
			name: name || `JoshBot Session ${this._sessions.size + 1}`,
			history: [],
			requestHandler: async (request, _context, stream, _token) => {
				// Simple echo bot for demo purposes
				stream.markdown(`You said: "${request.prompt}"`);
				return { metadata: { command: '', sessionId } };
			}
		};
		this._sessions.set(sessionId, newSession);
		return sessionId;
	}

	async getSessionItems(_token: vscode.CancellationToken): Promise<vscode.ChatSessionItem[]> {
		return Array.from(this._sessions.values()).map(session => ({
			id: session.id,
			label: session.name,
			iconPath: session.iconPath
		}));
	}
}

export function deactivate() {
	// This method is called when the extension is deactivated
}
