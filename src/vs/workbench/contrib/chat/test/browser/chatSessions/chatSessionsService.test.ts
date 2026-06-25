/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKey, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatSessionsService } from '../../../browser/chatSessions/chatSessions.contribution.js';
import { ChatSessionOptionsMap, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta, IChatSessionsExtensionPoint, ReadonlyChatSessionOptionsMap } from '../../../common/chatSessionsService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';

suite.skip('ChatSessionsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let chatSessionsService: ChatSessionsService;

	setup(() => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		chatSessionsService = store.add(instantiationService.createInstance(ChatSessionsService));
	});

	suite('extractFileNameFromLink', () => {

		function callExtractFileNameFromLink(filePath: string): string {
			// Access the private method using bracket notation with proper typing
			type ServiceWithPrivateMethod = Record<'extractFileNameFromLink', (filePath: string) => string>;
			return (chatSessionsService as unknown as ServiceWithPrivateMethod)['extractFileNameFromLink'](filePath);
		}

		test('should extract filename from markdown link with link text', () => {
			const input = 'Read [README](file:///path/to/README.md) for more info';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Read README for more info');
		});

		test('should extract filename from markdown link without link text', () => {
			const input = 'Read [](file:///index.js) for instructions';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Read index.js for instructions');
		});

		test('should extract filename from markdown link with empty link text', () => {
			const input = 'Check [  ](file:///config.json) settings';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Check config.json settings');
		});

		test('should handle multiple file links in same string', () => {
			const input = 'See [main](file:///main.js) and [utils](file:///utils/helper.ts)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'See main and utils');
		});

		test('should handle file path without extension', () => {
			const input = 'Open [](file:///src/components/Button)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Open Button');
		});

		test('should handle deep file paths', () => {
			const input = 'Edit [](file:///very/deep/nested/path/to/file.tsx)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Edit file.tsx');
		});

		test('should handle file path that is just a filename', () => {
			const input = 'View [script](file:///script.py)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'View script');
		});

		test('should handle link text with special characters', () => {
			const input = 'See [App.js (main)](file:///App.js)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'See App.js (main)');
		});

		test('should return original string if no file links present', () => {
			const input = 'This is just regular text with no links';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'This is just regular text with no links');
		});

		test('should handle mixed content with file links and regular text', () => {
			const input = 'Check [config](file:///config.yml) and visit https://example.com';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Check config and visit https://example.com');
		});

		test('should handle file path with query parameters or fragments', () => {
			const input = 'Open [](file:///index.html?param=value#section)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Open index.html?param=value#section');
		});

		test('should handle Windows-style paths', () => {
			const input = 'Edit [](file:///C:/Users/user/Documents/file.txt)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Edit file.txt');
		});

		test('should preserve whitespace around replacements', () => {
			const input = '   Check [](file:///test.js)   ';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, '   Check test.js   ');
		});
	});
});

suite('ChatSessionsService - getChatSessionItems availability', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const GATED_TYPE = 'gated-type';
	const UNGATED_TYPE = 'ungated-type';
	const gatedKey = new RawContextKey<boolean>('test.gatedTypeEnabled', false);

	let service: ChatSessionsService;
	let contextKeyService: ContextKeyService;
	let gatedEnabled: IContextKey<boolean>;

	/**
	 * A minimal item controller that immediately exposes a single session item.
	 * This stands in for an extension-host-registered controller, which is
	 * registered independently of the contribution's `when` clause.
	 */
	class FakeItemController implements IChatSessionItemController {
		private readonly _onDidChange = store.add(new Emitter<IChatSessionItemsDelta>());
		readonly onDidChangeChatSessionItems: Event<IChatSessionItemsDelta> = this._onDidChange.event;

		constructor(private readonly _type: string) { }

		get items(): readonly IChatSessionItem[] {
			return [{
				resource: URI.from({ scheme: this._type, path: `/session-1` }),
				label: `${this._type} session`,
				timing: { created: 0, lastRequestStarted: undefined, lastRequestEnded: undefined },
			}];
		}

		async refresh(): Promise<void> { }
	}

	function registerType(type: string, when: string | undefined): void {
		const contribution: IChatSessionsExtensionPoint = { type, name: type, displayName: type, description: '', when };
		store.add(service.registerChatSessionContribution(contribution));
		store.add(service.registerChatSessionItemController(type, new FakeItemController(type)));
	}

	async function resolvedTypes(): Promise<string[]> {
		const types: string[] = [];
		for await (const { chatSessionType, items } of service.getChatSessionItems(undefined, CancellationToken.None)) {
			if (items.length > 0) {
				types.push(chatSessionType);
			}
		}
		return types.sort();
	}

	setup(() => {
		const configurationService = new TestConfigurationService();
		contextKeyService = store.add(new ContextKeyService(configurationService));
		gatedEnabled = gatedKey.bindTo(contextKeyService);

		const instantiationService = store.add(workbenchInstantiationService({
			contextKeyService: () => contextKeyService,
			configurationService: () => configurationService,
		}, store));
		service = store.add(instantiationService.createInstance(ChatSessionsService));

		registerType(GATED_TYPE, `${gatedKey.key}`);
		registerType(UNGATED_TYPE, undefined);
	});

	test('excludes a type whose contribution `when` is false', async () => {
		gatedEnabled.set(false);
		assert.deepStrictEqual(await resolvedTypes(), [UNGATED_TYPE]);
	});

	test('includes a type whose contribution `when` is true', async () => {
		gatedEnabled.set(true);
		assert.deepStrictEqual(await resolvedTypes(), [GATED_TYPE, UNGATED_TYPE]);
	});

	test('reflects a runtime `when` flip without re-registration', async () => {
		gatedEnabled.set(true);
		assert.deepStrictEqual(await resolvedTypes(), [GATED_TYPE, UNGATED_TYPE]);

		gatedEnabled.set(false);
		assert.deepStrictEqual(await resolvedTypes(), [UNGATED_TYPE]);
	});
});

