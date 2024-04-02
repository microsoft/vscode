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
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('TextDiffEditorModel', () => {

	const disposables = new DisposableStore();
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);
	});

	teardown(() => {
		disposables.clear();
	});

	test('basics', async () => {
		disposables.add(accessor.textModelResolverService.registerTextModelContentProvider('test', {
			provideTextContent: async function (resource: URI): Promise<ITextModel | null> {
				if (resource.scheme === 'test') {
					const modelContent = 'Hello Test';
					const languageSelection = accessor.languageService.createById('json');

					return disposables.add(accessor.modelService.createModel(modelContent, languageSelection, resource));
				}

				return null;
			}
		}));

		const input = disposables.add(instantiationService.createInstance(TextResourceEditorInput, URI.from({ scheme: 'test', authority: null!, path: 'thePath' }), 'name', 'description', undefined, undefined));
		const otherInput = disposables.add(instantiationService.createInstance(TextResourceEditorInput, URI.from({ scheme: 'test', authority: null!, path: 'thePath' }), 'name2', 'description', undefined, undefined));
		const diffInput = disposables.add(instantiationService.createInstance(DiffEditorInput, 'name', 'description', input, otherInput, undefined));

		let model = disposables.add(await diffInput.resolve() as TextDiffEditorModel);

		assert(model);
		assert(model instanceof TextDiffEditorModel);

		const diffEditorModel = model.textDiffEditorModel!;
		assert(diffEditorModel.original);
		assert(diffEditorModel.modified);

		model = disposables.add(await diffInput.resolve() as TextDiffEditorModel);
		assert(model.isResolved());

		assert(diffEditorModel !== model.textDiffEditorModel);
		diffInput.dispose();
		assert(!model.textDiffEditorModel);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
