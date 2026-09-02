/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IShareProvider, IShareService } from '../../../contrib/share/common/share.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { mock } from '../../../test/common/workbenchTestServices.js';
import { MainThreadShare } from '../../browser/mainThreadShare.js';

suite('MainThreadShare', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('disposes share provider registrations when they are unregistered', () => {
		let registrationDisposed = false;
		const shareService = new class extends mock<IShareService>() {
			override registerShareProvider(_provider: IShareProvider) {
				return toDisposable(() => registrationDisposed = true);
			}
		};
		const extHostContext = new class extends mock<IExtHostContext>() {
			override readonly remoteAuthority = '';
			override readonly extensionHostKind = ExtensionHostKind.LocalProcess;
			override getProxy(): any { return {}; }
		};
		const service = store.add(new MainThreadShare(extHostContext, shareService));

		service.$registerShareProvider(1, [], 'test', 'Test', 1);
		service.$unregisterShareProvider(1);

		assert.strictEqual(registrationDisposed, true);
	});
});
