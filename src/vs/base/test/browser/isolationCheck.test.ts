/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { focusDetector, leftoverDomDetector } from './isolationCheck.js';

suite('Isolation check', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports elements left in the body, but not those that were there before', () => {
		const existing = mainWindow.document.createElement('div');
		mainWindow.document.body.append(existing);
		const before = leftoverDomDetector.snapshot();
		const leftover = mainWindow.document.createElement('div');
		leftover.id = 'leftover';
		leftover.className = 'monaco-workbench extra';
		mainWindow.document.body.append(leftover);
		const findings = leftoverDomDetector.check(before);
		leftover.remove();
		existing.remove();
		assert.deepStrictEqual({ findings, restored: leftoverDomDetector.check(before) }, {
			findings: ['left div#leftover.monaco-workbench.extra in body'],
			restored: [],
		});
	});

	test('reports focus left on an element, but not on the body or an element that had focus before', () => {
		const container = mainWindow.document.createElement('div');
		container.className = 'list';
		const input = mainWindow.document.createElement('input');
		container.append(input);
		mainWindow.document.body.append(container);
		const before = focusDetector.snapshot();
		input.focus();
		const findings = focusDetector.check(before);
		const stillFocused = focusDetector.check(focusDetector.snapshot());
		input.blur();
		container.remove();
		assert.deepStrictEqual({ findings, stillFocused, restored: focusDetector.check(before) }, {
			findings: ['left focus on div.list > input'],
			stillFocused: [],
			restored: [],
		});
	});
});
