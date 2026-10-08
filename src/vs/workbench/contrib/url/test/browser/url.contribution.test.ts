/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
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

	test('allows contributed external URI openers', async () => {
		const input = 'https://example.com/path';
		const opened: { resource: string; options: OpenOptions | undefined }[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
			override async input(): Promise<string | undefined> {
				return input;
			}
		}());
		instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(resource: URI | string, options?: OpenOptions): Promise<boolean> {
				opened.push({ resource: resource.toString(), options });
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
