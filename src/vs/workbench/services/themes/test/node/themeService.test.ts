/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import fs = require('fs');
import path = require('path');
import os = require('os');
import assert = require('assert');
import uuid = require('vs/base/common/uuid');
import extfs = require('vs/base/node/extfs');
import utils = require('vs/workbench/services/files/test/node/utils');
import {IThemeData} from 'vs/workbench/services/themes/common/themeService';
import {ThemeService} from 'vs/workbench/services/themes/node/themeService';

suite('ThemeService', () => {
	let events: utils.TestEventService;
	let service: ThemeService;
	let parentDir = path.join(os.tmpdir(), 'vsctests', 'service');
	let testDir: string;

	let mockExtensionService;
	let mockTmThemeService;
	let mockCssThemeService;

	let testThemes;

	suiteSetup(done => {
		let id = uuid.generateUuid();
		let cssSourceDir = require.toUrl('./fixtures/css');
		testDir = path.join(parentDir, id);

		extfs.copy(cssSourceDir, testDir, () => {
			testThemes = [
				<IThemeData>{
					id: 'theme-css',
					path: `${testDir}/color.css`,
					type: 'color'
				},
				<IThemeData>{
					id: 'theme-css-not-exist',
					path: './path/does/not/exist.css',
					type: 'color'
				},
				<IThemeData>{
					id: 'theme-textmate',
					path: `${testDir}/color.tmTheme`,
					type: 'color'
				},
				<IThemeData>{
					id: 'theme-textmate-not-exist',
					path: `./path/does/not/exist.tmTheme`,
					type: 'color'
				},
				<IThemeData>{
					id: 'theme-json',
					path: `${testDir}/color.json`,
					type: 'color'
				},
				<IThemeData>{
					id: 'theme-json-not-exist',
					path: `/path/does/not/exist.json`,
					type: 'color'
				},
				<IThemeData>{
					id: 'theme-invalid',
					path: `/path/does/not/invalid-type`,
					type: 'invalid type'
				}
			];

			mockExtensionService = {
				onReady: () => {
					return {
						then: (fn) => {
							return Promise.resolve(testThemes)
						}
					};
				}
			};
			mockCssThemeService = {
				parseSource: () => ''
			};
			// must only call this once until extension point dependency has resolved
			service = new ThemeService(mockExtensionService, mockCssThemeService);
			done();
		});

	});

	suiteTeardown(done => {
		extfs.del(parentDir, os.tmpdir(), () => { }, done);
	});

	test('getThemes - returns all themes', done => {
		service.getThemes().then(allThemes => {
			assert.equal(allThemes, testThemes, 'should return all themes');
			done();
		});
	});

	test('loadTheme - when theme exists return theme data', done => {
		service.loadTheme('theme-css').then(themeData => {
			assert.equal(themeData.id, testThemes[0].id, 'css theme id should match');
			done();
		});
	});

	test('generateTheme - returns true when given a valid css theme', done => {
		service.generateTheme(testThemes[0]).then(result => {
			assert.equal(result, true);
			done();
		});
	});

	test('generateTheme - throws error when css theme does not exist', done => {
		(service.generateTheme(testThemes[1])).then(
			s => assert.ok(false),
			e => assert.equal(e, 'Unable to load ./path/does/not/exist.css')
		).then(done);
	});

	test('generateTheme - returns true when given a valid textmate theme', done => {
		service.generateTheme(testThemes[2]).then(result => {
			assert.equal(result, true);
			done();
		});
	});

	test('generateTheme - throws error when textmate theme does not exist', done => {
		(service.generateTheme(testThemes[3])).then(
			s => assert.ok(false),
			e => assert.equal(e, 'Unable to load ./path/does/not/exist.tmTheme')
		).then(done);
	});

});