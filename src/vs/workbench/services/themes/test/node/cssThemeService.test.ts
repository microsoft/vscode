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

import {CssThemeService} from 'vs/workbench/services/themes/node/cssThemeService';
import {supportedColorSelectors, supportedIconSelectors} from 'vs/workbench/services/themes/common/cssThemeService';

suite('CssThemeService', () => {
	let events: utils.TestEventService;
	let service: CssThemeService;
	let parentDir = path.join(os.tmpdir(), 'vsctests', 'service');
	let testDir: string;

	setup(done => {
		let id = uuid.generateUuid();
		testDir = path.join(parentDir, id);
		let cssSourceDir = require.toUrl('./fixtures/css');

		extfs.copy(cssSourceDir, testDir, () => {
			service = new CssThemeService();
			done();
		});
	});

	teardown(done => {
		extfs.del(parentDir, os.tmpdir(), () => { }, done);
	});

	test('_supportsSelector - matches supported selector', () => {
		let matchResult = service._supportsSelector('.editor {color: 123}', ['.someClass', '.editor']);
		assert.ok(matchResult);
	});

	test('_supportsSelector - does not match unsupported selector', () => {
		let matchResult = service._supportsSelector('.vs-dark {color: 123}', ['.someClass', '.editor']);
		assert.ok(matchResult === false);
	});

	test('parseSource - asserts params', () => {
		let throwFn = () => service.parseSource('', '', '', '');
		assert.throws(throwFn, /Invalid theme directory/);

		throwFn = () => service.parseSource('testDirectory', '', '', '');
		assert.throws(throwFn, /Invalid themeId/);

		throwFn = () => service.parseSource('testDirectory', 'vs-dark test-theme', '', '');
		assert.throws(throwFn, /Invalid themeComponent/);
	});

	test('parseSource - throws css errors when css is invalid', () => {
		let testCss = fs.readFileSync(path.join(testDir, 'invalid.css'), 'utf8');
		let throwFn = () => service.parseSource('testDirectory', 'vs-dark test-theme', 'color', testCss);
		assert.throws(throwFn);
	});

	test('parseSource - does not throw when css is empty', () => {
		let throwFn = () => service.parseSource('testDirectory', 'vs-dark test-theme', 'color', '');
		assert.doesNotThrow(throwFn);

		let resultCss = service.parseSource('testDirectory', 'vs-dark test-theme', 'color', '');
		assert.equal(resultCss, '');
	});

	test('parseSource - throws error when selector not supported', () => {
		let throwFn = () => service.parseSource('testDirectory', 'vs-dark test-theme', 'color', '.notsupported {}');
		assert.throws(throwFn, /Theme selector not supported. '.notsupported'/);
	});

	test('parseSource - throws error when css property not supported', () => {
		let throwFn = () => service.parseSource('testDirectory', 'vs-dark test-theme', 'color', '.editor {position: absolute;}');
		assert.throws(throwFn, /Theme css property not supported. 'position: absolute;'/);
	});

	test('parseSource - uses supported selectors for color theme component', done => {
		service._parseCssRules = (rules, supportedSelectors: Array<string>): any[] => {
			assert.equal(supportedSelectors, supportedColorSelectors);
			done();
			return [];
		}
		service.parseSource('testDirectory', 'vs-dark test-theme', 'color', '.editor {}');
	});

	test('parseSource - uses supported selectors for icon theme component', done => {
		service._parseCssRules = (rules, supportedSelectors: Array<string>): any[] => {
			assert.equal(supportedSelectors, supportedIconSelectors);
			done();
			return [];
		}
		service.parseSource('testDirectory', 'vs-dark test-theme', 'icon', '.editor {}');
	});

	test('parseSource - returns transformed color theme css', () => {
		let testCss = fs.readFileSync(path.join(testDir, 'color.css'), 'utf8');
		let expectedCss = fs.readFileSync(path.join(testDir, 'expected-color.css'), 'utf8');
		let resultCss = service.parseSource('testDirectory', 'vs-dark test-theme', 'color', testCss);
		assert.equal(resultCss, expectedCss);
	});

	test('parseSource - returns transformed icon theme css', () => {
		let testCss = fs.readFileSync(path.join(testDir, 'icons.css'), 'utf8');
		let expectedCss = fs.readFileSync(path.join(testDir, 'expected-icons.css'), 'utf8');
		let resultCss = service.parseSource('./test-theme', 'vs-dark test-theme', 'icon', testCss);
		fs.writeFileSync(path.join('d:\\', 'out-icons.css'), resultCss);
		assert.equal(resultCss, expectedCss);
	});

});