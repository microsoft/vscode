/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, IWaitUntilData } from '../../../../../base/common/event.js';
import { extUriIgnorePathCase, joinPath } from '../../../../../base/common/resources.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { IBulkEditService, ResourceFileEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileChangesEvent, FileChangeType, FileOperation, FileOperationEvent } from '../../../../../platform/files/common/files.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { Progress } from '../../../../../platform/progress/common/progress.js';
import { UndoRedoGroup } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { IEditableData } from '../../../../common/views.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkingCopyFileService, WorkingCopyFileEvent } from '../../../../services/workingCopy/common/workingCopyFileService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { createFileStat, NullFilesConfigurationService, TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { ExplorerService } from '../../browser/explorerService.js';
import { IExplorerView } from '../../browser/files.js';
import { ExplorerItem, NewExplorerItem } from '../../common/explorerModel.js';
import { SESSIONS_FILES_VIEW_ID, VIEW_ID } from '../../common/files.js';
import { BulkFileEdits } from '../../../bulkEdit/browser/bulkFileEdits.js';

suite('Files - ExplorerService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let explorerService: ExplorerService;
	let focusChanged: Emitter<boolean>;
	let fileService: TestFileService;
	let item: NewExplorerItem;
	let calls: string[];
	let focusDuringRender: boolean;

	const editableData: IEditableData = {
		validationMessage: () => null,
		onFinish: async () => { },
	};

	setup(() => {
		calls = [];
		focusDuringRender = false;
		focusChanged = store.add(new Emitter<boolean>());
		fileService = store.add(new TestFileService());
		const configurationService = new TestConfigurationService({ explorer: { autoReveal: false } });
		const instantiationService = workbenchInstantiationService({
			fileService: () => fileService,
			configurationService: () => configurationService,
		}, store);
		instantiationService.stub(IHostService, { onDidChangeFocus: focusChanged.event });
		instantiationService.stub(IBulkEditService, {});
		explorerService = store.add(instantiationService.createInstance(ExplorerService));
		explorerService.registerView(new class extends mock<IExplorerView>() {
			override async setEditable(_stat: ExplorerItem, isEditing: boolean): Promise<void> {
				calls.push(isEditing ? 'start editing' : 'finish editing');
				if (isEditing && focusDuringRender) {
					focusChanged.fire(true);
				}
			}
			override async refresh(): Promise<void> {
				calls.push('refresh');
			}
			override hasPhantomElements(): boolean {
				return false;
			}
			override isItemVisible(): boolean {
				return true;
			}
		});
		const root = explorerService.roots[0];
		item = new NewExplorerItem(fileService, configurationService, NullFilesConfigurationService, root, false);
		root.addChild(item);
	});

	suite('move batches', () => {
		let service: ExplorerService;
		let fileService: TestFileService;
		let configuration: TestConfigurationService;
		let willRun: Emitter<WorkingCopyFileEvent>;
		let didRun: Emitter<WorkingCopyFileEvent>;
		let didFail: Emitter<WorkingCopyFileEvent>;
		let source: ExplorerItem;
		let target: ExplorerItem;
		let refreshes: { name: string | undefined; recursive: boolean }[];
		let refresh: (() => Promise<void>) | undefined;
		let correlationId: number;
		let instantiation: ReturnType<typeof workbenchInstantiationService>;

		function add(parent: ExplorerItem, name: string, directory = false): ExplorerItem {
			const item = new ExplorerItem(joinPath(parent.resource, name), fileService, configuration, NullFilesConfigurationService, parent, directory);
			item._isDirectoryResolved = directory;
			parent.addChild(item);
			return item;
		}

		function moveEvent(item: ExplorerItem, parent = target, name = item.name): FileOperationEvent {
			const stat = createFileStat(joinPath(parent.resource, name), false, !item.isDirectory, item.isDirectory);
			return new FileOperationEvent(item.resource, FileOperation.MOVE, stat);
		}

		function batch(events: FileOperationEvent[]): IWaitUntilData<WorkingCopyFileEvent> {
			return {
				correlationId: correlationId++,
				operation: FileOperation.MOVE,
				files: events.map(event => ({ source: event.resource, target: event.target!.resource }))
			};
		}

		async function fire(emitter: Emitter<WorkingCopyFileEvent>, event: IWaitUntilData<WorkingCopyFileEvent>): Promise<void> {
			const promises: Promise<unknown>[] = [];
			emitter.fire({ ...event, token: CancellationToken.None, waitUntil: promise => promises.push(promise) });
			await Promise.all(promises);
		}

		setup(() => {
			refreshes = [];
			refresh = undefined;
			correlationId = 0;
			fileService = store.add(new TestFileService());
			configuration = new TestConfigurationService({ explorer: { autoReveal: false, fileNesting: { enabled: false } } });
			willRun = store.add(new Emitter<WorkingCopyFileEvent>());
			didRun = store.add(new Emitter<WorkingCopyFileEvent>());
			didFail = store.add(new Emitter<WorkingCopyFileEvent>());
			instantiation = workbenchInstantiationService({
				fileService: () => fileService,
				configurationService: () => configuration,
			}, store);
			instantiation.stub(IWorkingCopyFileService, {
				onWillRunWorkingCopyFileOperation: willRun.event,
				onDidRunWorkingCopyFileOperation: didRun.event,
				onDidFailWorkingCopyFileOperation: didFail.event,
			});
			instantiation.stub(IUriIdentityService, { extUri: extUriIgnorePathCase });
			service = store.add(instantiation.createInstance(ExplorerService));
			service.registerView(new class extends mock<IExplorerView>() {
				override async refresh(recursive: boolean, item?: ExplorerItem): Promise<void> {
					refreshes.push({ name: item?.name, recursive });
					await refresh?.();
				}
				override hasPhantomElements(): boolean { return false; }
				override isItemVisible(): boolean { return true; }
				override focusNext(): void { }
				override getFocus(): ExplorerItem[] { return [source]; }
			});
			source = add(service.roots[0], 'source', true);
			target = add(service.roots[0], 'target', true);
		});

		test('updates every model entry immediately and refreshes each parent once at completion', async () => {
			const events = Array.from({ length: 32 }, (_, index) => moveEvent(add(source, `file${index}.ts`)));
			const operation = batch(events);
			await fire(willRun, operation);
			for (const event of events) {
				fileService.fireAfterOperation(event);
			}
			const during = { source: source.children.size, target: target.children.size, refreshes: [...refreshes] };
			await fire(didRun, operation);

			assert.deepStrictEqual({ during, refreshes }, {
				during: { source: 0, target: 32, refreshes: [] },
				refreshes: [{ name: 'source', recursive: false }, { name: 'target', recursive: false }],
			});
		});

		test('joins asynchronous operation continuations and the final refresh', async () => {
			const nestedParent = add(source, 'nest.ts');
			const child = add(source, 'child.ts');
			child.nestedParent = nestedParent;
			const events = [moveEvent(child), moveEvent(add(source, 'other.ts'))];
			const operation = batch(events);
			await fire(willRun, operation);
			const rendered = new DeferredPromise<void>();
			refresh = () => rendered.p;
			events.forEach(event => fileService.fireAfterOperation(event));
			let finished = false;
			const completion = fire(didRun, operation).then(() => finished = true);
			await timeout(0);
			const beforeRender = finished;
			await rendered.complete();
			await completion;

			assert.deepStrictEqual({ beforeRender, finished, refreshes }, {
				beforeRender: false,
				finished: true,
				refreshes: [{ name: 'nest.ts', recursive: false }, { name: 'source', recursive: false }, { name: 'target', recursive: false }],
			});
		});

		for (const finishNestedFirst of [false, true]) {
			test(`keeps overlapping batches independent (nested finishes first: ${finishNestedFirst})`, async () => {
				const third = add(service.roots[0], 'third', true);
				const first = [moveEvent(add(source, 'a')), moveEvent(add(source, 'b'))];
				const second = [moveEvent(add(source, 'c'), third), moveEvent(add(source, 'd'), third)];
				const operations = [batch(first), batch(second)];
				await fire(willRun, operations[0]);
				await fire(willRun, operations[1]);
				first.forEach(event => fileService.fireAfterOperation(event));
				second.forEach(event => fileService.fireAfterOperation(event));
				const order = finishNestedFirst ? [1, 0] : [0, 1];
				await fire(didRun, operations[order[0]]);
				const intermediate = [...refreshes];
				await fire(didRun, operations[order[1]]);

				assert.deepStrictEqual({ intermediate, refreshes, counts: [source.children.size, target.children.size, third.children.size] }, {
					intermediate: [{ name: 'source', recursive: false }, { name: finishNestedFirst ? 'third' : 'target', recursive: false }],
					refreshes: order.flatMap(index => [{ name: 'source', recursive: false }, { name: index ? 'third' : 'target', recursive: false }]),
					counts: [0, 2, 2],
				});
			});
		}

		test('flushes partial failures and handles later events without a batch', async () => {
			const events = [moveEvent(add(source, 'a')), moveEvent(add(source, 'b'))];
			const operation = batch(events);
			await fire(willRun, operation);
			fileService.fireAfterOperation(events[0]);
			await fire(didFail, operation);
			const afterFailure = [...refreshes];
			fileService.fireAfterOperation(events[1]);
			await timeout(0);

			assert.deepStrictEqual({ afterFailure, refreshes, names: [...target.children.keys()].sort() }, {
				afterFailure: [{ name: 'source', recursive: false }, { name: 'target', recursive: false }],
				refreshes: [false, false].flatMap(() => [{ name: 'source', recursive: false }, { name: 'target', recursive: false }]),
				names: ['a', 'b'],
			});
		});

		test('does not retain an empty failed batch or delay single-file moves', async () => {
			const events = [moveEvent(add(source, 'a')), moveEvent(add(source, 'b'))];
			const cancelled = batch(events);
			await fire(willRun, cancelled);
			await fire(didFail, cancelled);
			const single = batch([events[0]]);
			await fire(willRun, single);
			fileService.fireAfterOperation(events[0]);
			const immediate = [...refreshes];
			await fire(didRun, single);
			await timeout(0);

			assert.deepStrictEqual({ immediate, refreshes }, {
				immediate: [{ name: 'source', recursive: false }],
				refreshes: [{ name: 'source', recursive: false }, { name: 'target', recursive: false }],
			});
		});

		for (const failure of [false, true]) {
			test(`finishes Explorer updates before a bulk edit ${failure ? 'rejects a partial failure' : 'stops on cancellation'}`, async () => {
				const tokenSource = store.add(new CancellationTokenSource());
				const error = new Error('move failed');
				const events = [moveEvent(add(source, 'a')), moveEvent(add(source, 'b'))];
				instantiation.stub(IWorkingCopyFileService, {
					move: async operations => {
						const operation = batch(events);
						await fire(willRun, operation);
						for (const { file } of operations) {
							fileService.fireAfterOperation(new FileOperationEvent(file.source, FileOperation.MOVE, createFileStat(file.target)));
							if (failure) {
								await fire(didFail, operation);
								throw error;
							}
						}
						tokenSource.cancel();
						await fire(didRun, operation);
						return operations.map(operation => createFileStat(operation.file.target));
					},
					copy: async () => assert.fail('The next operation group must not run'),
				});
				const edits = [
					...events.map(event => new ResourceFileEdit(event.resource, event.target!.resource)),
					new ResourceFileEdit(joinPath(source.resource, 'copy'), joinPath(target.resource, 'copy'), { copy: true }),
				];
				const bulk = instantiation.createInstance(BulkFileEdits, 'Move', 'move', new UndoRedoGroup(), undefined, false, Progress.None, tokenSource.token, edits);
				if (failure) {
					await assert.rejects(bulk.apply(), candidate => candidate === error);
				} else {
					await bulk.apply();
				}

				assert.deepStrictEqual({ source: [...source.children.keys()], target: [...target.children.keys()], refreshes }, {
					source: failure ? ['b'] : [],
					target: failure ? ['a'] : ['a', 'b'],
					refreshes: [{ name: 'source', recursive: false }, { name: 'target', recursive: false }],
				});
			});
		}

		test('matches file operation resources using URI identity', async () => {
			const events = [moveEvent(add(source, 'a')), moveEvent(add(source, 'b'))];
			const operation = batch(events);
			await fire(willRun, {
				...operation, files: operation.files.map(file => ({
					source: file.source!.with({ path: file.source!.path.toUpperCase() }),
					target: file.target.with({ path: file.target.path.toUpperCase() }),
				}))
			});
			events.forEach(event => fileService.fireAfterOperation(event));
			const during = [...refreshes];
			await fire(didRun, operation);

			assert.deepStrictEqual({ during, refreshes }, {
				during: [],
				refreshes: [{ name: 'source', recursive: false }, { name: 'target', recursive: false }],
			});
		});

		test('joins matching events to every overlapping operation', async () => {
			const events = [moveEvent(add(source, 'a')), moveEvent(add(source, 'b'))];
			const first = batch(events);
			const second = batch(events);
			await fire(willRun, first);
			await fire(willRun, second);
			events.forEach(event => fileService.fireAfterOperation(event));
			await fire(didRun, second);
			const firstCompletion = [...refreshes];
			await fire(didFail, first);

			assert.deepStrictEqual({ firstCompletion, refreshes }, {
				firstCompletion: [{ name: 'source', recursive: false }, { name: 'target', recursive: false }],
				refreshes: [false, false].flatMap(() => [{ name: 'source', recursive: false }, { name: 'target', recursive: false }]),
			});
		});

		test('refreshes distinct model parents even when they represent the same URI', async () => {
			const duplicateRoot = new ExplorerItem(service.roots[0].resource, fileService, configuration, NullFilesConfigurationService, undefined, true);
			service.roots.push(duplicateRoot);
			const duplicateSource = add(duplicateRoot, 'source', true);
			const duplicateTarget = add(duplicateRoot, 'target', true);
			const events = ['a', 'b'].map(name => {
				add(duplicateSource, name);
				return moveEvent(add(source, name));
			});
			const operation = batch(events);
			await fire(willRun, operation);
			events.forEach(event => fileService.fireAfterOperation(event));
			await fire(didRun, operation);

			assert.deepStrictEqual({
				counts: [source.children.size, target.children.size, duplicateSource.children.size, duplicateTarget.children.size],
				refreshes,
			}, {
				counts: [0, 2, 0, 2],
				refreshes: [
					{ name: 'source', recursive: false }, { name: 'source', recursive: false },
					{ name: 'target', recursive: false }, { name: 'target', recursive: false },
				],
			});
		});

		test('preserves folder descendants, renames and recursive nesting refreshes', async () => {
			configuration.getValue<{ fileNesting: { enabled: boolean } }>('explorer')!.fileNesting.enabled = true;
			const folder = add(source, 'folder', true);
			const descendant = add(folder, 'child.ts');
			const events = [moveEvent(add(source, 'old.ts'), source, 'new.ts'), moveEvent(folder)];
			const operation = batch(events);
			await fire(willRun, operation);
			events.forEach(event => fileService.fireAfterOperation(event));
			await fire(didRun, operation);

			assert.deepStrictEqual({
				source: [...source.children.keys()],
				target: [...target.children.keys()],
				descendant: descendant.resource.path,
				refreshes
			}, {
				source: ['new.ts'],
				target: ['folder'],
				descendant: joinPath(target.resource, 'folder', 'child.ts').path,
				refreshes: [{ name: 'source', recursive: true }, { name: 'target', recursive: true }],
			});
		});

		test('keeps copy, delete and external file changes responsive during a move batch', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const events = [moveEvent(add(source, 'a')), moveEvent(add(source, 'b'))];
			const operation = batch(events);
			await fire(willRun, operation);
			const copy = moveEvent(add(source, 'copy'));
			fileService.fireAfterOperation(new FileOperationEvent(copy.resource, FileOperation.COPY, copy.target!));
			await timeout(0);
			fileService.fireAfterOperation(new FileOperationEvent(copy.target!.resource, FileOperation.DELETE));
			await timeout(0);
			fileService.fireFileChanges(new FileChangesEvent([{ resource: joinPath(source.resource, 'external'), type: FileChangeType.ADDED }], false));
			await timeout(500);
			await fire(didFail, operation);

			assert.deepStrictEqual(refreshes, [
				{ name: 'target', recursive: false },
				{ name: 'target', recursive: false },
				{ name: undefined, recursive: true },
			]);
		}));

		test('attempts every parent refresh and releases failed batch state', async () => {
			const events = [moveEvent(add(source, 'a')), moveEvent(add(source, 'b'))];
			const operation = batch(events);
			await fire(willRun, operation);
			events.forEach(event => fileService.fireAfterOperation(event));
			const error = new Error('refresh failed');
			refresh = async () => { throw error; };
			await assert.rejects(fire(didRun, operation), candidate => candidate === error);
			refresh = undefined;
			const afterFailure = [...refreshes];
			fileService.fireAfterOperation(moveEvent(add(source, 'late')));
			await timeout(0);

			assert.deepStrictEqual({ afterFailure, refreshes }, {
				afterFailure: [{ name: 'source', recursive: false }, { name: 'target', recursive: false }],
				refreshes: [false, false].flatMap(() => [{ name: 'source', recursive: false }, { name: 'target', recursive: false }]),
			});
		});

		test('disposal clears pending batches and prevents asynchronous refresh continuations', async () => {
			const child = add(source, 'child');
			child.nestedParent = add(source, 'nest');
			const events = [moveEvent(child), moveEvent(add(source, 'other'))];
			const operation = batch(events);
			await fire(willRun, operation);
			events.forEach(event => fileService.fireAfterOperation(event));
			service.dispose();
			await fire(didRun, operation);
			await timeout(0);
			fileService.fireAfterOperation(moveEvent(add(source, 'late')));
			await timeout(0);

			assert.deepStrictEqual(refreshes, []);
		});

		test('disposal during a flush prevents further view work', async () => {
			const events = [moveEvent(add(source, 'a')), moveEvent(add(source, 'b'))];
			const operation = batch(events);
			await fire(willRun, operation);
			events.forEach(event => fileService.fireAfterOperation(event));
			refresh = async () => service.dispose();
			await fire(didRun, operation);

			assert.deepStrictEqual(refreshes, [{ name: 'source', recursive: false }]);
		});
	});

	for (const isSessionsWindow of [false, true]) {
		test(`derives the view id from the application before and after view creation (sessions: ${isSessionsWindow})`, () => {
			const instantiation = workbenchInstantiationService({
				fileService: () => fileService,
				configurationService: () => new TestConfigurationService({ explorer: { autoReveal: false } }),
			}, store);
			instantiation.stub(IWorkbenchEnvironmentService, { isSessionsWindow });
			const service = store.add(instantiation.createInstance(ExplorerService));
			const before = service.getViewId();
			service.registerView(new class extends mock<IExplorerView>() {
				override readonly id = 'registered.explorer';
			});
			const expected = isSessionsWindow ? SESSIONS_FILES_VIEW_ID : VIEW_ID;
			assert.deepStrictEqual({ before, after: service.getViewId() }, { before: expected, after: expected });
		});
	}

	test('refreshes on window focus when not editing', () => {
		focusChanged.fire(false);
		const afterBlur = [...calls];
		focusChanged.fire(true);

		assert.deepStrictEqual({ afterBlur, afterFocus: calls }, { afterBlur: [], afterFocus: ['refresh'] });
	});

	for (const focusBeforeRender of [true, false]) {
		test(`defers focus refresh ${focusBeforeRender ? 'before' : 'after'} rendering the input`, async () => {
			focusDuringRender = focusBeforeRender;
			await explorerService.setEditable(item, editableData);
			if (!focusBeforeRender) {
				focusChanged.fire(true);
			}
			const whileEditing = {
				calls: [...calls],
				editable: explorerService.isEditable(item),
				children: [...explorerService.roots[0].children.values()],
			};

			await explorerService.setEditable(item, null);

			assert.deepStrictEqual({ whileEditing, calls, editable: explorerService.isEditable(undefined) }, {
				whileEditing: { calls: ['start editing'], editable: true, children: [item] },
				calls: ['start editing', 'finish editing', 'refresh'],
				editable: false,
			});
		});
	}

	test('coalesces deferred focus refreshes and clears them after editing', async () => {
		await explorerService.setEditable(item, editableData);
		focusChanged.fire(true);
		focusChanged.fire(false);
		focusChanged.fire(true);
		await explorerService.setEditable(item, null);
		await explorerService.setEditable(item, editableData);
		focusChanged.fire(false);
		await explorerService.setEditable(item, null);

		assert.deepStrictEqual(calls, ['start editing', 'finish editing', 'refresh', 'start editing', 'finish editing']);
	});

	test('still allows an explicit refresh while editing', async () => {
		await explorerService.setEditable(item, editableData);
		await explorerService.refresh(false);

		assert.deepStrictEqual(calls, ['start editing', 'refresh']);
	});

	test('defers file changes that were already queued when editing started', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		fileService.fireFileChanges(new FileChangesEvent([{ resource: joinPath(explorerService.roots[0].resource, 'external.txt'), type: FileChangeType.ADDED }], false));
		await explorerService.setEditable(item, editableData);
		await timeout(500);
		const whileEditing = [...calls];

		await explorerService.setEditable(item, null);
		await timeout(500);

		assert.deepStrictEqual({ whileEditing, calls }, {
			whileEditing: ['start editing'],
			calls: ['start editing', 'finish editing', 'refresh'],
		});
	}));
});
