/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { CompletionItemKind } from '../../common/state/protocol/commands.js';
import { MessageAttachmentKind } from '../../common/state/protocol/state.js';
import { CustomizationStatus, type CustomizationRef } from '../../common/state/sessionState.js';
import { AgentHostCompletions, CompletionTriggerCharacter } from '../../node/agentHostCompletions.js';
import { AgentHostSkillCompletionProvider } from '../../node/agentHostSkillCompletionProvider.js';
import { MockAgent } from './mockAgent.js';

suite('AgentHostSkillCompletionProvider', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		const memoryProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.inMemory, memoryProvider));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function pluginRoot(path: string): URI {
		return URI.from({ scheme: Schemas.inMemory, path });
	}

	function customization(root: URI, nonce?: string): CustomizationRef {
		return {
			uri: root.toString(),
			displayName: root.path,
			...(nonce !== undefined ? { nonce } : {}),
		};
	}

	async function writeSkill(root: URI, name: string, content: string): Promise<URI> {
		const skillDirectory = URI.joinPath(root, 'skills', name);
		await fileService.createFolder(skillDirectory);
		const skillUri = URI.joinPath(skillDirectory, 'SKILL.md');
		await fileService.writeFile(skillUri, VSBuffer.fromString(content));
		return skillUri;
	}

	function createProvider(agent: MockAgent): AgentHostSkillCompletionProvider {
		return disposables.add(new AgentHostSkillCompletionProvider(
			() => agent,
			fileService,
			new NullLogService(),
			'/user',
		));
	}

	async function run(provider: AgentHostSkillCompletionProvider, text: string, offset = text.length) {
		return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, session: 'mock:/session', text, offset }, CancellationToken.None);
	}

	test('announces slash as a trigger character', () => {
		const completions = disposables.add(new AgentHostCompletions(new NullLogService()));
		const provider = disposables.add(new AgentHostSkillCompletionProvider(() => undefined, fileService, new NullLogService(), '/user'));
		disposables.add(completions.registerProvider(provider));
		assert.deepStrictEqual([...completions.triggerCharacters], [CompletionTriggerCharacter.Slash]);
	});

	test('returns global customization skills with frontmatter metadata and trailing space', async () => {
		const root = pluginRoot('/global-plugin');
		const skillUri = await writeSkill(root, 'agent-host-docs', [
			'---',
			'name: Agent Host Docs',
			'description: Use this skill when working on Agent Host code',
			'---',
			'Body',
		].join('\n'));
		const agent = new MockAgent('mock');
		agent.customizations = [customization(root, '1')];
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result, [{
			insertText: '/agent-host-docs ',
			rangeStart: 0,
			rangeEnd: 1,
			attachment: {
				type: MessageAttachmentKind.Simple,
				label: '/agent-host-docs',
				_meta: {
					uri: skillUri.toString(),
					name: 'agent-host-docs',
					displayName: 'Agent Host Docs',
					description: 'Use this skill when working on Agent Host code',
				},
			},
		}]);
	});

	test('preserves session-effective order and appends global-only customizations', async () => {
		const sessionRoot = pluginRoot('/session-plugin');
		await writeSkill(sessionRoot, 'session-skill', '---\nname: Session Skill\n---\nBody');
		const globalRoot = pluginRoot('/global-plugin');
		await writeSkill(globalRoot, 'global-skill', '---\nname: Global Skill\n---\nBody');

		const sessionCustomization = customization(sessionRoot, 'session');
		const globalCustomization = customization(globalRoot, 'global');
		const agent = new MockAgent('mock');
		agent.customizations = [globalCustomization];
		agent.getSessionCustomizations = async () => [{ customization: sessionCustomization, enabled: true, status: CustomizationStatus.Loaded }];
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result.map(item => item.insertText), ['/session-skill ', '/global-skill ']);
	});

	test('lets session customization state suppress a duplicate global customization', async () => {
		const root = pluginRoot('/duplicate-plugin');
		await writeSkill(root, 'disabled-skill', '---\nname: Disabled Skill\n---\nBody');
		const ref = customization(root, '1');
		const agent = new MockAgent('mock');
		agent.customizations = [ref];
		agent.getSessionCustomizations = async () => [{ customization: ref, enabled: false, status: CustomizationStatus.Loaded }];
		const provider = createProvider(agent);

		const result = await run(provider, '/');

		assert.deepStrictEqual(result, []);
	});

	test('filters by leading slash token and replaces only that token', async () => {
		const root = pluginRoot('/filter-plugin');
		await writeSkill(root, 'alpha', 'Alpha');
		await writeSkill(root, 'beta', 'Beta');
		const agent = new MockAgent('mock');
		agent.customizations = [customization(root, '1')];
		const provider = createProvider(agent);

		const result = await run(provider, '/b extra', 2);

		assert.deepStrictEqual(result.map(item => ({ insertText: item.insertText, rangeStart: item.rangeStart, rangeEnd: item.rangeEnd })), [{
			insertText: '/beta ',
			rangeStart: 0,
			rangeEnd: 2,
		}]);
	});

	test('clears cached skill metadata when customizations change', async () => {
		const root = pluginRoot('/cached-plugin');
		const skillUri = await writeSkill(root, 'cached-skill', '---\nname: First Name\n---\nBody');
		const agent = new MockAgent('mock');
		agent.customizations = [customization(root)];
		const provider = createProvider(agent);

		assert.deepStrictEqual((await run(provider, '/'))[0].attachment._meta?.displayName, 'First Name');

		await fileService.writeFile(skillUri, VSBuffer.fromString('---\nname: Second Name\n---\nBody'));
		agent.fireCustomizationsChange();

		assert.deepStrictEqual((await run(provider, '/'))[0].attachment._meta?.displayName, 'Second Name');
	});
});
