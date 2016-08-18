/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Model} from 'vs/editor/common/model/model';
import {Context} from 'vs/editor/contrib/suggest/common/suggestModel';

suite('SuggestModel', function () {

	let model: Model;

	setup(function () {
		model = Model.createFromString('Das Pferd frisst keinen Gurkensalat - Philipp Reis 1861.\nWer hat\'s erfunden?');
	});

	teardown(function () {
		model.dispose();
	});

	test('Context - shouldAutoTrigger', function () {

		function assertAutoTrigger(offset: number, expected: boolean): void {
			const pos = model.getPositionAt(offset);
			const ctx = new Context(model, pos, false);
			assert.equal(ctx.shouldAutoTrigger(), expected);
		}

		assertAutoTrigger(3, true); // end of word, Das|
		assertAutoTrigger(4, false); // no word Das |
		assertAutoTrigger(1, false); // middle of word D|as
		assertAutoTrigger(55, false); // number, 1861|
	});

	test('Context - isDifferentContext', function () {

		// different line
		const ctx = new Context(model, { lineNumber: 1, column: 8 }, true); // Das Pfer|d
		assert.equal(ctx.isDifferentContext(new Context(model, { lineNumber: 2, column: 1 }, true)), true);


		function createEndContext(value: string) {
			const model = Model.createFromString(value);
			const ctx = new Context(model, model.getPositionAt(value.length), true); // Das Pfer|d
			return ctx;
		}

		// got shorter -> redo
		assert.equal(createEndContext('One Two').isDifferentContext(createEndContext('One Tw')), true);

		// got longer inside word -> keep
		assert.equal(createEndContext('One Tw').isDifferentContext(createEndContext('One Two')), false);

		// got longer new word -> redo
		assert.equal(createEndContext('One Two').isDifferentContext(createEndContext('One Two ')), true);
	});
});
