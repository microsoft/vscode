/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProgress, IProgressService, IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatEditingService } from '../../../chat/common/editing/chatEditingService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IResolvedTextFileEditorModel, ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { QuickDiffModelService } from '../../browser/quickDiffModel.js';
import { IQuickDiffService, QuickDiff } from '../../common/quickDiff.js';
import { ISCMService } from '../../common/scm.js';

suite('QuickDiffModelService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(disposables: DisposableStore) {
		const textFileModels = new ResourceMap<IResolvedTextFileEditorModel>();
		const quickDiffRequests: string[] = [];
		const onDidChangeQuickDiffProviders = disposables.add(new Emitter<void>());

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ITextFileService, upcastPartial<ITextFileService>({
			files: upcastPartial<ITextFileService['files']>({ get: (resource: URI) => textFileModels.get(resource) })
		}));
		instantiationService.stub(IUriIdentityService, new class extends mock<IUriIdentityService>() {
			override asCanonicalUri(uri: URI): URI { return uri; }
		}());
		instantiationService.stub(ISCMService, new class extends mock<ISCMService>() {
			override readonly repositories = [];
			override readonly onDidAddRepository = Event.None;
			override readonly onDidRemoveRepository = Event.None;
		}());
		instantiationService.stub(IQuickDiffService, new class extends mock<IQuickDiffService>() {
			override readonly onDidChangeQuickDiffProviders = onDidChangeQuickDiffProviders.event;
			override async getQuickDiffs(uri: URI): Promise<QuickDiff[]> {
				quickDiffRequests.push(uri.path);
				return [];
			}
		}());
		instantiationService.stub(IChatEditingService, new class extends mock<IChatEditingService>() {
			override readonly editingSessionsObs = constObservable([]);
		}());
		instantiationService.stub(IProgressService, new class extends mock<IProgressService>() {
			override withProgress<R>(_options: unknown, task: (progress: IProgress<IProgressStep>) => Promise<R>): Promise<R> {
				return task({ report: () => { } });
			}
		}());
		instantiationService.stub(IEditorWorkerService, new class extends mock<IEditorWorkerService>() { }());
		instantiationService.stub(ITextModelService, new class extends mock<ITextModelService>() { }());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly isSessionsWindow = false;
		}());

		const service = disposables.add(instantiationService.createInstance(QuickDiffModelService));

		const addTextFileModel = (path: string) => {
			const resource = URI.file(path);
			const onWillDispose = disposables.add(new Emitter<void>());
			let disposed = false;
			const textEditorModel = disposables.add(createTextModel('hello', null, undefined, resource));
			const textFileModel = new class extends mock<IResolvedTextFileEditorModel>() {
				override readonly resource = resource;
				override readonly textEditorModel = textEditorModel;
				override readonly onDidChangeEncoding = Event.None;
				override readonly onWillDispose = onWillDispose.event;
				override isResolved(): this is IResolvedTextFileEditorModel { return true; }
				override isDisposed(): boolean { return disposed; }
				override getLanguageId(): string { return 'plaintext'; }
			}();
			textFileModels.set(resource, textFileModel);

			return {
				resource,
				dispose: () => {
					onWillDispose.fire();
					disposed = true;
					textFileModels.delete(resource);
				}
			};
		};

		return { service, addTextFileModel, quickDiffRequests, onDidChangeQuickDiffProviders };
	}

	test('reuses a released model, and only asks the quick diff providers again if something changed meanwhile', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const disposables = store.add(new DisposableStore());
		const { service, addTextFileModel, quickDiffRequests, onDidChangeQuickDiffProviders } = createService(disposables);
		const { resource } = addTextFileModel('/repo/file.txt');
		const requests: number[] = [];

		const reference1 = service.createQuickDiffModelReference(resource)!;
		await timeout(1000);
		requests.push(quickDiffRequests.length);
		reference1.dispose();

		// Showing the editor again (ex: switching back to its tab)
		const reference2 = service.createQuickDiffModelReference(resource)!;
		await timeout(1000);
		requests.push(quickDiffRequests.length);
		reference2.dispose();

		// Something changes while no editor shows the model
		onDidChangeQuickDiffProviders.fire();
		await timeout(1000);
		requests.push(quickDiffRequests.length);

		const reference3 = service.createQuickDiffModelReference(resource)!;
		await timeout(1000);
		requests.push(quickDiffRequests.length);
		reference3.dispose();

		assert.deepStrictEqual({
			reused: [reference2.object === reference1.object, reference3.object === reference1.object],
			requests
		}, {
			reused: [true, true],
			requests: [1, 1, 1, 2]
		});
	}));

	test('disposes released models when their text file model is disposed, after a while, and when too many are kept', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const disposables = store.add(new DisposableStore());
		const { service, addTextFileModel } = createService(disposables);

		const isReusedAfter = async (path: string, release: (file: ReturnType<typeof addTextFileModel>) => Promise<unknown> | void) => {
			const file = addTextFileModel(path);
			const reference = service.createQuickDiffModelReference(file.resource)!;
			reference.dispose();
			await release(file);
			const newReference = service.createQuickDiffModelReference(file.resource)!;
			newReference.dispose();
			return newReference.object === reference.object;
		};

		assert.deepStrictEqual({
			// Closing and opening the file again
			textFileModelDisposed: await isReusedAfter('/repo/a.txt', file => { file.dispose(); addTextFileModel('/repo/a.txt'); }),
			shortlyAfter: await isReusedAfter('/repo/b.txt', () => timeout(1000)),
			longAfter: await isReusedAfter('/repo/c.txt', () => timeout(60 * 1000)),
			tooManyKept: await isReusedAfter('/repo/d.txt', () => {
				for (let i = 0; i < 10; i++) {
					service.createQuickDiffModelReference(addTextFileModel(`/repo/other${i}.txt`).resource)!.dispose();
				}
			})
		}, {
			textFileModelDisposed: false,
			shortlyAfter: true,
			longAfter: false,
			tooManyKept: false
		});
	}));
});
