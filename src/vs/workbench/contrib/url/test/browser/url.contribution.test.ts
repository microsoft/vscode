/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService, OpenOptions } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import '../../browser/url.contribution.js';

suite('Open URL action', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('allows contributed external URI openers and preserves the input', async () => {
		const input = 'https://example.com/path%23fragment';
		const opened: { resource: Parameters<IOpenerService['open']>[0]; options: OpenOptions | undefined }[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
			override async input(): Promise<string | undefined> {
				return input;
			}
		}());
		instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(resource: Parameters<IOpenerService['open']>[0], options?: OpenOptions): Promise<boolean> {
				opened.push({ resource, options });
				return true;
			}
		}());
		instantiationService.stub(IStorageService, store.add(new TestStorageService()));

		const command = CommandsRegistry.getCommand('workbench.action.url.openUrl');
		assert.ok(command);
		await instantiationService.invokeFunction(command.handler);

		assert.deepStrictEqual(opened, [{
			resource: input,
			options: { allowContributedOpeners: true }
		}]);
	});
});
