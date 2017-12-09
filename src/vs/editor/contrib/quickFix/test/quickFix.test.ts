/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import { Model } from 'vs/editor/common/model/model';
import { CodeActionProviderRegistry, LanguageIdentifier, CodeActionProvider } from 'vs/editor/common/modes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { getCodeActions } from 'vs/editor/contrib/quickFix/quickFix';

suite('QuickFix', () => {

	let langId = new LanguageIdentifier('fooLang', 17);
	let uri = URI.parse('untitled:path');
	let model: Model;
	let disposables: IDisposable[] = [];

	setup(function () {
		model = Model.createFromString('test1\ntest2\ntest3', undefined, langId, uri);
		disposables = [model];
	});

	teardown(function () {
		dispose(disposables);
	});

	test('basics', async function () {

		const provider = new class implements CodeActionProvider {
			provideCodeActions() {
				return [{
					title: 'Testing1',
					diagnostics: [{
						startLineNumber: 1,
						startColumn: 1,
						endLineNumber: 2,
						endColumn: 1,
						severity: Severity.Error,
						message: 'some error'
					}]
				}, {
					title: 'Testing2'
				}];
			}
		};

		disposables.push(CodeActionProviderRegistry.register('fooLang', provider));

		const actions = await getCodeActions(model, new Range(1, 1, 2, 1));
		assert.equal(actions.length, 2);
	});

});
