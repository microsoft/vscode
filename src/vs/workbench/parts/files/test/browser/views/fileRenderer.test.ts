/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import assert = require('assert');
import {FileRenderer} from 'vs/workbench/parts/files/browser/views/explorerViewer';
import {supportedColorSelectors, supportedIconSelectors} from 'vs/workbench/services/themes/common/cssThemeService';

suite('FileRenderer', () => {
	let renderer: FileRenderer;
	let mockElement;
	let mockContextService;

	setup(() => {
		mockElement = {
			class: '',
			attributes: {},
			addClass: function(className) {
				this.class = (this.class + ' ' + className).trim();
				return this;
			},
			attr: function(attrName, attrValue) {
				this.attributes[attrName] = attrValue;
				return this;
			}
		}

		let mockState = {};
		let mockActionRunner;
		let mockContextViewService = {};
		mockContextService = {};
		renderer = new FileRenderer(
			<any>mockState,
			mockActionRunner,
			<any>mockContextViewService,
			<any>mockContextService
		);
	});

	test('applyElementStats - adds folder icon when adding a new folder', () => {
		let stat = {
			isDirectoryResolved: true
		};
		// set workspace to null
		mockContextService.toWorkspaceRelativePath = () => null;
		let matchResult = (<any>renderer).applyElementStats(mockElement, stat);
		assert.ok(!matchResult.attributes['data-directory'], 'data-directory attribute should be falsy');
		assert.ok(!matchResult.attributes['data-file'], 'data-file attribute should be falsy');
		assert.equal(matchResult.class, 'folder-icon', 'class should contain folder-icon');
	});

	test('applyElementStats - adds file icon when adding a new file', () => {
		let stat = {
			isDirectoryResolved: false
		};
		// set workspace to null
		mockContextService.toWorkspaceRelativePath = () => null;
		let matchResult = (<any>renderer).applyElementStats(mockElement, stat);
		assert.ok(!matchResult.attributes['data-directory'], 'data-directory attribute should be falsy');
		assert.ok(!matchResult.attributes['data-file'], 'data-file attribute should be falsy');
		assert.equal(matchResult.class, 'file-icon', 'class should contain file-icon');
	});

	test('applyElementStats - adds folder icon to root folders', () => {
		let stat = {
			isDirectory: true
		};
		// set workspace to null
		mockContextService.toWorkspaceRelativePath = () => '';
		// test
		let matchResult = (<any>renderer).applyElementStats(mockElement, stat);
		assert.equal(matchResult.attributes['data-directory'], '', 'data-directory should be empty');
		assert.ok(matchResult.attributes['data-file'] === undefined, 'data-file should be undefined');
		assert.equal(matchResult.class, 'folder-icon', 'class should contain folder-icon');
	});

	test('applyElementStats - adds folder icon to sub folders', () => {
		let stat = {
			isDirectory: true
		};
		// set workspace to null
		mockContextService.toWorkspaceRelativePath = () => './test/in-a-workspace';
		// test
		let matchResult = (<any>renderer).applyElementStats(mockElement, stat);
		assert.equal(matchResult.attributes['data-directory'], './test/in-a-workspace', 'data-directory should be ./test/in-a-workspace');
		assert.ok(matchResult.attributes['data-file'] === undefined, 'data-file should be undefined');
		assert.equal(matchResult.class, 'folder-icon', 'class should contain folder-icon');
	});

	test('applyElementStats - adds file icon to files in sub folders', () => {
		let stat = {
			isDirectory: false,
			name: 'in-a-workspace.txt'
		};
		// set workspace to null
		mockContextService.toWorkspaceRelativePath = () => './test/in-a-workspace.txt';
		// test
		let matchResult = (<any>renderer).applyElementStats(mockElement, stat);
		assert.equal(matchResult.attributes['data-directory'], './test', 'data-directory should be ./test');
		assert.equal(matchResult.attributes['data-file'], 'in-a-workspace.txt', 'data-file should be \'in-a-workspace.txt\'');
		assert.equal(matchResult.class, 'file-icon', 'class should contain file-icon');
	});

	test('applyElementStats - adds file icon to files in root folders', () => {
		let stat = {
			isDirectory: false,
			name: 'in-a-workspace.txt'
		};

		// set workspace to null
		mockContextService.toWorkspaceRelativePath = () => 'in-a-workspace.txt';
		// test
		let matchResult = (<any>renderer).applyElementStats(mockElement, stat);
		assert.equal(matchResult.attributes['data-directory'], '', 'data-directory should be empty');
		assert.equal(matchResult.attributes['data-file'], 'in-a-workspace.txt', 'data-file should be \'in-a-workspace.txt\'');
		assert.equal(matchResult.class, 'file-icon', 'class should contain file-icon');
	});

});