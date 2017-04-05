/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Action, IAction, isAction } from 'vs/base/common/actions';

suite('Actions', () => {
	test('isAction', function () {
		assert(isAction(new Action('id', 'label', 'style', true, function () { return null; })));
		assert(isAction(<IAction>{
			id: 'id',
			label: 'label',
			class: 'style',
			checked: true,
			enabled: true,
			run: function () { return null; }
		}));

		assert(!isAction({
			//		id: 'id',
			label: 'label',
			class: 'style',
			checked: true,
			enabled: true,
			run: function () { return null; }
		}));
		assert(!isAction({
			id: 1234,
			label: 'label',
			class: 'style',
			checked: true,
			enabled: true,
			run: function () { return null; }
		}));
		assert(!isAction({
			id: 'id',
			label: 'label',
			class: 'style',
			checked: 1,
			enabled: 1,
			run: function () { return null; }
		}));
		assert(!isAction(null));
		assert(!isAction({
			id: 'id',
			label: 'label',
			//		class: 'style',
			checked: true,
			enabled: true,
			//		run: function() { return null; }
		}));
		assert(!isAction({
			id: 'id',
			label: 42,
			class: 'style',
			checked: true,
			enabled: true,
		}));
		assert(!isAction({
			id: 'id',
			label: 'label',
			class: 'style',
			checked: 'checked',
			enabled: true,
		}));
		assert(!isAction({
			id: 'id',
			label: 'label',
			class: 'style',
			checked: true,
			enabled: true,
			run: true
		}));
	});
});
