/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { TMScopeRegistry } from 'vs/editor/node/textMate/TMSyntax';

suite('TextMate.TMScopeRegistry', () => {
	test('getFilePath', () => {
		let registry = new TMScopeRegistry();

		registry.register('source.a', './grammar/a.tmLanguage');
		assert.equal(registry.getFilePath('source.a'), './grammar/a.tmLanguage');
		assert.equal(registry.getFilePath('a'), null);
		assert.equal(registry.getFilePath('source.b'), null);
		assert.equal(registry.getFilePath('b'), null);

		registry.register('source.b', './grammar/b.tmLanguage');
		assert.equal(registry.getFilePath('source.a'), './grammar/a.tmLanguage');
		assert.equal(registry.getFilePath('a'), null);
		assert.equal(registry.getFilePath('source.b'), './grammar/b.tmLanguage');
		assert.equal(registry.getFilePath('b'), null);

		registry.register('source.a', './grammar/ax.tmLanguage');
		assert.equal(registry.getFilePath('source.a'), './grammar/ax.tmLanguage');
		assert.equal(registry.getFilePath('a'), null);
		assert.equal(registry.getFilePath('source.b'), './grammar/b.tmLanguage');
		assert.equal(registry.getFilePath('b'), null);
	});
});
