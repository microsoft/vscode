/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { Workspace, WorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { EditorBreadcrumbsModel, FileElement } from 'vs/workbench/browser/parts/editor/breadcrumbsModel';
import { TestContextService } from 'vs/workbench/test/workbenchTestServices';


suite('Breadcrumb Model', function () {

	const workspaceService = new TestContextService(new Workspace('ffff', 'Test', [new WorkspaceFolder({ uri: URI.parse('foo:/bar/baz/ws'), name: 'ws', index: 0 })]));

	test('only uri, inside workspace', function () {

		let model = new EditorBreadcrumbsModel(URI.parse('foo:/bar/baz/ws/some/path/file.ts'), undefined, workspaceService);
		let elements = model.getElements();

		assert.equal(elements.length, 3);
		let [one, two, three] = elements as FileElement[];
		assert.equal(one.isFile, false);
		assert.equal(two.isFile, false);
		assert.equal(three.isFile, true);
		assert.equal(one.uri.toString(), 'foo:/bar/baz/ws/some');
		assert.equal(two.uri.toString(), 'foo:/bar/baz/ws/some/path');
		assert.equal(three.uri.toString(), 'foo:/bar/baz/ws/some/path/file.ts');
	});

	test('only uri, outside workspace', function () {

		let model = new EditorBreadcrumbsModel(URI.parse('foo:/outside/file.ts'), undefined, workspaceService);
		let elements = model.getElements();

		assert.equal(elements.length, 2);
		let [one, two] = elements as FileElement[];
		assert.equal(one.isFile, false);
		assert.equal(two.isFile, true);
		assert.equal(one.uri.toString(), 'foo:/outside');
		assert.equal(two.uri.toString(), 'foo:/outside/file.ts');
	});
});
