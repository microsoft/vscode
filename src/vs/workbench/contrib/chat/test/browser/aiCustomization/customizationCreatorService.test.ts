/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { resolveUserTargetDirectory } from '../../../browser/aiCustomization/customizationCreatorService.js';

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
});
