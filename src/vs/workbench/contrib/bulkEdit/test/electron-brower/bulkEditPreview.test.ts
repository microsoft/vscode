/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from 'vs/base/common/event';
import { IFileService } from 'vs/platform/files/common/files';
import { mock } from 'vs/workbench/test/electron-browser/api/mock';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import type { WorkspaceEdit } from 'vs/editor/common/modes';
import { URI } from 'vs/base/common/uri';
import { BulkFileOperations } from 'vs/workbench/contrib/bulkEdit/browser/bulkEditPreview';


suite('BulkEditPreview', function () {


	let instaService: IInstantiationService;

	setup(function () {

		const fileService: IFileService = new class extends mock<IFileService>() {
			onFileChanges = Event.None;
			async exists() {
				return true;
			}
		};

		const modelService: IModelService = new class extends mock<IModelService>() {
			getModel() {
				return null;
			}
			getModels() {
				return [];
			}
		};

		instaService = new InstantiationService(new ServiceCollection(
			[IFileService, fileService],
			[IModelService, modelService],
		));
	});

	test('one needsConfirmation unchecks all of file', async function () {

		const edit: WorkspaceEdit = {
			edits: [
				{ newUri: URI.parse('some:///uri1'), metadata: { label: 'cat1', needsConfirmation: true } },
				{ oldUri: URI.parse('some:///uri1'), newUri: URI.parse('some:///uri2'), metadata: { label: 'cat2', needsConfirmation: false } },
			]
		};

		const ops = await instaService.invokeFunction(BulkFileOperations.create, edit);
		assert.equal(ops.fileOperations.length, 1);
		assert.equal(ops.fileOperations[0].isChecked(), false);
	});

	test('has categories', async function () {

		const edit: WorkspaceEdit = {
			edits: [
				{ newUri: URI.parse('some:///uri1'), metadata: { label: 'uri1', needsConfirmation: true } },
				{ newUri: URI.parse('some:///uri2'), metadata: { label: 'uri2', needsConfirmation: false } }
			]
		};

		const ops = await instaService.invokeFunction(BulkFileOperations.create, edit);
		assert.equal(ops.categories.length, 2);
		assert.equal(ops.categories[0].metadata.label, 'uri1'); // unconfirmed!
		assert.equal(ops.categories[1].metadata.label, 'uri2');
	});

	test('has not categories', async function () {

		const edit: WorkspaceEdit = {
			edits: [
				{ newUri: URI.parse('some:///uri1'), metadata: { label: 'uri1', needsConfirmation: true } },
				{ newUri: URI.parse('some:///uri2'), metadata: { label: 'uri1', needsConfirmation: false } }
			]
		};

		const ops = await instaService.invokeFunction(BulkFileOperations.create, edit);
		assert.equal(ops.categories.length, 1);
		assert.equal(ops.categories[0].metadata.label, 'uri1'); // unconfirmed!
		assert.equal(ops.categories[0].metadata.label, 'uri1');
	});

	test('update file from categories', async function () {

		const edit: WorkspaceEdit = {
			edits: [
				{ newUri: URI.parse('some:///uri1'), metadata: { label: 'cat1', needsConfirmation: true } },
				{ newUri: URI.parse('some:///uri1'), metadata: { label: 'cat2', needsConfirmation: true } }
			]
		};

		const ops = await instaService.invokeFunction(BulkFileOperations.create, edit);
		assert.equal(ops.categories.length, 2);

		const [first, second] = ops.categories;
		assert.equal(first.fileOperations.length, 1);
		assert.equal(second.fileOperations.length, 1);

		assert.equal(first.fileOperations[0].isChecked(), false);
		assert.equal(second.fileOperations[0].isChecked(), false);

		first.fileOperations[0].updateChecked(true);
		assert.equal(first.fileOperations[0].isChecked(), true);
		assert.equal(first.fileOperations[0].isChecked(), true);
	});
});
