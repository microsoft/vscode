/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

async function getSessionContent(id: string, _token: vscode.CancellationToken): Promise<vscode.ChatSession> {
	const sessionManager = JoshBotSessionManager.getInstance();
	return await sessionManager.getSessionContent(id, _token);
}

// Must match package.json's "contributes.chatSessions.[0].id"
const CHAT_SESSION_TYPE = 'josh-bot';

const output = vscode.window.createOutputChannel('JoshBot');

export function activate(context: vscode.ExtensionContext) {
	console.log('JoshBot extension is now active!');
	output.appendLine('JoshBot extension is now active!');

	const disposable = vscode.commands.registerCommand('joshbot.hello', () => {
		vscode.window.showInformationMessage('Hello from JoshBot!');
		output.appendLine('Hello command executed');
	});

	const sessionManager = JoshBotSessionManager.getInstance();
	sessionManager.initialize(context);

	const provider = new class implements vscode.ChatSessionItemProvider, vscode.ChatSessionContentProvider {
		label = vscode.l10n.t('JoshBot');
		provideChatSessionItems = async (_token: vscode.CancellationToken) => {
			output.appendLine('Providing chat session items');
			return await sessionManager.getSessionItems(_token);
		};
		provideChatSessionContent = async (id: string, token: vscode.CancellationToken) => {
			output.appendLine(`Providing chat session content for id: ${id}`);
			return await getSessionContent(id, token);
		};
		// Events not used yet, but required by interface.
		onDidChangeChatSessionItems = new vscode.EventEmitter<void>().event;
	};

	context.subscriptions.push(vscode.chat.registerChatSessionItemProvider(
		CHAT_SESSION_TYPE,
		provider
	));

	context.subscriptions.push(vscode.chat.registerChatSessionContentProvider(
		CHAT_SESSION_TYPE,
		provider
	));

	context.subscriptions.push(disposable);
	context.subscriptions.push(output);
}

interface JoshBotSession extends vscode.ChatSession {
	id: string;
	name: string;
	iconPath?: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri };
	history: ReadonlyArray<vscode.ChatRequestTurn | vscode.ChatResponseTurn>;
	requestHandler: vscode.ChatRequestHandler;
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
		const currentResponseParts: Array<vscode.ChatResponseMarkdownPart | vscode.ChatToolInvocationPart> = [];
		currentResponseParts.push(new vscode.ChatResponseMarkdownPart('hey'));
		const response2 = new vscode.ChatResponseTurn2(currentResponseParts, {}, 'joshbot');
		const defaultSession: JoshBotSession = {
			id: 'default-session',
			name: 'JoshBot Chat',
			history: [
				new vscode.ChatRequestTurn2('hello', undefined, [], 'joshbot', [], []),
				response2 as vscode.ChatResponseTurn
			],
			requestHandler: async (request, _context, stream, _token) => {
				// Simple echo bot for demo purposes
				output.appendLine(`(default-session) Request received: ${request.prompt}`);
				stream.markdown(`You said: "${request.prompt}"`);
				return { metadata: { command: '', sessionId: 'default-session' } };
			}
		};

		this._sessions.set(defaultSession.id, defaultSession);

		const ongoingSession: JoshBotSession = {
			id: 'ongoing-session',
			name: 'JoshBot Chat ongoing',
			history: [
				new vscode.ChatRequestTurn2('hello', undefined, [], 'joshbot', [], []),
				response2 as vscode.ChatResponseTurn
			],
			requestHandler: async (request, _context, stream, _token) => {
				output.appendLine(`(ongoing-session) Request received: ${request.prompt}`);
				stream.markdown(`Processing your request: "${request.prompt}"`);
				output.appendLine(`(ongoing-session) Completed response for: ${request.prompt}`);
				return { metadata: { command: '', sessionId: 'ongoing-session' } };
			}
		};
		this._sessions.set(ongoingSession.id, ongoingSession);
	}

	async getSessionContent(id: string, _token: vscode.CancellationToken): Promise<vscode.ChatSession> {
		// Remove the chat session type prefix if present
		const actualId = id.includes(':') ? id.split(':')[1] : id;

		const session = this._sessions.get(actualId);
		if (!session) {
			throw new Error(`Session with id ${actualId} not found`);
		}

		if (session.id === 'ongoing-session') {
			return {
				history: session.history,
				requestHandler: session.requestHandler,
				activeResponseCallback: async (stream) => {
					// loop 1 to 5
					output.appendLine(`Active response callback for session ${session.id}`);
					for (let i = 0; i < 5; i++) {
						stream.markdown(`\nthinking step ${i + 1}... \n`);
						await new Promise(resolve => setTimeout(resolve, 1000));
					}

					stream.markdown(`Done`);
				}
			};
		} else {
			return {
				history: session.history,
				requestHandler: session.requestHandler,
				activeResponseCallback: undefined
			};
		}
	}

	async createNewSession(name?: string): Promise<string> {
		output.appendLine(`Creating new session with name: ${name}`);
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
		output.appendLine(`Providing chat session items`);
		return Array.from(this._sessions.values()).map(session => ({
			id: `${CHAT_SESSION_TYPE}:${session.id}`,
			label: session.name,
			iconPath: session.iconPath
		}));
	}
}

export function deactivate() {
	// This method is called when the extension is deactivated
}
