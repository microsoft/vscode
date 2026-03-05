/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/// <reference types="vscode" />

/**
 * Mock extension for Sessions E2E testing.
 *
 * Provides fake implementations of:
 * - GitHub authentication (skips sign-in)
 * - Chat participant (returns canned responses)
 * - File system provider for github-remote-file:// (in-memory files)
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

/** @type {Map<string, Uint8Array>} */
const fileStore = new Map();

// Pre-populate a fake repo
const MOCK_FILES = {
	'/src/index.ts': 'export function main() {\n\tconsole.log("Hello from mock repo");\n}\n',
	'/src/utils.ts': 'export function add(a: number, b: number): number {\n\treturn a + b;\n}\n',
	'/package.json': '{\n\t"name": "mock-repo",\n\t"version": "1.0.0"\n}\n',
	'/README.md': '# Mock Repository\n\nThis is a mock repository for E2E testing.\n',
};

for (const [path, content] of Object.entries(MOCK_FILES)) {
	fileStore.set(path, new TextEncoder().encode(content));
}

// Canned chat responses keyed by keywords in the user message
const CHAT_RESPONSES = [
	{
		match: /build|compile/i,
		response: [
			'I\'ll help you build the project. Here are the changes:',
			'',
			'```typescript',
			'// src/build.ts',
			'import { main } from "./index";',
			'',
			'async function build() {',
			'\tconsole.log("Building...");',
			'\tmain();',
			'\tconsole.log("Build complete!");',
			'}',
			'',
			'build();',
			'```',
			'',
			'I\'ve created a new build script that imports and runs the main function.',
		].join('\n'),
	},
	{
		match: /fix|bug/i,
		response: [
			'I found the issue. Here\'s the fix:',
			'',
			'```diff',
			'- export function add(a: number, b: number): number {',
			'+ export function add(a: number, b: number): number {',
			'+   if (typeof a !== "number" || typeof b !== "number") {',
			'+     throw new TypeError("Both arguments must be numbers");',
			'+   }',
			'    return a + b;',
			'  }',
			'```',
			'',
			'Added input validation to prevent NaN results.',
		].join('\n'),
	},
	{
		match: /explain/i,
		response: [
			'This project has a simple structure:',
			'',
			'- **src/index.ts** — Main entry point with a `main()` function',
			'- **src/utils.ts** — Utility functions like `add()`',
			'- **package.json** — Project metadata',
			'',
			'The `main()` function logs a greeting to the console.',
		].join('\n'),
	},
];

const DEFAULT_RESPONSE = [
	'I understand your request. Let me work on that.',
	'',
	'Here\'s what I\'d suggest:',
	'',
	'1. Review the current codebase structure',
	'2. Make the necessary changes',
	'3. Run the tests to verify',
	'',
	'Would you like me to proceed?',
].join('\n');

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

/**
 * @param {import('vscode').ExtensionContext} context
 */
function activate(context) {
	const vscode = require('vscode');

	console.log('[sessions-e2e-mock] Activating mock extension');

	// 1. Mock GitHub Authentication Provider
	context.subscriptions.push(registerMockAuth(vscode));

	// 2. Mock Chat Participant
	context.subscriptions.push(registerMockChat(vscode));

	// 3. Mock File System Provider
	context.subscriptions.push(registerMockFileSystem(vscode));

	console.log('[sessions-e2e-mock] All mocks registered');
}

// ---------------------------------------------------------------------------
// Mock Authentication Provider
// ---------------------------------------------------------------------------

/**
 * @param {typeof import('vscode')} vscode
 * @returns {import('vscode').Disposable}
 */
function registerMockAuth(vscode) {
	const sessionChangeEmitter = new vscode.EventEmitter();

	/** @type {import('vscode').AuthenticationSession} */
	const mockSession = {
		id: 'mock-session-1',
		accessToken: 'gho_mock_e2e_test_token_00000000000000000000',
		account: {
			id: 'e2e-test-user',
			label: 'E2E Test User',
		},
		scopes: ['read:user', 'repo', 'workflow'],
	};

	/** @type {import('vscode').AuthenticationProvider} */
	const provider = {
		onDidChangeSessions: sessionChangeEmitter.event,
		async getSessions(_scopes, _options) {
			return [mockSession];
		},
		async createSession(_scopes, _options) {
			sessionChangeEmitter.fire({ added: [mockSession], removed: [], changed: [] });
			return mockSession;
		},
		async removeSession(_sessionId) {
			sessionChangeEmitter.fire({ added: [], removed: [mockSession], changed: [] });
		},
	};

	console.log('[sessions-e2e-mock] Registering mock GitHub auth provider');
	return vscode.authentication.registerAuthenticationProvider('github', 'GitHub (Mock)', provider, {
		supportsMultipleAccounts: false,
	});
}

