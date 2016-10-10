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
import { getDocumentFormattingEdits, FormattingPriorities } from 'vs/editor/contrib/format/common/format';

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
				return undefined;
			}
		}));
		disposables.push(DocumentFormattingEditProviderRegistry.register('foolang', {
			name: 'boo',
			provideDocumentFormattingEdits() {
				lastName = 'boo';
				return undefined;
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

		const prios = <FormattingPriorities>{
			foolang: 'far'
		};

		return getDocumentFormattingEdits(model, undefined, prios).then(_ => {
			assert.equal(lastName, 'far');
		});
	});

	test('equal explict prios, fallback to selector score', function () {

		const prios = <FormattingPriorities>{
			foolang: ['far', 'boo']
		};

		return getDocumentFormattingEdits(model, undefined, prios).then(_ => {
			assert.equal(lastName, 'far');
		});
	});

	test('invalid explict prios, fallback to selector score', function () {

		return TPromise.join([
			getDocumentFormattingEdits(model, undefined, {
				foolang: 'some_dead_provider'
			}).then(_ => {
				assert.equal(lastName, 'boo');
			}),
			getDocumentFormattingEdits(model, undefined, {
				foolang: ['some_dead_provider', 'far', 'boo']
			}).then(_ => {
				assert.equal(lastName, 'far');
			})]);
	});
});