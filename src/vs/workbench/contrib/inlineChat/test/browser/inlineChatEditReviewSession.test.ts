/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IReference } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IAutoSaveConfiguration, IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { ITextFileEditorModelManager, ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IChatExternalEdit, IChatService, IChatUserActionEvent } from '../../../chat/common/chatService/chatService.js';
import { ModifiedFileEntryState } from '../../../chat/common/editing/chatEditingService.js';
import { ChatResponseModelChangeReason, IChatResponseModel } from '../../../chat/common/model/chatModel.js';
import { ChatEditingModifiedDocumentEntry } from '../../../chat/browser/chatEditing/chatEditingModifiedDocumentEntry.js';
import { InlineChatEditReviewSession } from '../../browser/inlineChatEditReviewSession.js';
import { TestWorkerService } from './testWorkerService.js';

suite('InlineChatEditReviewSession', () => {

	const store = new DisposableStore();
	const chatSessionResource = URI.parse('chat-session:test');
	const targetUri = URI.parse('test:/target.ts');
	let session: InlineChatEditReviewSession;
	let modelService: IModelService;
	let readonlyUpdates: { resource: URI; value: true | false | 'toggle' | 'reset' | { value: string } }[];
	let seededContents: ResourceMap<string>;
	let beforeContents: ResourceMap<string>;
	let models: ResourceMap<ITextModel>;
	let dirtyResources: ResourceSet;
	let cancelSave: boolean;

	interface ITestChatResponse extends IChatResponseModel {
		addExternalEdit(edit: IChatExternalEdit): void;
	}

	function getModel(resource: URI): ITextModel {
		let model = models.get(resource) ?? modelService.getModel(resource);
		if (!model) {
			model = store.add(modelService.createModel(seededContents.get(resource) ?? '', null, resource, false));
		}
		models.set(resource, model);
		return model;
	}

	function createResponse(parts: readonly IChatExternalEdit[] = [], requestId = 'request-1'): ITestChatResponse {
		const responseParts = [...parts];
		const onDidChange = store.add(new Emitter<ChatResponseModelChangeReason>());
		return new class extends mock<ITestChatResponse>() {
			override readonly requestId = requestId;
			override readonly response = {
				value: responseParts,
				getMarkdown: () => '',
				getFinalResponse: () => '',
				toString: () => '',
			};
			override readonly agent = { id: 'agent' } as IChatResponseModel['agent'];
			override readonly slashCommand = { name: 'inline' } as IChatResponseModel['slashCommand'];
			override readonly request = { modelId: 'model', modeInfo: { telemetryModeId: 'edit' } } as IChatResponseModel['request'];
			override readonly session = { sessionResource: chatSessionResource } as IChatResponseModel['session'];
			override readonly result = undefined;
			override readonly onDidChange = onDidChange.event;
			override addExternalEdit(edit: IChatExternalEdit): void {
				responseParts.push(edit);
				onDidChange.fire({ reason: 'other' });
			}
		};
	}

	async function beginAndEnd(targetContent: string, response = createResponse()): Promise<void> {
		await session.beginTurn(response);
		getModel(targetUri).setValue(targetContent);
		await session.endTurn(response);
	}

	setup(() => {
		readonlyUpdates = [];
		seededContents = new ResourceMap<string>();
		beforeContents = new ResourceMap<string>();
		models = new ResourceMap<ITextModel>();
		dirtyResources = new ResourceSet();
		cancelSave = false;

		const textModelService = new class extends mock<ITextModelService>() {
			override async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
				return {
					dispose: () => { },
					object: {
						textEditorModel: getModel(resource),
						getLanguageId: () => 'typescript',
					} as IResolvedTextEditorModel
				};
			}
		}();
		const textFileService = new class extends mock<ITextFileService>() {
			override readonly files = new class extends mock<ITextFileEditorModelManager>() {
				override get(_resource: URI) {
					return undefined;
				}
			}();
			override isDirty(_resource: URI): boolean {
				return dirtyResources.has(_resource);
			}
			override async save(resource: URI): Promise<URI | undefined> {
				return cancelSave ? undefined : resource;
			}
		}();
		const filesConfigurationService = new class extends mock<IFilesConfigurationService>() {
			override async updateReadonly(resource: URI | URI[], value: true | false | 'toggle' | 'reset' | { value: string }): Promise<void> {
				for (const uri of Array.isArray(resource) ? resource : [resource]) {
					readonlyUpdates.push({ resource: uri, value });
				}
			}
			override getAutoSaveConfiguration(_resource: URI): IAutoSaveConfiguration {
				return {};
			}
		}();
		const fileService = new class extends mock<IFileService>() {
			override readonly onDidFilesChange = Event.None;
			override watch(_resource: URI) {
				return Disposable.None;
			}
			override async readFile(resource: URI): Promise<IFileContent> {
				return { value: VSBuffer.fromString(beforeContents.get(resource) ?? '') } as IFileContent;
			}
		}();

		const collection = new ServiceCollection();
		collection.set(ITextModelService, textModelService);
		collection.set(ITextFileService, textFileService);
		collection.set(IFilesConfigurationService, filesConfigurationService);
		collection.set(IFileService, fileService);
		collection.set(IEditorWorkerService, new SyncDescriptor(TestWorkerService));
		collection.set(IChatService, new class extends mock<IChatService>() {
			override notifyUserAction(_event: IChatUserActionEvent): void { }
		}());
		collection.set(INotebookService, new class extends mock<INotebookService>() {
			override hasSupportedNotebooks(_resource: URI): boolean {
				return false;
			}
		}());

		const insta = store.add(store.add(workbenchInstantiationService(undefined, store)).createChild(collection));
		modelService = insta.get(IModelService);
		store.add(insta.get(IEditorWorkerService) as TestWorkerService);
		session = store.add(insta.createInstance(InlineChatEditReviewSession, chatSessionResource, targetUri));
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('creates a review entry with the pre-turn content before the turn ends', async () => {
		seededContents.set(targetUri, 'const value = 1;\n');

		await session.beginTurn(createResponse());

		const entry = session.getEntry(targetUri) as ChatEditingModifiedDocumentEntry;
		assert.deepStrictEqual({
			initialContent: entry.initialContent,
			state: entry.state.get(),
			uri: entry.modifiedURI.toString(),
		}, {
			initialContent: 'const value = 1;\n',
			state: ModifiedFileEntryState.Modified,
			uri: targetUri.toString(),
		});
		await session.endTurn(createResponse());
	});

	test('updates the review diff while the agent edits', async () => {
		seededContents.set(targetUri, 'const value = 1;\n');
		const response = createResponse();

		await session.beginTurn(response);
		const entry = session.getEntry(targetUri) as ChatEditingModifiedDocumentEntry;
		getModel(targetUri).setValue('const value = 2;\n');

		const diff = await waitForState(entry.diffInfo.map(value => value.changes.length > 0 ? value : undefined));
		assert.strictEqual(diff.changes.length, 1);

		await session.endTurn(response);
	});

	test('locks the target with a markdown message and resets it after the turn', async () => {
		seededContents.set(targetUri, 'before');

		await beginAndEnd('after');

		assert.deepStrictEqual(readonlyUpdates.map(update => ({
			resource: update.resource.toString(),
			value: update.value,
		})), [
			{ resource: targetUri.toString(), value: { value: 'Editor is read-only while Copilot is editing this file.' } },
			{ resource: targetUri.toString(), value: 'reset' },
		]);
	});

	test('releases the read-only lock when disposed during a turn', async () => {
		seededContents.set(targetUri, 'before');

		await session.beginTurn(createResponse());
		session.dispose();
		await Promise.resolve();

		assert.deepStrictEqual(readonlyUpdates.map(update => update.value), [
			{ value: 'Editor is read-only while Copilot is editing this file.' },
			'reset',
		]);
	});

	test('creates an entry for an off-target external edit using its before content', async () => {
		const externalUri = URI.parse('test:/external.ts');
		const beforeContentUri = URI.parse('test:/before-external.ts');
		seededContents.set(targetUri, 'target before');
		seededContents.set(externalUri, 'external after');
		beforeContents.set(beforeContentUri, 'external before');
		const response = createResponse([{
			kind: 'externalEdit',
			uri: externalUri,
			editKind: 'edit',
			beforeContentUri,
		}]);

		await beginAndEnd('target after', response);

		const entries = session.entries.get() as ChatEditingModifiedDocumentEntry[];
		assert.deepStrictEqual(entries.map(entry => ({
			uri: entry.modifiedURI.toString(),
			initialContent: entry.initialContent,
		})), [
			{ uri: targetUri.toString(), initialContent: 'target before' },
			{ uri: externalUri.toString(), initialContent: 'external before' },
		]);
	});

	test('creates an off-target entry with a populated diff before the turn ends', async () => {
		const externalUri = URI.parse('test:/realtime-external.ts');
		const beforeContentUri = URI.parse('test:/before-realtime-external.ts');
		seededContents.set(targetUri, 'target before');
		seededContents.set(externalUri, 'external after');
		beforeContents.set(beforeContentUri, 'external before');
		const response = createResponse();

		await session.beginTurn(response);
		response.addExternalEdit({
			kind: 'externalEdit',
			uri: externalUri,
			editKind: 'edit',
			beforeContentUri,
		});

		const entry = await waitForState(session.entries.map(entries => entries.find(candidate => candidate.modifiedURI.toString() === externalUri.toString()))) as ChatEditingModifiedDocumentEntry;
		const diff = await waitForState(entry.diffInfo.map(value => value.changes.length > 0 ? value : undefined));
		assert.deepStrictEqual({
			initialContent: entry.initialContent,
			diffChanges: diff.changes.length,
		}, {
			initialContent: 'external before',
			diffChanges: 1,
		});

		await session.endTurn(response);
	});

	test('skips deleted external edits', async () => {
		const deletedUri = URI.parse('test:/deleted.ts');
		seededContents.set(targetUri, 'before');
		const response = createResponse([{
			kind: 'externalEdit',
			uri: deletedUri,
			editKind: 'delete',
		}]);

		await beginAndEnd('after', response);

		assert.deepStrictEqual(session.entries.get().map(entry => entry.modifiedURI.toString()), [targetUri.toString()]);
	});

	test('does not lock or edit when the pre-turn save is cancelled', async () => {
		// A cancelled save leaves the buffer dirty. Proceeding would let the agent write to
		// disk and the end-of-turn revert would discard the user's unsaved work.
		seededContents.set(targetUri, 'before');
		dirtyResources.add(targetUri);
		cancelSave = true;

		const response = createResponse();
		await assert.rejects(() => session.beginTurn(response), err => isCancellationError(err));

		assert.deepStrictEqual({
			entryCount: session.entries.get().length,
			locksLeftHeld: readonlyUpdates.filter(update => update.value !== 'reset').length,
		}, { entryCount: 0, locksLeftHeld: 0 });
	});

	test('tracks a created off-target file as created so rejecting deletes it', async () => {
		const createdUri = URI.parse('test:/created.ts');
		seededContents.set(targetUri, 'before');
		seededContents.set(createdUri, 'generated\n');
		const response = createResponse([{
			kind: 'externalEdit',
			uri: createdUri,
			editKind: 'create',
		}]);

		await session.beginTurn(response);
		const entry = await waitForState(session.entries.map(entries => entries.find(candidate => candidate.modifiedURI.toString() === createdUri.toString())));
		await session.endTurn(response);

		const created = entry as ChatEditingModifiedDocumentEntry;
		assert.strictEqual(created.createdInRequestId, created.telemetryInfo.requestId);
	});

	test('skips renamed external edits', async () => {
		const renamedUri = URI.parse('test:/renamed.ts');
		seededContents.set(targetUri, 'before');
		const response = createResponse([{
			kind: 'externalEdit',
			uri: renamedUri,
			editKind: 'rename',
		}]);

		await beginAndEnd('after', response);

		assert.deepStrictEqual(session.entries.get().map(entry => entry.modifiedURI.toString()), [targetUri.toString()]);
	});

	test('accepts all entries', async () => {
		const externalUri = URI.parse('test:/accepted-external.ts');
		seededContents.set(targetUri, 'before');
		seededContents.set(externalUri, 'external');
		await beginAndEnd('accepted', createResponse([{
			kind: 'externalEdit',
			uri: externalUri,
			editKind: 'edit',
		}]));

		await session.accept();

		assert.deepStrictEqual(session.entries.get().map(entry => entry.state.get()), [
			ModifiedFileEntryState.Accepted,
			ModifiedFileEntryState.Accepted,
		]);
	});

	test('rejects all entries', async () => {
		seededContents.set(targetUri, 'before');
		await beginAndEnd('rejected');

		await session.reject();

		assert.deepStrictEqual(session.entries.get().map(entry => entry.state.get()), [ModifiedFileEntryState.Rejected]);
	});

	test('does not create duplicate entries for the target across turns', async () => {
		seededContents.set(targetUri, 'before');

		await beginAndEnd('first');
		await beginAndEnd('second', createResponse());

		assert.deepStrictEqual(session.entries.get().map(entry => entry.modifiedURI.toString()), [targetUri.toString()]);
	});

	test('keeps the initial content and cumulative diff across turns', async () => {
		const initialContent = 'one\ntwo\nthree\nfour\nfive\n';
		seededContents.set(targetUri, initialContent);
		const firstResponse = createResponse([], 'request-1');
		const secondResponse = createResponse([], 'request-2');

		await session.beginTurn(firstResponse);
		getModel(targetUri).setValue('ONE\ntwo\nthree\nfour\nfive\n');
		await session.endTurn(firstResponse);

		await session.beginTurn(secondResponse);
		getModel(targetUri).setValue('ONE\ntwo\nthree\nfour\nFIVE\n');
		await session.endTurn(secondResponse);

		const entry = session.getEntry(targetUri) as ChatEditingModifiedDocumentEntry;
		const diff = await waitForState(entry.diffInfo.map(value => value.changes.length === 2 ? value : undefined));
		assert.deepStrictEqual({
			entryCount: session.entries.get().length,
			initialContent: entry.initialContent,
			modifiedContent: entry.modifiedModel.getValue(),
			diffChanges: diff.changes.length,
		}, {
			entryCount: 1,
			initialContent,
			modifiedContent: 'ONE\ntwo\nthree\nfour\nFIVE\n',
			diffChanges: 2,
		});
	});

	test('keeps an off-target file baseline across turns', async () => {
		const externalUri = URI.parse('test:/cumulative-external.ts');
		const beforeContentUri = URI.parse('test:/before-cumulative-external.ts');
		const initialContent = 'one\ntwo\nthree\nfour\nfive\n';
		seededContents.set(targetUri, 'target');
		seededContents.set(externalUri, initialContent);
		beforeContents.set(beforeContentUri, initialContent);
		const firstResponse = createResponse([{
			kind: 'externalEdit',
			uri: externalUri,
			editKind: 'edit',
			beforeContentUri,
		}], 'request-1');
		const secondResponse = createResponse([{
			kind: 'externalEdit',
			uri: externalUri,
			editKind: 'edit',
			beforeContentUri,
		}], 'request-2');

		await session.beginTurn(firstResponse);
		const entry = await waitForState(session.entries.map(entries => entries.find(candidate => candidate.modifiedURI.toString() === externalUri.toString()))) as ChatEditingModifiedDocumentEntry;
		getModel(externalUri).setValue('ONE\ntwo\nthree\nfour\nfive\n');
		await session.endTurn(firstResponse);
		const firstDiff = await entry.getDiffInfo();
		assert.strictEqual(firstDiff.changes.length, 1);

		await session.beginTurn(secondResponse);
		getModel(externalUri).setValue('ONE\ntwo\nthree\nfour\nFIVE\n');
		await session.endTurn(secondResponse);

		const diff = await entry.getDiffInfo();
		assert.deepStrictEqual({
			entryCount: session.entries.get().filter(candidate => candidate.modifiedURI.toString() === externalUri.toString()).length,
			initialContent: entry.initialContent,
			modifiedContent: entry.modifiedModel.getValue(),
			firstDiffChanges: firstDiff.changes.length,
			diffChanges: diff.changes.length,
		}, {
			entryCount: 1,
			initialContent,
			modifiedContent: 'ONE\ntwo\nthree\nfour\nFIVE\n',
			firstDiffChanges: 1,
			diffChanges: 2,
		});
	});
});
