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

			const expectedEvents = ['active', 'active', 'selection', 'accept', 'hide'];
			const expectedActiveItems = [['eins'], ['zwei']];
			const expectedSelectionItems = [['zwei']];

			const quickPick = window.createQuickPick();
			quickPick.onDidChangeActive(items => {
				try {
					assert.equal('active', expectedEvents.shift());
					const expected = expectedActiveItems.shift();
					assert.deepEqual(items.map(item => item.label), expected);
					assert.deepEqual(quickPick.activeItems.map(item => item.label), expected);
				} catch (err) {
					done(err);
				}
			});
			quickPick.onDidChangeSelection(items => {
				try {
					assert.equal('selection', expectedEvents.shift());
					const expected = expectedSelectionItems.shift();
					assert.deepEqual(items.map(item => item.label), expected);
					assert.deepEqual(quickPick.selectedItems.map(item => item.label), expected);
				} catch (err) {
					done(err);
				}
			});
			quickPick.onDidAccept(() => {
				try {
					assert.equal('accept', expectedEvents.shift());
					const expected = ['zwei'];
					assert.deepEqual(quickPick.activeItems.map(item => item.label), expected);
					assert.deepEqual(quickPick.selectedItems.map(item => item.label), expected);
					quickPick.dispose();
				} catch (err) {
					done(err);
				}
			});
			quickPick.onDidHide(() => {
				try {
					assert.equal('hide', expectedEvents.shift());
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
