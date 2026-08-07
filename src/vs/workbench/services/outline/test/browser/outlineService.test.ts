/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IEditorPane } from '../../../../common/editor.js';
import { IOutlineCreator, OutlineTarget } from '../../browser/outline.js';
import { OutlineService } from '../../browser/outlineService.js';

suite('OutlineService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards creator changes without changing creator registration', async () => {
		const service = new OutlineService();
		const onDidChange = store.add(new Emitter<void>());
		const pane = {} as IEditorPane;
		let customEditorAvailable = false;
		let standardOutlineCreates = 0;

		const standardCreator: IOutlineCreator<IEditorPane, unknown> = {
			matches: (candidate): candidate is IEditorPane => candidate === pane,
			createOutline: async () => {
				standardOutlineCreates++;
				return undefined;
			},
		};
		const customEditorCreator: IOutlineCreator<IEditorPane, unknown> = {
			onDidChange: onDidChange.event,
			matches: (_candidate): _candidate is IEditorPane => customEditorAvailable,
			createOutline: async () => undefined,
		};

		store.add(service.registerOutlineCreator(standardCreator));
		const customRegistration = store.add(service.registerOutlineCreator(customEditorCreator));
		let serviceChanges = 0;
		store.add(service.onDidChange(() => serviceChanges++));

		customEditorAvailable = true;
		onDidChange.fire();

		assert.strictEqual(serviceChanges, 1);
		assert.strictEqual(service.canCreateOutline(pane), true);
		await service.createOutline(pane, OutlineTarget.OutlinePane, CancellationToken.None);
		assert.strictEqual(standardOutlineCreates, 1);

		customRegistration.dispose();
		onDidChange.fire();
		assert.strictEqual(serviceChanges, 2);
	});
});
