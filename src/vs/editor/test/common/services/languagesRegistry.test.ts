/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {LanguagesRegistry} from 'vs/editor/common/services/languagesRegistry';

suite('LanguagesRegistry', () => {

	test('output mode does not have a name', () => {
		let registry = new LanguagesRegistry(false);

		registry._registerCompatModes([{
			id: 'outputModeId',
			extensions: [],
			aliases: [null],
			mimetypes: ['outputModeMimeType'],
			moduleId: 'outputModeModuleId',
			ctorName: 'outputModeCtorName'
		}]);

		assert.deepEqual(registry.getRegisteredLanguageNames(), []);
	});

	test('mode with alias does have a name', () => {
		let registry = new LanguagesRegistry(false);

		registry._registerCompatModes([{
			id: 'modeId',
			extensions: [],
			aliases: ['ModeName'],
			mimetypes: ['bla'],
			moduleId: 'bla',
			ctorName: 'bla'
		}]);

		assert.deepEqual(registry.getRegisteredLanguageNames(), ['ModeName']);
		assert.deepEqual(registry.getLanguageName('modeId'), 'ModeName');
	});

	test('mode without alias gets a name', () => {
		let registry = new LanguagesRegistry(false);

		registry._registerCompatModes([{
			id: 'modeId',
			extensions: [],
			aliases: [],
			mimetypes: ['bla'],
			moduleId: 'bla',
			ctorName: 'bla'
		}]);

		assert.deepEqual(registry.getRegisteredLanguageNames(), ['modeId']);
		assert.deepEqual(registry.getLanguageName('modeId'), 'modeId');
	});

	test('bug #4360: f# not shown in status bar', () => {
		let registry = new LanguagesRegistry(false);

		registry._registerCompatModes([{
			id: 'modeId',
			extensions: ['.ext1'],
			aliases: ['ModeName'],
			mimetypes: ['bla'],
			moduleId: 'bla',
			ctorName: 'bla'
		}]);

		registry._registerCompatModes([{
			id: 'modeId',
			extensions: ['.ext2'],
			aliases: [],
			mimetypes: ['bla'],
			moduleId: 'bla',
			ctorName: 'bla'
		}]);

		assert.deepEqual(registry.getRegisteredLanguageNames(), ['ModeName']);
		assert.deepEqual(registry.getLanguageName('modeId'), 'ModeName');
	});

});