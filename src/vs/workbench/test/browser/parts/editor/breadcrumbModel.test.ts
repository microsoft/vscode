/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { BreadcrumbsModel, FileElement } from '../../../../browser/parts/editor/breadcrumbsModel.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { TestContextService } from '../../../common/workbenchTestServices.js';
import { Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IOutlineService } from '../../../../services/outline/browser/outline.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Breadcrumb Model', function () {

	let model: BreadcrumbsModel;
	const workspaceService = new TestContextService(new Workspace('ffff', [new WorkspaceFolder({ uri: URI.parse('foo:/bar/baz/ws'), name: 'ws', index: 0 })]));
	const configService = new class extends TestConfigurationService {
		override getValue<T>(...args: any[]): T | undefined {
			if (args[0] === 'breadcrumbs.filePath') {
				return 'on' as T;
			}
			if (args[0] === 'breadcrumbs.symbolPath') {
				return 'on' as T;
			}
			return super.getValue(...args);
		}
		override updateValue() {
			return Promise.resolve();
		}
	};

	teardown(function () {
		model.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('only uri, inside workspace', function () {

		model = new BreadcrumbsModel(URI.parse('foo:/bar/baz/ws/some/path/file.ts'), undefined, configService, workspaceService, new class extends mock<IOutlineService>() { });
		const elements = model.getElements();

		assert.strictEqual(elements.length, 3);
		const [one, two, three] = elements as FileElement[];
		assert.strictEqual(one.kind, FileKind.FOLDER);
		assert.strictEqual(two.kind, FileKind.FOLDER);
		assert.strictEqual(three.kind, FileKind.FILE);
		assert.strictEqual(one.uri.toString(), 'foo:/bar/baz/ws/some');
		assert.strictEqual(two.uri.toString(), 'foo:/bar/baz/ws/some/path');
		assert.strictEqual(three.uri.toString(), 'foo:/bar/baz/ws/some/path/file.ts');
	});

	test('display uri matters for FileElement', function () {

		model = new BreadcrumbsModel(URI.parse('foo:/bar/baz/ws/some/PATH/file.ts'), undefined, configService, workspaceService, new class extends mock<IOutlineService>() { });
		const elements = model.getElements();

		assert.strictEqual(elements.length, 3);
		const [one, two, three] = elements as FileElement[];
		assert.strictEqual(one.kind, FileKind.FOLDER);
		assert.strictEqual(two.kind, FileKind.FOLDER);
		assert.strictEqual(three.kind, FileKind.FILE);
		assert.strictEqual(one.uri.toString(), 'foo:/bar/baz/ws/some');
		assert.strictEqual(two.uri.toString(), 'foo:/bar/baz/ws/some/PATH');
		assert.strictEqual(three.uri.toString(), 'foo:/bar/baz/ws/some/PATH/file.ts');
	});

	test('only uri, outside workspace', function () {

		model = new BreadcrumbsModel(URI.parse('foo:/outside/file.ts'), undefined, configService, workspaceService, new class extends mock<IOutlineService>() { });
		const elements = model.getElements();

		assert.strictEqual(elements.length, 2);
		const [one, two] = elements as FileElement[];
		assert.strictEqual(one.kind, FileKind.FOLDER);
		assert.strictEqual(two.kind, FileKind.FILE);
		assert.strictEqual(one.uri.toString(), 'foo:/outside');
		assert.strictEqual(two.uri.toString(), 'foo:/outside/file.ts');
	});
});
