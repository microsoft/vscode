/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatDebugLogLevel, IChatDebugEvent, IChatDebugGenericEvent, IChatDebugService } from '../../common/chatDebugService.js';
import { ChatDebugServiceImpl } from '../../common/chatDebugServiceImpl.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { PromptsDebugContribution } from '../../browser/promptsDebugContribution.js';
import { IPromptDiscoveryChangeEvent, IPromptDiscoveryInfo, IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';

suite('PromptsDebugContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let chatDebugService: ChatDebugServiceImpl;
	let promptsOnDidDiscoveryChange: Emitter<IPromptDiscoveryChangeEvent>;
	let discoveryInfoByType: Map<PromptsType, IPromptDiscoveryInfo>;
	let instaService: TestInstantiationService;

	setup(() => {
		instaService = disposables.add(new TestInstantiationService());

		chatDebugService = disposables.add(new ChatDebugServiceImpl());
		instaService.stub(IChatDebugService, chatDebugService);

		promptsOnDidDiscoveryChange = disposables.add(new Emitter<IPromptDiscoveryChangeEvent>());
		discoveryInfoByType = new Map();

		instaService.stub(IPromptsService, {
			onDidDiscoveryChange: promptsOnDidDiscoveryChange.event,
			getDiscoveryInfo: async (type: PromptsType, _token: CancellationToken) => {
				return discoveryInfoByType.get(type) ?? { type, files: [] };
			},
		} as Partial<IPromptsService>);
	});

	test('should provide initial snapshot via provideChatDebugLog', async () => {
		const instructionsInfo: IPromptDiscoveryInfo = {
			type: PromptsType.instructions,
			files: [{
				uri: URI.file('/workspace/.github/instructions/test.instructions.md'),
				name: 'test.instructions.md',
				status: 'loaded' as const,
				storage: PromptsStorage.local,
			}],
			sourceFolders: [{
				uri: URI.file('/workspace/.github/instructions'),
				storage: PromptsStorage.local,
			}],
		};
		discoveryInfoByType.set(PromptsType.instructions, instructionsInfo);

		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const sessionResource = LocalChatSessionUri.forSession('session-1');
		await chatDebugService.invokeProviders(sessionResource);

		const events = chatDebugService.getEvents(sessionResource);
		// Should have events for all discovery types
		const discoveryEvents = events.filter(e => e.kind === 'generic' && (e as IChatDebugGenericEvent).category === 'discovery');
		assert.ok(discoveryEvents.length > 0, 'Should have discovery events');

		// Find the instructions event
		const instructionsEvent = discoveryEvents.find(e => (e as IChatDebugGenericEvent).name === 'Load Instructions');
		assert.ok(instructionsEvent, 'Should have an instructions discovery event');
		assert.ok(instructionsEvent.id, 'Event should have an ID for resolution');

		const resolved = await chatDebugService.resolveEvent(instructionsEvent.id!);
		assert.ok(resolved);
		assert.strictEqual(resolved.kind, 'fileList');
		if (resolved.kind === 'fileList') {
			assert.strictEqual(resolved.discoveryType, PromptsType.instructions);
			assert.strictEqual(resolved.files.length, 1);
			assert.strictEqual(resolved.files[0].name, 'test.instructions.md');
			assert.strictEqual(resolved.files[0].status, 'loaded');
			assert.strictEqual(resolved.sourceFolders?.length, 1);
		}
	});

	test('should broadcast change events to active sessions', () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		// Create two active sessions by logging events to them
		const session1 = LocalChatSessionUri.forSession('session-1');
		const session2 = LocalChatSessionUri.forSession('session-2');
		chatDebugService.log(session1, 'init');
		chatDebugService.log(session2, 'init');

		const firedEvents: IChatDebugEvent[] = [];
		disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));

		const discoveryInfo: IPromptDiscoveryInfo = {
			type: PromptsType.skill,
			files: [{
				uri: URI.file('/workspace/.github/skills/test/SKILL.md'),
				name: 'test',
				status: 'loaded' as const,
				storage: PromptsStorage.local,
			}],
		};

		promptsOnDidDiscoveryChange.fire({ type: PromptsType.skill, discoveryInfo });

		// Should broadcast to both sessions
		const changeEvents = firedEvents.filter(e =>
			e.kind === 'generic' &&
			(e as IChatDebugGenericEvent).category === 'discovery' &&
			(e as IChatDebugGenericEvent).name.includes('Changed')
		);
		assert.strictEqual(changeEvents.length, 2, 'Should fire for both active sessions');
	});

	test('should not broadcast to sessions that do not exist yet', () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const firedEvents: IChatDebugEvent[] = [];
		disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));

		// Fire a change event without any active sessions
		promptsOnDidDiscoveryChange.fire({
			type: PromptsType.agent,
			discoveryInfo: { type: PromptsType.agent, files: [] },
		});

		assert.strictEqual(firedEvents.length, 0, 'No events should fire when no sessions exist');
	});

	test('should return undefined for unknown event ids', async () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const resolved = await chatDebugService.resolveEvent('nonexistent-id');
		assert.strictEqual(resolved, undefined);
	});

	test('should handle discoveryInfo with skipped files in change events', async () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const session = LocalChatSessionUri.forSession('session-1');
		chatDebugService.log(session, 'init');

		const firedEvents: IChatDebugEvent[] = [];
		disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));

		const discoveryInfo: IPromptDiscoveryInfo = {
			type: PromptsType.instructions,
			files: [
				{
					uri: URI.file('/workspace/.github/instructions/loaded.instructions.md'),
					name: 'loaded.instructions.md',
					status: 'loaded' as const,
					storage: PromptsStorage.local,
				},
				{
					uri: URI.file('/workspace/.github/instructions/skipped.instructions.md'),
					name: 'skipped.instructions.md',
					status: 'skipped' as const,
					storage: PromptsStorage.local,
					skipReason: 'disabled',
				},
			],
		};

		promptsOnDidDiscoveryChange.fire({ type: PromptsType.instructions, discoveryInfo });

		assert.strictEqual(firedEvents.length, 1);
		const eventId = firedEvents[0].id!;
		const resolved = await chatDebugService.resolveEvent(eventId);
		assert.ok(resolved);
		if (resolved.kind === 'fileList') {
			assert.strictEqual(resolved.files.length, 2);
			assert.strictEqual(resolved.files[0].status, 'loaded');
			assert.strictEqual(resolved.files[1].status, 'skipped');
			assert.strictEqual(resolved.files[1].skipReason, 'disabled');
		}
	});

	test('change events should have Info level', () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const session = LocalChatSessionUri.forSession('session-1');
		chatDebugService.log(session, 'init');

		const firedEvents: IChatDebugEvent[] = [];
		disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));

		promptsOnDidDiscoveryChange.fire({
			type: PromptsType.hook,
			discoveryInfo: { type: PromptsType.hook, files: [] },
		});

		const event = firedEvents[0] as IChatDebugGenericEvent;
		assert.strictEqual(event.level, ChatDebugLogLevel.Info, 'Level should be Info');
	});
});
