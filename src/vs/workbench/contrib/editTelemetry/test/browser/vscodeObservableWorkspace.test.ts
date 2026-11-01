/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { createCodeEditorServices } from '../../../../../editor/test/browser/testCodeEditor.js';
import { AnnotatedDocuments, UriVisibilityProvider } from '../../browser/helpers/annotatedDocuments.js';
import { VSCodeWorkspace } from '../../browser/helpers/vscodeObservableWorkspace.js';

suite('VSCodeWorkspace', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('coalesces a burst of model removals into one document refresh', async () => {
		const instantiationService = createCodeEditorServices(disposables);
		const modelService = instantiationService.get(IModelService);
		const models = Array.from({ length: 200 }, () => disposables.add(modelService.createModel('content', null)));
		const workspace = disposables.add(instantiationService.createInstance(VSCodeWorkspace));
		instantiationService.stubInstance(UriVisibilityProvider, { isVisible: () => false });
		disposables.add(instantiationService.createInstance(AnnotatedDocuments, workspace));
		let refreshes = 0;
		disposables.add(autorun(reader => {
			workspace.documents.read(reader);
			refreshes++;
		}));
		refreshes = 0;
		const getModels = sinon.spy(modelService, 'getModels');

		await Promise.all(models.map(async model => {
			await Promise.resolve();
			model.dispose();
		}));

		assert.deepStrictEqual({
			scans: getModels.callCount,
			refreshes,
			documents: workspace.documents.get(),
			allDisposed: models.every(model => model.isDisposed()),
		}, {
			scans: 1,
			refreshes: 1,
			documents: [],
			allDisposed: true,
		});
	});

	test('tracks new documents and their edits before a pending removal refresh', async () => {
		const instantiationService = createCodeEditorServices(disposables);
		const modelService = instantiationService.get(IModelService);
		const uri = URI.parse('inmemory://workspace/document');
		const original = disposables.add(modelService.createModel('original', null, uri));
		const workspace = disposables.add(instantiationService.createInstance(VSCodeWorkspace));
		original.dispose();

		const replacement = disposables.add(modelService.createModel('replacement', null, uri));
		const document = workspace.getDocument(uri)!;
		replacement.setValue('edited');
		const immediateValue = document.value.get().value;
		await Promise.resolve();

		assert.deepStrictEqual({
			immediateValue,
			value: workspace.getDocument(uri)?.value.get().value,
			sameDocument: workspace.getDocument(uri) === document,
			documentCount: workspace.documents.get().length,
		}, {
			immediateValue: 'edited',
			value: 'edited',
			sameDocument: true,
			documentCount: 1,
		});
	});

	test('exposes only cached values for a document whose model was just disposed', async () => {
		const instantiationService = createCodeEditorServices(disposables);
		const modelService = instantiationService.get(IModelService);
		const model = disposables.add(modelService.createModel('content', null));
		const workspace = disposables.add(instantiationService.createInstance(VSCodeWorkspace));
		instantiationService.stubInstance(UriVisibilityProvider, { isVisible: () => true });
		const annotated = disposables.add(instantiationService.createInstance(AnnotatedDocuments, workspace));
		const tracker = annotated.documents.get()[0];

		model.dispose();
		const stale = workspace.getDocument(model.uri)!;
		const inWindow = {
			listed: workspace.documents.get().length,
			value: stale.value.get().value,
			version: stale.version.get(),
			languageId: stale.languageId.get(),
			hasTextModel: Object.keys(stale).includes('textModel'),
			trackerListed: annotated.documents.get()[0] === tracker,
		};
		await Promise.resolve();

		assert.deepStrictEqual({
			inWindow,
			afterWindow: { listed: workspace.documents.get().length, trackerListed: annotated.documents.get().length },
		}, {
			inWindow: { listed: 1, value: 'content', version: 1, languageId: 'plaintext', hasTextModel: false, trackerListed: true },
			afterWindow: { listed: 0, trackerListed: 0 },
		});
	});

	test('does not refresh documents after workspace disposal', async () => {
		const instantiationService = createCodeEditorServices(disposables);
		const modelService = instantiationService.get(IModelService);
		const model = disposables.add(modelService.createModel('content', null));
		const workspace = disposables.add(instantiationService.createInstance(VSCodeWorkspace));
		model.dispose();
		workspace.dispose();
		const getModels = sinon.spy(modelService, 'getModels');

		await Promise.resolve();

		assert.strictEqual(getModels.callCount, 0);
	});
});
