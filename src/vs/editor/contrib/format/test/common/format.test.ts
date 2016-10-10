/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Model } from 'vs/editor/common/model/model';
import { DocumentFormattingEditProviderRegistry } from 'vs/editor/common/modes';
import { getDocumentFormattingEdits, FormattingEditProviderPriorities } from 'vs/editor/contrib/format/common/format';


suite('Format - Prio', function () {

	let model = Model.createFromString('foobar-barfoo-bingbong', undefined, 'foolang');
	let disposables: IDisposable[] = [];

	teardown(function () {
		disposables = dispose(disposables);
	});

	test('selector score', function () {

		let lastName: string;

		disposables.push(DocumentFormattingEditProviderRegistry.register('foolang', {
			name: 'far',
			provideDocumentFormattingEdits() {
				lastName = 'far';
				return undefined;
			}
		}));

		// comes later -> wins
		disposables.push(DocumentFormattingEditProviderRegistry.register('foolang', {
			name: 'boo',
			provideDocumentFormattingEdits() {
				lastName = 'boo';
				return undefined;
			}
		}));

		return getDocumentFormattingEdits(model, undefined).then(_ => {
			assert.equal(lastName, 'boo');
		});
	});

	test('explict prios', function () {

		const prios = <FormattingEditProviderPriorities>{
			foolang: 'far'
		};

		let lastName: string;

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

		return getDocumentFormattingEdits(model, undefined, prios).then(_ => {
			assert.equal(lastName, 'far');
		});
	});

	test('invalid explict prios, fallback to selector score', function () {

		const prios = <FormattingEditProviderPriorities>{
			foolang: 'does_not_exist'
		};

		let lastName: string;

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

		return getDocumentFormattingEdits(model, undefined, prios).then(_ => {
			assert.equal(lastName, 'boo');
		});
	});
});