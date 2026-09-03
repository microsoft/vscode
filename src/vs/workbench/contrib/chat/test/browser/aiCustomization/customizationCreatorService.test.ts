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
import { CustomizationLocationPicker, resolveUserTargetDirectory } from '../../../browser/aiCustomization/customizationCreatorService.js';

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
		);

		const result = await picker.resolveTargetDirectoryWithPicker(sessionResource, PromptsType.agent, 'local');

		assert.strictEqual(result, targetDirectory);
	});
});
