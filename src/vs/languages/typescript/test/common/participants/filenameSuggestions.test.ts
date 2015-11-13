/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import network = require('vs/base/common/network');
import uri from 'vs/base/common/uri';
import filenameSuggestions = require('vs/languages/typescript/common/participants/filenameSuggestions');
import modelMirror = require('vs/editor/common/model/mirrorModel');
import resourceService = require('vs/editor/common/services/resourceServiceImpl');
import modesUtil = require('vs/editor/test/common/modesTestUtils');

suite('TS/JS* - Filename Suggest', () => {

	var jsModel = modelMirror.createMirrorModelFromString(null, 1, 'var a = require("module/path");', modesUtil.createMockMode('mock.mode.id'), network.URL.fromValue('http://test/async.js'));
	var tsModel = modelMirror.createMirrorModelFromString(null, 1, 'import a = require("module/path");', modesUtil.createMockMode('mock.mode.id'), network.URL.fromValue('http://test/async.ts'));

	var _resourceService = new resourceService.ResourceService();
	_resourceService.insert(jsModel.getAssociatedResource(), jsModel);
	_resourceService.insert(tsModel.getAssociatedResource(), tsModel);

	test('PathMaker - ///-reference', function() {
		var pathMaker = new filenameSuggestions.PathMaker();
		assert.equal(pathMaker.makeModulePath(false, 'http://localhost:88/api/files/monaco/client/module.ts', 'http://localhost:88/api/files/monaco/base.ts'), 'client/module.ts');
		assert.equal(pathMaker.makeModulePath(false, 'http://localhost:88/api/files/monaco/module.ts', 'http://localhost:88/api/files/monaco/client/base.ts'), '../module.ts');
	});

	test('PathMaker - commonjs', function() {
		var pathMaker = new filenameSuggestions.PathMaker();
		assert.equal(pathMaker.makeModulePath(true, 'http://localhost:88/api/files/monaco/client/module.ts', 'http://localhost:88/api/files/monaco/base.ts'), './client/module');
		assert.equal(pathMaker.makeModulePath(true, 'http://localhost:88/api/files/monaco/module2.ts', 'http://localhost:88/api/files/monaco/base.ts'), './module2');
		assert.equal(pathMaker.makeModulePath(true, 'http://localhost:88/api/files/monaco/module.ts', 'http://localhost:88/api/files/monaco/client/base.ts'), '../module');
	});
});
