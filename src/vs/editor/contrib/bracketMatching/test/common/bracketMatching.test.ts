/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { withMockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { Model } from 'vs/editor/common/model/model';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { MockMode } from 'vs/editor/test/common/mocks/mockMode';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { BracketMatchingController } from 'vs/editor/contrib/bracketMatching/common/bracketMatching';

suite('bracket matching', () => {
	test('issue #9768: Allow to select text while jumping between brackets', () => {
		class BracketMode extends MockMode {

			private static _id = new LanguageIdentifier('bracketMode', 3);

			constructor() {
				super(BracketMode._id);
				this._register(LanguageConfigurationRegistry.register(this.getLanguageIdentifier(), {
					brackets: [
						['{', '}'],
						['[', ']'],
						['(', ')'],
					]
				}));
			}
		}

		let mode = new BracketMode();
		let model = Model.createFromString('var x = (3 + (5-7)) + ((5+3)+5);', undefined, mode.getLanguageIdentifier());

		withMockCodeEditor(null, { model: model }, (editor, cursor) => {
			let bracketMatchingController = editor.registerAndInstantiateContribution<BracketMatchingController>(BracketMatchingController);

			editor.setPosition(new Position(1, 9));
			bracketMatchingController.jumpToBracket();
			assert.deepEqual(editor.getPosition(), new Position(1, 20));
			assert.deepEqual(editor.getSelection(), new Selection(1, 9, 1, 20));

			editor.setPosition(new Position(1, 10));
			bracketMatchingController.jumpToBracket();
			assert.deepEqual(editor.getPosition(), new Position(1, 20));
			assert.deepEqual(editor.getSelection(), new Selection(1, 9, 1, 20));

			editor.setPosition(new Position(1, 19));
			bracketMatchingController.jumpToBracket();
			assert.deepEqual(editor.getPosition(), new Position(1, 20));
			assert.deepEqual(editor.getSelection(), new Selection(1, 9, 1, 20));

			editor.setPosition(new Position(1, 20));
			bracketMatchingController.jumpToBracket();
			assert.deepEqual(editor.getPosition(), new Position(1, 20));
			assert.deepEqual(editor.getSelection(), new Selection(1, 9, 1, 20));

			editor.setPosition(new Position(1, 14));
			bracketMatchingController.jumpToBracket();
			assert.deepEqual(editor.getPosition(), new Position(1, 19));
			assert.deepEqual(editor.getSelection(), new Selection(1, 14, 1, 19));

			editor.setPosition(new Position(1, 15));
			bracketMatchingController.jumpToBracket();
			assert.deepEqual(editor.getPosition(), new Position(1, 19));
			assert.deepEqual(editor.getSelection(), new Selection(1, 14, 1, 19));

			editor.setPosition(new Position(1, 18));
			bracketMatchingController.jumpToBracket();
			assert.deepEqual(editor.getPosition(), new Position(1, 19));
			assert.deepEqual(editor.getSelection(), new Selection(1, 14, 1, 19));

			editor.setPosition(new Position(1, 23));
			bracketMatchingController.jumpToBracket();
			assert.deepEqual(editor.getPosition(), new Position(1, 32));
			assert.deepEqual(editor.getSelection(), new Selection(1, 23, 1, 32));

			editor.setPosition(new Position(1, 24));
			bracketMatchingController.jumpToBracket();
			assert.deepEqual(editor.getPosition(), new Position(1, 29));
			assert.deepEqual(editor.getSelection(), new Selection(1, 24, 1, 29));

			bracketMatchingController.dispose();
		});

		model = Model.createFromString('{ test \n more test \n  }', undefined, mode.getLanguageIdentifier());

		withMockCodeEditor(null, { model: model }, (editor, cursor) => {
			let bracketMatchingController = editor.registerAndInstantiateContribution<BracketMatchingController>(BracketMatchingController);

			editor.setPosition(new Position(1, 1));
			bracketMatchingController.jumpToBracket();
			assert.deepEqual(editor.getPosition(), new Position(3, 4));
			assert.deepEqual(editor.getSelection(), new Selection(1, 1, 3, 4));

			editor.setPosition(new Position(1, 2));
			bracketMatchingController.jumpToBracket();
			assert.deepEqual(editor.getPosition(), new Position(3, 4));
			assert.deepEqual(editor.getSelection(), new Selection(1, 1, 3, 4));

			editor.setPosition(new Position(3, 3));
			bracketMatchingController.jumpToBracket();
			assert.deepEqual(editor.getPosition(), new Position(3, 4));
			assert.deepEqual(editor.getSelection(), new Selection(1, 1, 3, 4));

			editor.setPosition(new Position(3, 4));
			bracketMatchingController.jumpToBracket();
			assert.deepEqual(editor.getPosition(), new Position(3, 4));
			assert.deepEqual(editor.getSelection(), new Selection(1, 1, 3, 4));

			bracketMatchingController.dispose();
		});

		model = Model.createFromString('][', undefined, mode.getLanguageIdentifier());

		withMockCodeEditor(null, { model: model }, (editor, cursor) => {
			let bracketMatchingController = editor.registerAndInstantiateContribution<BracketMatchingController>(BracketMatchingController);

			editor.setPosition(new Position(1, 1));
			bracketMatchingController.jumpToBracket();
			assert.deepEqual(editor.getPosition(), new Position(1, 1));
			assert.deepEqual(editor.getSelection(), new Selection(1, 1, 1, 1));

			bracketMatchingController.dispose();
		});

		model.dispose();
		mode.dispose();
	});
});
