/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ChatEditingSessionState, IChatEditingSession, IModifiedFileEntry, ModifiedFileEntryState } from '../../../../contrib/chat/common/editing/chatEditingService.js';
import { IChatRequestDisablement } from '../../../../contrib/chat/common/model/chatModel.js';
import { IChatTodo } from '../../../../contrib/chat/common/tools/chatTodoListService.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../contrib/chat/common/languageModels.js';
import { ChatAgentLocation } from '../../../../contrib/chat/common/constants.js';
import { ChatInputNotificationSeverity, IChatInputNotification } from '../../../../contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { renderChatInput } from './renderChatInput.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

const sampleArtifacts = [
	{ label: 'Dev Server', uri: 'http://localhost:3000', type: 'devServer' as const },
	{ label: 'Screenshot', uri: 'file:///tmp/screenshot.png', type: 'screenshot' as const },
	{ label: 'Plan', uri: 'file:///tmp/plan.md', type: 'plan' as const },
];

function createMockEditingSession(files: { uri: string; added: number; removed: number }[]): IChatEditingSession {
	const entries = files.map(f => {
		const entry = new class extends mock<IModifiedFileEntry>() {
			override readonly entryId = f.uri;
			override readonly modifiedURI = URI.parse(f.uri);
			override readonly originalURI = URI.parse(f.uri);
			override readonly state = observableValue('state', ModifiedFileEntryState.Modified);
			override readonly linesAdded = observableValue('linesAdded', f.added);
			override readonly linesRemoved = observableValue('linesRemoved', f.removed);
			override readonly lastModifyingRequestId = 'request-1';
			override readonly changesCount = observableValue('changesCount', 1);
			override readonly isCurrentlyBeingModifiedBy = observableValue('isCurrentlyBeingModifiedBy', undefined);
			override readonly lastModifyingResponse = observableValue('lastModifyingResponse', undefined);
			override readonly rewriteRatio = observableValue('rewriteRatio', 0);
			override readonly waitsForLastEdits = observableValue('waitsForLastEdits', false);
			override readonly reviewMode = observableValue('reviewMode', false);
			override readonly autoAcceptController = observableValue('autoAcceptController', undefined);
		}();
		return entry;
	});

	return new class extends mock<IChatEditingSession>() {
		override readonly isGlobalEditingSession = false;
		override readonly chatSessionResource = URI.parse('chat-session:test-session');
		override readonly onDidDispose = Event.None;
		override readonly state = observableValue('state', ChatEditingSessionState.Idle);
		override readonly entries = observableValue('entries', entries);
		override readonly requestDisablement = observableValue<IChatRequestDisablement[]>('requestDisablement', []);
	}();
}

const sampleTodos: IChatTodo[] = [
	{ id: 1, title: 'Set up project structure', status: 'completed' },
	{ id: 2, title: 'Implement auth service', status: 'in-progress' },
	{ id: 3, title: 'Add unit tests', status: 'not-started' },
];

const sampleModels: ILanguageModelChatMetadataAndIdentifier[] = [
	{
		identifier: 'openai-gpt-5.3-codex',
		metadata: {
			extension: new ExtensionIdentifier('fixture.extension'),
			id: 'gpt-5.3-codex',
			name: 'GPT-5.3-Codex',
			vendor: 'openai',
			family: 'gpt',
			version: '1',
			maxInputTokens: 128000,
			maxOutputTokens: 4096,
			isDefaultForLocation: { [ChatAgentLocation.Chat]: true },
		},
	},
];

const sampleNotification: IChatInputNotification = {
	id: 'fixture.notification',
	severity: ChatInputNotificationSeverity.Info,
	message: 'You are approaching your monthly limit.',
	description: undefined,
	actions: [],
	dismissible: true,
	autoDismissOnMessage: false,
};

export default defineThemedFixtureGroup({ path: 'chat/input/' }, {
	Default: defineComponentFixture({ render: context => renderChatInput(context) }),
	WithSandboxing: defineComponentFixture({ render: context => renderChatInput(context, { sandboxingEnabled: true }) }),
	WithProviderIcon: defineComponentFixture({ render: context => renderChatInput(context, { models: sampleModels }) }),
	CompactWithProviderIcon: defineComponentFixture({ render: context => renderChatInput(context, { models: sampleModels, width: 260 }) }),
	WithArtifacts: defineComponentFixture({ render: context => renderChatInput(context, { artifacts: sampleArtifacts }) }),
	// The notice/input seam, the subject of #330483. Driven through the real
	// notification service so the squared corner comes from the stack.
	WithNotification: defineComponentFixture({
		render: context => renderChatInput(context, { notification: sampleNotification })
	}),
	// A run of three: notice, todo list, then the input. Covers a notice docking
	// to a widget rather than straight to the input.
	WithNotificationAndTodos: defineComponentFixture({
		render: context => renderChatInput(context, { notification: sampleNotification, todos: sampleTodos })
	}),
	WithFileChanges: defineComponentFixture({
		render: context => renderChatInput(context, { editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]) })
	}),
	WithTodos: defineComponentFixture({
		render: context => renderChatInput(context, { todos: sampleTodos })
	}),
	WithTodosAndFileChanges: defineComponentFixture({
		render: context => renderChatInput(context, { todos: sampleTodos, editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]) })
	}),
	WithArtifactsAndFileChanges: defineComponentFixture({
		render: context => renderChatInput(context, { artifacts: sampleArtifacts, editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]) })
	}),
	Full: defineComponentFixture({
		render: context => renderChatInput(context, {
			artifacts: sampleArtifacts,
			editingSession: createMockEditingSession([{ uri: 'file:///workspace/src/fibon.ts', added: 21, removed: 1 }]),
			todos: sampleTodos,
		})
	}),
	// Standalone dictation / Voice Mode controls, shown when the segmented voice
	// pill isn't active. Each state changes part of the border / color / glow
	// cascade, so they are covered individually.
	VoiceDictationIdle: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'dictationIdle' }) }),
	VoiceDictationRecording: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'dictationRecording' }) }),
	VoiceDictationPreparing: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'dictationPreparing' }) }),
	VoiceModeIdle: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'voiceIdle' }) }),
	VoiceModeConnecting: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'voiceConnecting' }) }),
	VoiceModeListening: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'voiceListening' }) }),
	VoiceModeSpeaking: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'voiceSpeaking' }) }),
	VoiceModeDisconnect: defineComponentFixture({ render: context => renderChatInput(context, { voiceControl: 'voiceDisconnect' }) }),

	// Where the pet lands, with and without a notice docked above the input (#332570).
	WithPet: defineComponentFixture({ render: context => renderChatInput(context, { pet: true }) }),
	WithPetAndNotification: defineComponentFixture({
		render: context => renderChatInput(context, { pet: true, notification: sampleNotification })
	}),
	// Notification and todo list are separate stack members, so they genuinely coexist.
	WithPetAndNotificationAndTodos: defineComponentFixture({
		render: context => renderChatInput(context, { pet: true, notification: sampleNotification, todos: sampleTodos })
	}),
});
