/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { PromptsServiceCustomizationItemProvider } from '../../../browser/aiCustomization/promptsServiceCustomizationItemProvider.js';
import { IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptsConfig } from '../../../common/promptSyntax/config/config.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { ICustomAgent, IPromptPath, IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';

suite('PromptsServiceCustomizationItemProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const pathService = new class extends mock<IPathService>() {
		override userHome(): URI;
		override userHome(): Promise<URI>;
		override userHome(): URI | Promise<URI> { return URI.file('/home/me'); }
	}();

	function createPromptsService(listedFiles: readonly URI[]): IPromptsService {
		return new class extends mock<IPromptsService>() {
			override onDidChangeCustomAgents = Event.None;
			override onDidChangeSlashCommands = Event.None;
			override onDidChangeSkills = Event.None;
			override onDidChangeHooks = Event.None;
			override onDidChangeInstructions = Event.None;
			override onDidChangeAgentInstructions = Event.None;
			override getDisabledPromptFiles() { return new ResourceSet(); }
			override async listPromptFiles(type: PromptsType): Promise<readonly IPromptPath[]> {
				return type === PromptsType.hook ? listedFiles.map(uri => ({ uri, storage: PromptsStorage.local, type })) : [];
			}
			override async getCustomAgents(): Promise<readonly ICustomAgent[]> { return []; }
			override async findAgentSkills() { return []; }
			override async getPromptSlashCommands() { return []; }
			override async getInstructionFiles() { return []; }
			override async listAgentInstructions() { return []; }
		}();
	}

	async function listHooks(listedFiles: readonly URI[], useParentRepositories: boolean) {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('file', store.add(new InMemoryFileSystemProvider())));
		await fileService.createFolder(URI.file('/repo/.git'));
		await fileService.writeFile(URI.file('/repo/.github/hooks/hooks.json'), VSBuffer.fromString('{}'));
		await fileService.writeFile(URI.file('/repo/.github/hooks/notes.md'), VSBuffer.fromString(''));
		await fileService.writeFile(URI.file('/repo/packages/app/.github/hooks/app.json'), VSBuffer.fromString('{}'));

		const promptsService = createPromptsService(listedFiles);
		const workspaceService = new class extends mock<IAICustomizationWorkspaceService>() {
			override isSessionsWindow = false;
		}();
		const configurationService = new TestConfigurationService({ [PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS]: useParentRepositories });
		const provider = new PromptsServiceCustomizationItemProvider(
			promptsService,
			workspaceService,
			new class extends mock<IProductService>() { }(),
			new TestContextService(testWorkspace(URI.file('/repo/packages/app'))),
			configurationService,
			fileService,
			pathService,
		);
		const items = await provider.provideChatSessionCustomizations(URI.parse('vscode-chat-session://local/1'), CancellationToken.None);
		return items.filter(item => item.type === PromptsType.hook).map(item => ({ path: item.uri.path, enabled: item.enabled, badge: item.badge }));
	}

	function createProvider(fileService: FileService) {
		const promptsService = createPromptsService([]);
		return new PromptsServiceCustomizationItemProvider(promptsService, new class extends mock<IAICustomizationWorkspaceService>() { }(), new class extends mock<IProductService>() { }(), new TestContextService(), new TestConfigurationService(), fileService, pathService);
	}

	test('lists repository-root hooks for a nested folder as not running when Local does not read parent repositories', async () => {
		assert.deepStrictEqual(await listHooks([URI.file('/repo/packages/app/.github/hooks/app.json')], false), [
			{ path: '/repo/packages/app/.github/hooks/app.json', enabled: true, badge: undefined },
			{ path: '/repo/.github/hooks/hooks.json', enabled: false, badge: 'Won\'t run' },
		]);
	});

	test('does not list repository-root hooks twice when Local reads parent repositories', async () => {
		assert.deepStrictEqual(await listHooks([URI.file('/repo/packages/app/.github/hooks/app.json'), URI.file('/repo/.github/hooks/hooks.json')], true), [
			{ path: '/repo/packages/app/.github/hooks/app.json', enabled: true, badge: undefined },
			{ path: '/repo/.github/hooks/hooks.json', enabled: true, badge: undefined },
		]);
	});

	test('reports a change when a repository hook file is written', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('file', store.add(new InMemoryFileSystemProvider())));
		let changes = 0;
		store.add(createProvider(fileService).onDidChange(() => changes++));

		await fileService.writeFile(URI.file('/repo/.github/hooks/hooks.json'), VSBuffer.fromString('{}'));
		await fileService.writeFile(URI.file('/repo/.github/hooks/notes.md'), VSBuffer.fromString(''));
		await fileService.writeFile(URI.file('/repo/src/hooks/hooks.json'), VSBuffer.fromString('{}'));

		assert.strictEqual(changes, 1);
	});
});
