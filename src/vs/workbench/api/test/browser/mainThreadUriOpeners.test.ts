/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../base/browser/window.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { TestNotificationService } from '../../../../platform/notification/test/common/testNotificationService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IExternalUriOpenerService } from '../../../contrib/externalUriOpener/common/externalUriOpenerService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { TestExtensionService, TestStorageService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadUriOpeners } from '../../browser/mainThreadUriOpeners.js';
import { ExtHostUriOpenersShape } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadUriOpeners', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('makes the window a link was activated in the active window before an extension opens it, as the extension opens in the active window', async () => {
		const calls: string[] = [];
		const proxy = upcastPartial<ExtHostUriOpenersShape>({
			$openUri: async (id, context) => { calls.push(`open ${id} ${context.resolvedUri.toString()}`); },
		});
		const hostService = new class extends mock<IHostService>() {
			override async focus(targetWindow: Window): Promise<void> {
				calls.push(`focus ${targetWindow === mainWindow ? 'source window' : 'other window'}`);
			}
		};
		const editorGroupsService = upcastPartial<IEditorGroupsService>({
			getGroup: (id: number) => id === 7 ? upcastPartial<IEditorGroup>({ focus: () => { calls.push('focus group 7'); } }) : undefined,
		});
		const openers = store.add(new MainThreadUriOpeners(
			SingleProxyRPCProtocol(proxy),
			store.add(new TestStorageService()),
			upcastPartial<IExternalUriOpenerService>({ registerExternalOpenerProvider: () => Disposable.None }),
			new TestExtensionService(),
			upcastPartial<IOpenerService>({}),
			new TestNotificationService(),
			hostService,
			editorGroupsService,
		));
		await openers.$registerUriOpener('github.issue', ['https'], new ExtensionIdentifier('github.pr'), 'GitHub');
		const [opener] = await Iterable.asyncToArray(openers.getOpeners(URI.parse('https://github.com/microsoft/vscode/issues/1')));
		const href = 'https://github.com/microsoft/vscode/issues/1';

		await opener.openExternalUri(href, { sourceUri: URI.parse(href), sourceHref: href, sourceWindowId: mainWindow.vscodeWindowId }, CancellationToken.None);
		await opener.openExternalUri(href, { sourceUri: URI.parse(href), sourceHref: href, sourceWindowId: mainWindow.vscodeWindowId, sourceEditorGroupId: 7 }, CancellationToken.None);
		await opener.openExternalUri(href, { sourceUri: URI.parse(href), sourceHref: href }, CancellationToken.None);

		assert.deepStrictEqual(calls, [
			'focus source window',
			`open github.issue ${href}`,
			// The editor part of the group the link was activated in is made the active one as well.
			'focus source window',
			'focus group 7',
			`open github.issue ${href}`,
			// Without a window the link was activated in, as the active window.
			`open github.issue ${href}`,
		]);
	});
});
