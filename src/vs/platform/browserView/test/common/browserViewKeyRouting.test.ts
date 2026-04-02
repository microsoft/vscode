/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { shouldForwardBrowserViewKeydown, type IBrowserViewKeyRoutingEvent } from '../../common/browserViewKeyRouting.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

function testEvent(overrides: Partial<IBrowserViewKeyRoutingEvent>): IBrowserViewKeyRoutingEvent {
	return {
		key: 'l',
		code: 'KeyL',
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		metaKey: false,
		...overrides
	};
}

suite('BrowserViewKeyRouting', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves Cmd+Left in editable targets on macOS', () => {
		assert.strictEqual(shouldForwardBrowserViewKeydown(testEvent({ key: 'ArrowLeft', code: 'ArrowLeft', metaKey: true }), { isMac: true, isEditableTarget: true }), false);
	});

	test('preserves Cmd+Right in editable targets on macOS', () => {
		assert.strictEqual(shouldForwardBrowserViewKeydown(testEvent({ key: 'ArrowRight', code: 'ArrowRight', metaKey: true }), { isMac: true, isEditableTarget: true }), false);
	});

	test('preserves Shift+Cmd+Left selection navigation in editable targets on macOS', () => {
		assert.strictEqual(shouldForwardBrowserViewKeydown(testEvent({ key: 'ArrowLeft', code: 'ArrowLeft', metaKey: true, shiftKey: true }), { isMac: true, isEditableTarget: true }), false);
	});

	test('preserves Ctrl+ArrowLeft in editable targets on non-mac platforms', () => {
		assert.strictEqual(shouldForwardBrowserViewKeydown(testEvent({ key: 'ArrowLeft', code: 'ArrowLeft', ctrlKey: true }), { isMac: false, isEditableTarget: true }), false);
	});

	test('still forwards non-navigation shortcuts from editable targets', () => {
		assert.strictEqual(shouldForwardBrowserViewKeydown(testEvent({ key: 'l', code: 'KeyL', metaKey: true }), { isMac: true, isEditableTarget: true }), true);
	});

	test('still forwards Cmd+Left when the target is not editable', () => {
		assert.strictEqual(shouldForwardBrowserViewKeydown(testEvent({ key: 'ArrowLeft', code: 'ArrowLeft', metaKey: true }), { isMac: true, isEditableTarget: false }), true);
	});
});