// ---------------------------------------------------------------------------
// Mock Chat Participant
// ---------------------------------------------------------------------------

/**
 * @param {typeof import('vscode')} vscode
 * @returns {import('vscode').Disposable}
 */
function registerMockChat(vscode) {
	const participant = vscode.chat.createChatParticipant('copilot', async (request, _context, response, _token) => {
		const userMessage = request.prompt || '';
		console.log(`[sessions-e2e-mock] Chat request: "${userMessage}"`);

		// Find matching canned response
		let responseText = DEFAULT_RESPONSE;
		for (const entry of CHAT_RESPONSES) {
			if (entry.match.test(userMessage)) {
				responseText = entry.response;
				break;
			}
		}

		// Stream the response with a small delay to simulate typing
		const lines = responseText.split('\n');
		for (const line of lines) {
			response.markdown(line + '\n');
		}

		return { metadata: { mock: true } };
	});

	participant.iconPath = new vscode.ThemeIcon('copilot');

	console.log('[sessions-e2e-mock] Registered mock chat participant "copilot"');
	return participant;
}

// ---------------------------------------------------------------------------
// Mock File System Provider (github-remote-file scheme)
// ---------------------------------------------------------------------------

/**
 * @param {typeof import('vscode')} vscode
 * @returns {import('vscode').Disposable}
 */
function registerMockFileSystem(vscode) {
	const fileChangeEmitter = new vscode.EventEmitter();

	/** @type {import('vscode').FileSystemProvider} */
	const provider = {
		onDidChangeFile: fileChangeEmitter.event,

		stat(uri) {
			const filePath = uri.path;
			if (fileStore.has(filePath)) {
				return {
					type: vscode.FileType.File,
					ctime: 0,
					mtime: Date.now(),
					size: fileStore.get(filePath).byteLength,
				};
			}
			// Check if it's a directory (any file starts with this path)
			const dirPrefix = filePath.endsWith('/') ? filePath : filePath + '/';
			const isDir = filePath === '/' || [...fileStore.keys()].some(k => k.startsWith(dirPrefix));
			if (isDir) {
				return { type: vscode.FileType.Directory, ctime: 0, mtime: Date.now(), size: 0 };
			}
			throw vscode.FileSystemError.FileNotFound(uri);
		},

		readDirectory(uri) {
			const dirPath = uri.path.endsWith('/') ? uri.path : uri.path + '/';
			const entries = new Map();
			for (const filePath of fileStore.keys()) {
				if (!filePath.startsWith(dirPath)) { continue; }
				const relative = filePath.slice(dirPath.length);
				const parts = relative.split('/');
				if (parts.length === 1) {
					entries.set(parts[0], vscode.FileType.File);
				} else {
					entries.set(parts[0], vscode.FileType.Directory);
				}
			}
			return [...entries.entries()];
		},

		readFile(uri) {
			const content = fileStore.get(uri.path);
			if (!content) { throw vscode.FileSystemError.FileNotFound(uri); }
			return content;
		},

		writeFile(uri, content, _options) {
			fileStore.set(uri.path, content);
			fileChangeEmitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
		},

		createDirectory(_uri) { /* no-op for in-memory */ },

		delete(uri, _options) {
			fileStore.delete(uri.path);
			fileChangeEmitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
		},

		rename(oldUri, newUri, _options) {
			const content = fileStore.get(oldUri.path);
			if (!content) { throw vscode.FileSystemError.FileNotFound(oldUri); }
			fileStore.delete(oldUri.path);
			fileStore.set(newUri.path, content);
			fileChangeEmitter.fire([
				{ type: vscode.FileChangeType.Deleted, uri: oldUri },
				{ type: vscode.FileChangeType.Created, uri: newUri },
			]);
		},

		watch(_uri, _options) {
			return { dispose() { } };
		},
	};

	console.log('[sessions-e2e-mock] Registering mock file system for mock-fs://');
	return vscode.workspace.registerFileSystemProvider('mock-fs', provider, {
		isCaseSensitive: true,
	});
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { activate };
