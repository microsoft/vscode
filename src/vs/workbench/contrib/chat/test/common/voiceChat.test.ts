/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ProviderResult } from 'vs/editor/common/languages';
import { IChatAgent, IChatAgentCommand, IChatAgentHistoryEntry, IChatAgentMetadata, IChatAgentRequest, IChatAgentResult, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatProgress, IChatFollowup } from 'vs/workbench/contrib/chat/common/chatService';
import { VoiceChatService } from 'vs/workbench/contrib/chat/common/voiceChat';
import { ISpeechProvider, ISpeechService, ISpeechToTextEvent, ISpeechToTextSession, KeywordRecognitionStatus, SpeechToTextStatus } from 'vs/workbench/contrib/speech/common/speechService';

suite('VoiceChat', () => {

	class TestChatAgentCommand implements IChatAgentCommand {
		constructor(readonly name: string, readonly description: string) { }
	}

	class TestChatAgent implements IChatAgent {
		constructor(readonly id: string, readonly lastSlashCommands: IChatAgentCommand[]) { }
		invoke(request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult> { throw new Error('Method not implemented.'); }
		provideSlashCommands(token: CancellationToken): Promise<IChatAgentCommand[]> { throw new Error('Method not implemented.'); }
		provideWelcomeMessage?(token: CancellationToken): ProviderResult<(string | IMarkdownString)[] | undefined> { throw new Error('Method not implemented.'); }
		metadata = {};
	}

	const agents: IChatAgent[] = [
		new TestChatAgent('workspace', [
			new TestChatAgentCommand('fix', 'fix'),
			new TestChatAgentCommand('explain', 'explain')
		]),
		new TestChatAgent('vscode', [
			new TestChatAgentCommand('search', 'search')
		]),
	];

	class TestChatAgentService implements IChatAgentService {
		_serviceBrand: undefined;
		readonly onDidChangeAgents = Event.None;
		registerAgent(agent: IChatAgent): IDisposable { throw new Error(); }
		invokeAgent(id: string, request: IChatAgentRequest, progress: (part: IChatProgress) => void, history: IChatAgentHistoryEntry[], token: CancellationToken): Promise<IChatAgentResult> { throw new Error(); }
		getFollowups(id: string, sessionId: string, token: CancellationToken): Promise<IChatFollowup[]> { throw new Error(); }
		getAgents(): Array<IChatAgent> { return agents; }
		getAgent(id: string): IChatAgent | undefined { throw new Error(); }
		getDefaultAgent(): IChatAgent | undefined { throw new Error(); }
		getSecondaryAgent(): IChatAgent | undefined { throw new Error(); }
		hasAgent(id: string): boolean { throw new Error(); }
		updateAgent(id: string, updateMetadata: IChatAgentMetadata): void { throw new Error(); }
	}

	class TestSpeechService implements ISpeechService {
		_serviceBrand: undefined;

		onDidRegisterSpeechProvider = Event.None;
		onDidUnregisterSpeechProvider = Event.None;

		readonly hasSpeechProvider = true;
		readonly hasActiveSpeechToTextSession = false;
		readonly hasActiveKeywordRecognition = false;

		registerSpeechProvider(identifier: string, provider: ISpeechProvider): IDisposable { throw new Error('Method not implemented.'); }
		onDidStartSpeechToTextSession = Event.None;
		onDidEndSpeechToTextSession = Event.None;

		createSpeechToTextSession(token: CancellationToken): ISpeechToTextSession {
			return {
				onDidChange: emitter.event,
				dispose: () => { }
			};
		}

		onDidStartKeywordRecognition = Event.None;
		onDidEndKeywordRecognition = Event.None;
		recognizeKeyword(token: CancellationToken): Promise<KeywordRecognitionStatus> { throw new Error('Method not implemented.'); }
	}

	const disposables = new DisposableStore();
	const emitter = disposables.add(new Emitter<ISpeechToTextEvent>());

	teardown(() => {
		disposables.clear();
	});

	test('Agent and slash command detection', async () => {
		const service = disposables.add(new VoiceChatService(new TestSpeechService(), new TestChatAgentService()));

		let event: ISpeechToTextEvent | undefined;
		let session: ISpeechToTextSession | undefined;

		function createSession() {
			session?.dispose();

			session = disposables.add(service.createVoiceChatSession(CancellationToken.None));
			disposables.add(session.onDidChange(e => {
				event = e;
			}));
		}

		// Nothing to detect
		createSession();

		emitter.fire({ status: SpeechToTextStatus.Started });
		assert.strictEqual(event?.status, SpeechToTextStatus.Started);

		emitter.fire({ status: SpeechToTextStatus.Recognizing, text: 'Hello' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
		assert.strictEqual(event?.text, 'Hello');

		emitter.fire({ status: SpeechToTextStatus.Recognizing, text: 'Hello World' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
		assert.strictEqual(event?.text, 'Hello World');

		emitter.fire({ status: SpeechToTextStatus.Recognized, text: 'Hello World' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
		assert.strictEqual(event?.text, 'Hello World');

		// Agent
		createSession();

		emitter.fire({ status: SpeechToTextStatus.Recognizing, text: 'At' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
		assert.strictEqual(event?.text, 'At');

		emitter.fire({ status: SpeechToTextStatus.Recognizing, text: 'At workspace' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
		assert.strictEqual(event?.text, '@workspace');

		emitter.fire({ status: SpeechToTextStatus.Recognizing, text: 'At workspace help' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
		assert.strictEqual(event?.text, '@workspace help');

		emitter.fire({ status: SpeechToTextStatus.Recognized, text: 'At workspace help' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
		assert.strictEqual(event?.text, '@workspace help');

		// Agent with punctuation
		createSession();

		emitter.fire({ status: SpeechToTextStatus.Recognizing, text: 'At workspace, help' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
		assert.strictEqual(event?.text, '@workspace help');

		emitter.fire({ status: SpeechToTextStatus.Recognized, text: 'At workspace, help' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
		assert.strictEqual(event?.text, '@workspace help');

		createSession();

		emitter.fire({ status: SpeechToTextStatus.Recognizing, text: 'At Workspace. help' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
		assert.strictEqual(event?.text, '@workspace help');

		emitter.fire({ status: SpeechToTextStatus.Recognized, text: 'At Workspace. help' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
		assert.strictEqual(event?.text, '@workspace help');

		// Slash Command
		createSession();

		emitter.fire({ status: SpeechToTextStatus.Recognizing, text: 'At code slash search help' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
		assert.strictEqual(event?.text, '@vscode /search help');

		emitter.fire({ status: SpeechToTextStatus.Recognized, text: 'At code slash search help' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
		assert.strictEqual(event?.text, '@vscode /search help');

		// Slash Command with punctuation
		createSession();

		emitter.fire({ status: SpeechToTextStatus.Recognizing, text: 'At code, slash search, help' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
		assert.strictEqual(event?.text, '@vscode /search help');

		emitter.fire({ status: SpeechToTextStatus.Recognized, text: 'At code, slash search, help' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
		assert.strictEqual(event?.text, '@vscode /search help');

		createSession();

		emitter.fire({ status: SpeechToTextStatus.Recognizing, text: 'At code. slash, search help' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
		assert.strictEqual(event?.text, '@vscode /search help');

		emitter.fire({ status: SpeechToTextStatus.Recognized, text: 'At code. slash search, help' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
		assert.strictEqual(event?.text, '@vscode /search help');

		// Agent not detected twice
		createSession();

		emitter.fire({ status: SpeechToTextStatus.Recognizing, text: 'At workspace, for at workspace' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognizing);
		assert.strictEqual(event?.text, '@workspace for at workspace');

		emitter.fire({ status: SpeechToTextStatus.Recognized, text: 'At workspace, for at workspace' });
		assert.strictEqual(event?.status, SpeechToTextStatus.Recognized);
		assert.strictEqual(event?.text, '@workspace for at workspace');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
