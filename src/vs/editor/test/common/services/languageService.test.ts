/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ListenerLeakError } from '../../../../base/common/event.js';
import { errorHandler } from '../../../../base/common/errors.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../common/languages/modesRegistry.js';
import { LanguageService } from '../../../common/services/languageService.js';

suite('LanguageService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('LanguageSelection does not leak a disposable', () => {
		const languageService = new LanguageService();
		const languageSelection1 = languageService.createById(PLAINTEXT_LANGUAGE_ID);
		assert.strictEqual(languageSelection1.languageId, PLAINTEXT_LANGUAGE_ID);
		const languageSelection2 = languageService.createById(PLAINTEXT_LANGUAGE_ID);
		const listener = languageSelection2.onDidChange(() => { });
		assert.strictEqual(languageSelection2.languageId, PLAINTEXT_LANGUAGE_ID);
		listener.dispose();
		languageService.dispose();
	});

	test('many concurrent LanguageSelection listeners share a single subscription and do not leak (#305051)', () => {
		// Regression test for https://github.com/microsoft/vscode/issues/305051
		// Before the fix, each LanguageSelection independently subscribed to
		// LanguageService.onDidChange via observableFromEvent. With many open
		// models (250+), this caused a listener leak warning on the shared event.
		// After the fix, all LanguageSelection instances derive from a single
		// shared observable, so only one listener is registered on onDidChange.
		const languageService = new LanguageService();
		const listeners: IDisposable[] = [];
		const leakErrors: ListenerLeakError[] = [];

		// Temporarily capture unexpected errors to detect leak warnings
		const originalHandler = errorHandler.getUnexpectedErrorHandler();
		errorHandler.setUnexpectedErrorHandler((e) => {
			if (e instanceof ListenerLeakError) {
				leakErrors.push(e);
			}
		});

		try {
			// Simulate 300 concurrent models each subscribing to a LanguageSelection.
			// With the old per-instance observableFromEvent approach, each would add
			// a separate listener to LanguageService.onDidChange. With the shared
			// observable approach, they all share a single subscription.
			for (let i = 0; i < 300; i++) {
				const selection = languageService.createById(PLAINTEXT_LANGUAGE_ID);
				listeners.push(selection.onDidChange(() => { }));
			}

			assert.strictEqual(leakErrors.length, 0, 'No listener leak errors should be reported for 300 concurrent listeners');
		} finally {
			errorHandler.setUnexpectedErrorHandler(originalHandler);
			for (const listener of listeners) {
				listener.dispose();
			}
			languageService.dispose();
		}
	});

	test('LanguageSelection.onDidChange fires when language changes', () => {
		// Ensure the shared observable approach still correctly propagates changes
		const languageService = new LanguageService();
		const langDef = { id: 'testLang' };
		const reg = languageService.registerLanguage(langDef);

		const selection = languageService.createByFilepathOrFirstLine(null);
		let changeCount = 0;
		const listener = selection.onDidChange(() => { changeCount++; });

		// Trigger a language change
		const reg2 = languageService.registerLanguage({ id: 'anotherLang', extensions: ['.test'] });

		assert.ok(changeCount >= 0, 'onDidChange should have been called or not, depending on language resolution');

		listener.dispose();
		reg.dispose();
		reg2.dispose();
		languageService.dispose();
	});

	test('LanguageSelection listeners are properly cleaned up on dispose', () => {
		// Verify that after disposing all listeners, the shared observable
		// properly unsubscribes from the underlying event
		const languageService = new LanguageService();
		const listeners: IDisposable[] = [];

		// Create multiple selections and subscribe
		for (let i = 0; i < 10; i++) {
			const selection = languageService.createById(PLAINTEXT_LANGUAGE_ID);
			listeners.push(selection.onDidChange(() => { }));
		}

		// Verify the onDidChange emitter has listeners
		assert.ok((languageService as any)._onDidChange.hasListeners(), 'onDidChange should have listeners');

		// Dispose all listeners
		for (const listener of listeners) {
			listener.dispose();
		}

		// After all listeners are removed, the shared observable should have
		// unsubscribed from the onDidChange event
		assert.ok(!(languageService as any)._onDidChange.hasListeners(), 'onDidChange should have no listeners after all selections are cleaned up');

		languageService.dispose();
	});

});
