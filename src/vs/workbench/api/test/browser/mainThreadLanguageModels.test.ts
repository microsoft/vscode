/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IAuthenticationAccessService } from '../../../services/authentication/browser/authenticationAccessService.js';
import { ILanguageModelIgnoredFilesService } from '../../../contrib/chat/common/ignoredFiles.js';
import { ILanguageModelsService } from '../../../contrib/chat/common/languageModels.js';
import { TestExtensionService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadLanguageModels } from '../../browser/mainThreadLanguageModels.js';
import { ExtHostLanguageModelsShape } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadLanguageModels', function () {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('bridges onDidChangeLanguageModels to $onChatModelsChange', async () => {
		const store = disposables.add(new DisposableStore());
		const onDidChangeLanguageModels = store.add(new Emitter<string>());
		let onChatModelsChangeCount = 0;
		const proxy: Partial<ExtHostLanguageModelsShape> = {
			$onChatModelsChange: () => { onChatModelsChangeCount++; },
		};
		const languageModelsService = new class extends mock<ILanguageModelsService>() {
			override readonly onDidChangeLanguageModels = onDidChangeLanguageModels.event;
		};

		store.add(new MainThreadLanguageModels(
			SingleProxyRPCProtocol(proxy),
			languageModelsService,
			new NullLogService(),
			new class extends mock<IAuthenticationService>() { },
			new class extends mock<IAuthenticationAccessService>() { },
			new TestExtensionService(),
			new class extends mock<ILanguageModelIgnoredFilesService>() { },
		));

		assert.strictEqual(onChatModelsChangeCount, 0);

		onDidChangeLanguageModels.fire('vendor-a');
		assert.strictEqual(onChatModelsChangeCount, 1);

		onDidChangeLanguageModels.fire('vendor-b');
		assert.strictEqual(onChatModelsChangeCount, 2);
	});
});
