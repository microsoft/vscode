/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Model } from 'vs/editor/common/model/model';
import { DocumentFormattingEditProviderRegistry } from 'vs/editor/common/modes';
import { getDocumentFormattingEdits, FormatterConfiguration } from 'vs/editor/contrib/format/common/format';

let lastName: string;

suite('Format - Prio', function () {

	let model = Model.createFromString('foobar-barfoo-bingbong', undefined, 'foolang');
	let disposables: IDisposable[] = [];

	setup(function () {
		lastName = '';
		disposables.push(DocumentFormattingEditProviderRegistry.register('foolang', {
			name: 'far',
			provideDocumentFormattingEdits() {
				lastName = 'far';
				return [];
			}
		}));
		disposables.push(DocumentFormattingEditProviderRegistry.register('foolang', {
			name: 'boo',
			provideDocumentFormattingEdits() {
				lastName = 'boo';
				return [];
			}
		}));
	});

	teardown(function () {
		disposables = dispose(disposables);
	});

	test('selector score', function () {
		// 'boo' registered last
		return getDocumentFormattingEdits(model, undefined).then(_ => {
			assert.equal(lastName, 'boo');
		});
	});

	test('explict prios', function () {

		const prios = <FormatterConfiguration>{
			foolang: 'far'
		};

		return getDocumentFormattingEdits(model, undefined, prios).then(_ => {
			assert.equal(lastName, 'far');
		});
	});

	test('invalid prio, no formatter', function () {

		const prios = <FormatterConfiguration>{
			foolang: 'some_dead_provider'
		};

		return getDocumentFormattingEdits(model, undefined, prios).then(_ => {
			assert.equal(lastName, '');
			assert.equal(_, undefined);
		});
	});
});