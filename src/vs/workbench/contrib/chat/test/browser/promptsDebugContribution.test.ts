/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatDebugLogLevel, IChatDebugEvent, IChatDebugGenericEvent, IChatDebugService } from '../../common/chatDebugService.js';
import { ChatDebugServiceImpl } from '../../common/chatDebugServiceImpl.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { PromptsDebugContribution } from '../../browser/promptsDebugContribution.js';
import { IPromptDiscoveryLogEntry, IPromptDiscoveryInfo, IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';

suite('PromptsDebugContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let chatDebugService: ChatDebugServiceImpl;
	let promptsOnDidLogDiscovery: Emitter<IPromptDiscoveryLogEntry>;
	let instaService: TestInstantiationService;

	setup(() => {
		instaService = disposables.add(new TestInstantiationService());

		chatDebugService = disposables.add(new ChatDebugServiceImpl());
		instaService.stub(IChatDebugService, chatDebugService);

		promptsOnDidLogDiscovery = disposables.add(new Emitter<IPromptDiscoveryLogEntry>());
		instaService.stub(IPromptsService, { onDidLogDiscovery: promptsOnDidLogDiscovery.event } as Partial<IPromptsService>);
	});

	test('should forward discovery events to chat debug service', () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const firedEvents: IChatDebugEvent[] = [];
		disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));

		promptsOnDidLogDiscovery.fire({
			sessionResource: LocalChatSessionUri.forSession('session-1'),
			name: 'Load Instructions',
			details: 'Resolved 3 instructions in 12.5ms',
			category: 'discovery',
		});

		assert.strictEqual(firedEvents.length, 1);
		const event = firedEvents[0] as IChatDebugGenericEvent;
		assert.strictEqual(event.kind, 'generic');
		assert.ok(event.sessionResource);
		assert.strictEqual(event.name, 'Load Instructions');
		assert.strictEqual(event.details, 'Resolved 3 instructions in 12.5ms');
		assert.strictEqual(event.category, 'discovery');
	});

	test('should store discoveryInfo and resolve via resolveEvent', async () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const firedEvents: IChatDebugEvent[] = [];
		disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));

		const discoveryInfo: IPromptDiscoveryInfo = {
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
				exists: true,
				fileCount: 1,
			}],
		};

		promptsOnDidLogDiscovery.fire({
			sessionResource: LocalChatSessionUri.forSession('session-1'),
			name: 'Discovery End',
			details: '1 loaded, 0 skipped',
			category: 'discovery',
			discoveryInfo,
		});

		assert.strictEqual(firedEvents.length, 1);
		const eventId = firedEvents[0].id;
		assert.ok(eventId, 'Event should have an ID for resolution');

		const resolved = await chatDebugService.resolveEvent(eventId);
		assert.ok(resolved);
		assert.strictEqual(resolved.kind, 'fileList');
		if (resolved.kind === 'fileList') {
			assert.strictEqual(resolved.discoveryType, 'instructions');
			assert.strictEqual(resolved.files.length, 1);
			assert.strictEqual(resolved.files[0].name, 'test.instructions.md');
			assert.strictEqual(resolved.files[0].status, 'loaded');
			assert.strictEqual(resolved.sourceFolders?.length, 1);
			assert.strictEqual(resolved.sourceFolders?.[0].exists, true);
		}
	});

	test('should return undefined for unknown event ids', async () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const resolved = await chatDebugService.resolveEvent('nonexistent-id');
		assert.strictEqual(resolved, undefined);
	});

	test('should not assign event id when no discoveryInfo', () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const firedEvents: IChatDebugEvent[] = [];
		disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));

		promptsOnDidLogDiscovery.fire({
			sessionResource: LocalChatSessionUri.forSession('session-1'),
			name: 'Discovery Start',
			category: 'discovery',
		});

		assert.strictEqual(firedEvents.length, 1);
		assert.strictEqual(firedEvents[0].id, undefined, 'Event without discoveryInfo should have no id');
	});

	test('should handle discoveryInfo with skipped files', async () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

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

		promptsOnDidLogDiscovery.fire({
			sessionResource: LocalChatSessionUri.forSession('session-1'),
			name: 'Discovery End',
			discoveryInfo,
		});

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

	test('should handle level as undefined (defaults to Info)', () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const firedEvents: IChatDebugEvent[] = [];
		disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));

		promptsOnDidLogDiscovery.fire({
			sessionResource: LocalChatSessionUri.forSession('session-1'),
			name: 'Test',
		});

		const event = firedEvents[0] as IChatDebugGenericEvent;
		assert.strictEqual(event.level, ChatDebugLogLevel.Info, 'Default level should be Info');
	});
});
