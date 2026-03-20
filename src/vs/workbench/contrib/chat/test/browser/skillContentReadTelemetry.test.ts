/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { hash } from '../../../../../base/common/hash.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentPlugin, IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IAgentSkill, IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { IToolCompletedEvent, ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { MockLanguageModelToolsService } from '../common/tools/mockLanguageModelToolsService.js';
import { SkillContentReadTelemetry } from '../../browser/skillContentReadTelemetry.js';

function makeToolCompletedEvent(overrides: Partial<IToolCompletedEvent> = {}): IToolCompletedEvent {
	return {
		toolId: 'copilot_readFile',
		toolReferenceName: 'readFile',
		parameters: { filePath: '/workspace/.github/skills/my-skill/SKILL.md' },
		result: { content: [{ kind: 'text', value: '# My Skill\nDo something useful.' }] },
		sessionResource: undefined,
		requestId: undefined,
		...overrides,
	};
}

function makeSkill(overrides: Partial<IAgentSkill> = {}): IAgentSkill {
	return {
		uri: URI.file('/workspace/.github/skills/my-skill/SKILL.md'),
		storage: PromptsStorage.local,
		name: 'my-skill',
		description: 'A test skill',
		disableModelInvocation: false,
		userInvocable: true,
		...overrides,
	};
}

suite('SkillContentReadTelemetry', () => {
	const disposables = new DisposableStore();
	let instaService: TestInstantiationService;
	let mockToolsService: MockLanguageModelToolsService;
	let telemetryEvents: { eventName: string; data: Record<string, unknown> }[];
	let onDidChangeSkillsEmitter: Emitter<void>;
	let findAgentSkillsResult: IAgentSkill[] | undefined;

	setup(() => {
		instaService = disposables.add(new TestInstantiationService());

		mockToolsService = disposables.add(new MockLanguageModelToolsService());
		instaService.stub(ILanguageModelToolsService, mockToolsService);

		instaService.stub(ILogService, new NullLogService());

		telemetryEvents = [];
		instaService.stub(ITelemetryService, {
			publicLog2: (eventName: string, data: Record<string, unknown>) => {
				telemetryEvents.push({ eventName, data });
			}
		} as unknown as ITelemetryService);

		onDidChangeSkillsEmitter = disposables.add(new Emitter<void>());
		findAgentSkillsResult = [makeSkill()];
		instaService.stub(IPromptsService, {
			findAgentSkills: () => Promise.resolve(findAgentSkillsResult),
			onDidChangeSkills: onDidChangeSkillsEmitter.event,
			// Stubs for other events the service may require
			onDidChangeSlashCommands: Event.None,
			onDidChangeCustomAgents: Event.None,
			onDidChangeInstructions: Event.None,
		});

		instaService.stub(IAgentPluginService, {
			plugins: observableValue('testPlugins', [] as readonly IAgentPlugin[]),
		});
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function fireAndAwait(event: IToolCompletedEvent): Promise<void> {
		mockToolsService.fireOnDidCompleteToolInvocation(event);
		// Allow the fire-and-forget async telemetry to complete
		await new Promise<void>(resolve => setTimeout(resolve, 50));
	}

	test('should emit telemetry when readFile completes for a known SKILL.md', async () => {
		const contribution = disposables.add(instaService.createInstance(SkillContentReadTelemetry));
		assert.ok(contribution);

		await fireAndAwait(makeToolCompletedEvent());

		const event = telemetryEvents.find(e => e.eventName === 'skillContentRead');
		assert.ok(event, 'Should emit skillContentRead telemetry');
		assert.deepStrictEqual(event.data, {
			skillNameHash: String(hash('my-skill')),
			skillStorage: PromptsStorage.local,
			extensionIdHash: '',
			extensionVersion: '',
			pluginNameHash: '',
			pluginVersion: '',
			contentHash: String(hash('# My Skill\nDo something useful.')),
		});
	});

	test('should not emit telemetry for non-readFile tools', async () => {
		disposables.add(instaService.createInstance(SkillContentReadTelemetry));

		await fireAndAwait(makeToolCompletedEvent({
			toolReferenceName: 'editFile',
			toolId: 'copilot_editFile',
		}));

		assert.strictEqual(
			telemetryEvents.filter(e => e.eventName === 'skillContentRead').length,
			0,
			'Should not emit telemetry for non-readFile tools'
		);
	});

	test('should not emit telemetry for non-SKILL.md files', async () => {
		disposables.add(instaService.createInstance(SkillContentReadTelemetry));

		await fireAndAwait(makeToolCompletedEvent({
			parameters: { filePath: '/workspace/src/index.ts' },
		}));

		assert.strictEqual(
			telemetryEvents.filter(e => e.eventName === 'skillContentRead').length,
			0,
			'Should not emit telemetry for non-SKILL.md files'
		);
	});

	test('should not emit telemetry for SKILL.md not in the skills list', async () => {
		disposables.add(instaService.createInstance(SkillContentReadTelemetry));

		await fireAndAwait(makeToolCompletedEvent({
			parameters: { filePath: '/workspace/.github/skills/unknown-skill/SKILL.md' },
		}));

		assert.strictEqual(
			telemetryEvents.filter(e => e.eventName === 'skillContentRead').length,
			0,
			'Should not emit telemetry for unknown skills'
		);
	});

	test('should include extension and plugin provenance', async () => {
		const pluginUri = URI.parse('plugin://my-plugin');
		findAgentSkillsResult = [makeSkill({
			storage: PromptsStorage.extension,
			extension: {
				identifier: new ExtensionIdentifier('publisher.my-ext'),
				version: '2.0.0',
			} as IExtensionDescription,
			pluginUri,
		})];

		instaService.stub(IAgentPluginService, {
			plugins: observableValue('testPlugins', [{
				uri: pluginUri,
				label: 'my-plugin',
				fromMarketplace: { version: '3.1.0' },
			}] as unknown as readonly IAgentPlugin[]),
		});

		disposables.add(instaService.createInstance(SkillContentReadTelemetry));

		await fireAndAwait(makeToolCompletedEvent());

		const event = telemetryEvents.find(e => e.eventName === 'skillContentRead');
		assert.ok(event, 'Should emit skillContentRead telemetry');
		assert.deepStrictEqual(event.data, {
			skillNameHash: String(hash('my-skill')),
			skillStorage: PromptsStorage.extension,
			extensionIdHash: String(hash('publisher.my-ext')),
			extensionVersion: '2.0.0',
			pluginNameHash: String(hash('my-plugin')),
			pluginVersion: '3.1.0',
			contentHash: String(hash('# My Skill\nDo something useful.')),
		});
	});

	test('should clear cache when skills change', async () => {
		disposables.add(instaService.createInstance(SkillContentReadTelemetry));

		// First call populates cache
		await fireAndAwait(makeToolCompletedEvent());
		assert.strictEqual(telemetryEvents.filter(e => e.eventName === 'skillContentRead').length, 1);

		// Change skills to empty → fire change event
		findAgentSkillsResult = [];
		onDidChangeSkillsEmitter.fire();

		// Next call should re-fetch and find no match
		await fireAndAwait(makeToolCompletedEvent());
		assert.strictEqual(
			telemetryEvents.filter(e => e.eventName === 'skillContentRead').length,
			1,
			'Should not emit after skills were cleared'
		);
	});
});
