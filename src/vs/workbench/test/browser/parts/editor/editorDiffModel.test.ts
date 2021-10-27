/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TextDiffEditorModel } from 'vs/workbench/common/editor/textDiffEditorModel';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { TextResourceEditorInput } from 'vs/workbench/common/editor/textResourceEditorInput';
import { URI } from 'vs/base/common/uri';
import { workbenchInstantiationService, TestServiceAccessor } from 'vs/workbench/test/browser/workbenchTestServices';
import { ITextModel } from 'vs/editor/common/model';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { DisposableStore } from 'vs/base/common/lifecycle';

suite('TextDiffEditorModel', () => {

	let disposables: DisposableStore;
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);
	});

	teardown(() => {
		disposables.dispose();
	});

	test('basics', async () => {
		const dispose = accessor.textModelResolverService.registerTextModelContentProvider('test', {
			provideTextContent: async function (resource: URI): Promise<ITextModel | null> {
				if (resource.scheme === 'test') {
					let modelContent = 'Hello Test';
					let languageSelection = accessor.modeService.create('json');

					return accessor.modelService.createModel(modelContent, languageSelection, resource);
				}

				return null;
			}
		});

		let input = instantiationService.createInstance(TextResourceEditorInput, URI.from({ scheme: 'test', authority: null!, path: 'thePath' }), 'name', 'description', undefined, undefined);
		let otherInput = instantiationService.createInstance(TextResourceEditorInput, URI.from({ scheme: 'test', authority: null!, path: 'thePath' }), 'name2', 'description', undefined, undefined);
		let diffInput = instantiationService.createInstance(DiffEditorInput, 'name', 'description', input, otherInput, undefined);

		let model = await diffInput.resolve() as TextDiffEditorModel;

		assert(model);
		assert(model instanceof TextDiffEditorModel);

		let diffEditorModel = model.textDiffEditorModel!;
		assert(diffEditorModel.original);
		assert(diffEditorModel.modified);

		model = await diffInput.resolve() as TextDiffEditorModel;
		assert(model.isResolved());

		assert(diffEditorModel !== model.textDiffEditorModel);
		diffInput.dispose();
		assert(!model.textDiffEditorModel);

		dispose.dispose();
	});
});
