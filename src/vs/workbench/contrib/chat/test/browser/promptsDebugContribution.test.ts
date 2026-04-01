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
import { IChatAgentService, IChatAgentInvocationEvent } from '../../common/participants/chatAgents.js';
import { PromptsDebugContribution } from '../../browser/promptsDebugContribution.js';
import { ILocalPromptPath, IPromptDiscoveryInfo, IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';

function createLocalPromptPath(path: string, name: string): ILocalPromptPath {
	return {
		uri: URI.file(path),
		name,
		storage: PromptsStorage.local,
		type: PromptsType.instructions,
	};
}

function isGenericEvent(event: IChatDebugEvent): event is IChatDebugGenericEvent {
	return event.kind === 'generic';
}

async function flushAsyncLogging(): Promise<void> {
	await new Promise<void>(resolve => setTimeout(resolve, 0));
}

suite('PromptsDebugContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let chatDebugService: ChatDebugServiceImpl;
	let willInvokeAgentEmitter: Emitter<IChatAgentInvocationEvent>;
	let instaService: TestInstantiationService;
	let promptsService: Partial<IPromptsService>;
	const emptyDiscoveryInfo = (type: PromptsType): IPromptDiscoveryInfo => ({ type, files: [], durationInMillis: 0 });

	setup(() => {
		instaService = disposables.add(new TestInstantiationService());

		chatDebugService = disposables.add(new ChatDebugServiceImpl());
		instaService.stub(IChatDebugService, chatDebugService);

		willInvokeAgentEmitter = disposables.add(new Emitter<IChatAgentInvocationEvent>());
		instaService.stub(IChatAgentService, { onWillInvokeAgent: willInvokeAgentEmitter.event } as Partial<IChatAgentService>);
		promptsService = {
			getDiscoveryInfo: async type => emptyDiscoveryInfo(type),
		};
		instaService.stub(IPromptsService, promptsService);
	});

	test('should forward discovery events to chat debug service', async () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const firedEvents: IChatDebugEvent[] = [];
		disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));

		promptsService.getDiscoveryInfo = async type => ({
			type,
			durationInMillis: 7,
			files: type === PromptsType.instructions ? [{
				status: 'loaded' as const,
				promptPath: createLocalPromptPath('/workspace/.github/instructions/test.instructions.md', 'test.instructions.md'),
			}] : [],
		});

		willInvokeAgentEmitter.fire({ agentId: 'test-agent', request: { sessionResource: LocalChatSessionUri.forSession('session-1') } as IChatAgentInvocationEvent['request'] });
		await flushAsyncLogging();

		assert.strictEqual(firedEvents.length, 5);
		const event = firedEvents.find((e): e is IChatDebugGenericEvent => isGenericEvent(e) && e.name === 'Load Instructions');
		assert.ok(event);
		assert.strictEqual(event.kind, 'generic');
		assert.ok(event.sessionResource);
		assert.strictEqual(event.name, 'Load Instructions');
		assert.ok(event.details?.includes('Resolved 1 instruction'));
		assert.strictEqual(event.category, 'discovery');
	});

	test('should store discoveryInfo and resolve via resolveEvent', async () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const firedEvents: IChatDebugEvent[] = [];
		disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));

		const discoveryInfo: IPromptDiscoveryInfo = {
			type: PromptsType.instructions,
			durationInMillis: 11,
			files: [{
				status: 'loaded' as const,
				promptPath: createLocalPromptPath('/workspace/.github/instructions/test.instructions.md', 'test.instructions.md'),
			}],
			sourceFolders: [{
				uri: URI.file('/workspace/.github/instructions'),
				storage: PromptsStorage.local,
			}],
		};

		promptsService.getDiscoveryInfo = async type => type === PromptsType.instructions ? discoveryInfo : emptyDiscoveryInfo(type);
		willInvokeAgentEmitter.fire({ agentId: 'test-agent', request: { sessionResource: LocalChatSessionUri.forSession('session-1') } as IChatAgentInvocationEvent['request'] });
		await flushAsyncLogging();

		const instructionsEvent = firedEvents.find((e): e is IChatDebugGenericEvent => isGenericEvent(e) && e.name === 'Load Instructions');
		assert.ok(instructionsEvent);
		const eventId = instructionsEvent.id;
		assert.ok(eventId, 'Event should have an ID for resolution');

		const resolved = await chatDebugService.resolveEvent(eventId);
		assert.ok(resolved);
		assert.strictEqual(resolved.kind, 'fileList');
		if (resolved.kind === 'fileList') {
			assert.strictEqual(resolved.discoveryType, 'instructions');
			assert.strictEqual(resolved.durationInMillis, 11);
			assert.strictEqual(resolved.files.length, 1);
			assert.strictEqual(resolved.files[0].name, 'test.instructions.md');
			assert.strictEqual(resolved.files[0].status, 'loaded');
			assert.strictEqual(resolved.sourceFolders?.length, 1);
		}
	});

	test('should return undefined for unknown event ids', async () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const resolved = await chatDebugService.resolveEvent('nonexistent-id');
		assert.strictEqual(resolved, undefined);
	});

	test('should assign event id when discoveryInfo is empty', async () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const firedEvents: IChatDebugEvent[] = [];
		disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));

		promptsService.getDiscoveryInfo = async type => emptyDiscoveryInfo(type);
		willInvokeAgentEmitter.fire({ agentId: 'test-agent', request: { sessionResource: LocalChatSessionUri.forSession('session-1') } as IChatAgentInvocationEvent['request'] });
		await flushAsyncLogging();

		assert.strictEqual(firedEvents.length, 5);
		assert.ok(firedEvents.every(e => e.id !== undefined), 'Events with discovery info should have an id');
	});

	test('should handle discoveryInfo with skipped files', async () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const firedEvents: IChatDebugEvent[] = [];
		disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));

		const discoveryInfo: IPromptDiscoveryInfo = {
			type: PromptsType.instructions,
			durationInMillis: 5,
			files: [
				{
					status: 'loaded' as const,
					promptPath: createLocalPromptPath('/workspace/.github/instructions/loaded.instructions.md', 'loaded.instructions.md'),
				},
				{
					status: 'skipped' as const,
					promptPath: createLocalPromptPath('/workspace/.github/instructions/skipped.instructions.md', 'skipped.instructions.md'),
					skipReason: 'disabled',
				},
			],
		};

		promptsService.getDiscoveryInfo = async type => type === PromptsType.instructions ? discoveryInfo : emptyDiscoveryInfo(type);
		willInvokeAgentEmitter.fire({ agentId: 'test-agent', request: { sessionResource: LocalChatSessionUri.forSession('session-1') } as IChatAgentInvocationEvent['request'] });
		await flushAsyncLogging();

		const eventId = firedEvents.find((e): e is IChatDebugGenericEvent => isGenericEvent(e) && e.name === 'Load Instructions')!.id!;
		const resolved = await chatDebugService.resolveEvent(eventId);
		assert.ok(resolved);
		if (resolved.kind === 'fileList') {
			assert.strictEqual(resolved.files.length, 2);
			assert.strictEqual(resolved.files[0].status, 'loaded');
			assert.strictEqual(resolved.files[1].status, 'skipped');
			assert.strictEqual(resolved.files[1].skipReason, 'disabled');
		}
	});

	test('should handle level as undefined (defaults to Info)', async () => {
		disposables.add(instaService.createInstance(PromptsDebugContribution));

		const firedEvents: IChatDebugEvent[] = [];
		disposables.add(chatDebugService.onDidAddEvent(e => firedEvents.push(e)));

		promptsService.getDiscoveryInfo = async type => emptyDiscoveryInfo(type);
		willInvokeAgentEmitter.fire({ agentId: 'test-agent', request: { sessionResource: LocalChatSessionUri.forSession('session-1') } as IChatAgentInvocationEvent['request'] });
		await flushAsyncLogging();

		const event = firedEvents[0] as IChatDebugGenericEvent;
		assert.strictEqual(event.level, ChatDebugLogLevel.Info, 'Default level should be Info');
	});
});
