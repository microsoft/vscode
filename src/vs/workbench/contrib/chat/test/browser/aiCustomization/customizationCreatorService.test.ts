/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../common/customizationHarnessService.js';
import { CustomizationLocationPicker, filterCustomizationSourceFolders, getCustomizationLocationPickItems, resolveUserTargetDirectory } from '../../../browser/aiCustomization/customizationCreatorService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';

suite('customizationCreatorService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createMockPromptsService(userFolderUri?: URI): Pick<IPromptsService, 'getSourceFolders'> {
		return {
			getSourceFolders: () => Promise.resolve(
				userFolderUri
					? [{ uri: userFolderUri, storage: PromptsStorage.user, type: PromptsType.instructions }]
					: []
			),
		} as Pick<IPromptsService, 'getSourceFolders'>;
	}

	suite('resolveUserTargetDirectory', () => {

		test('returns user folder from getSourceFolders', async () => {
			const userFolder = URI.file('/home/user/.copilot/instructions');
			const result = await resolveUserTargetDirectory(
				createMockPromptsService(userFolder) as IPromptsService,
				PromptsType.instructions,
			);
			assert.strictEqual(result?.path, '/home/user/.copilot/instructions');
		});

		test('returns undefined when no user folder exists', async () => {
			const result = await resolveUserTargetDirectory(
				createMockPromptsService() as IPromptsService,
				PromptsType.hook,
			);
			assert.strictEqual(result, undefined);
		});
	});

	test('skips the picker when only one target directory matches', async () => {
		const sessionResource = URI.parse('test-harness:///session');
		const targetDirectory = URI.file('/workspace/.github/agents');
		const harnessService = new class extends mock<ICustomizationHarnessService>() {
			override findHarnessById(id: string): IHarnessDescriptor | undefined {
				assert.strictEqual(id, 'test-harness');
				return {
					id,
					label: 'Test',
					icon: Codicon.copilot,
					itemProvider: {
						onDidChange: Event.None,
						provideChatSessionCustomizations: async () => [],
						provideSourceFolders: async () => [
							{ uri: targetDirectory, label: 'Workspace', source: PromptsStorage.local },
							{ uri: URI.file('/user/agents'), label: 'User', source: PromptsStorage.user },
						],
					},
				};
			}
		}();
		const quickInputService = new class extends mock<IQuickInputService>() {
			override pick(): Promise<never> {
				throw new Error('The picker should not be shown');
			}
		}();
		const picker = new CustomizationLocationPicker(
			quickInputService,
			harnessService,
			new class extends mock<IInstantiationService>() { }(),
			new class extends mock<ILabelService>() { }(),
			new class extends mock<IWorkspaceContextService>() { }(),
		);

		const result = await picker.resolveTargetDirectoryWithPicker(sessionResource, PromptsType.agent, 'local');

		assert.strictEqual(result, targetDirectory);
	});

	test('identifies workspace folders in a multi-root location picker', () => {
		const firstWorkspace = URI.file('/workspace/first');
		const secondWorkspace = URI.file('/workspace/second');
		const firstFolder = { uri: firstWorkspace, name: 'First', index: 0, toResource: (path: string) => URI.joinPath(firstWorkspace, path) };
		const secondFolder = { uri: secondWorkspace, name: 'Second', index: 1, toResource: (path: string) => URI.joinPath(secondWorkspace, path) };
		const labelService = new class extends mock<ILabelService>() {
			override getUriLabel(resource: URI, options?: { noPrefix?: boolean }): string {
				assert.strictEqual(options?.noPrefix, true);
				return resource.path.split('/').slice(-2).join('/');
			}
		}();
		const workspaceContextService = new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = Event.None;
			override getWorkspace() { return { id: 'multi-root', folders: [firstFolder, secondFolder] }; }
			override getWorkspaceFolder(resource: URI) {
				return resource.path.startsWith(firstWorkspace.path) ? firstFolder : resource.path.startsWith(secondWorkspace.path) ? secondFolder : null;
			}
		}();
		const items = getCustomizationLocationPickItems(
			[
				{ uri: URI.joinPath(firstWorkspace, '.github/agents'), label: 'Workspace', source: PromptsStorage.local },
				{ uri: URI.joinPath(secondWorkspace, '.github/agents'), label: 'Workspace', source: PromptsStorage.local },
			],
			labelService,
			workspaceContextService,
		);

		assert.deepStrictEqual(items.map(({ label, description }) => ({ label, description })), [
			{ label: 'First', description: '.github/agents' },
			{ label: 'Second', description: '.github/agents' },
		]);
	});

	test('omits the repeated workspace name in a folder-scoped location picker', () => {
		const workspace = URI.file('/workspace/vscode');
		const workspaceFolder = { uri: workspace, name: 'vscode', index: 0, toResource: (path: string) => URI.joinPath(workspace, path) };
		const labelService = new class extends mock<ILabelService>() {
			override getUriLabel(resource: URI): string {
				return resource.path.split('/').slice(-2).join('/');
			}
		}();
		const workspaceContextService = new class extends mock<IWorkspaceContextService>() {
			override getWorkspace() { return { id: 'multi-root', folders: [workspaceFolder, { ...workspaceFolder, name: 'other', index: 1 }] }; }
			override getWorkspaceFolder() { return workspaceFolder; }
		}();
		const items = getCustomizationLocationPickItems(
			[
				{ uri: URI.joinPath(workspace, '.agents/skills'), label: '.agents/skills', source: PromptsStorage.local },
				{ uri: URI.joinPath(workspace, '.github/skills'), label: '.github/skills', source: PromptsStorage.local },
			],
			labelService,
			workspaceContextService,
			workspace,
		);

		assert.deepStrictEqual(items.map(({ label, description }) => ({ label, description })), [
			{ label: '.agents/skills', description: undefined },
			{ label: '.github/skills', description: undefined },
		]);
	});

	test('filters creation locations to the selected workspace folder', () => {
		const firstWorkspace = URI.file('/workspace/first');
		const secondWorkspace = URI.file('/workspace/second');
		const firstFolder = { uri: firstWorkspace, name: 'First', index: 0, toResource: (path: string) => URI.joinPath(firstWorkspace, path) };
		const secondFolder = { uri: secondWorkspace, name: 'Second', index: 1, toResource: (path: string) => URI.joinPath(secondWorkspace, path) };
		const workspaceContextService = new class extends mock<IWorkspaceContextService>() {
			override getWorkspaceFolder(resource: URI) {
				return resource.path.startsWith(firstWorkspace.path) ? firstFolder : resource.path.startsWith(secondWorkspace.path) ? secondFolder : null;
			}
		}();
		const folders = [
			{ uri: URI.joinPath(firstWorkspace, '.github/skills'), label: '.github/skills', source: PromptsStorage.local },
			{ uri: URI.joinPath(firstWorkspace, '.claude/skills'), label: '.claude/skills', source: PromptsStorage.local },
			{ uri: URI.joinPath(secondWorkspace, '.github/skills'), label: '.github/skills', source: PromptsStorage.local },
			{ uri: URI.file('/user/skills'), label: 'User', source: PromptsStorage.user },
		];

		const filtered = filterCustomizationSourceFolders(folders, 'local', firstWorkspace, workspaceContextService);

		assert.deepStrictEqual(filtered.map(folder => folder.uri.toString()), [
			URI.joinPath(firstWorkspace, '.github/skills').toString(),
			URI.joinPath(firstWorkspace, '.claude/skills').toString(),
		]);
	});
});
