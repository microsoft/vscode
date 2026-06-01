/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import assert from 'assert';
import { l10n, MessageItem, MessageOptions } from 'vscode';
import { pickDirtyWorkTreeCheckoutAction } from '../commands';

suite('Git commands', () => {

	test('dirty work tree checkout prompt uses custom modal dialog', async () => {
		let actualOptions: MessageOptions | undefined;

		await pickDirtyWorkTreeCheckoutAction(async (_message, options, ...items) => {
			actualOptions = options;

			return items[0];
		});

		assert.strictEqual(actualOptions?.modal, true);
		assert.strictEqual(actualOptions?.useCustom, true);
	});

	test('dirty work tree checkout prompt maps all choices to actions', async () => {
		const expectedMessage = l10n.t('Your local changes would be overwritten by checkout.');
		const expectedTitles = [
			l10n.t('Stash & Checkout'),
			l10n.t('Migrate Changes'),
			l10n.t('Force Checkout')
		];
		const cases: [number, 'stash' | 'migrate' | 'force'][] = [
			[0, 'stash'],
			[1, 'migrate'],
			[2, 'force']
		];

		for (const [choiceIndex, expectedAction] of cases) {
			let actualMessage: string | undefined;
			let actualItems: MessageItem[] | undefined;

			const action = await pickDirtyWorkTreeCheckoutAction(async (message, _options, ...items) => {
				actualMessage = message;
				actualItems = items;

				return items[choiceIndex];
			});

			assert.strictEqual(actualMessage, expectedMessage);
			assert.deepStrictEqual(actualItems?.map(item => item.title), expectedTitles);
			assert.strictEqual(action, expectedAction);
		}
	});

	test('dirty work tree checkout prompt returns undefined when dismissed', async () => {
		const action = await pickDirtyWorkTreeCheckoutAction(async () => undefined);

		assert.strictEqual(action, undefined);
	});
});
