/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { equals } from '../../../../../../base/common/arrays.js';
import { timeout } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IReference } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { waitForState } from '../../../../../../base/common/observable.js';
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
import { AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID, AGENT_HOST_DISCARD_CHANGES_OPERATION_ID } from '../../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { identityAgentHostResourceUriMapper } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../../../../../../platform/agentHost/common/state/protocol/channels-changeset/commands.js';
import { ChangesetFile, ChangesetOperation, ChangesetOperationScope, ChangesetOperationStatus, ChangesetOperationTargetKind, ChangesetState, ChangesetStatus, ComponentToState, SessionState, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileContent, IFileService } from '../../../../../../platform/files/common/files.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IAutoSaveConfiguration, IFilesConfigurationService } from '../../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IResolvedTextFileEditorModel, ITextFileEditorModelManager, ITextFileSaveOptions, ITextFileService } from '../../../../../services/textfile/common/textfiles.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IAiEditTelemetryService } from '../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { TestWorkerService } from '../../../../inlineChat/test/browser/testWorkerService.js';
import { INotebookService } from '../../../../notebook/common/notebookService.js';
import { AgentHostEditReview } from '../../../browser/agentSessions/agentHost/agentHostEditReview.js';
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
	override readonly resourceUris = identityAgentHostResourceUriMapper;
	/** The operations invoked, as `keep` or `undo`, the file, and the zero-based lines of a range. */
	readonly invoked: string[] = [];
	/** The error that the next operations fail with. */
	failure: string | undefined;
	workingSet: ChangesetState = { status: ChangesetStatus.Ready, files: [], operations: createOperations() };
	readonly onDidChangeWorkingSet = new Emitter<ChangesetState>();
	private readonly _session = upcastPartial<SessionState>({
		provider: 'copilot',
		changesets: [{ label: 'Working Set', uriTemplate: 'changeset/working-set', changeKind: ChangesetKind.WorkingSet }],
	});

	override getSubscription<T extends StateComponents>(kind: T, _resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
		const getValue = () => (kind === StateComponents.Session ? this._session : this.workingSet) as ComponentToState[T];
		return {
			object: {
				get value() { return getValue(); },
				get verifiedValue() { return getValue(); },
				onDidChange: (kind === StateComponents.Changeset ? this.onDidChangeWorkingSet.event : Event.None) as Event<ComponentToState[T]>,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			},
			dispose: () => { },
		};
	}

	/** The host updates the Working Set, as at the end of a turn or after an operation. */
	setWorkingSet(files: ChangesetFile[], operations = createOperations()): void {
		this.workingSet = { status: ChangesetStatus.Ready, files, operations };
		this.onDidChangeWorkingSet.fire(this.workingSet);
	}

	override async invokeChangesetOperation(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult> {
		const target = params.target!;
		const lines = target.kind === ChangesetOperationTargetKind.Range ? ` ${target.side} ${target.range.start.line}-${target.range.end.line}` : '';
		this.invoked.push(`${params.operationId === AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID ? 'keep' : 'undo'} ${URI.parse(target.resource).path}${lines}`);
		if (this.failure) {
			throw new Error(this.failure);
		}
		return {};
	}
}

suite('AgentHostEditReview', () => {

	const store = new DisposableStore();
	const chatSessionResource = URI.parse('agent-host-copilot:/session');
	let host: TestAgentHost;
	let review: AgentHostEditReview;
	let modelService: IModelService;
	let models: ResourceMap<ITextModel>;
	/** File contents on disk, which the agent host writes and saves update. */
	let disk: ResourceMap<string>;
	/** Contents the agent host recorded, which it serves at their URIs. */
	let recorded: ResourceMap<string>;
	let saves: string[];
	let errors: string[];
	/** Document encodings other than UTF-8. */
	let encodings: ResourceMap<string>;
	/** How long diffs take. */
	let diffDelay: number;
	let version: number;

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

	function userTypes(path: string, lineNumber: number, column: number, text: string): void {
		getModel(URI.file(path)).applyEdits([EditOperation.insert(new Position(lineNumber, column), text)]);
	}

	/** A file of the Working Set. Its recorded contents get new URIs each time, like the edit rows of the host. */
	function workingSetFile(path: string, baseline: string | undefined, current: string | undefined): ChangesetFile {
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

	setup(() => {
		models = new ResourceMap<ITextModel>();
		disk = new ResourceMap<string>();
		recorded = new ResourceMap<string>();
		saves = [];
		errors = [];
		encodings = new ResourceMap<string>();
		diffDelay = 0;
		version = 0;
		host = new TestAgentHost();
		store.add(host.onDidChangeWorkingSet);

		class TestDelayedWorkerService extends TestWorkerService {
			override async computeDiff(original: URI, modified: URI, options: IDocumentDiffProviderOptions, algorithm: DiffAlgorithmName): Promise<IDocumentDiff | null> {
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
				return upcastPartial<IAgentHostSessionResolution>({ connection: host, connectionAuthority: 'local', backendSession: URI.parse('copilot:/session') });
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
				override get(_resource: URI) {
					return undefined;
				}
			}();
			override isDirty(resource: URI): boolean {
				return models.has(resource) && getModel(resource).getValue() !== disk.get(resource);
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
			override error(message: string) {
				errors.push(message);
			}
		}());
		collection.set(INotebookService, new class extends mock<INotebookService>() {
			override hasSupportedNotebooks(resource: URI): boolean {
				return resource.path.endsWith('.ipynb');
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
		review = store.add(instantiationService.createInstance(AgentHostEditReview, chatSessionResource));
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

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
		host.setWorkingSet([workingSetFile('/a.ts', 'a\nb\nc\nd\n', 'a\nB\nc\nD\n')]);
		await settle();
		const entry = getEntry('/a.ts');
		await getChanges(entry);
		// The user adds two lines at the top, which the session hasn't recorded.
		userTypes('/a.ts', 1, 1, 'x\ny\n');
		const changes = await getChanges(entry);

		const diff = entry.diffInfo.get();
		const kept = await diff.keep(diff.changes[1]);
		const undone = await diff.undo(diff.changes[0]);

		assert.deepStrictEqual({ original: entry.originalModel.getValue(), changes, kept, undone, invoked: host.invoked }, {
			original: 'x\ny\na\nb\nc\nd\n',
			changes: ['[4,5)', '[6,7)'],
			kept: true,
			undone: true,
			invoked: ['keep /a.ts after 3-4', 'undo /a.ts after 1-2'],
		});
	});

	test('keeps or undoes the changes to a created file as a whole', async () => {
		hostWrites('/new.ts', 'hello\nworld\n');
		host.setWorkingSet([workingSetFile('/new.ts', undefined, 'hello\nworld\n')]);
		await settle();
		const entry = getEntry('/new.ts');
		await getChanges(entry);

		const diff = entry.diffInfo.get();
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
});
