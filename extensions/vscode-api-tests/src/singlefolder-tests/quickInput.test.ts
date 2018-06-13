/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { window, commands } from 'vscode';
import { closeAllEditors } from '../utils';

suite('window namespace tests', function () {

	suite('QuickInput tests', function () {
		teardown(closeAllEditors);

		test('createQuickPick, select second', function (_done) {
			let done = (err?: any) => {
				done = () => {};
				_done(err);
			};
			const quickPick = window.createQuickPick();
			const expectedFocusChanges = [['eins'], ['zwei']];
			quickPick.onDidChangeActive(items => {
				try {
					assert.deepEqual(items.map(item => item.label), expectedFocusChanges.shift());
				} catch (err) {
					done(err);
				}
			});
			quickPick.onDidAccept(() => {
				try {
					const items = quickPick.activeItems;
					quickPick.dispose();
					assert.equal(items.length, 1);
					assert.equal(items[0].label, 'zwei');
					assert.equal(expectedFocusChanges.length, 0);
					done();
				} catch (err) {
					done(err);
				}
			});
			quickPick.items = ['eins', 'zwei', 'drei'].map(label => ({ label }));
			quickPick.show();

			(async () => {
				await commands.executeCommand('workbench.action.quickOpenSelectNext');
				await commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
			})()
				.catch(err => done(err));
		});
	});
});
