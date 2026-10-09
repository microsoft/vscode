/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OpenerService } from '../../../../editor/browser/services/openerService.js';
import { ExternalUriOpenerPriority } from '../../../../editor/common/languages.js';
import { TestCodeEditorService } from '../../../../editor/test/browser/editorTestServices.js';
import { NullCommandService } from '../../../../platform/commands/test/common/nullCommandService.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../platform/notification/test/common/testNotificationService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
import { ExternalUriOpenerService } from '../../../contrib/externalUriOpener/common/externalUriOpenerService.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { TestExtensionService, TestStorageService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadUriOpeners } from '../../browser/mainThreadUriOpeners.js';
import { ExtHostContext, MainContext } from '../../common/extHost.protocol.js';
import { ExtHostUriOpeners } from '../../common/extHostUriOpener.js';
import { ViewColumn } from '../../common/extHostTypes.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';

suite('ExtHostUriOpeners', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sourceUri = URI.parse('https://source.example.com');
	const resolvedUri = URI.parse('https://resolved.example.com');
	let openerService: OpenerService;
	let opened: { uri: vscode.Uri; context: vscode.OpenExternalUriContext }[];

	setup(async () => {
		opened = [];
		const rpc = store.add(new TestRPCProtocol());
		openerService = store.add(new OpenerService(
			store.add(new TestCodeEditorService(new TestThemeService())),
			NullCommandService
		));
		const externalUriOpenerService = store.add(new ExternalUriOpenerService(
			openerService,
			new TestConfigurationService(),
			new NullLogService(),
			new class extends mock<IPreferencesService>() { },
			new class extends mock<IQuickInputService>() { }
		));
		const extHostUriOpeners = rpc.set(ExtHostContext.ExtHostUriOpeners, new ExtHostUriOpeners(rpc));
		rpc.set(MainContext.MainThreadUriOpeners, store.add(new MainThreadUriOpeners(
			rpc,
			store.add(new TestStorageService()),
			externalUriOpenerService,
			new TestExtensionService(),
			openerService,
			new TestNotificationService()
		)));
		store.add(openerService.registerExternalUriResolver({
			async resolveExternalUri() {
				return { resolved: resolvedUri, dispose() { } };
			}
		}));
		store.add(extHostUriOpeners.registerExternalUriOpener(new ExtensionIdentifier('test.opener'), 'test-opener', {
			canOpenExternalUri: () => ExternalUriOpenerPriority.Preferred,
			openExternalUri: (uri, context) => { opened.push({ uri, context }); }
		}, { schemes: ['https'], label: 'Test Opener' }));
		await rpc.sync();
	});

	for (const openToSide of [true, false, undefined]) {
		test(`maps internal openToSide=${openToSide} to viewColumn`, async () => {
			await openerService.open(sourceUri, { allowContributedOpeners: true, openToSide });

			assert.deepStrictEqual(opened, [{
				uri: resolvedUri,
				context: { sourceUri, viewColumn: openToSide ? ViewColumn.Beside : undefined }
			}]);
		});
	}
});
