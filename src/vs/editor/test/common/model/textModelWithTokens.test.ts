/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Model} from 'vs/editor/common/model/model';
import {ViewLineToken} from 'vs/editor/common/core/viewLineToken';
import {ITokenizationSupport} from 'vs/editor/common/modes';
import {MockMode} from 'vs/editor/test/common/mocks/mockMode';

suite('TextModelWithTokens', () => {

	function assertViewLineTokens(model:Model, lineNumber:number, forceTokenization:boolean, expected:ViewLineToken[]): void {
		let actual = model.getLineTokens(lineNumber, !forceTokenization).inflate();
		assert.deepEqual(actual, expected);
	}

	test('Microsoft/monaco-editor#122: Unhandled Exception: TypeError: Unable to get property \'replace\' of undefined or null reference', () => {
		let _tokenId = 0;
		class IndicisiveMode extends MockMode {
			public tokenizationSupport:ITokenizationSupport;

			constructor() {
				super();
				this.tokenizationSupport = {
					getInitialState: () => {
						return null;
					},
					tokenize: (line, state, offsetDelta, stopAtOffset) => {
						let myId = ++_tokenId;
						return {
							tokens: [{ startIndex: 0, type: 'custom.'+myId }],
							actualStopOffset: line.length,
							endState: null,
							modeTransitions: [],
							retokenize: null
						};
					}
				};
			}
		}
		let model = Model.createFromString('A model with\ntwo lines');

		assertViewLineTokens(model, 1, true, [new ViewLineToken(0, '')]);
		assertViewLineTokens(model, 2, true, [new ViewLineToken(0, '')]);

		model.setMode(new IndicisiveMode());

		assertViewLineTokens(model, 1, true, [new ViewLineToken(0, 'custom.1')]);
		assertViewLineTokens(model, 2, true, [new ViewLineToken(0, 'custom.2')]);

		model.setMode(new IndicisiveMode());

		assertViewLineTokens(model, 1, false, [new ViewLineToken(0, '')]);
		assertViewLineTokens(model, 2, false, [new ViewLineToken(0, '')]);

		model.dispose();
	});

});
