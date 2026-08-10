/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INewSessionComposer, NewSessionComposerService } from '../../browser/newSessionComposerService.js';

suite('NewSessionComposerService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function composer(): INewSessionComposer {
		return {
			animatePrompt: async (_text, _durationMs, _placeholder, _token: CancellationToken) => true,
			showPromptOptions: () => true,
		};
	}

	test('tracks the newest mounted composer and falls back when it is disposed', () => {
		const store = disposables.add(new DisposableStore());
		const service = store.add(new NewSessionComposerService());
		const first = composer();
		const second = composer();
		store.add(service.registerComposer(first));
		const secondRegistration = service.registerComposer(second);

		const newest = service.activeComposer.get() === second;
		secondRegistration.dispose();

		assert.deepStrictEqual({ newest, fallback: service.activeComposer.get() === first }, { newest: true, fallback: true });
	});
});
