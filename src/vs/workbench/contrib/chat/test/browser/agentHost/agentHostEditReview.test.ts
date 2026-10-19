/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IReference } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { constObservable, observableValue, waitForState } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { EditOperation } from '../../../../../../editor/common/core/editOperation.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { EditSources } from '../../../../../../editor/common/textModelEditSource.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { FileChangesEvent, FileChangeType, IFileContent, IFileService } from '../../../../../../platform/files/common/files.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IAutoSaveConfiguration, IFilesConfigurationService } from '../../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IResolvedTextFileEditorModel, ITextFileEditorModelManager, ITextFileSaveOptions, ITextFileService } from '../../../../../services/textfile/common/textfiles.js';
import { IWorkingCopyService } from '../../../../../services/workingCopy/common/workingCopyService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IAiEditTelemetryService } from '../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { TestWorkerService } from '../../../../inlineChat/test/browser/testWorkerService.js';
import { INotebookService } from '../../../../notebook/common/notebookService.js';
import { AgentHostEditReview } from '../../../browser/agentSessions/agentHost/agentHostEditReview.js';
import { ChatEditingModifiedDocumentEntry } from '../../../browser/chatEditing/chatEditingModifiedDocumentEntry.js';
import { IChatExternalEdit, IChatService, IChatUserActionEvent } from '../../../common/chatService/chatService.js';
import { IChatEditingService, IChatEditReviewSession, IModifiedFileEntry, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';

suite('AgentHostEditReview', () => {

	const store = new DisposableStore();
	const chatSessionResource = URI.parse('agent-host-copilot:/session');
	let review: AgentHostEditReview;
	let modelService: IModelService;
	let models: ResourceMap<ITextModel>;
	/** File contents on disk, which the agent writes and saves update. */
	let disk: ResourceMap<string>;
	/** Content of the before snapshots the agent host reports. */
	let snapshots: ResourceMap<string>;
	let saves: string[];
	let deletes: string[];
	/** Document encodings other than UTF-8. */
	let encodings: ResourceMap<string>;
	/** Runs while a before snapshot is read, as the user and other chats go on. */
	let onSnapshotRead: ((resource: URI) => void) | undefined;
	/** Runs while the existence of a file is checked. */
	let onExists: ((resource: URI) => void) | undefined;
	let onDidFilesChange: Emitter<FileChangesEvent>;
	/** Other URIs of the same files, like on a case insensitive file system. */
	let aliases: ResourceMap<URI>;
	/** Files with unsaved changes in editors other than text editors. */
	let dirtyWorkingCopies: ResourceMap<true>;
	let instantiationService: TestInstantiationService;
	const otherSessions = observableValue<readonly IChatEditReviewSession[]>('otherSessions', []);

	function canonical(resource: URI): URI {
		return aliases.get(resource) ?? resource;
	}

	/** Like a text file model, whose document has unsaved changes. */
	function isDirty(resource: URI): boolean {
		return models.has(resource) && getModel(resource).getValue() !== disk.get(resource);
	}

	function getModel(resource: URI): ITextModel {
		let model = models.get(resource);
		if (!model) {
			model = store.add(modelService.createModel(disk.get(resource) ?? '', null, resource, false));
			models.set(resource, model);
		}
		return model;
	}

	/** The agent writes a file, and an open editor reloads it from disk like a text file model does. */
	function agentWrites(resource: URI, content: string): void {
		disk.set(resource, content);
		if (models.has(resource)) {
			modelService.updateModel(getModel(resource), content, EditSources.reloadFromDisk());
		}
	}

	/** The user types at the end of a document. */
	function userTypes(resource: URI, text: string): void {
		const model = getModel(resource);
		model.applyEdits([EditOperation.insert(new Position(model.getLineCount(), 1), text)]);
	}

	function edit(path: string, before: string | undefined, editKind: IChatExternalEdit['editKind'] = 'edit'): IChatExternalEdit {
		const uri = URI.file(path);
		const beforeContentUri = before === undefined ? undefined : URI.parse(`snapshot:${path}?before`);
		if (beforeContentUri) {
			snapshots.set(beforeContentUri, before!);
		}
		return { kind: 'externalEdit', uri, editKind, beforeContentUri };
	}

	function getEntry(path: string): ChatEditingModifiedDocumentEntry {
		return review.getEntry(URI.file(path)) as ChatEditingModifiedDocumentEntry;
	}

	async function changeCount(entry: ChatEditingModifiedDocumentEntry): Promise<number> {
		return (await entry.getDiffInfo()).changes.length;
	}

	function asSession(of: AgentHostEditReview): IChatEditReviewSession {
		return new class extends mock<IChatEditReviewSession>() {
			override readonly chatSessionResource = of.chatSessionResource;
			override getEntry(uri: URI) {
				return of.getEntry(uri);
			}
		}();
	}

	setup(() => {
		models = new ResourceMap<ITextModel>();
		disk = new ResourceMap<string>();
		snapshots = new ResourceMap<string>();
		saves = [];
		deletes = [];
		encodings = new ResourceMap<string>();
		onSnapshotRead = undefined;
		onExists = undefined;
		onDidFilesChange = store.add(new Emitter<FileChangesEvent>());
		aliases = new ResourceMap<URI>();
		dirtyWorkingCopies = new ResourceMap<true>();
		otherSessions.set([], undefined);

		const collection = new ServiceCollection();
		collection.set(ITextModelService, new class extends mock<ITextModelService>() {
			override async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
				resource = canonical(resource);
				// The review's own baseline models exist; files must exist on disk.
				if (!disk.has(resource) && !models.has(resource) && !modelService.getModel(resource)) {
					throw new Error(`File not found: ${resource}`);
				}
				const textEditorModel = modelService.getModel(resource) ?? getModel(resource);
				// Behaves like a text file model, so that undoing a created file deletes it.
				const object = new class extends mock<IResolvedTextFileEditorModel>() {
					override readonly textEditorModel = textEditorModel;
					override getLanguageId() { return 'typescript'; }
					override getEncoding() { return encodings.get(resource) ?? 'utf8'; }
					override async setEncoding() { }
					override isDirty(): this is IResolvedTextFileEditorModel { return false; }
					override async revert() { }
					override async save() { return true; }
				}();
				return { dispose: () => { }, object };
			}
		}());
		collection.set(ITextFileService, new class extends mock<ITextFileService>() {
			override readonly files = new class extends mock<ITextFileEditorModelManager>() {
				override get(_resource: URI) {
					return undefined;
				}
			}();
			override isDirty(resource: URI): boolean {
				return isDirty(resource);
			}
			override async save(resource: URI, options?: ITextFileSaveOptions): Promise<URI | undefined> {
				saves.push(`${resource.path}${options?.skipSaveParticipants ? ' (no participants)' : ''}`);
				disk.set(resource, getModel(resource).getValue());
				return resource;
			}
		}());
		collection.set(IFilesConfigurationService, new class extends mock<IFilesConfigurationService>() {
			override getAutoSaveConfiguration(_resource: URI): IAutoSaveConfiguration {
				return {};
			}
		}());
		collection.set(IFileService, new class extends mock<IFileService>() {
			override readonly onDidFilesChange = onDidFilesChange.event;
			override watch(_resource: URI) {
				return Disposable.None;
			}
			override async exists(resource: URI): Promise<boolean> {
				onExists?.(resource);
				return disk.has(canonical(resource));
			}
			override async readFile(resource: URI): Promise<IFileContent> {
				const content = snapshots.get(resource);
				if (content === undefined) {
					throw new Error(`Snapshot not found: ${resource}`);
				}
				onSnapshotRead?.(resource);
				return { value: VSBuffer.fromString(content) } as IFileContent;
			}
			override async del(resource: URI): Promise<void> {
				deletes.push(resource.path);
				disk.delete(resource);
			}
		}());
		collection.set(IEditorWorkerService, new SyncDescriptor(TestWorkerService));
		collection.set(IChatService, new class extends mock<IChatService>() {
			override getSession() {
				return undefined;
			}
			override notifyUserAction(_event: IChatUserActionEvent): void { }
		}());
		collection.set(IChatEditingService, new class extends mock<IChatEditingService>() {
			override readonly editingSessionsObs = otherSessions;
		}());
		collection.set(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() {
			override resolveSessionResourceIdentity() {
				return undefined;
			}
		}());
		collection.set(IAiEditTelemetryService, new class extends mock<IAiEditTelemetryService>() {
			override handleCodeAccepted(): void { }
			override handleCodeRejected(): void { }
		}());
		// Like the real services, these know documents only by their canonical URIs.
		collection.set(IWorkingCopyService, new class extends mock<IWorkingCopyService>() {
			override isDirty(resource: URI): boolean {
				return isDirty(resource) || dirtyWorkingCopies.has(resource);
			}
		}());
		collection.set(IUriIdentityService, new class extends mock<IUriIdentityService>() {
			override asCanonicalUri(uri: URI): URI {
				return canonical(uri);
			}
		}());
		collection.set(INotebookService, new class extends mock<INotebookService>() {
			override hasSupportedNotebooks(resource: URI): boolean {
				return resource.path.endsWith('.ipynb');
			}
		}());

		instantiationService = store.add(store.add(workbenchInstantiationService(undefined, store)).createChild(collection));
		modelService = instantiationService.get(IModelService);
		store.add(instantiationService.get(IEditorWorkerService) as TestWorkerService);
		review = store.add(instantiationService.createInstance(AgentHostEditReview, chatSessionResource));
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('reviews an agent edit against the content before it', async () => {
		agentWrites(URI.file('/a.ts'), 'one\nTWO\nthree\n');

		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/a.ts', 'one\ntwo\nthree\n')]);
		await review.endTurn('turn-1');

		const entry = getEntry('/a.ts');
		assert.deepStrictEqual({
			initialContent: entry.initialContent,
			state: entry.state.get(),
			reviewMode: entry.reviewMode.get(),
			changes: await changeCount(entry),
		}, {
			initialContent: 'one\ntwo\nthree\n',
			state: ModifiedFileEntryState.Modified,
			reviewMode: true,
			changes: 1,
		});
	});

	test('attributes reloads from disk during a turn to the agent and everything else to the user', async () => {
		const uri = URI.file('/a.ts');
		agentWrites(uri, 'a\nb\nc\n');
		getModel(uri);

		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/a.ts', 'a\nb\nc\n')]);
		const entry = getEntry('/a.ts');
		// The editor reloads the agent's write only after the edit was reported, while the user types.
		agentWrites(uri, 'a\nB\nc\n');
		userTypes(uri, 'typed during the turn\n');
		await review.endTurn('turn-1');
		const agentChanges = await waitForState(entry.diffInfo.map(diff => diff.changes.length > 0 ? diff.changes.length : undefined));
		agentWrites(uri, 'a\nB\nc\ntyped during the turn\nchanged on disk later\n');

		assert.deepStrictEqual({ agentChanges, baseline: entry.originalModel.getValue() }, {
			agentChanges: 1,
			baseline: 'a\nb\nc\ntyped during the turn\nchanged on disk later\n',
		});
	});

	test('keeps an agent change the user edits, so that undoing never discards the user\'s text', async () => {
		const uri = URI.file('/a.ts');
		agentWrites(uri, 'x = 2\nz = 0\ny = 2\n');
		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/a.ts', 'x = 1\nz = 0\ny = 1\n')]);
		await review.endTurn('turn-1');
		const entry = getEntry('/a.ts');
		await waitForState(entry.diffInfo.map(diff => diff.changes.length === 2 ? true : undefined));

		// The user rewrites the value the agent wrote.
		getModel(uri).applyEdits([EditOperation.replace(new Range(1, 5, 1, 6), '3')]);
		await timeout(10);
		const agentChanges = await changeCount(entry);
		await review.reject(uri);

		assert.deepStrictEqual({ agentChanges, disk: disk.get(uri) }, { agentChanges: 1, disk: 'x = 3\nz = 0\ny = 1\n' });
	});

	test('keeps the whole agent change the user edits part of, so that undoing never mixes their text', async () => {
		const uri = URI.file('/a.ts');
		agentWrites(uri, 'bar(a, c)\nz = 0\ny = 2\n');
		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/a.ts', 'foo(a, b)\nz = 0\ny = 1\n')]);
		await review.endTurn('turn-1');
		const entry = getEntry('/a.ts');
		await waitForState(entry.diffInfo.map(diff => diff.changes.length === 2 ? true : undefined));
		const partsOfFirstChange = entry.diffInfo.get().changes[0].innerChanges?.length;

		// The user rewrites one of the two values the agent changed on the first line.
		getModel(uri).applyEdits([EditOperation.replace(new Range(1, 8, 1, 9), 'd')]);
		await timeout(10);
		const agentChanges = await changeCount(entry);
		await review.reject(uri);

		assert.deepStrictEqual(
			{ partsOfFirstChange, agentChanges, disk: disk.get(uri) },
			{ partsOfFirstChange: 2, agentChanges: 1, disk: 'bar(a, d)\nz = 0\ny = 1\n' },
		);
	});

	test('stops reviewing a file once the user\'s edits leave nothing to decide', async () => {
		const uri = URI.file('/a.ts');
		agentWrites(uri, 'x = 2\n');
		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/a.ts', 'x = 1\n')]);
		await review.endTurn('turn-1');
		const entry = getEntry('/a.ts');
		await waitForState(entry.changesCount.map(count => count === 1 ? true : undefined));

		// The user rewrites the only value the agent wrote, which keeps it.
		getModel(uri).applyEdits([EditOperation.replace(new Range(1, 5, 1, 6), '3')]);
		await waitForState(entry.changesCount.map(count => count === 0 ? true : undefined));
		await timeout(0);

		assert.deepStrictEqual(
			{ reviewed: review.entries.get().length, text: getModel(uri).getValue(), disk: disk.get(uri) },
			{ reviewed: 0, text: 'x = 3\n', disk: 'x = 2\n' },
		);
	});

	test('reviews nothing outside an observed turn, with unsaved changes, or without a readable baseline', async () => {
		agentWrites(URI.file('/history.ts'), 'after');
		agentWrites(URI.file('/dirty.ts'), 'after');
		agentWrites(URI.file('/unknown.ts'), 'after');
		agentWrites(URI.file('/unreadable.ts'), 'after');
		getModel(URI.file('/dirty.ts')).setValue('unsaved text');

		await review.addEdits('turn-0', [edit('/history.ts', 'before')]);
		review.beginTurn('turn-1');
		const unreadable = edit('/unreadable.ts', 'before');
		snapshots.delete(unreadable.beforeContentUri!);
		await review.addEdits('turn-1', [edit('/dirty.ts', 'before'), edit('/unknown.ts', undefined), unreadable, edit('/deleted.ts', 'before', 'delete')]);
		await review.endTurn('turn-1');

		assert.deepStrictEqual(review.entries.get().map(entry => entry.modifiedURI.path), []);
	});

	test('does not review a file another chat is reviewing', async () => {
		agentWrites(URI.file('/a.ts'), 'after');
		const otherEntry = new class extends mock<IModifiedFileEntry>() {
			override readonly state = constObservable(ModifiedFileEntryState.Modified);
		}();
		otherSessions.set([new class extends mock<IChatEditReviewSession>() {
			override readonly chatSessionResource = URI.parse('agent-host-copilot:/other');
			override getEntry() {
				return otherEntry;
			}
		}()], undefined);

		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/a.ts', 'before')]);
		await review.endTurn('turn-1');

		assert.deepStrictEqual(review.entries.get().length, 0);
	});

	test('does not review a file the user changes, or another chat starts reviewing, while its edit is read', async () => {
		agentWrites(URI.file('/typed.ts'), 'after\n');
		agentWrites(URI.file('/shared.ts'), 'after\n');
		const other = store.add(instantiationService.createInstance(AgentHostEditReview, URI.parse('agent-host-copilot:/other')));
		otherSessions.set([review, other].map(asSession), undefined);
		onSnapshotRead = resource => {
			if (resource.path === '/typed.ts') {
				userTypes(URI.file('/typed.ts'), 'typed while the edit was read\n');
			}
		};

		review.beginTurn('turn-1');
		other.beginTurn('turn-1');
		await Promise.all([
			review.addEdits('turn-1', [edit('/typed.ts', 'before\n'), edit('/shared.ts', 'before\n')]),
			other.addEdits('turn-1', [edit('/shared.ts', 'before\n')]),
		]);
		await Promise.all([review.endTurn('turn-1'), other.endTurn('turn-1')]);

		assert.deepStrictEqual({
			typed: review.getEntry(URI.file('/typed.ts')) !== undefined,
			reviewsOfShared: [review, other].filter(candidate => candidate.getEntry(URI.file('/shared.ts'))).length,
		}, { typed: false, reviewsOfShared: 1 });
	});

	test('reviews only UTF-8 text, because the agent host decodes its snapshots as UTF-8', async () => {
		agentWrites(URI.file('/bom.ts'), 'after\n');
		agentWrites(URI.file('/latin1.ts'), 'after\n');
		agentWrites(URI.file('/was-latin1.ts'), 'after\n');
		agentWrites(URI.file('/was-utf16.ts'), 'after\n');
		encodings.set(URI.file('/bom.ts'), 'utf8bom');
		encodings.set(URI.file('/latin1.ts'), 'windows1252');

		review.beginTurn('turn-1');
		// The agent rewrote files as UTF-8 whose content before could not be decoded as UTF-8.
		await review.addEdits('turn-1', [edit('/bom.ts', 'before\n'), edit('/latin1.ts', 'before\n'), edit('/was-latin1.ts', 'caf\uFFFD\n'), edit('/was-utf16.ts', 'b\0e\0\n\0')]);
		await review.endTurn('turn-1');

		assert.deepStrictEqual(review.entries.get().map(entry => entry.modifiedURI.path), ['/bom.ts']);
	});

	test('does not review notebooks, or files with unsaved changes in other editors', async () => {
		agentWrites(URI.file('/notebook.ipynb'), '{ "cells": [1] }\n');
		agentWrites(URI.file('/drawing.svg'), 'after\n');
		dirtyWorkingCopies.set(URI.file('/drawing.svg'), true);

		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/notebook.ipynb', '{ "cells": [] }\n'), edit('/drawing.svg', 'before\n')]);
		await review.endTurn('turn-1');

		assert.deepStrictEqual(review.entries.get().map(entry => entry.modifiedURI.path), []);
	});

	test('reviews a file as the document the user has open, whatever casing the agent uses', async () => {
		const opened = URI.file('/Opened.ts');
		const dirty = URI.file('/Dirty.ts');
		aliases.set(URI.file('/opened.ts'), opened);
		aliases.set(URI.file('/dirty.ts'), dirty);
		agentWrites(opened, 'after\n');
		agentWrites(dirty, 'after\n');
		getModel(dirty).setValue('unsaved text\n');

		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/opened.ts', 'before\n'), edit('/dirty.ts', 'before\n')]);
		await review.endTurn('turn-1');

		assert.deepStrictEqual({
			reviewed: review.entries.get().map(entry => entry.modifiedURI.path),
			found: review.getEntry(opened) !== undefined,
		}, { reviewed: ['/Opened.ts'], found: true });
	});

	test('keeping only moves the baseline, undoing writes the file back to disk', async () => {
		agentWrites(URI.file('/kept.ts'), 'kept after\n');
		agentWrites(URI.file('/undone.ts'), 'undone after\n');
		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/kept.ts', 'kept before\n'), edit('/undone.ts', 'undone before\n')]);
		await review.endTurn('turn-1');
		await changeCount(getEntry('/kept.ts'));
		await changeCount(getEntry('/undone.ts'));

		await review.accept(URI.file('/kept.ts'));
		await review.reject(URI.file('/undone.ts'));
		await timeout(10);

		assert.deepStrictEqual({
			kept: disk.get(URI.file('/kept.ts')),
			undone: disk.get(URI.file('/undone.ts')),
			saves,
		}, {
			kept: 'kept after\n',
			undone: 'undone before\n',
			saves: ['/undone.ts (no participants)'],
		});
	});

	test('undoing a single change saves it', async () => {
		const uri = URI.file('/a.ts');
		agentWrites(uri, 'A\nb\nC\n');
		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/a.ts', 'a\nb\nc\n')]);
		await review.endTurn('turn-1');
		const entry = getEntry('/a.ts');
		const diff = await waitForState(entry.diffInfo.map(value => value.changes.length === 2 ? value : undefined));

		await diff.undo(diff.changes[0]);
		await timeout(10);

		assert.deepStrictEqual({ disk: disk.get(uri), saves, state: entry.state.get() }, {
			disk: 'a\nb\nC\n',
			saves: ['/a.ts (no participants)'],
			state: ModifiedFileEntryState.Modified,
		});
	});

	test('undoing the only change after a turn saves it before the review ends', async () => {
		const uri = URI.file('/a.ts');
		agentWrites(uri, 'a\nB\nc\n');
		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/a.ts', 'a\nb\nc\n')]);
		await review.endTurn('turn-1');
		const entry = getEntry('/a.ts');
		const diff = await waitForState(entry.diffInfo.map(value => value.changes.length === 1 ? value : undefined));

		await diff.undo(diff.changes[0]);
		await timeout(10);

		assert.deepStrictEqual({ disk: disk.get(uri), saves, entries: review.entries.get().length }, {
			disk: 'a\nb\nc\n',
			saves: ['/a.ts (no participants)'],
			entries: 0,
		});
	});

	test('can keep and undo files the agent is not editing while a turn runs', async () => {
		agentWrites(URI.file('/a.ts'), 'after\n');
		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/a.ts', 'before\n')]);
		await review.endTurn('turn-1');
		await changeCount(getEntry('/a.ts'));

		review.beginTurn('turn-2');
		await review.reject(URI.file('/a.ts'));
		await timeout(10);
		const state = { disk: disk.get(URI.file('/a.ts')), saves: [...saves] };
		await review.endTurn('turn-2');

		assert.deepStrictEqual(state, { disk: 'before\n', saves: ['/a.ts (no participants)'] });
	});

	test('undoing a created file deletes it', async () => {
		agentWrites(URI.file('/new.ts'), 'generated\n');
		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/new.ts', undefined, 'create')]);
		await review.endTurn('turn-1');
		await changeCount(getEntry('/new.ts'));

		await review.reject(URI.file('/new.ts'));

		assert.deepStrictEqual({ deletes, entries: review.entries.get().length }, { deletes: ['/new.ts'], entries: 0 });
	});

	test('undoing a created file keeps text the user wrote in it', async () => {
		const uri = URI.file('/new.ts');
		agentWrites(uri, 'generated\n');
		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/new.ts', undefined, 'create')]);
		await review.endTurn('turn-1');
		await changeCount(getEntry('/new.ts'));

		userTypes(uri, 'mine\n');
		await review.reject(uri);

		assert.deepStrictEqual({ deletes, disk: disk.get(uri) }, { deletes: [], disk: 'mine\n' });
	});

	test('reviews a decided file again from its current content', async () => {
		const uri = URI.file('/a.ts');
		agentWrites(uri, 'one\n');
		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/a.ts', 'zero\n')]);
		await review.endTurn('turn-1');
		await changeCount(getEntry('/a.ts'));
		await review.accept(uri);
		await timeout(10);
		const entriesAfterKeep = review.entries.get().length;

		agentWrites(uri, 'two\n');
		review.beginTurn('turn-2');
		await review.addEdits('turn-2', [edit('/a.ts', 'one\n')]);
		await review.endTurn('turn-2');

		assert.deepStrictEqual({ entriesAfterKeep, initialContent: getEntry('/a.ts').initialContent, state: getEntry('/a.ts').state.get() }, {
			entriesAfterKeep: 0,
			initialContent: 'one\n',
			state: ModifiedFileEntryState.Modified,
		});
	});

	test('drops the review, including edits still being read, when cleared', async () => {
		agentWrites(URI.file('/a.ts'), 'after\n');
		agentWrites(URI.file('/b.ts'), 'after\n');
		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/a.ts', 'before\n')]);
		await changeCount(getEntry('/a.ts'));
		const pending = review.addEdits('turn-1', [edit('/b.ts', 'before\n')]);
		review.clear();
		await pending;
		await review.endTurn('turn-1');

		assert.deepStrictEqual(review.entries.get().length, 0);
	});

	test('drops files whose changes the agent reverted within the turn', async () => {
		const uri = URI.file('/a.ts');
		agentWrites(uri, 'after\n');
		getModel(uri);
		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/a.ts', 'before\n')]);
		agentWrites(uri, 'before\n');
		await timeout(10);
		await review.endTurn('turn-1');

		assert.deepStrictEqual(review.entries.get().length, 0);
	});

	test('attributes changes to the user after a turn, even when a file leaves the review while the turn ends', async () => {
		agentWrites(URI.file('/a.ts'), 'A\n');
		agentWrites(URI.file('/b.ts'), 'one\nTWO\nthree\n');
		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/a.ts', 'a\n'), edit('/b.ts', 'one\ntwo\nthree\n')]);
		const b = getEntry('/b.ts');
		await Promise.all([changeCount(getEntry('/a.ts')), changeCount(b)]);
		// The first file is deleted while the turn ends.
		onExists = resource => {
			if (resource.path === '/a.ts') {
				onExists = undefined;
				onDidFilesChange.fire(new FileChangesEvent([{ resource, type: FileChangeType.DELETED }], false));
			}
		};
		await review.endTurn('turn-1');

		// Between turns, the other file changes on disk, e.g. when the user switches branches.
		agentWrites(URI.file('/b.ts'), 'one\nTWO\nTHREE\n');
		await timeout(10);

		assert.deepStrictEqual(
			{ reviewed: review.entries.get().map(entry => entry.modifiedURI.path), agentChanges: await changeCount(b) },
			{ reviewed: ['/b.ts'], agentChanges: 1 },
		);
	});

	test('drops the review of a file the agent deletes or renames, or that is gone', async () => {
		for (const path of ['/deleted.ts', '/renamed.ts', '/gone.ts', '/removed.ts']) {
			agentWrites(URI.file(path), 'after\n');
		}
		review.beginTurn('turn-1');
		await review.addEdits('turn-1', ['/deleted.ts', '/renamed.ts', '/gone.ts', '/removed.ts'].map(path => edit(path, 'before\n')));
		await review.endTurn('turn-1');
		await Promise.all(['/deleted.ts', '/renamed.ts', '/gone.ts', '/removed.ts'].map(path => changeCount(getEntry(path))));

		// One file is deleted outside of the agent's edits, another one while the agent reports it as edited.
		disk.delete(URI.file('/removed.ts'));
		onDidFilesChange.fire(new FileChangesEvent([{ resource: URI.file('/removed.ts'), type: FileChangeType.DELETED }], false));
		disk.delete(URI.file('/gone.ts'));
		review.beginTurn('turn-2');
		await review.addEdits('turn-2', [
			edit('/deleted.ts', 'after\n', 'delete'),
			{ ...edit('/moved.ts', 'after\n', 'rename'), originalUri: URI.file('/renamed.ts') },
			edit('/gone.ts', 'after\n'),
		]);
		await review.endTurn('turn-2');

		assert.deepStrictEqual(review.entries.get().map(entry => entry.modifiedURI.path), []);
	});

	test('undoing a file that was deleted meanwhile does not bring it back', async () => {
		const uri = URI.file('/a.ts');
		agentWrites(uri, 'after\n');
		review.beginTurn('turn-1');
		await review.addEdits('turn-1', [edit('/a.ts', 'before\n')]);
		await review.endTurn('turn-1');
		await changeCount(getEntry('/a.ts'));

		disk.delete(uri);
		await review.reject(uri);

		assert.deepStrictEqual({ saves, exists: disk.has(uri) }, { saves: [], exists: false });
	});
});
