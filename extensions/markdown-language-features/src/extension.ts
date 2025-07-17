/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LanguageClient, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { MdLanguageClient, startClient } from './client/client';
import { activateShared } from './extension.shared';
import { VsCodeOutputLogger } from './logging';
import { IMdParser, MarkdownItEngine } from './markdownEngine';
import { getMarkdownExtensionContributions } from './markdownExtensions';
import { githubSlugifier } from './slugify';

// Chat session provider implementation
const sessionProviderType = 'fake-session-provider';
function registerMarkdownChatProvider(context: vscode.ExtensionContext) {
	// Create sample history with a request and a response
	const sampleHistory: Array<vscode.ChatRequestTurn | vscode.ChatResponseTurn> = [
		// Simple request turn with proper ChatRequestTurn structure
		new vscode.ChatRequestTurn('Hello, this is a test request to the markdown chat provider', undefined, [], 'markdown', []),
		// Simple response turn with proper ChatResponseTurn structure
		new vscode.ChatResponseTurn(
			[new vscode.ChatResponseMarkdownPart(new vscode.MarkdownString('Hello! I am a simple markdown chat provider. I can help with markdown-related questions.'))],
			{},
			'markdown'
		)
	];

	// Request handler that reverses the input text
	const requestHandler: vscode.ChatRequestHandler = async (
		request: vscode.ChatRequest,
		_context: unknown,
		stream: vscode.ChatResponseStream,
		_token: vscode.CancellationToken
	): Promise<void> => {
		// Extract the text from the request
		const text = request.prompt || '';

		if (text) {
			// Reverse the input text and stream it back
			const reversedText = text.split('').reverse().join('');

			// First send the original text
			await stream.progress('You said: ' + text);

			// Wait a bit to simulate processing
			await new Promise(resolve => setTimeout(resolve, 500));

			// Then send the reversed text
			await stream.progress('Here is your text reversed: ');
			await stream.progress('```\n' + reversedText + '\n```');

			// Complete the response by resolving the promise
			return Promise.resolve();
		} else {
			// Handle empty messages
			await stream.progress('I can only process text messages right now.');
			return Promise.resolve();
		}
	};

	// Register the chat session provider
	const chatSessionProvider: vscode.ChatSessionContentProvider = {
		provideChatSessionContent: async (_id: string, _token: vscode.CancellationToken): Promise<vscode.ChatSession> => {
			// Create a chat session with our sample history and request handler
			return {
				history: sampleHistory,
				requestHandler: requestHandler
			};
		}
	};

	// Register the provider with the 'markdown' type
	context.subscriptions.push(
		vscode.chat.registerChatSessionContentProvider(sessionProviderType, chatSessionProvider)
	);

	// Register a command to open a markdown chat session
	context.subscriptions.push(
		vscode.commands.registerCommand('markdown.openChatSession', async () => {
			await vscode.window.openChatSession(sessionProviderType, '123');
		})
	);
}

export async function activate(context: vscode.ExtensionContext) {
	const contributions = getMarkdownExtensionContributions(context);
	context.subscriptions.push(contributions);

	const logger = new VsCodeOutputLogger();
	context.subscriptions.push(logger);

	const engine = new MarkdownItEngine(contributions, githubSlugifier, logger);

	const client = await startServer(context, engine);
	context.subscriptions.push(client);
	activateShared(context, client, engine, logger, contributions);

	// Register our markdown chat provider
	registerMarkdownChatProvider(context);
}

function startServer(context: vscode.ExtensionContext, parser: IMdParser): Promise<MdLanguageClient> {
	const isDebugBuild = context.extension.packageJSON.main.includes('/out/');

	const serverModule = context.asAbsolutePath(
		isDebugBuild
			// For local non bundled version of vscode-markdown-languageserver
			// ? './node_modules/vscode-markdown-languageserver/out/node/workerMain'
			? './node_modules/vscode-markdown-languageserver/dist/node/workerMain'
			: './dist/serverWorkerMain'
	);

	// The debug options for the server
	const debugOptions = { execArgv: ['--nolazy', '--inspect=' + (7000 + Math.round(Math.random() * 999))] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	// pass the location of the localization bundle to the server
	process.env['VSCODE_L10N_BUNDLE_LOCATION'] = vscode.l10n.uri?.toString() ?? '';

	return startClient((id, name, clientOptions) => {
		return new LanguageClient(id, name, serverOptions, clientOptions);
	}, parser);
}
