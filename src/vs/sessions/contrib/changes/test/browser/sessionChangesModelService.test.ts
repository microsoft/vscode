/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue, ValueWithChangeEventFromObservable, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { createCodeEditorServices } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IMultiDiffSourceResolverService, MultiDiffEditorItem } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ITextFileEditorModelManager, ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionChangesModelService } from '../../browser/sessionChangesModelService.js';
import { SessionChangesEditorInput } from '../../browser/sessionChangesEditorInput.js';
import { ISessionChangesService } from '../../common/sessionChangesService.js';

suite('SessionChangesModelService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createCache(limits = { inputs: 3, textBytes: 16 * 1024 * 1024 }) {
		const reads: string[] = [];
		const released: string[] = [];
		const models = new Map<string, ITextModel>();
		const sources = new Map<string, ISettableObservable<readonly MultiDiffEditorItem[]>>();
		const sourceErrors = new Set<string>();
		const sessionsChanged = disposables.add(new Emitter<ISessionsChangeEvent>());
		const services = new ServiceCollection();
		services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		services.set(ITextModelService, new class extends mock<ITextModelService>() {
			override async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
				reads.push(resource.path);
				const model = createTextModel('body', undefined, undefined, resource);
				models.set(resource.path, model);
				return {
					object: new class extends mock<IResolvedTextEditorModel>() {
						override readonly textEditorModel = model;
						override isReadonly() { return false; }
					},
					dispose: () => {
						released.push(resource.path);
						model.dispose();
					},
				};
			}
		});
		services.set(ITextResourceConfigurationService, new class extends mock<ITextResourceConfigurationService>() {
			override readonly onDidChangeConfiguration = Event.None;
			override getValue<T>(): T { return {} as T; }
		});
		services.set(ITextFileService, new class extends mock<ITextFileService>() {
			override readonly files = new class extends mock<ITextFileEditorModelManager>() {
				override readonly onDidChangeDirty = Event.None;
			};
		});
		services.set(IMultiDiffSourceResolverService, new class extends mock<IMultiDiffSourceResolverService>() {
			override async resolve(resource: URI) {
				if (sourceErrors.has(resource.path)) {
					throw new Error('Cannot resolve changes');
				}
				let source = sources.get(resource.path);
				if (!source) {
					source = observableValue<readonly MultiDiffEditorItem[]>('files', [
						new MultiDiffEditorItem(undefined, URI.file(`/workspace/${resource.path}.ts`), undefined),
					]);
					sources.set(resource.path, source);
				}
				return { resources: new ValueWithChangeEventFromObservable(source), loadOnDemand: true };
			}
		});
		const instantiationService = createCodeEditorServices(disposables, services);
		const cache = disposables.add(new SessionChangesModelService(
			limits,
			instantiationService,
			new class extends mock<ISessionChangesService>() {
				override getSessionResource(resource: URI) { return resource; }
			},
			new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessions = sessionsChanged.event;
			},
		));
		const open = async (name: string) => {
			const reference = disposables.add(cache.acquire(URI.parse(`changes:${name}`)));
			const viewModel = await reference.object.getViewModel();
			const row = disposables.add(viewModel.items.get()[0].acquire());
			await row.object;
			row.dispose();
			return { reference, viewModel };
		};
		return { cache, open, reads, released, models, sources, sourceErrors, sessionsChanged };
	}

	test('reuses resolved file contents across sixty switches between three sessions', async () => {
		const { cache, reads, released } = createCache();
		const sessionChangesService = new class extends mock<ISessionChangesService>() {
			override readonly activeSessionUncommittedChangesCountObs = constObservable(1);
		};
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
		};
		for (let i = 0; i < 20; i++) {
			for (const name of ['a', 'b', 'c']) {
				const input = disposables.add(new SessionChangesEditorInput(URI.parse(`changes:${name}`), cache, sessionChangesService, layoutService));
				const viewModel = await input.getViewModel();
				const row = disposables.add(viewModel.items.get()[0].acquire());
				await row.object;
				row.dispose();
				input.clear();
				input.dispose();
			}
		}
		assert.deepStrictEqual({ reads, released }, {
			reads: ['/workspace/a.ts', '/workspace/b.ts', '/workspace/c.ts'],
			released: [],
		});
	});

	test('evicts the least recently used inactive model', async () => {
		const { open, reads, released } = createCache({ inputs: 2, textBytes: 1024 });
		for (const name of ['a', 'b', 'a', 'c', 'b']) {
			(await open(name)).reference.dispose();
		}
		assert.deepStrictEqual({ reads, released }, {
			reads: ['/workspace/a.ts', '/workspace/b.ts', '/workspace/c.ts', '/workspace/b.ts'],
			released: ['/workspace/b.ts', '/workspace/a.ts'],
		});
	});

	test('never evicts a model with a live lease', async () => {
		const { cache, open, released } = createCache({ inputs: 0, textBytes: 0 });
		const { reference } = await open('a');
		const second = disposables.add(cache.acquire(URI.parse('changes:a')));
		reference.dispose();
		const beforeLastRelease = reference.object.isDisposed();
		second.dispose();
		assert.deepStrictEqual({ beforeLastRelease, afterLastRelease: reference.object.isDisposed(), released }, {
			beforeLastRelease: false,
			afterLastRelease: true,
			released: ['/workspace/a.ts'],
		});
	});

	test('evicts retained text that grows beyond the byte budget', async () => {
		const { open, models, released } = createCache({ inputs: 3, textBytes: 16 });
		const { reference } = await open('a');
		reference.dispose();
		const model = models.get('/workspace/a.ts');
		assert.ok(model);
		model.setValue('large file contents');
		assert.deepStrictEqual({ inputDisposed: reference.object.isDisposed(), released }, {
			inputDisposed: true, released: ['/workspace/a.ts'],
		});
	});

	test('keeps live contents and follows changeset resource updates', async () => {
		const { open, models, sources, reads } = createCache();
		const first = await open('a');
		const model = models.get('/workspace/a.ts');
		assert.ok(model);
		model.setValue('updated');
		const currentText = first.viewModel.items.get()[0].documentDiffItem.modified?.textModel?.getValue();
		first.reference.dispose();
		const source = sources.get('a');
		assert.ok(source);
		source.set([new MultiDiffEditorItem(undefined, URI.file('/workspace/renamed.ts'), undefined)], undefined);
		await waitForState(first.viewModel.items, items => items[0]?.modifiedUri?.path === '/workspace/renamed.ts');
		const next = await open('a');
		assert.deepStrictEqual({
			currentText,
			sameModel: next.viewModel === first.viewModel,
			reads,
			newFile: next.viewModel.items.get()[0].modifiedUri?.path,
		}, { currentText: 'updated', sameModel: true, reads: ['/workspace/a.ts', '/workspace/renamed.ts'], newFile: '/workspace/renamed.ts' });
	});

	test('removes archived and deleted sessions from the idle cache', async () => {
		const { open, sessionsChanged, released } = createCache();
		const first = await open('a');
		const second = await open('b');
		first.reference.dispose();
		second.reference.dispose();
		const session = (name: string, archived: boolean) => new class extends mock<ISession>() {
			override readonly resource = URI.parse(`changes:${name}`);
			override readonly isArchived = constObservable(archived);
		};
		sessionsChanged.fire({ added: [], removed: [session('a', false)], changed: [session('b', true)] });
		assert.deepStrictEqual(released, ['/workspace/a.ts', '/workspace/b.ts']);
	});

	test('defers disposal of a removed session until its last lease is released', async () => {
		const { cache, open, sessionsChanged, released } = createCache();
		const first = await open('a');
		const second = disposables.add(cache.acquire(URI.parse('changes:a')));
		sessionsChanged.fire({
			added: [], changed: [],
			removed: [new class extends mock<ISession>() {
				override readonly resource = URI.parse('changes:a');
			}],
		});
		first.reference.dispose();
		const whileLeased = released.length;
		second.dispose();
		assert.deepStrictEqual({ whileLeased, released }, { whileLeased: 0, released: ['/workspace/a.ts'] });
	});

	test('does not retain unresolved or failed model inputs', async () => {
		const { cache, open, sourceErrors } = createCache();
		const unresolved = disposables.add(cache.acquire(URI.parse('changes:a')));
		unresolved.dispose();
		const failed = disposables.add(cache.acquire(URI.parse('changes:b')));
		sourceErrors.add('b');
		await assert.rejects(failed.object.getViewModel(), /Cannot resolve changes/);
		failed.dispose();
		sourceErrors.clear();
		const retried = await open('b');
		assert.deepStrictEqual({
			unresolvedDisposed: unresolved.object.isDisposed(),
			failedDisposed: failed.object.isDisposed(),
			newInput: retried.reference.object !== failed.object,
		}, { unresolvedDisposed: true, failedDisposed: true, newInput: true });
	});
});
