/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import assert = require('assert');
import {WorkingFilesRenderer} from 'vs/workbench/parts/files/browser/views/workingFilesViewer';
import {supportedColorSelectors, supportedIconSelectors} from 'vs/workbench/services/themes/common/cssThemeService';

suite('WorkingFilesRenderer', () => {
	let renderer: WorkingFilesRenderer;
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

		let mockModel = {};
		let mockActionProv = {};
		let mockActionRunner;
		mockContextService = {};
		renderer = new WorkingFilesRenderer(
			<any>mockModel,
			<any>mockActionProv,
			mockActionRunner,
			<any>mockContextService
		);
	});

	test('applyElementStats - use resource.fsPath when there is no workspace open', () => {
		let entry = {
			resource: {
				fsPath: '/d/source/test/not-workspace.txt'
			}
		};

		mockContextService.toWorkspaceRelativePath = () => null;
		let matchResult = (<any>renderer).applyElementStats(mockElement, entry);
		assert.equal(matchResult.attributes['data-directory'], '/d/source/test');
		assert.equal(matchResult.attributes['data-file'], 'not-workspace.txt');
	});

	test('applyElementStats - use workspace path when there is a workspace open', () => {
		let entry = {
			resource: {
				fsPath: null
			}
		};

		mockContextService.toWorkspaceRelativePath = () => './test/in-a-workspace.txt';
		let matchResult = (<any>renderer).applyElementStats(mockElement, entry);
		assert.equal(matchResult.attributes['data-directory'], './test');
		assert.equal(matchResult.attributes['data-file'], 'in-a-workspace.txt');
	});

});