suite('ChatSessionsService - untitled↔real session aliases', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let service: ChatSessionsService;

	const untitled = URI.from({ scheme: 'remoteProvider', path: '/untitled-abc' });
	const real = URI.from({ scheme: 'remoteProvider', path: '/real-abc' });

	setup(() => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		service = store.add(instantiationService.createInstance(ChatSessionsService));
	});

	test('setMaterializedSessionResource publishes the forward untitled→real mapping', () => {
		assert.strictEqual(service.getMaterializedSessionResource(untitled), undefined, 'no mapping before publish');
		// The inverse alias alone must not publish the forward mapping (it is only
		// published once the real session has loaded).
		service.registerSessionResourceAlias(untitled, real);
		assert.strictEqual(service.getMaterializedSessionResource(untitled), undefined, 'registerSessionResourceAlias alone does not publish the forward mapping');
		service.setMaterializedSessionResource(untitled, real);
		assert.strictEqual(service.getMaterializedSessionResource(untitled)?.toString(), real.toString());
	});

	test('clearMaterializedSessionResource clears the forward mapping when called with the untitled key', () => {
		service.registerSessionResourceAlias(untitled, real);
		service.setMaterializedSessionResource(untitled, real);
		service.clearMaterializedSessionResource(untitled);
		assert.strictEqual(service.getMaterializedSessionResource(untitled), undefined);
	});

	test('clearMaterializedSessionResource clears the forward mapping when called with the real value', () => {
		service.registerSessionResourceAlias(untitled, real);
		service.setMaterializedSessionResource(untitled, real);
		service.clearMaterializedSessionResource(real);
		assert.strictEqual(service.getMaterializedSessionResource(untitled), undefined);
	});

	test('options selected before first send survive disposal of the untitled session', async () => {
		const type = untitled.scheme;
		store.add(service.registerChatSessionContribution({ type, name: type, displayName: type, description: '' }));
		store.add(service.registerChatSessionContentProvider(type, {
			provideChatSessionContent: (resource: URI) => Promise.resolve({
				sessionResource: resource,
				history: [],
				onWillDispose: Event.None,
				dispose: () => { },
			}),
		}));

		// Create the untitled session entry and record a user option selection on it.
		await service.getOrCreateChatSession(untitled, CancellationToken.None);
		service.setSessionOption(untitled, 'model', 'sonnet');

		// Materialize: register the inverse alias, load the real session, publish
		// the forward mapping.
		service.registerSessionResourceAlias(untitled, real);
		await service.getOrCreateChatSession(real, CancellationToken.None);
		service.setMaterializedSessionResource(untitled, real);

		// The real session resolves the option through the inverse alias.
		assert.strictEqual(service.getSessionOption(real, 'model'), 'sonnet');

		// Disposing the untitled model clears only the forward mapping; the inverse
		// alias is intentionally kept, so the real session keeps resolving the
		// option to the untitled entry.
		service.clearMaterializedSessionResource(untitled);
		assert.strictEqual(service.getSessionOption(real, 'model'), 'sonnet');
	});
});

suite('ChatSessionOptionsMap', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('toStrValueArray', () => {

		test('should return undefined for undefined input', () => {
			assert.strictEqual(ChatSessionOptionsMap.toStrValueArray(undefined), undefined);
		});

		test('should convert a Map to an array of {optionId, value}', () => {
			const map = new Map([['models', 'gpt-4'], ['repo', 'my-repo']]);
			assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(map), [
				{ optionId: 'models', value: 'gpt-4' },
				{ optionId: 'repo', value: 'my-repo' },
			]);
		});

		test('should extract .id from IChatSessionProviderOptionItem values', () => {
			const map: ReadonlyChatSessionOptionsMap = new Map([
				['agent', { id: 'copilot', name: 'Copilot' }],
			]);
			assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(map), [
				{ optionId: 'agent', value: 'copilot' },
			]);
		});

		test('should handle a plain object as if it were a record (defensive fallback)', () => {
			// Simulates a Map that lost its prototype during serialization
			const plainObject = { models: 'gpt-4', repo: 'my-repo' } as unknown as ReadonlyChatSessionOptionsMap;
			assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(plainObject), [
				{ optionId: 'models', value: 'gpt-4' },
				{ optionId: 'repo', value: 'my-repo' },
			]);
		});
	});

	suite('toRecord', () => {

		test('should convert a Map to a record', () => {
			const map = new Map([['models', 'gpt-4']]);
			const record = ChatSessionOptionsMap.toRecord(map);
			assert.strictEqual(record['models'], 'gpt-4');
		});

		test('should handle a plain object as if it were a record (defensive fallback)', () => {
			const plainObject = { models: 'gpt-4' } as unknown as ReadonlyChatSessionOptionsMap;
			const record = ChatSessionOptionsMap.toRecord(plainObject);
			assert.strictEqual(record['models'], 'gpt-4');
		});
	});

	suite('fromRecord', () => {

		test('should convert a record to a Map', () => {
			const map = ChatSessionOptionsMap.fromRecord({ models: 'gpt-4', repo: 'my-repo' });
			assert.strictEqual(map.get('models'), 'gpt-4');
			assert.strictEqual(map.get('repo'), 'my-repo');
			assert.strictEqual(map.size, 2);
		});
	});
});
