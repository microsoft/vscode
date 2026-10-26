/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { equals } from '../../../../../../base/common/arrays.js';
import { DeferredPromise, raceTimeout, timeout } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, IReference } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { autorun, observableValue, transaction, waitForState } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { EditOperation } from '../../../../../../editor/common/core/editOperation.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { IDocumentDiff, IDocumentDiffProviderOptions } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { DiffAlgorithmName, IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { EditSources } from '../../../../../../editor/common/textModelEditSource.js';
import { computeStringDiffWithMetadata } from '../../../../../../editor/common/services/editorWebWorker.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID, AGENT_HOST_DISCARD_CHANGES_OPERATION_ID } from '../../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { fromAgentHostUri, identityAgentHostResourceUriMapper, toAgentHostContentUri, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../../../../../../platform/agentHost/common/state/protocol/channels-changeset/commands.js';
import { ChangesetFile, ChangesetOperation, ChangesetOperationScope, ChangesetOperationStatus, ChangesetOperationTargetKind, ChangesetState, ChangesetStatus, ComponentToState, FileEditKind, SessionState, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { FileOperation, IFileContent, IFileService } from '../../../../../../platform/files/common/files.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { BrowserTextFileService } from '../../../../../services/textfile/browser/browserTextFileService.js';
import { IEditorIdentifier, IEditorCloseEvent, isDiffEditorInput } from '../../../../../common/editor.js';
import { DiffEditorInput } from '../../../../../common/editor/diffEditorInput.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IAutoSaveConfiguration, IFilesConfigurationService } from '../../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IResolvedTextFileEditorModel, ITextFileEditorModel, ITextFileEditorModelManager, ITextFileSaveOptions, ITextFileService, TextFileReconcileResult } from '../../../../../services/textfile/common/textfiles.js';
import { IWorkingCopyService, WorkingCopyService } from '../../../../../services/workingCopy/common/workingCopyService.js';
import { TestFileEditorInput, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IAiEditTelemetryService } from '../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { TestWorkerService } from '../../../../inlineChat/test/browser/testWorkerService.js';
import { INotebookService } from '../../../../notebook/common/notebookService.js';
import { AgentHostEditReview } from '../../../browser/agentSessions/agentHost/agentHostEditReview.js';
import { AgentHostCheckpointReview } from '../../../browser/agentSessions/agentHost/agentHostCheckpointReview.js';
import { AgentHostSnapshotController } from '../../../browser/agentSessions/agentHost/agentHostSnapshotController.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { ChatEditingModifiedDocumentEntry } from '../../../browser/chatEditing/chatEditingModifiedDocumentEntry.js';
import { IChatService, IChatUserActionEvent } from '../../../common/chatService/chatService.js';
import { ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';

function createOperations(status = ChangesetOperationStatus.Idle): ChangesetOperation[] {
	return [AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID, AGENT_HOST_DISCARD_CHANGES_OPERATION_ID].map(id => ({
		id,
		label: id,
		scopes: [ChangesetOperationScope.Resource, ChangesetOperationScope.Range],
		status,
	}));
}

/** The agent host of the reviewed session, whose Working Set the test sets. */
class TestAgentHost extends mock<IAgentConnection>() {
	override resourceUris = identityAgentHostResourceUriMapper;
	/** The operations invoked, as `keep` or `undo`, the file, and the zero-based lines of a range. */
	readonly invoked: string[] = [];
	readonly invokedRequests: InvokeChangesetOperationParams[] = [];
	/** The error that the next operations fail with. */
	failure: string | undefined;
	operationGate: { started: DeferredPromise<void>; release: DeferredPromise<void> } | undefined;
	afterOperation: ((params: InvokeChangesetOperationParams) => void) | undefined;
	workingSet: ChangesetState = { status: ChangesetStatus.Ready, files: [], operations: createOperations() };
	workingSetError: Error | undefined;
	readonly onDidChangeWorkingSet = new Emitter<ChangesetState>();
	readonly onDidErrorWorkingSet = new Emitter<Error>();
	session = upcastPartial<SessionState>({
		provider: 'copilot',
		changesets: [{ label: 'Working Set', uriTemplate: 'changeset/working-set', changeKind: ChangesetKind.WorkingSet }],
	});

	override getSubscription<T extends StateComponents>(kind: T, _resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
		const getValue = () => (kind === StateComponents.Session ? this.session : this.workingSet) as ComponentToState[T];
		const getError = () => kind === StateComponents.Changeset ? this.workingSetError : undefined;
		return {
			object: {
				get value() { return getError() ?? getValue(); },
				get verifiedValue() {
					const error = getError();
					if (error) {
						throw error;
					}
					return getValue();
				},
				onDidChange: (kind === StateComponents.Changeset ? this.onDidChangeWorkingSet.event : Event.None) as Event<ComponentToState[T]>,
				onDidError: kind === StateComponents.Changeset ? this.onDidErrorWorkingSet.event : Event.None,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			},
			dispose: () => { },
		};
	}

	/** The host updates the Working Set, as at the end of a turn or after an operation. */
	setWorkingSet(files: ChangesetFile[], operations = createOperations(), status = ChangesetStatus.Ready): void {
		this.workingSetError = undefined;
		this.workingSet = { status, files, operations };
		this.onDidChangeWorkingSet.fire(this.workingSet);
	}

	setWorkingSetError(error: Error): void {
		this.workingSetError = error;
		this.onDidErrorWorkingSet.fire(error);
	}

	override async invokeChangesetOperation(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult> {
		this.invokedRequests.push(params);
		const target = params.target!;
		const lines = target.kind === ChangesetOperationTargetKind.Range ? ` ${target.side} ${target.range.start.line}-${target.range.end.line}` : '';
		const nonce = target.nonce;
		this.invoked.push(`${params.operationId === AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID ? 'keep' : 'undo'} ${URI.parse(target.resource).path}${lines}${nonce !== undefined ? ` @${nonce}` : ''}`);
		if (this.failure) {
			throw new Error(this.failure);
		}
		if (this.operationGate) {
			this.operationGate.started.complete();
			await this.operationGate.release.p;
		}
		this.afterOperation?.(params);
		return {};
	}
}

suite('AgentHostEditReview', () => {

	const store = new DisposableStore();
	const chatSessionResource = URI.parse('agent-host-copilot:/session');
	let host: TestAgentHost;
	let review: AgentHostEditReview;
	let createReview: () => AgentHostEditReview;
	let connectionAuthority: string;
	let backendSession: URI;
	let modelService: IModelService;
	let models: ResourceMap<ITextModel>;
	/** File contents on disk, which the agent host writes and saves update. */
	let disk: ResourceMap<string>;
	/** Documents with unsaved changes, which the user typed. */
	let dirty: ResourceSet;
	/** Contents the agent host recorded, which it serves at their URIs. */
	let recorded: ResourceMap<string>;
	let saves: string[];
	let errors: string[];
	/** The accessibility signals played, as `kept` or `undone`. */
	let signals: string[];
	/** Documents whose saves fail, as on a write conflict. */
	let failingSaves: ResourceSet;
	let failingReloads: ResourceSet;
	/** Document encodings other than UTF-8. */
	let encodings: ResourceMap<string>;
	/** How long diffs take. */
	let diffDelay: number;
	let diffGate: { started: DeferredPromise<void>; release: DeferredPromise<void> } | undefined;
	let stringDiffGate: { started: DeferredPromise<void>; release: DeferredPromise<void> } | undefined;
	let stringDiffCoarse: boolean;
	let version: number;
	/** The diff editors that are open. */
	let diffEditors: IEditorIdentifier[];
	/** The diff editors closed, and whether the original they compared with was still open then. */
	let closedEditors: string[];
	let vetoClose: boolean;
	let closedEditorEvent: Emitter<IEditorCloseEvent>;
	const editorService = new class extends mock<IEditorService>() {
		override get onDidCloseEditor() { return closedEditorEvent.event; }
		override getEditors(): readonly IEditorIdentifier[] {
			return diffEditors;
		}
		override async closeEditors(editors: readonly IEditorIdentifier[]): Promise<void> {
			for (const { editor } of editors) {
				if (isDiffEditorInput(editor) && editor.original.resource && editor.modified.resource) {
					closedEditors.push(`${editor.modified.resource.path}, while its original was ${modelService.getModel(editor.original.resource) ? 'open' : 'disposed'}`);
				}
			}
			if (!vetoClose) {
				diffEditors = diffEditors.filter(candidate => !editors.includes(candidate));
				closedEditorEvent.fire(upcastPartial<IEditorCloseEvent>({}));
			}
		}
	}();

	function getModel(resource: URI): ITextModel {
		let model = models.get(resource);
		if (!model) {
			model = store.add(modelService.createModel(disk.get(resource) ?? '', null, resource, false));
			models.set(resource, model);
		}
		return model;
	}

	/** The agent host writes a file, and an open editor reloads it from disk like a text file model does. */
	function hostWrites(path: string, content: string): void {
		const resource = URI.file(path);
		disk.set(resource, content);
		if (models.has(resource)) {
			modelService.updateModel(getModel(resource), content, EditSources.reloadFromDisk());
		}
	}

	/** The agent host writes a file, which an open editor only reloads later, as when the file watcher lags behind. */
	function hostWritesWithoutReload(path: string, content: string): void {
		disk.set(URI.file(path), content);
	}

	function userTypes(path: string, lineNumber: number, column: number, text: string): void {
		const resource = URI.file(path);
		getModel(resource).applyEdits([EditOperation.insert(new Position(lineNumber, column), text)]);
		dirty.add(resource);
	}

	/** A file of the Working Set. Its recorded contents get new URIs each time, like the edit rows of the host. */
	function workingSetFile(path: string, baseline: string | undefined, current: string | undefined, nonce?: string): ChangesetFile {
		version++;
		const uri = URI.file(path).toString();
		const record = (part: string, content: string) => {
			const contentUri = URI.file(`/recorded/${version}/${part}${path}`);
			recorded.set(contentUri, content);
			return { uri, content: { uri: contentUri.toString() } };
		};
		return {
			id: uri,
			edit: {
				...(baseline === undefined ? {} : { before: record('before', baseline) }),
				...(current === undefined ? {} : { after: record('after', current) }),
				diff: { added: 1, removed: 1 },
			},
			...(nonce !== undefined ? { nonce } : {}),
		};
	}

	function getEntry(path: string): ChatEditingModifiedDocumentEntry {
		return review.getEntry(URI.file(path)) as ChatEditingModifiedDocumentEntry;
	}

	/** The lines of the changes the editor shows, once its diff caught up with the document. */
	async function getChanges(entry: ChatEditingModifiedDocumentEntry): Promise<string[]> {
		// The diff that an edit starts waits for the one in progress, so it is the second to finish.
		await entry.getDiffInfo();
		return (await entry.getDiffInfo()).changes.map(change => change.modified.toString());
	}

	async function describeEntries() {
		const entries = review.entries.get() as ChatEditingModifiedDocumentEntry[];
		return Promise.all(entries.map(async entry => ({ path: entry.modifiedURI.path, original: entry.originalModel.getValue(), changes: await getChanges(entry) })));
	}

	/** Waits until the review follows an update of the Working Set that lists `paths`. */
	async function waitForEntries(...paths: string[]): Promise<void> {
		await waitForState(review.entries.map(entries => equals(entries.map(entry => entry.modifiedURI.path), paths) ? true : undefined));
	}

	/** Lets the review follow the latest update of the Working Set. */
	async function settle(): Promise<void> {
		await timeout(0);
		await timeout(0);
	}

	function createCheckpointReview(): AgentHostCheckpointReview {
		return store.add(new AgentHostCheckpointReview(new class extends mock<IFileService>() {
			override async readFile(resource: URI): Promise<IFileContent> {
				const content = recorded.get(resource);
				assert.notStrictEqual(content, undefined);
				return upcastPartial<IFileContent>({ value: VSBuffer.fromString(content!) });
			}
		}(), new NullLogService()));
	}

	/** Opens a diff editor that compares the original of `entry` with its document, as Toggle Diff does. */
	function openDiffEditor(entry: ChatEditingModifiedDocumentEntry): void {
		const original = store.add(new TestFileEditorInput(entry.originalURI, 'test'));
		const modified = store.add(new TestFileEditorInput(entry.modifiedURI, 'test'));
		diffEditors.push({ editor: store.add(new DiffEditorInput(undefined, undefined, original, modified, undefined, editorService)), groupId: 1 });
	}

	async function useRealTextFiles(content: string) {
		review.dispose();
		const files = store.add(new class extends FileService {
			override async readFile(...args: Parameters<IFileService['readFile']>): Promise<IFileContent> {
				const recordedContent = recorded.get(args[0]);
				return recordedContent !== undefined ? upcastPartial<IFileContent>({ value: VSBuffer.fromString(recordedContent) }) : super.readFile(...args);
			}
		}(new NullLogService()));
		store.add(files.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		const instantiation = store.add(workbenchInstantiationService({
			fileService: () => files,
			textFileService: service => store.add(service.createInstance(BrowserTextFileService)),
		}, store));
		instantiation.stub(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() {
			override readonly onDidChangeSessionResolution = Event.None;
			override resolveSessionResource() {
				return upcastPartial<IAgentHostSessionResolution>({ connection: host, connectionAuthority: 'local', backendSession: URI.parse('copilot:/session') });
			}
		}());
		instantiation.stub(IAgentHostUntitledProvisionalSessionService, new class extends mock<IAgentHostUntitledProvisionalSessionService>() {
			override readonly onDidChange = Event.None;
			override get() { return undefined; }
		}());
		instantiation.stub(IChatService, new class extends mock<IChatService>() {
			override getSession() { return undefined; }
			override notifyUserAction() { }
		}());
		instantiation.stub(INotebookService, new class extends mock<INotebookService>() {
			override hasSupportedNotebooks() { return false; }
		}());
		const warning = store.add(new Emitter<string>());
		instantiation.stub(INotificationService, new class extends mock<INotificationService>() {
			override warn(message: string) { errors.push(message); warning.fire(message); }
			override error(message: string) { errors.push(message); }
		}());
		instantiation.stub(IEditorWorkerService, store.add(instantiation.createInstance(class extends TestWorkerService {
			override computeStringEditFromDiffWithMetadata(...args: Parameters<IEditorWorkerService['computeStringEditFromDiffWithMetadata']>) {
				return computeStringDiffWithMetadata(...args);
			}
		})));
		const service = instantiation.get(ITextFileService);
		store.add(service.files.retainResolvedContent());
		await files.writeFile(URI.file('/dirty.ts'), VSBuffer.fromString(content));
		const model = store.add(await service.files.resolve(URI.file('/dirty.ts')));
		assert.ok(model.isResolved());
		store.add(await instantiation.get(ITextModelService).createModelReference(model.resource));
		modelService = instantiation.get(IModelService);
		store.add(instantiation.get(ITextModelService).registerTextModelContentProvider(Schemas.chatEditingModel, {
			provideTextContent: async resource => modelService.getModel(resource),
		}));
		review = store.add(instantiation.createInstance(AgentHostEditReview, chatSessionResource));
		const type = () => {
			model.textEditorModel.pushEditOperations(null, [EditOperation.insert(new Position(2, 1), 'user ')], () => null);
		};
		return { model, files, type, warning, workingCopyService: instantiation.get(IWorkingCopyService) };
	}

	setup(() => {
		models = new ResourceMap<ITextModel>();
		disk = new ResourceMap<string>();
		dirty = new ResourceSet();
		recorded = new ResourceMap<string>();
		saves = [];
		errors = [];
		signals = [];
		failingSaves = new ResourceSet();
		failingReloads = new ResourceSet();
		encodings = new ResourceMap<string>();
		diffDelay = 0;
		diffGate = undefined;
		stringDiffGate = undefined;
		stringDiffCoarse = false;
		version = 0;
		diffEditors = [];
		closedEditors = [];
		closedEditorEvent = store.add(new Emitter<IEditorCloseEvent>());
		vetoClose = false;
		host = new TestAgentHost();
		connectionAuthority = 'local';
		backendSession = URI.parse('copilot:/session');
		store.add(host.onDidChangeWorkingSet);
		store.add(host.onDidErrorWorkingSet);

		class TestDelayedWorkerService extends TestWorkerService {
			override async computeStringEditFromDiffWithMetadata(...args: Parameters<IEditorWorkerService['computeStringEditFromDiffWithMetadata']>) {
				const result = await computeStringDiffWithMetadata(...args);
				if (stringDiffGate) {
					stringDiffGate.started.complete();
					await stringDiffGate.release.p;
				}
				return { ...result, isCoarse: stringDiffCoarse || result.isCoarse };
			}
			override async computeDiff(original: URI, modified: URI, options: IDocumentDiffProviderOptions, algorithm: DiffAlgorithmName): Promise<IDocumentDiff | null> {
				if (diffGate) {
					diffGate.started.complete();
					await diffGate.release.p;
				}
				if (diffDelay) {
					await timeout(diffDelay);
				}
				return super.computeDiff(original, modified, options, algorithm);
			}
		}

		const collection = new ServiceCollection();
		collection.set(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() {
			override readonly onDidChangeSessionResolution = Event.None;
			override resolveSessionResource() {
				return upcastPartial<IAgentHostSessionResolution>({ connection: host, connectionAuthority, backendSession });
			}
		}());
		collection.set(IAgentHostUntitledProvisionalSessionService, new class extends mock<IAgentHostUntitledProvisionalSessionService>() {
			override readonly onDidChange = Event.None;
			override get() {
				return undefined;
			}
		}());
		collection.set(ITextModelService, new class extends mock<ITextModelService>() {
			override async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
				// The review's own baseline models exist; files must exist on disk.
				if (!disk.has(resource) && !models.has(resource) && !modelService.getModel(resource)) {
					throw new Error(`File not found: ${resource}`);
				}
				const textEditorModel = modelService.getModel(resource) ?? getModel(resource);
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
				override retainResolvedContent() { return Disposable.None; }
				override readonly onDidSave = Event.None;
				override readonly onDidRevert = Event.None;
				override get(resource: URI) {
					if (!models.has(resource)) {
						return undefined;
					}
					return new class extends mock<ITextFileEditorModel>() {
						override isDisposed() { return false; }
						override isDirty(): this is IResolvedTextFileEditorModel { return dirty.has(resource); }
						override async reconcileExternalChanges() { return TextFileReconcileResult.Reconciled; }
						override async resolve() {
							if (failingReloads.has(resource)) {
								throw new Error('Disk unavailable');
							}
							// Like a text file model, reloading from disk keeps unsaved changes.
							if (!dirty.has(resource)) {
								modelService.updateModel(getModel(resource), disk.get(resource) ?? '', EditSources.reloadFromDisk());
							}
						}
					}();
				}
			}();
			override isDirty(resource: URI): boolean {
				return dirty.has(resource);
			}
			override async save(resource: URI, options?: ITextFileSaveOptions): Promise<URI | undefined> {
				saves.push(`${resource.path}${options?.skipSaveParticipants ? ' (no participants)' : ''}`);
				if (failingSaves.has(resource)) {
					// Like a text file model on a write conflict, the save resolves without saving.
					return undefined;
				}
				disk.set(resource, getModel(resource).getValue());
				dirty.delete(resource);
				return resource;
			}
		}());
		collection.set(IFilesConfigurationService, new class extends mock<IFilesConfigurationService>() {
			override getAutoSaveConfiguration(_resource: URI): IAutoSaveConfiguration {
				return {};
			}
			override disableAutoSave(_resource: URI): IDisposable {
				return Disposable.None;
			}
		}());
		collection.set(IFileService, new class extends mock<IFileService>() {
			override readonly onDidFilesChange = Event.None;
			override watch(_resource: URI) {
				return Disposable.None;
			}
			override async exists(resource: URI): Promise<boolean> {
				return disk.has(resource);
			}
			override async readFile(resource: URI): Promise<IFileContent> {
				const content = recorded.get(resource);
				if (content === undefined) {
					throw new Error(`Not recorded: ${resource}`);
				}
				return { value: VSBuffer.fromString(content) } as IFileContent;
			}
		}());
		collection.set(IEditorWorkerService, new SyncDescriptor(TestDelayedWorkerService));
		collection.set(IChatService, new class extends mock<IChatService>() {
			override getSession() {
				return undefined;
			}
			override notifyUserAction(_event: IChatUserActionEvent): void { }
		}());
		collection.set(IAiEditTelemetryService, new class extends mock<IAiEditTelemetryService>() {
			override handleCodeAccepted(): void { }
			override handleCodeRejected(): void { }
		}());
		collection.set(INotificationService, new class extends mock<INotificationService>() {
			override warn(message: string) {
				errors.push(message);
			}
			override error(message: string) {
				errors.push(message);
			}
		}());
		collection.set(INotebookService, new class extends mock<INotebookService>() {
			override hasSupportedNotebooks(resource: URI): boolean {
				return resource.path.endsWith('.ipynb');
			}
		}());
		collection.set(IEditorService, editorService);
		collection.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() {
			override async playSignal(signal: AccessibilitySignal): Promise<void> {
				signals.push(signal === AccessibilitySignal.editsKept ? 'kept' : signal === AccessibilitySignal.editsUndone ? 'undone' : 'other');
			}
		}());
		collection.set(IUriIdentityService, new class extends mock<IUriIdentityService>() {
			override asCanonicalUri(uri: URI): URI {
				return uri;
			}
		}());

		const instantiationService = store.add(store.add(workbenchInstantiationService(undefined, store)).createChild(collection));
		modelService = instantiationService.get(IModelService);
		store.add(instantiationService.get(IEditorWorkerService) as TestWorkerService);
		createReview = () => store.add(instantiationService.createInstance(AgentHostEditReview, chatSessionResource));
		review = createReview();
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('hiding review releases editor restrictions and re-enabling reviews the latest host changes', async () => {
		review.dispose();
		const enabled = observableValue('reviewEnabled', true);
		const controller = store.add(new AgentHostSnapshotController(chatSessionResource, connectionAuthority, undefined, new NullLogService(), new class extends mock<IFileService>() { }(), store.add(new WorkingCopyService())));
		controller.attachReview(enabled, () => review = createReview());
		hostWrites('/a.ts', 'A\nb\n');
		const first = workingSetFile('/a.ts', 'a\nb\n', 'A\nb\n', 'tc1');
		host.setWorkingSet([first]);
		await settle();
		const entry = getEntry('/a.ts');
		await getChanges(entry);
		openDiffEditor(entry);
		host.setWorkingSet([{ ...first, isEditing: true }]);
		const editing = !!entry.isCurrentlyBeingModifiedBy.get();

		enabled.set(false, undefined);
		const hidden = {
			entries: controller.entries.get().length,
			editing: !!entry.isCurrentlyBeingModifiedBy.get(),
			originalDisposed: entry.originalModel.isDisposed(),
		};
		hostWrites('/a.ts', 'A\nB\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\n', 'A\nB\n', 'tc2')]);
		await settle();
		enabled.set(true, undefined);
		await settle();
		const resumed = await getChanges(getEntry('/a.ts'));
		const invokedBeforeKeep = host.invoked.slice();
		await controller.accept();

		assert.deepStrictEqual({ editing, hidden, resumed, invokedBeforeKeep, invoked: host.invoked, errors }, {
			editing: true,
			hidden: { entries: 0, editing: false, originalDisposed: false },
			resumed: ['[1,3)'],
			invokedBeforeKeep: [],
			invoked: ['keep /a.ts @tc2'],
			errors: [],
		});
	});

	test('reviews the files of the Working Set against their baseline', async () => {
		hostWrites('/a.ts', 'one\nTWO\nthree\n');
		hostWrites('/new.ts', 'hello\n');
		host.setWorkingSet([
			workingSetFile('/a.ts', 'one\ntwo\nthree\n', 'one\nTWO\nthree\n'),
			workingSetFile('/new.ts', undefined, 'hello\n'),
			workingSetFile('/deleted.ts', 'bye\n', undefined),
		]);
		await settle();

		assert.deepStrictEqual(await describeEntries(), [
			{ path: '/a.ts', original: 'one\ntwo\nthree\n', changes: ['[2,3)'] },
			{ path: '/new.ts', original: '', changes: ['[1,3)'] },
		]);
	});

	for (const provider of ['claude', 'codex', 'third-party']) {
		for (const authority of ['local', 'remote.example']) {
			test(`reviews ${provider} changes on ${authority} using advertised URIs without optional metadata`, async () => {
				review.dispose();
				connectionAuthority = authority;
				backendSession = URI.parse('ahp-session:/opaque-host-session');
				const channel = 'ahp-changeset:/opaque-host-review';
				host.session = { ...host.session, provider, changesets: [{ label: 'Review', uriTemplate: channel, changeKind: ChangesetKind.WorkingSet }] };
				host.resourceUris = {
					fromAgentHost: resource => toAgentHostUri(resource, authority),
					toAgentHost: fromAgentHostUri,
				};
				const resource = toAgentHostUri(URI.file('/a.ts'), authority);
				disk.set(resource, 'A\n');
				const file = workingSetFile('/a.ts', 'a\n', 'A\n');
				for (const side of [file.edit.before, file.edit.after]) {
					if (side?.content) {
						const snapshot = URI.parse(side.content.uri);
						recorded.set(toAgentHostContentUri(snapshot, authority, URI.parse(side.uri)), recorded.get(snapshot)!);
					}
				}
				host.setWorkingSet([file]);
				review = createReview();
				await waitForEntries('/a.ts');
				const entry = review.getEntry(resource)!;
				assert.ok(entry instanceof ChatEditingModifiedDocumentEntry);
				await entry.getDiffInfo();
				await review.accept(resource);

				assert.deepStrictEqual({ state: entry.state.get(), requests: host.invokedRequests, errors }, {
					state: ModifiedFileEntryState.Accepted,
					requests: [{ channel, operationId: AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID, target: { kind: ChangesetOperationTargetKind.Resource, resource: URI.file('/a.ts').toString() } }],
					errors: [],
				});
			});
		}
	}

	test('follows the Working Set as the agent host updates it', async () => {
		hostWrites('/a.ts', 'one\nTWO\nthree\n');
		hostWrites('/b.ts', 'B\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'one\ntwo\nthree\n', 'one\nTWO\nthree\n'), workingSetFile('/b.ts', 'b\n', 'B\n')]);
		await settle();
		const first = getEntry('/a.ts');
		await Promise.all([getChanges(first), getChanges(getEntry('/b.ts'))]);

		// The next turn edits the first file again, and the second one was kept in the working set.
		hostWrites('/a.ts', 'one\nTWO\nTHREE\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'one\ntwo\nthree\n', 'one\nTWO\nTHREE\n')]);
		await waitForEntries('/a.ts');

		assert.deepStrictEqual({ entries: await describeEntries(), sameEntry: getEntry('/a.ts') === first }, {
			entries: [{ path: '/a.ts', original: 'one\ntwo\nthree\n', changes: ['[2,4)'] }],
			sameEntry: true,
		});
	});

	test('closes the diff editors of a file that leaves the review before disposing the original they show', async () => {
		hostWrites('/a.ts', 'A\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\n', 'A\n')]);
		await waitForEntries('/a.ts');
		const entry = getEntry('/a.ts');
		await getChanges(entry);
		openDiffEditor(entry);

		// The last change was kept, so the agent host settled the file.
		host.setWorkingSet([]);
		await waitForEntries();
		await settle();

		assert.deepStrictEqual({ closedEditors, disposed: entry.originalModel.isDisposed() }, {
			closedEditors: ['/a.ts, while its original was open'],
			disposed: true,
		});
	});

	test('checkpoint restoration hides lookups immediately and cannot be undone by an old host publication', async () => {
		hostWrites('/a.ts', 'A\n');
		const file = workingSetFile('/a.ts', 'a\n', 'A\n', 'shown');
		host.setWorkingSet([file]);
		await waitForEntries('/a.ts');
		const entry = getEntry('/a.ts');
		await getChanges(entry);
		const projection = createCheckpointReview();
		review.setCheckpointReview(projection);
		const [diff] = review.fileChanges.get();
		const update = await projection.prepareRestore([{
			edits: [{
				kind: FileEditKind.Edit,
				resource: entry.modifiedURI,
				beforeContentUri: diff.originalURI,
				afterContentUri: diff.modifiedSnapshotURI,
				undoStopId: 'request',
			}]
		}], true, [entry.modifiedURI]);
		transaction(update);
		const immediatelyHidden = !review.getEntry(entry.modifiedURI) && review.entries.get().length === 0 && review.fileChanges.get().length === 0;
		await review.accept(entry.modifiedURI);
		host.setWorkingSet([file]);
		await settle();
		const staysHidden = review.entries.get().length === 0;
		hostWrites('/a.ts', 'new\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\n', 'new\n', 'new')]);
		await waitForEntries('/a.ts');
		assert.deepStrictEqual({ immediatelyHidden, staysHidden, operations: host.invoked, newContent: getEntry('/a.ts').modifiedModel.getValue() }, {
			immediatelyHidden: true, staysHidden: true, operations: [], newContent: 'new\n',
		});
	});

	test('a replacement revision republishes a retained entry when checkpoint removal was queued behind an update', async () => {
		hostWrites('/a.ts', 'A\n');
		hostWrites('/b.ts', 'B\n');
		const first = workingSetFile('/a.ts', 'a\n', 'A\n', 'shown');
		host.setWorkingSet([first, workingSetFile('/b.ts', 'b\n', 'B\n')]);
		await waitForEntries('/a.ts', '/b.ts');
		const entry = getEntry('/a.ts');
		await Promise.all([getChanges(entry), getChanges(getEntry('/b.ts'))]);
		const projection = createCheckpointReview();
		review.setCheckpointReview(projection);
		let observed: string[] = [];
		store.add(autorun(reader => {
			observed = review.entries.read(reader).map(entry => entry.modifiedURI.path);
		}));
		const [diff] = review.fileChanges.get();
		const update = await projection.prepareRestore([{
			edits: [{
				kind: FileEditKind.Edit,
				resource: entry.modifiedURI,
				beforeContentUri: diff.originalURI,
				afterContentUri: diff.modifiedSnapshotURI,
				undoStopId: 'request',
			}]
		}], true, [entry.modifiedURI]);
		const gate = diffGate = { started: new DeferredPromise<void>(), release: new DeferredPromise<void>() };
		hostWritesWithoutReload('/b.ts', 'updated\n');
		const second = workingSetFile('/b.ts', 'b\n', 'updated\n');
		host.setWorkingSet([second, first]);
		await gate.started.p;
		transaction(update);
		const hidden = [...observed];
		diffGate = undefined;
		hostWrites('/a.ts', 'replacement\n');
		host.setWorkingSet([second, workingSetFile('/a.ts', 'a\n', 'replacement\n', 'replacement')]);
		gate.release.complete();
		const resolved = await review.resolveEntry(entry.modifiedURI);
		assert.deepStrictEqual({
			hidden, sameEntry: resolved === entry, observed, content: entry.modifiedModel.getValue(),
		}, {
			hidden: ['/b.ts'], sameEntry: true, observed: ['/a.ts', '/b.ts'], content: 'replacement\n',
		});
	});

	for (const duringWrite of [false, true]) {
		test(`checkpoint restoration retains dirty-document review (typing during write: ${duringWrite})`, async () => {
			const baseline = 'first\nmiddle\nlast\n';
			const agentContent = 'FIRST\nmiddle\nLAST\n';
			const { model, files, type, workingCopyService } = await useRealTextFiles(agentContent);
			const file = workingSetFile('/dirty.ts', baseline, agentContent, 'shown');
			host.setWorkingSet([file]);
			await waitForEntries('/dirty.ts');
			await getChanges(getEntry('/dirty.ts'));
			const controller = store.add(new AgentHostSnapshotController(chatSessionResource, connectionAuthority, {
				getChanges: () => undefined,
				resolve: async () => [file.edit],
			}, new NullLogService(), files, workingCopyService));
			controller.ensureRequestCheckpoint('request');
			review.setCheckpointReview(controller.checkpointReview);
			if (duringWrite) {
				store.add(Event.once(Event.filter(files.onDidRunOperation, event => event.operation === FileOperation.WRITE && isEqual(event.resource, model.resource)))(() => type()));
			} else {
				type();
			}
			await assert.rejects(controller.restoreSnapshot('request', undefined), /unsaved changes/);
			await getChanges(getEntry('/dirty.ts'));
			assert.deepStrictEqual({
				dirty: model.isDirty(),
				buffer: model.textEditorModel.getValue(),
				disk: (await files.readFile(model.resource)).value.toString(),
				visible: review.entries.get().map(entry => entry.modifiedURI.path),
				redo: controller.canRedo.get(),
			}, {
				dirty: true,
				buffer: 'FIRST\nuser middle\nLAST\n',
				disk: duringWrite ? baseline : agentContent,
				visible: ['/dirty.ts'],
				redo: duringWrite,
			});
		});
	}

	test('shows the agent\'s changes when the Working Set updates before an open document reloads what the agent wrote', async () => {
		// The document is open when the agent edits the file.
		hostWrites('/a.ts', 'a\nb\n');
		getModel(URI.file('/a.ts'));
		hostWritesWithoutReload('/a.ts', 'A\nb\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\n', 'A\nb\n')]);
		await settle();
		const first = await describeEntries();

		// The agent edits the file again, and the Working Set updates first again.
		hostWritesWithoutReload('/a.ts', 'A\nB\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\n', 'A\nB\n')]);
		await settle();

		assert.deepStrictEqual({ first, second: await describeEntries() }, {
			first: [{ path: '/a.ts', original: 'a\nb\n', changes: ['[1,2)'] }],
			second: [{ path: '/a.ts', original: 'a\nb\n', changes: ['[1,3)'] }],
		});
	});

	test('does not show changes the session has not recorded as the agent\'s', async () => {
		hostWrites('/a.ts', 'a\nB\n');
		// After the agent's last edit, the user adds a line that the session doesn't record.
		userTypes('/a.ts', 1, 1, 'x\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\n', 'a\nB\n')]);
		await settle();

		assert.deepStrictEqual(await describeEntries(), [{ path: '/a.ts', original: 'x\na\nb\n', changes: ['[3,4)'] }]);
	});

	test('keeps and undoes files with the agent host, saving unsaved text before undoing', async () => {
		hostWrites('/a.ts', 'A\n');
		hostWrites('/b.ts', 'B\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\n', 'A\n'), workingSetFile('/b.ts', 'b\n', 'B\n')]);
		await settle();
		await Promise.all([getChanges(getEntry('/a.ts')), getChanges(getEntry('/b.ts'))]);
		userTypes('/b.ts', 2, 1, 'mine\n');
		await getChanges(getEntry('/b.ts'));

		await review.accept(URI.file('/a.ts'));
		await review.reject(URI.file('/b.ts'));
		const states = [getEntry('/a.ts').state.get(), getEntry('/b.ts').state.get()];
		// Both files leave the Working Set.
		host.setWorkingSet([]);
		await settle();

		assert.deepStrictEqual({ invoked: host.invoked, saves, states, entries: review.entries.get().length }, {
			invoked: ['keep /a.ts', 'undo /b.ts'],
			saves: ['/b.ts (no participants)'],
			states: [ModifiedFileEntryState.Accepted, ModifiedFileEntryState.Rejected],
			entries: 0,
		});
	});

	test('keeps and undoes a single change by its lines in the recorded content', async () => {
		hostWrites('/a.ts', 'a\nB\nc\nD\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\nc\nd\n', 'a\nB\nc\nD\n', 'tc1')]);
		await settle();
		const entry = getEntry('/a.ts');
		await getChanges(entry);
		// The user adds two lines at the top, which the session hasn't recorded.
		userTypes('/a.ts', 1, 1, 'x\ny\n');
		const changes = await getChanges(entry);
		const original = entry.originalModel.getValue();
		host.afterOperation = params => {
			if (params.operationId === AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID) {
				host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\nc\nD\n', 'a\nB\nc\nD\n', 'tc2')]);
			} else {
				host.setWorkingSet([]);
			}
		};

		const diff = entry.diffInfo.get();
		const kept = await diff.keep(diff.changes[1]);
		const remaining = entry.diffInfo.get();
		const undone = await remaining.undo(remaining.changes[0]);

		assert.deepStrictEqual({ original, changes, kept, undone, invoked: host.invoked, remaining: review.entries.get().length }, {
			original: 'x\ny\na\nb\nc\nd\n',
			changes: ['[4,5)', '[6,7)'],
			kept: true,
			undone: true,
			invoked: ['keep /a.ts after 3-4 @tc1', 'undo /a.ts after 1-2 @tc2'],
			remaining: 0,
		});
	});

	test('a hunk decision waits for the host publication and the editor diff', async () => {
		hostWrites('/a.ts', 'A\nb\nC\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\nc\n', 'A\nb\nC\n', 'initial')]);
		await waitForEntries('/a.ts');
		const entry = getEntry('/a.ts');
		await getChanges(entry);
		const invoked = new DeferredPromise<void>();
		host.afterOperation = () => { invoked.complete(); };
		let completed = false;
		const diff = entry.diffInfo.get();
		const pending = diff.keep(diff.changes[0]).then(result => { completed = true; return result; });
		await invoked.p;
		await settle();
		const beforePublication = completed;
		const gate = diffGate = { started: new DeferredPromise<void>(), release: new DeferredPromise<void>() };
		host.setWorkingSet([workingSetFile('/a.ts', 'A\nb\nc\n', 'A\nb\nC\n', 'kept')]);
		await gate.started.p;
		const beforeDiff = completed;
		diffGate = undefined;
		gate.release.complete();
		const result = await pending;
		assert.deepStrictEqual({ beforePublication, beforeDiff, result, changes: entry.changesCount.get() }, {
			beforePublication: false, beforeDiff: false, result: true, changes: 1,
		});
	});

	for (const operation of ['keep', 'undo'] as const) {
		test(`a hunk ${operation} reports a subscription error without waiting for the publication timeout`, async () => {
			hostWrites('/a.ts', 'A\nb\nC\n');
			host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\nc\n', 'A\nb\nC\n', 'initial')]);
			await waitForEntries('/a.ts');
			const entry = getEntry('/a.ts');
			await getChanges(entry);
			const invoked = new DeferredPromise<void>();
			host.afterOperation = () => { invoked.complete(); };
			const diff = entry.diffInfo.get();
			const pending = operation === 'keep' ? diff.keep(diff.changes[0]) : diff.undo(diff.changes[0]);
			await invoked.p;
			await settle();
			host.setWorkingSetError(new Error('connection lost'));
			const result = await raceTimeout(pending, 1000);
			host.setWorkingSet([], createOperations(), ChangesetStatus.Error);
			await pending;
			assert.deepStrictEqual({ result, reported: errors.some(error => error.includes('The decision was sent')), signals }, {
				result: false, reported: true, signals: [],
			});
		});
	}

	test('resolving a live entry reports a subscription error without waiting for readiness timeout', async () => {
		host.setWorkingSet([], createOperations(), ChangesetStatus.Computing);
		const rejected = assert.rejects(review.resolveEntry(URI.file('/a.ts')), /couldn't be checked/).then(() => true);
		await settle();
		host.setWorkingSetError(new Error('connection lost'));
		const result = await raceTimeout(rejected, 1000);
		host.setWorkingSet([], createOperations(), ChangesetStatus.Error);
		await rejected;
		assert.strictEqual(result, true);
	});

	test('echoes the nonce of the changes it showed in the operation target', async () => {
		hostWrites('/a.ts', 'A\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\n', 'A\n', 'tc1')]);
		await settle();
		const entry = getEntry('/a.ts');
		await getChanges(entry);

		await entry.accept();

		assert.deepStrictEqual({ invoked: host.invoked, target: host.invokedRequests[0].target, meta: host.invokedRequests[0]._meta }, {
			invoked: ['keep /a.ts @tc1'],
			target: { kind: ChangesetOperationTargetKind.Resource, resource: URI.file('/a.ts').toString(), nonce: 'tc1' },
			meta: undefined,
		});
	});

	test('keeps or undoes only the changes that were shown when the user decided, even if the editor updated since', async () => {
		hostWrites('/a.ts', 'A\nb\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\n', 'A\nb\n', 'tc1')]);
		await settle();
		const entry = getEntry('/a.ts');
		await getChanges(entry);

		// The agent's next edit reaches the editor after the user selected Keep, before the agent host is asked.
		const kept = review.accept(URI.file('/a.ts'));
		hostWrites('/a.ts', 'A\nB\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\n', 'A\nB\n', 'tc2')]);
		await kept;
		const changes = await getChanges(entry);

		assert.deepStrictEqual({ invoked: host.invoked, errors, state: entry.state.get(), changes }, {
			invoked: [],
			errors: ['Could not keep the changes to \'a.ts\': The changes were updated in the meantime. Try again.'],
			state: ModifiedFileEntryState.Modified,
			changes: ['[1,3)'],
		});
	});

	for (const operation of ['keep', 'undo'] as const) {
		for (const pending of ['response', 'settlement'] as const) {
			test(`${operation} completion leaves a newer revision undecided while awaiting ${pending}`, async () => {
				hostWrites('/a.ts', 'A\nb\n');
				host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\n', 'A\nb\n', 'tc1')]);
				await settle();
				const entry = getEntry('/a.ts');
				await getChanges(entry);
				const gate = host.operationGate = { started: new DeferredPromise<void>(), release: new DeferredPromise<void>() };
				const decision = operation === 'keep' ? entry.acceptDeferred() : entry.rejectDeferred();
				await gate.started.p;
				if (pending === 'settlement') {
					gate.release.complete();
					await decision;
				}

				hostWrites('/a.ts', 'A\nB\n');
				const newer = workingSetFile('/a.ts', 'a\nb\n', 'A\nB\n', 'tc2');
				host.setWorkingSet([newer]);
				await settle();
				await getChanges(entry);
				gate.release.complete();
				const settleDecision = await decision;
				if (settleDecision) {
					transaction(settleDecision);
				}
				host.setWorkingSet([newer]);
				await settle();
				const afterFirstDecision = { state: entry.state.get(), changes: await getChanges(entry), sameEntry: getEntry('/a.ts') === entry };
				host.operationGate = undefined;
				if (operation === 'keep') {
					await review.accept();
				} else {
					await review.reject();
				}

				assert.deepStrictEqual({ afterFirstDecision, invoked: host.invoked, errors }, {
					afterFirstDecision: { state: ModifiedFileEntryState.Modified, changes: ['[1,3)'], sameEntry: true },
					invoked: [`${operation} /a.ts @tc1`, `${operation} /a.ts @tc2`],
					errors: [],
				});
			});
		}
	}

	test('signals the changes it kept or undid once, as local chat edits do, and not those the agent host refused', async () => {
		hostWrites('/a.ts', 'A\nb\nC\n');
		hostWrites('/b.ts', 'B\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\nc\n', 'A\nb\nC\n'), workingSetFile('/b.ts', 'b\n', 'B\n')]);
		await settle();
		const a = getEntry('/a.ts');
		await Promise.all([getChanges(a), getChanges(getEntry('/b.ts'))]);
		const results: Record<string, string[]> = {};
		host.afterOperation = () => {
			hostWritesWithoutReload('/a.ts', 'a\nb\nC\n');
			host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\nc\n', 'a\nb\nC\n'), workingSetFile('/b.ts', 'b\n', 'B\n')]);
		};

		const diff = a.diffInfo.get();
		await diff.undo(diff.changes[0]);
		results.hunkUndone = signals.splice(0);
		host.failure = 'The file changed.';
		const remaining = a.diffInfo.get();
		await remaining.keep(remaining.changes[0]);
		results.hunkRefused = signals.splice(0);
		await review.reject();
		results.allRefused = signals.splice(0);
		host.failure = undefined;
		host.afterOperation = undefined;
		await review.accept();
		results.allKept = signals.splice(0);

		assert.deepStrictEqual(results, {
			hunkUndone: ['undone'],
			hunkRefused: [],
			allRefused: [],
			allKept: ['kept'],
		});
	});

	test('does not undo changes whose document could not be saved first', async () => {
		hostWrites('/a.ts', 'A\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\n', 'A\n')]);
		await settle();
		const entry = getEntry('/a.ts');
		await getChanges(entry);
		userTypes('/a.ts', 2, 1, 'mine\n');
		failingSaves.add(URI.file('/a.ts'));

		await entry.reject();

		assert.deepStrictEqual({ invoked: host.invoked, saves, errors, state: entry.state.get() }, {
			invoked: [],
			saves: ['/a.ts (no participants)'],
			errors: ['Could not undo the changes to \'a.ts\': Its unsaved changes couldn\'t be saved. Save the file and try again.'],
			state: ModifiedFileEntryState.Modified,
		});
	});

	test('disables keeping and undoing a file while the agent writes it, as while local chat edits stream into it', async () => {
		// The chat has no response that the agent host could name as the one writing the file.
		hostWrites('/a.ts', 'A\nb\n');
		hostWrites('/b.ts', 'B\n');
		const a = workingSetFile('/a.ts', 'a\nb\n', 'A\nb\n', 'tc1');
		const b = workingSetFile('/b.ts', 'b\n', 'B\n', 'tc2');
		host.setWorkingSet([a, b]);
		await settle();
		const entry = getEntry('/a.ts');
		await Promise.all([getChanges(entry), getChanges(getEntry('/b.ts'))]);
		const describe = async () => ({ beingModified: !!entry.isCurrentlyBeingModifiedBy.get(), waitsForLastEdits: entry.waitsForLastEdits.get(), original: entry.originalModel.getValue(), changes: await getChanges(entry) });

		// The agent starts an edit of the first file.
		host.setWorkingSet([{ ...a, isEditing: true }, b]);
		await settle();
		const whileWriting = await describe();
		await review.accept();
		const keptWhileWriting = [...host.invoked];
		// Its edit is recorded before the document reloads what it wrote.
		const gate = diffGate = { started: new DeferredPromise<void>(), release: new DeferredPromise<void>() };
		hostWritesWithoutReload('/a.ts', 'A\nB\n');
		host.setWorkingSet([a, b]);
		await gate.started.p;
		await settle();
		const waitingForDiff = { beingModified: !!entry.isCurrentlyBeingModifiedBy.get(), waitsForLastEdits: entry.waitsForLastEdits.get() };
		diffGate = undefined;
		gate.release.complete();
		await waitForState(entry.isCurrentlyBeingModifiedBy.map(value => value ? undefined : true));

		assert.deepStrictEqual({ whileWriting, keptWhileWriting, waitingForDiff, afterWriting: await describe() }, {
			whileWriting: { beingModified: true, waitsForLastEdits: true, original: 'a\nb\n', changes: ['[1,2)'] },
			keptWhileWriting: ['keep /b.ts @tc2'],
			waitingForDiff: { beingModified: true, waitsForLastEdits: true },
			// The reload counts as the agent's, as local chat counts its edits on disk.
			afterWriting: { beingModified: false, waitsForLastEdits: false, original: 'a\nb\n', changes: ['[1,3)'] },
		});
	});

	for (const isEditing of [false, undefined]) {
		test(`uses the standard editing flag and resumes review when it becomes ${isEditing}`, async () => {
			hostWrites('/a.ts', 'A\n');
			const file = workingSetFile('/a.ts', 'a\n', 'A\n', 'tc1');
			host.setWorkingSet([file]);
			await settle();
			const entry = getEntry('/a.ts');
			await getChanges(entry);
			const before = !!entry.isCurrentlyBeingModifiedBy.get();

			host.setWorkingSet([{ ...file, isEditing: true }]);
			const whileEditing = !!entry.isCurrentlyBeingModifiedBy.get();
			host.setWorkingSet([{ ...file, isEditing }]);
			await waitForState(entry.isCurrentlyBeingModifiedBy.map(value => value ? undefined : true));
			const after = !!entry.isCurrentlyBeingModifiedBy.get();
			await review.accept(URI.file('/a.ts'));

			assert.deepStrictEqual({ before, whileEditing, after, invoked: host.invoked, errors }, {
				before: false, whileEditing: true, after: false, invoked: ['keep /a.ts @tc1'], errors: [],
			});
		});
	}

	test('marks an edit during recomputation immediately and an earlier diff cannot unlock a later edit', async () => {
		hostWrites('/a.ts', 'A\nb\n');
		const initial = workingSetFile('/a.ts', 'a\nb\n', 'A\nb\n', 'tc1');
		host.setWorkingSet([initial]);
		await settle();
		const entry = getEntry('/a.ts');
		await getChanges(entry);

		host.setWorkingSet([{ ...initial, isEditing: true }], createOperations(), ChangesetStatus.Recomputing);
		const duringRecomputation = !!entry.isCurrentlyBeingModifiedBy.get();
		hostWritesWithoutReload('/a.ts', 'A\nB\n');
		const updated = workingSetFile('/a.ts', 'a\nb\n', 'A\nB\n', 'tc2');
		const gate = diffGate = { started: new DeferredPromise<void>(), release: new DeferredPromise<void>() };
		host.setWorkingSet([updated]);
		await gate.started.p;
		const duringDiff = !!entry.isCurrentlyBeingModifiedBy.get();

		host.setWorkingSet([{ ...updated, isEditing: true }], createOperations(), ChangesetStatus.Recomputing);
		diffGate = undefined;
		gate.release.complete();
		await settle();
		const duringNextEdit = !!entry.isCurrentlyBeingModifiedBy.get();
		host.setWorkingSet([updated]);
		await waitForState(entry.isCurrentlyBeingModifiedBy.map(value => value ? undefined : true));

		assert.deepStrictEqual({
			duringRecomputation, duringDiff, duringNextEdit,
			after: { beingModified: !!entry.isCurrentlyBeingModifiedBy.get(), original: entry.originalModel.getValue(), changes: await getChanges(entry) },
		}, {
			duringRecomputation: true, duringDiff: true, duringNextEdit: true,
			after: { beingModified: false, original: 'a\nb\n', changes: ['[1,3)'] },
		});
	});

	test('keeps or undoes the changes to a created file as a whole', async () => {
		hostWrites('/new.ts', 'hello\nworld\n');
		host.setWorkingSet([workingSetFile('/new.ts', undefined, 'hello\nworld\n')]);
		await settle();
		const entry = getEntry('/new.ts');
		await getChanges(entry);

		const diff = entry.diffInfo.get();
		host.afterOperation = () => host.setWorkingSet([]);
		await diff.undo(diff.changes[0]);

		assert.deepStrictEqual(host.invoked, ['undo /new.ts']);
	});

	test('ignores a change that the Working Set replaced since it was shown', async () => {
		hostWrites('/a.ts', 'one\nTWO\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'one\ntwo\n', 'one\nTWO\n')]);
		await settle();
		const entry = getEntry('/a.ts');
		await getChanges(entry);
		const shown = entry.diffInfo.get();

		// The agent host records another edit meanwhile.
		hostWrites('/a.ts', 'ONE\nTWO\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'one\ntwo\n', 'ONE\nTWO\n')]);
		const kept = await shown.keep(shown.changes[0]);
		await getChanges(entry);

		assert.deepStrictEqual({ kept, invoked: host.invoked }, { kept: false, invoked: [] });
	});

	test('reports what the agent host could not keep or undo, which stays undecided', async () => {
		hostWrites('/a.ts', 'A\n');
		const files = [workingSetFile('/a.ts', 'a\n', 'A\n')];
		// A turn is running.
		host.setWorkingSet(files, createOperations(ChangesetOperationStatus.Disabled));
		await settle();
		const entry = getEntry('/a.ts');
		await getChanges(entry);

		await entry.accept();
		host.setWorkingSet(files);
		host.failure = 'The file changed.';
		await entry.reject();

		assert.deepStrictEqual({ errors, state: entry.state.get(), invoked: host.invoked }, {
			errors: [
				'Could not keep the changes to \'a.ts\': Try again once the agent has finished working.',
				'Could not undo the changes to \'a.ts\': The file changed.',
			],
			state: ModifiedFileEntryState.Modified,
			invoked: ['undo /a.ts'],
		});
	});

	test('does not review notebooks, or files that are not UTF-8 text', async () => {
		hostWrites('/notebook.ipynb', '{ "cells": [1] }\n');
		hostWrites('/latin1.ts', 'after\n');
		hostWrites('/was-latin1.ts', 'after\n');
		encodings.set(URI.file('/latin1.ts'), 'windows1252');
		host.setWorkingSet([
			workingSetFile('/notebook.ipynb', '{ "cells": [] }\n', '{ "cells": [1] }\n'),
			workingSetFile('/latin1.ts', 'before\n', 'after\n'),
			workingSetFile('/was-latin1.ts', 'caf\uFFFD\n', 'after\n'),
		]);
		await settle();

		assert.deepStrictEqual(review.entries.get().length, 0);
	});

	test('compares a document with its baseline in the line endings of the document', async () => {
		hostWrites('/a.ts', 'one\ntwo\nthree\nFOUR\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'one\r\ntwo\r\nthree\r\nfour\r\n', 'one\ntwo\nthree\nFOUR\n')]);
		await settle();
		const entry = getEntry('/a.ts');
		await getChanges(entry);

		// The user types at the start of the third line, away from the agent's change.
		userTypes('/a.ts', 3, 1, 'X');

		assert.deepStrictEqual({ original: entry.originalModel.getValue(), changes: await getChanges(entry) }, { original: 'one\ntwo\nXthree\nfour\n', changes: ['[4,5)'] });
	});

	test('typing before the first diff is computed does not change the baseline', async () => {
		diffDelay = 30;
		hostWrites('/a.ts', 'added\nbase\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'base\n', 'added\nbase\n')]);
		await settle();
		const entry = getEntry('/a.ts');

		// The user types into the agent's line while the first diff is computed.
		userTypes('/a.ts', 1, 4, 'X');
		const original = entry.originalModel.getValue();

		assert.deepStrictEqual({ original, changes: await getChanges(entry) }, { original: 'base\n', changes: ['[1,2)'] });
	});

	test('typing between the agent\'s changes before the first diff is computed stays the user\'s', async () => {
		diffDelay = 30;
		hostWrites('/a.ts', 'AAA\nmiddle\nZ\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\nmiddle\nz\n', 'AAA\nmiddle\nZ\n')]);
		await settle();
		const entry = getEntry('/a.ts');

		// The user types into the line between the agent's changes while the first diff is computed.
		userTypes('/a.ts', 2, 1, 'X');
		const original = entry.originalModel.getValue();

		assert.deepStrictEqual({ original, changes: await getChanges(entry) }, { original: 'a\nXmiddle\nz\n', changes: ['[1,2)', '[3,4)'] });
	});

	test('shows the first agent edit in an already dirty document and Keep leaves user text unsaved', async () => {
		const { model, files, type } = await useRealTextFiles('first\nmiddle\nlast\n');
		type();
		await files.writeFile(model.resource, VSBuffer.fromString('FIRST\nmiddle\nlast\n'));
		host.setWorkingSet([workingSetFile('/dirty.ts', 'first\nmiddle\nlast\n', 'FIRST\nmiddle\nlast\n', 'tc1')]);
		await waitForEntries('/dirty.ts');
		const entry = getEntry('/dirty.ts');
		const changes = await getChanges(entry);
		await review.accept();

		assert.deepStrictEqual({
			text: model.textEditorModel.getValue(), dirty: model.isDirty(),
			original: entry.originalModel.getValue(), changes, invoked: host.invoked,
			disk: (await files.readFile(model.resource)).value.toString(), errors,
		}, {
			text: 'FIRST\nuser middle\nlast\n', dirty: true, original: 'first\nuser middle\nlast\n',
			changes: ['[1,2)'], invoked: ['keep /dirty.ts @tc1'], disk: 'FIRST\nmiddle\nlast\n', errors: [],
		});
	});

	test('reconciles repeated agent edits into a dirty review and saves the combined document without conflict', async () => {
		const { model, files, type } = await useRealTextFiles('first\nmiddle\nlast\n');
		type();
		await files.writeFile(model.resource, VSBuffer.fromString('FIRST\nmiddle\nlast\n'));
		const first = workingSetFile('/dirty.ts', 'first\nmiddle\nlast\n', 'FIRST\nmiddle\nlast\n', 'tc1');
		host.setWorkingSet([first]);
		await waitForEntries('/dirty.ts');
		const entry = getEntry('/dirty.ts');
		await getChanges(entry);
		host.setWorkingSet([{ ...first, isEditing: true }]);
		await files.writeFile(model.resource, VSBuffer.fromString('FIRST\nmiddle\nLAST\n'));
		host.setWorkingSet([workingSetFile('/dirty.ts', 'first\nmiddle\nlast\n', 'FIRST\nmiddle\nLAST\n', 'tc2')]);
		await waitForState(entry.isCurrentlyBeingModifiedBy.map(value => value ? undefined : true));
		const beforeSave = { text: model.textEditorModel.getValue(), dirty: model.isDirty(), changes: await getChanges(entry), original: entry.originalModel.getValue() };
		await model.save({ skipSaveParticipants: true, ignoreErrorHandler: true });

		assert.deepStrictEqual({ beforeSave, dirty: model.isDirty(), disk: (await files.readFile(model.resource)).value.toString(), errors }, {
			beforeSave: { text: 'FIRST\nuser middle\nLAST\n', dirty: true, changes: ['[1,2)', '[3,4)'], original: 'first\nuser middle\nlast\n' },
			dirty: false, disk: 'FIRST\nuser middle\nLAST\n', errors: [],
		});
	});

	test('conflicting dirty edits preserve the document and editor review resumes after a revert', async () => {
		const { model, files, type, warning } = await useRealTextFiles('first\nmiddle\nlast\n');
		type();
		await files.writeFile(model.resource, VSBuffer.fromString('first\nagent middle\nlast\n'));
		const warned = Event.toPromise(warning.event);
		host.setWorkingSet([workingSetFile('/dirty.ts', 'first\nmiddle\nlast\n', 'first\nagent middle\nlast\n')]);
		await warned;
		const blocked = { text: model.textEditorModel.getValue(), dirty: model.isDirty(), entries: review.entries.get().length };
		await review.accept();
		await model.revert();
		await waitForEntries('/dirty.ts');

		assert.deepStrictEqual({ blocked, invoked: host.invoked, changes: await getChanges(getEntry('/dirty.ts')), warnings: errors.length }, {
			blocked: { text: 'first\nuser middle\nlast\n', dirty: true, entries: 0 },
			invoked: [], changes: ['[2,3)'], warnings: 1,
		});
	});

	test('a failed clean reload releases the editing gate and reports how to resume review', async () => {
		hostWrites('/a.ts', 'A\nb\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\n', 'A\nb\n')]);
		await waitForEntries('/a.ts');
		const entry = getEntry('/a.ts');
		await getChanges(entry);
		failingReloads.add(URI.file('/a.ts'));
		hostWritesWithoutReload('/a.ts', 'A\nB\n');
		const update = workingSetFile('/a.ts', 'a\nb\n', 'A\nB\n');
		host.setWorkingSet([update]);
		await settle();
		const failed = { entries: review.entries.get().length, editing: !!entry.isCurrentlyBeingModifiedBy.get(), notifications: errors.length };
		failingReloads.clear();
		host.setWorkingSet([update]);
		await waitForEntries('/a.ts');
		assert.deepStrictEqual({ failed, recovered: await getChanges(getEntry('/a.ts')) }, {
			failed: { entries: 0, editing: false, notifications: 1 }, recovered: ['[1,3)'],
		});
	});

	test('a vetoed diff close retains its original after review disposal until the editor really closes', async () => {
		hostWrites('/a.ts', 'A\n');
		host.setWorkingSet([workingSetFile('/a.ts', 'a\n', 'A\n')]);
		await waitForEntries('/a.ts');
		const entry = getEntry('/a.ts');
		await getChanges(entry);
		openDiffEditor(entry);
		vetoClose = true;
		host.setWorkingSet([]);
		await waitForEntries();
		await settle();
		const afterVeto = { openEditors: diffEditors.length, originalDisposed: entry.originalModel.isDisposed() };
		review.dispose();
		const afterReviewDisposed = entry.originalModel.isDisposed();
		vetoClose = false;
		await editorService.closeEditors([...diffEditors]);

		assert.deepStrictEqual({ afterVeto, afterReviewDisposed, afterClose: entry.originalModel.isDisposed() }, {
			afterVeto: { openEditors: 1, originalDisposed: false }, afterReviewDisposed: false, afterClose: true,
		});
	});

	test('disposing a review releases editing restrictions while its open diff retains the original', async () => {
		hostWrites('/a.ts', 'A\n');
		const file = workingSetFile('/a.ts', 'a\n', 'A\n');
		host.setWorkingSet([file]);
		await waitForEntries('/a.ts');
		const entry = getEntry('/a.ts');
		await getChanges(entry);
		openDiffEditor(entry);
		host.setWorkingSet([{ ...file, isEditing: true }]);
		const before = { editing: !!entry.isCurrentlyBeingModifiedBy.get(), waiting: entry.waitsForLastEdits.get() };
		review.dispose();
		const after = { editing: !!entry.isCurrentlyBeingModifiedBy.get(), waiting: entry.waitsForLastEdits.get(), originalDisposed: entry.originalModel.isDisposed() };
		await editorService.closeEditors([...diffEditors]);
		assert.deepStrictEqual({ before, after, finallyDisposed: entry.originalModel.isDisposed() }, {
			before: { editing: true, waiting: true },
			after: { editing: false, waiting: false, originalDisposed: false },
			finallyDisposed: true,
		});
	});

	test('worker preparation permits other work and rechecks user edits before exposing a review', async () => {
		hostWrites('/a.ts', 'A\nmiddle\n');
		const gate = stringDiffGate = { started: new DeferredPromise<void>(), release: new DeferredPromise<void>() };
		host.setWorkingSet([workingSetFile('/a.ts', 'a\nmiddle\n', 'A\nmiddle\n')]);
		await gate.started.p;
		await timeout(0);
		const beforeReady = review.entries.get().length;
		userTypes('/a.ts', 2, 1, 'user ');
		stringDiffGate = undefined;
		gate.release.complete();
		await waitForEntries('/a.ts');
		const entry = getEntry('/a.ts');
		assert.deepStrictEqual({ beforeReady, original: entry.originalModel.getValue(), changes: await getChanges(entry) }, {
			beforeReady: 0, original: 'a\nuser middle\n', changes: ['[1,2)'],
		});
	});

	for (const stale of [true, false]) {
		test(`hunk mapping fails closed when its worker result ${stale ? 'is stale' : 'times out'}`, async () => {
			hostWrites('/a.ts', 'a\nB\nlast\n');
			host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\nlast\n', 'a\nB\nlast\n')]);
			await waitForEntries('/a.ts');
			const entry = getEntry('/a.ts');
			await getChanges(entry);
			userTypes('/a.ts', 3, 1, 'user ');
			await getChanges(entry);
			const gate = stringDiffGate = { started: new DeferredPromise<void>(), release: new DeferredPromise<void>() };
			const diff = entry.diffInfo.get();
			const keep = diff.keep(diff.changes[0]);
			await gate.started.p;
			if (stale) {
				userTypes('/a.ts', 3, 1, 'another ');
			} else {
				stringDiffCoarse = true;
			}
			stringDiffGate = undefined;
			gate.release.complete();
			const kept = await keep;
			assert.deepStrictEqual({ kept, invoked: host.invoked, errors }, {
				kept: false, invoked: [],
				errors: [stale
					? 'Could not keep the changes to \'a.ts\': The changes were updated in the meantime. Try again.'
					: 'Could not keep the changes to \'a.ts\': The change couldn\'t be matched with the session\'s changes. Keep or undo the whole file instead.'],
			});
		});
	}
});
