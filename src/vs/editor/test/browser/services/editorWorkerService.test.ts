/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { Proxied } from '../../../../base/common/worker/webWorker.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IWebWorkerService } from '../../../../platform/webWorker/browser/webWorkerService.js';
import { EditorWorkerClient, EditorWorkerService } from '../../../browser/services/editorWorkerService.js';
import { EditorWorker } from '../../../common/services/editorWebWorker.js';
import { IModelService } from '../../../common/services/model.js';
import { ITextResourceConfigurationService } from '../../../common/services/textResourceConfiguration.js';
import { createCodeEditorServices } from '../testCodeEditor.js';

suite('EditorWorkerService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function createServices() {
		const instantiationService = createCodeEditorServices(disposables);
		instantiationService.stub(IWebWorkerService, new class extends mock<IWebWorkerService>() { }());
		instantiationService.stub(ITextResourceConfigurationService, new class extends mock<ITextResourceConfigurationService>() { }());
		const proxy = new class extends mock<Proxied<EditorWorker>>() {
			override $computeDefaultDocumentColors = async () => [];
		}();
		const withResources = sinon.stub(EditorWorkerClient.prototype, 'workerWithSyncedResources').resolves(proxy);
		const disposeWorker = sinon.spy(EditorWorkerClient.prototype, 'dispose');
		const modelService = instantiationService.get(IModelService);
		const service = disposables.add(instantiationService.createInstance(EditorWorkerService));
		return { modelService, service, withResources, disposeWorker };
	}

	test('checks for an empty workspace once per burst of model removals', async () => {
		const { modelService, service, disposeWorker } = createServices();
		const models = Array.from({ length: 200 }, () => disposables.add(modelService.createModel('content', null)));
		await service.computeDefaultDocumentColors(models[0].uri);
		const getModels = sinon.spy(modelService, 'getModels');

		for (const model of models.slice(1)) {
			model.dispose();
		}
		await Promise.resolve();
		const whileNonEmpty = { scans: getModels.callCount, disposed: disposeWorker.callCount };
		models[0].dispose();
		await Promise.resolve();

		assert.deepStrictEqual({
			whileNonEmpty,
			whenEmpty: { scans: getModels.callCount, disposed: disposeWorker.callCount },
		}, {
			whileNonEmpty: { scans: 1, disposed: 0 },
			whenEmpty: { scans: 2, disposed: 1 },
		});
	});

	test('keeps a worker for a replacement model and recreates it after the workspace empties', async () => {
		const { modelService, service, withResources, disposeWorker } = createServices();
		const first = disposables.add(modelService.createModel('first', null));
		await service.computeDefaultDocumentColors(first.uri);
		first.dispose();
		const replacement = disposables.add(modelService.createModel('replacement', null));
		await Promise.resolve();
		const disposalsBeforeReplacementCloses = disposeWorker.callCount;
		replacement.dispose();
		await Promise.resolve();
		const disposalsAfterReplacementCloses = disposeWorker.callCount;
		const reopened = disposables.add(modelService.createModel('reopened', null));
		await service.computeDefaultDocumentColors(reopened.uri);

		assert.deepStrictEqual({
			disposalsBeforeReplacementCloses,
			disposalsAfterReplacementCloses,
			recreated: withResources.firstCall.thisValue !== withResources.lastCall.thisValue,
		}, {
			disposalsBeforeReplacementCloses: 0,
			disposalsAfterReplacementCloses: 1,
			recreated: true,
		});
	});

	test('does not scan models after service disposal', async () => {
		const { modelService, service } = createServices();
		const model = disposables.add(modelService.createModel('content', null));
		await service.computeDefaultDocumentColors(model.uri);
		model.dispose();
		service.dispose();
		const getModels = sinon.spy(modelService, 'getModels');

		await Promise.resolve();

		assert.strictEqual(getModels.callCount, 0);
	});
});
