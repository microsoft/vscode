/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CanvasesEnabledSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { EditorActivation, IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotification, INotificationHandle } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { GroupModelChangeKind, IEditorIdentifier, ITextDiffEditorPane } from '../../../../common/editor.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart, IModalEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, IEditorsChangeEvent } from '../../../../services/editor/common/editorService.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../browserView/common/browserView.js';
import { CanvasInput, ICanvasContext, ICanvasContextService, ICanvasOpenRequest, ICanvasWorkingSetOwner, isCanvasOwner } from '../../common/canvas.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { CanvasService } from '../../electron-browser/canvasService.js';
import { canvasOwnerKey, ICanvas, ICanvasOwner } from '../../../../common/canvasReference.js';

suite('CanvasService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(options?: { readonly workingSets?: boolean; readonly presentedElsewhere?: boolean; readonly background?: boolean; readonly browserService?: IBrowserViewWorkbenchService }) {
		const owner: ICanvasOwner = { providerId: 'local', session: URI.parse('session:/owner'), chat: URI.parse('chat:/owner') };
		const canvas: ICanvas = {
			resource: URI.parse('canvas:/preview'), instanceId: 'preview', title: 'Preview', source: URI.parse('https://example.test'),
		};
		const canvases = observableValue<readonly ICanvas[] | undefined>('canvases', []);
		const openRequests = observableValue<ReadonlyMap<string, ICanvasOpenRequest>>('openRequests', new Map());
		const contexts = observableValue<readonly ICanvasContext[]>('contexts', [{ owner, canvases, openRequests, background: options?.background }]);
		const visible = observableValue<ReadonlySet<string>>('visible', new Set([canvasOwnerKey(owner)]));
		const removed = store.add(new Emitter<ICanvasOwner>());
		const groupRestores: boolean[] = [];
		// The owners the groups of the chat window, window 2, present: those of the chats it shows.
		const chatWindowOwners = observableValue<ReadonlySet<string>>('chatWindowOwners', new Set([canvasOwnerKey(owner)]));
		const workingSetState = observableValue('workingSetState', { owner: undefined as ICanvasWorkingSetOwner | undefined, restoring: false, applying: false });
		let activeInput: EditorInput | undefined;
		const contextService = upcastPartial<ICanvasContextService>({
			contexts, onDidRemoveOwner: removed.event,
			isOwnerVisible: (owner, reader) => visible.read(reader).has(canvasOwnerKey(owner)),
			resolveOwner: candidate => candidate.providerId === 'session-pill' ? owner : undefined,
			getContext: (owner, reader) => contexts.read(reader).find(context => isCanvasOwner(context.owner, owner)),
			getEditorGroup: (_owner, _input, restore) => {
				groupRestores.push(restore);
				return targetGroup;
			},
			canPresentInGroup: (owner, group, reader) => group.windowId === 2 && chatWindowOwners.read(reader).has(canvasOwnerKey(owner)),
			workingSets: options?.workingSets ? {
				state: workingSetState,
				registerEditorToRetain: () => Disposable.None,
				suppressEditorPartAutoVisibility: () => Disposable.None,
			} : undefined,
			isPresentedElsewhere: options?.presentedElsewhere ? () => true : undefined,
		});
		const editorsChanged = store.add(new Emitter<IEditorsChangeEvent>());
		const opened: CanvasInput[] = [];
		const openOptions: (IEditorOptions | undefined)[] = [];
		const openEditors: IEditorIdentifier[] = [];
		const closed: CanvasInput[] = [];
		const moves: string[] = [];
		const groups = [1, 2, 3].map(id => upcastPartial<IEditorGroup>({
			id, windowId: id === 3 ? 2 : 1,
			moveEditor: (editor, target) => {
				openEditors.splice(openEditors.findIndex(candidate => candidate.editor === editor && candidate.groupId === id), 1, { groupId: target.id, editor });
				moves.push(`${id}->${target.id}`);
				return true;
			},
		}));
		let targetGroup: IEditorGroup | undefined = groups[0];
		let pendingOpen: DeferredPromise<void> | undefined;
		let pendingClose: DeferredPromise<void> | undefined;
		let failOpen = false;
		const notifications: INotification[] = [];
		const notificationService = new class extends TestNotificationService {
			override notify(notification: INotification): INotificationHandle {
				notifications.push(notification);
				return super.notify(notification);
			}
		}();
		const editorService = new class extends mock<IEditorService>() {
			override readonly onDidEditorsChange = editorsChanged.event;
			override get activeEditor() { return activeInput; }
			override async openEditor(...args: unknown[]): Promise<ITextDiffEditorPane | undefined> {
				const input = args[0];
				if (!(input instanceof CanvasInput)) {
					throw new Error('Expected a canvas input');
				}
				opened.push(input);
				openOptions.push(args[1] as IEditorOptions | undefined);
				if (pendingOpen) {
					await pendingOpen.p;
				}
				if (failOpen) {
					return undefined;
				}
				const options = args[1] as IEditorOptions | undefined;
				// Without a group, an editor that is open already, such as one that matches it, is revealed instead.
				const revealed = !args[2] && options?.revealIfOpened ? openEditors.find(editor => editor.editor.matches(input)) : undefined;
				if (revealed) {
					return upcastPartial<ITextDiffEditorPane>({ group: groups.find(group => group.id === revealed.groupId), input: revealed.editor });
				}
				const group = (args[2] as IEditorGroup | undefined) ?? groups[0];
				openEditors.push({ groupId: group.id, editor: input });
				return upcastPartial<ITextDiffEditorPane>({ group, input });
			}
			override findEditors(): readonly IEditorIdentifier[] {
				return openEditors.slice();
			}
			override isVisible(input: EditorInput): boolean {
				return openEditors.some(editor => editor.editor === input && !input.isDisposed());
			}
			override async closeEditors(editors: readonly IEditorIdentifier[]): Promise<void> {
				if (pendingClose) {
					await pendingClose.p;
				}
				for (const editor of editors) {
					if (editor.editor instanceof CanvasInput) {
						closed.push(editor.editor);
						openEditors.splice(openEditors.indexOf(editor), 1);
					}
				}
			}
		}();
		const instantiationService = store.add(new TestInstantiationService());
		let modalActive = false;
		let applyingWorkingSet = false;
		const applyingWorkingSetChanged = store.add(new Emitter<boolean>());
		const editorGroupsService = upcastPartial<IEditorGroupsService>({
			mainPart: upcastPartial<IEditorPart>({ windowId: 1 }),
			getGroup: id => groups.find(group => group.id === id),
			get isApplyingWorkingSet() { return applyingWorkingSet; },
			onDidChangeApplyingWorkingSet: applyingWorkingSetChanged.event,
			get activeModalEditorPart() { return modalActive ? upcastPartial<IModalEditorPart>({}) : undefined; },
		});
		instantiationService.stub(IEditorGroupsService, editorGroupsService);
		const sentiment = store.add(new Emitter<void>());
		let hidden = false;
		const entitlementService = upcastPartial<IChatEntitlementService>({
			get sentiment() { return { hidden }; },
			onDidChangeSentiment: sentiment.event,
		});
		let folderLocation = URI.file('/workspace');
		const workspaceContextService = upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ folders: [{ uri: folderLocation, name: 'workspace', index: 0, toResource: path => URI.joinPath(folderLocation, path) }] }),
		});
		const uriIdentityService = upcastPartial<IUriIdentityService>({ extUri: upcastPartial<IUriIdentityService['extUri']>({ getComparisonKey: uri => uri.toString() }) });
		const service = store.add(new CanvasService(contextService, editorService, editorGroupsService, instantiationService, options?.browserService ?? upcastPartial<IBrowserViewWorkbenchService>({}), entitlementService,
			new TestConfigurationService({ [CanvasesEnabledSettingId]: true }), new NullLogService(), notificationService, workspaceContextService, uriIdentityService));
		return {
			workingSetState, setActiveInput: (input: EditorInput | undefined) => { activeInput = input; },
			owner, canvas, canvases, contexts, openRequests, visible, removed, opened, openOptions, openEditors, closed, moves, groupRestores, notifications, service, chatWindowOwners,
			delayOpen: () => pendingOpen = new DeferredPromise<void>(),
			failOpen: (value: boolean) => failOpen = value,
			hideAI: () => { hidden = true; sentiment.fire(); },
			showAI: () => { hidden = false; sentiment.fire(); },
			setModalActive: (value: boolean) => modalActive = value,
			/** Switches the folder location of the single-folder workspace, as before its editors are swapped. */
			setFolderLocation: (path: string) => folderLocation = URI.file(path),
			setApplyingWorkingSet: (value: boolean) => {
				applyingWorkingSet = value;
				applyingWorkingSetChanged.fire(value);
			},
			selectGroup: (id: number) => targetGroup = groups[id - 1],
			/** Lets the editor service choose the group, as the main window's active group when it is active. */
			selectNoGroup: () => targetGroup = undefined,
			delayClose: () => pendingClose = new DeferredPromise<void>(),
			/** Moves the open canvas into group `id`, as the user drags its tab, without the service opening it there. */
			moveByUser: (id: number) => {
				const moved = openEditors.find(editor => editor.editor instanceof CanvasInput)!;
				openEditors.splice(openEditors.indexOf(moved), 1, { groupId: id, editor: moved.editor });
				editorsChanged.fire({ groupId: id, event: { kind: GroupModelChangeKind.EDITOR_OPEN, editor: moved.editor, editorIndex: 0 } });
			},
		};
	}

	test('publishes the model to hosts while its first load is still in progress', async () => {
		const creation = new DeferredPromise<void>();
		const loaded = new DeferredPromise<IBrowserViewModel>();
		const model = upcastPartial<IBrowserViewModel>({ onWillDispose: Event.None, dispose: () => { } });
		const observed: IBrowserViewModel[] = [];
		let created = 0;
		const harness = createHarness({
			browserService: upcastPartial<IBrowserViewWorkbenchService>({
				createExternalBrowserView: async (_url, _source, _owner, onCreated) => {
					created++;
					await creation.p;
					onCreated?.(model);
					return loaded.p;
				},
			}),
		});
		harness.canvases.set([harness.canvas], undefined);
		const reference = { ...harness.owner, canvas: harness.canvas.resource };
		const first = harness.service.resolveCanvasModel(reference, harness.canvas.source!, false, model => observed.push(model));
		const second = harness.service.resolveCanvasModel(reference, harness.canvas.source!, false, model => observed.push(model));
		await creation.complete();
		await timeout(0);
		const hostsAttachedWhileLoading = observed.length;
		await loaded.complete(model);
		const resolutions = await Promise.all([first, second]);
		assert.deepStrictEqual({ created, hostsAttachedWhileLoading, sameModel: resolutions.every(result => result.model === model) }, {
			created: 1, hostsAttachedWhileLoading: 2, sameModel: true,
		});
	});

	test('deduplicates presentation, preserves dismissal, and reveals a new canvas lifetime', async () => {
		const harness = createHarness();
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		harness.canvases.set([{ ...harness.canvas, title: 'Renamed' }], undefined);
		harness.opened[0].dispose();
		harness.canvases.set([harness.canvas], undefined);
		const afterDismissal = harness.opened.length;
		harness.canvases.set([{ ...harness.canvas, resource: URI.parse('canvas:/new-lifetime') }], undefined);
		assert.deepStrictEqual({ afterDismissal, channels: harness.opened.map(input => input.reference.canvas.toString()) }, { afterDismissal: 1, channels: ['canvas:/preview', 'canvas:/new-lifetime'] });
	});

	test('reopens a dismissed lifetime only for a new successful model open request', async () => {
		const harness = createHarness();
		harness.openRequests.set(new Map([['preview', { id: 'first', succeeded: true }]]), undefined);
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		harness.opened[0].dispose();
		harness.canvases.set([{ ...harness.canvas, title: 'Updated', source: URI.parse('https://example.test/replacement') }], undefined);
		const afterMetadata = harness.opened.length;
		harness.openRequests.set(new Map([['preview', { id: 'second', succeeded: false, pending: true }]]), undefined);
		const beforeSuccess = harness.opened.length;
		harness.openRequests.set(new Map([['preview', { id: 'second', succeeded: true }]]), undefined);
		await timeout(0);
		assert.deepStrictEqual({
			afterMetadata, beforeSuccess, afterSuccess: harness.opened.length, sameLifetime: harness.opened[0].matches(harness.opened[1]),
		}, { afterMetadata: 1, beforeSuccess: 1, afterSuccess: 2, sameLifetime: true });
	});

	test('does not undo a user close after the corresponding model open started', async () => {
		const harness = createHarness();
		harness.openRequests.set(new Map([['preview', { id: 'opening', succeeded: false, pending: true }]]), undefined);
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		harness.opened[0].dispose();
		harness.openRequests.set(new Map([['preview', { id: 'opening', succeeded: true }]]), undefined);
		assert.strictEqual(harness.opened.length, 1);
	});

	test('acknowledges successful opens of a visible canvas without repeatedly revealing it', async () => {
		const harness = createHarness();
		harness.openRequests.set(new Map([['preview', { id: 'first', succeeded: false, pending: true }]]), undefined);
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		harness.openRequests.set(new Map([['preview', { id: 'first', succeeded: true }]]), undefined);
		harness.openRequests.set(new Map([['preview', { id: 'second', succeeded: true }]]), undefined);
		assert.strictEqual(harness.opened.length, 1);
	});

	test('automatic presentation preserves an active modal while explicit reveal foregrounds', async () => {
		const harness = createHarness();
		harness.setModalActive(true);
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		await harness.service.revealCanvas(harness.opened[0].reference);

		assert.deepStrictEqual(harness.openOptions, [
			{
				pinned: true,
				revealIfOpened: true,
				preserveFocus: true,
				inactive: true,
				activation: EditorActivation.PRESERVE,
			},
			{ pinned: true, revealIfOpened: true, preserveFocus: false },
		]);
		assert.deepStrictEqual(harness.groupRestores, [false, false]);
	});

	test('completed historical model opens preserve an active modal', async () => {
		const harness = createHarness();
		harness.setModalActive(true);
		harness.openRequests.set(new Map([['preview', { id: 'historical-request', succeeded: true }]]), undefined);
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);

		assert.deepStrictEqual(harness.openOptions, [
			{
				pinned: true,
				revealIfOpened: true,
				preserveFocus: true,
				inactive: true,
				activation: EditorActivation.PRESERVE,
			},
		]);
	});

	test('waits for a running model open before foregrounding through a modal', async () => {
		const harness = createHarness();
		harness.setModalActive(true);
		harness.openRequests.set(new Map([['preview', { id: 'fresh-request', succeeded: false, pending: true }]]), undefined);
		harness.canvases.set([harness.canvas], undefined);
		const beforeSuccess = harness.opened.length;
		harness.openRequests.set(new Map([['preview', { id: 'fresh-request', succeeded: true }]]), undefined);
		await timeout(0);

		assert.deepStrictEqual({
			beforeSuccess,
			options: harness.openOptions,
		}, {
			beforeSuccess: 0,
			options: [{ pinned: true, revealIfOpened: true, preserveFocus: false }],
		});
	});

	test('a canvas of a background context opens without taking focus or the active tab', async () => {
		const harness = createHarness({ background: true });
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);

		assert.deepStrictEqual(harness.openOptions, [{ pinned: true, revealIfOpened: true, preserveFocus: true, inactive: true, activation: EditorActivation.PRESERVE }]);
	});

	test('a canvas of a background context stays inactive when a working-set swap closed it while it was the active editor', async () => {
		const harness = createHarness({ background: true, workingSets: true });
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		const input = harness.opened[0];
		harness.setActiveInput(input);
		harness.workingSetState.set({ owner: undefined, restoring: false, applying: true }, undefined);
		harness.openEditors.length = 0;
		input.dispose();
		harness.workingSetState.set({ owner: undefined, restoring: false, applying: false }, undefined);
		await timeout(0);
		await timeout(0);

		assert.deepStrictEqual(harness.openOptions.slice(1), [{ pinned: true, preserveFocus: true, inactive: true, activation: EditorActivation.PRESERVE }]);
	});

	test('waits for a running model open in a background context before foregrounding it', async () => {
		const harness = createHarness({ background: true });
		harness.openRequests.set(new Map([['preview', { id: 'fresh-request', succeeded: false, pending: true }]]), undefined);
		harness.canvases.set([harness.canvas], undefined);
		const beforeSuccess = harness.opened.length;
		harness.openRequests.set(new Map([['preview', { id: 'fresh-request', succeeded: true }]]), undefined);
		await timeout(0);

		assert.deepStrictEqual({
			beforeSuccess,
			options: harness.openOptions,
		}, {
			beforeSuccess: 0,
			options: [{ pinned: true, revealIfOpened: true, preserveFocus: false }],
		});
	});

	test('failed model opens still allow modal-safe background presentation', async () => {
		const harness = createHarness();
		harness.setModalActive(true);
		harness.openRequests.set(new Map([['preview', { id: 'failed-request', succeeded: false }]]), undefined);
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);

		assert.deepStrictEqual(harness.openOptions, [{
			pinned: true,
			revealIfOpened: true,
			preserveFocus: true,
			inactive: true,
			activation: EditorActivation.PRESERVE,
		}]);
	});

	test('foregrounds a successful model open that arrives during modal-safe presentation', async () => {
		const harness = createHarness();
		harness.setModalActive(true);
		const pending = harness.delayOpen();
		harness.canvases.set([harness.canvas], undefined);
		harness.openRequests.set(new Map([['preview', { id: 'fresh-request', succeeded: false, pending: true }]]), undefined);
		harness.openRequests.set(new Map([['preview', { id: 'fresh-request', succeeded: true }]]), undefined);
		await pending.complete();
		await timeout(0);

		assert.deepStrictEqual(harness.openOptions, [
			{
				pinned: true,
				revealIfOpened: true,
				preserveFocus: true,
				inactive: true,
				activation: EditorActivation.PRESERVE,
			},
			{ pinned: true, revealIfOpened: true, preserveFocus: false },
		]);
	});

	test('keeps hidden owners out of presentation and isolates identical instances in different chats', async () => {
		const harness = createHarness();
		harness.visible.set(new Set(), undefined);
		harness.canvases.set([harness.canvas], undefined);
		const hiddenCount = harness.opened.length;
		const peerOwner = { ...harness.owner, chat: URI.parse('chat:/peer') };
		harness.contexts.set([{ owner: harness.owner, canvases: harness.canvases }, { owner: peerOwner, canvases: harness.canvases }], undefined);
		harness.visible.set(new Set([canvasOwnerKey(harness.owner), canvasOwnerKey(peerOwner)]), undefined);
		await timeout(0);
		assert.deepStrictEqual({
			hiddenCount, count: harness.opened.length, identitiesDistinct: harness.opened[0].resource.toString() !== harness.opened[1].resource.toString(),
		}, { hiddenCount: 0, count: 2, identitiesDistinct: true });
	});

	test('closes the canvas of an owner that stops being visible and shows it again once the owner is visible', async () => {
		const harness = createHarness();
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		const input = harness.opened[0];
		const peerOwner = { ...harness.owner, chat: URI.parse('chat:/peer') };
		harness.contexts.set([{ owner: harness.owner, canvases: harness.canvases }, { owner: peerOwner, canvases: observableValue('peerCanvases', []) }], undefined);
		harness.visible.set(new Set([canvasOwnerKey(peerOwner)]), undefined);
		await timeout(0);
		const closedWhileHidden = harness.closed.slice();
		harness.visible.set(new Set([canvasOwnerKey(harness.owner)]), undefined);
		await timeout(0);
		assert.deepStrictEqual({
			closedWhileHidden: closedWhileHidden.map(closed => closed === input),
			shownAgain: harness.openEditors.length,
		}, { closedWhileHidden: [true], shownAgain: 1 });
	});

	test('shows the canvas again once its owner is visible after a folder location working-set swap closed it while the owner was hidden', async () => {
		const harness = createHarness();
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		const input = harness.opened[0];
		harness.setApplyingWorkingSet(true);
		harness.visible.set(new Set(), undefined);
		harness.openEditors.length = 0;
		input.dispose();
		harness.setApplyingWorkingSet(false);
		harness.visible.set(new Set([canvasOwnerKey(harness.owner)]), undefined);
		await timeout(0);
		assert.deepStrictEqual({ reopened: harness.openEditors.length, opened: harness.opened.length }, { reopened: 1, opened: 2 });
	});

	test('keeps a canvas the user closed while no owner is visible dismissed once its owner is visible again', async () => {
		const harness = createHarness();
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		const input = harness.opened[0];
		harness.visible.set(new Set(), undefined);
		harness.openEditors.length = 0;
		input.dispose();
		harness.visible.set(new Set([canvasOwnerKey(harness.owner)]), undefined);
		await timeout(0);
		assert.deepStrictEqual({ reopened: harness.openEditors.length, opened: harness.opened.length }, { reopened: 0, opened: 1 });
	});

	test('shows the canvas again after a folder location working-set swap closed it while its owner was visible', async () => {
		const harness = createHarness();
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		const input = harness.opened[0];
		harness.setApplyingWorkingSet(true);
		harness.openEditors.length = 0;
		input.dispose();
		await timeout(0);
		const openedWhileApplying = harness.opened.length;
		harness.setApplyingWorkingSet(false);
		await timeout(0);
		assert.deepStrictEqual({ openedWhileApplying, reopened: harness.openEditors.length, opened: harness.opened.length }, { openedWhileApplying: 1, reopened: 1, opened: 2 });
	});

	suite('restores the canvas as the active tab at a folder location', () => {

		/**
		 * Switches to the folder location `path` while the canvas is the active editor or not, as the folder location
		 * working sets do, and returns whether the canvas came back as a background tab.
		 */
		async function switchTo(harness: ReturnType<typeof createHarness>, path: string, active: boolean): Promise<boolean | undefined> {
			const input = harness.opened[harness.opened.length - 1];
			harness.setActiveInput(active ? input : undefined);
			harness.setFolderLocation(path);
			harness.setApplyingWorkingSet(true);
			harness.setActiveInput(undefined);
			harness.openEditors.length = 0;
			input.dispose();
			harness.setApplyingWorkingSet(false);
			await timeout(0);
			return harness.openOptions[harness.openOptions.length - 1]?.inactive;
		}

		async function createOpenHarness() {
			const harness = createHarness();
			harness.canvases.set([harness.canvas], undefined);
			await timeout(0);
			return harness;
		}

		test('in the background when a working set is applied without changing the location, as source control working sets are', async () => {
			const harness = await createOpenHarness();
			await switchTo(harness, '/worktree', true);
			await switchTo(harness, '/workspace', true);
			// The working set being applied restores a text editor as the active one, which the canvas must not replace.
			const input = harness.opened[harness.opened.length - 1];
			harness.setActiveInput(input);
			harness.setApplyingWorkingSet(true);
			harness.setActiveInput(upcastPartial<EditorInput>({}));
			harness.openEditors.length = 0;
			input.dispose();
			harness.setApplyingWorkingSet(false);
			await timeout(0);
			assert.deepStrictEqual(harness.openOptions[harness.openOptions.length - 1]?.inactive, true);
		});

		test('active when it was the active editor there, as after visiting a worktree', async () => {
			const harness = await createOpenHarness();
			assert.deepStrictEqual([
				await switchTo(harness, '/worktree', true),
				await switchTo(harness, '/workspace', true),
			], [false, false]);
		});

		test('in the background when another editor was active there, although it was the active editor at the worktree', async () => {
			const harness = await createOpenHarness();
			assert.deepStrictEqual([
				await switchTo(harness, '/worktree', false),
				await switchTo(harness, '/workspace', true),
			], [true, true]);
		});

		test('as it was at the location left when visiting a location for the first time', async () => {
			const harness = await createOpenHarness();
			assert.deepStrictEqual([
				await switchTo(harness, '/worktree1', true),
				await switchTo(harness, '/worktree2', false),
			], [false, true]);
		});

		test('in the background as remembered there when its owner stayed hidden across two location swaps', async () => {
			const harness = await createOpenHarness();
			await switchTo(harness, '/worktreeB', true);
			await switchTo(harness, '/workspace', false);
			harness.visible.set(new Set(), undefined);
			await switchTo(harness, '/worktreeC', true);
			await switchTo(harness, '/worktreeB', false);
			harness.visible.set(new Set([canvasOwnerKey(harness.owner)]), undefined);
			await timeout(0);
			assert.deepStrictEqual({
				opened: harness.opened.length,
				inactive: harness.openOptions[harness.openOptions.length - 1]?.inactive,
			}, { opened: 4, inactive: true });
		});

		test('active as it was at the location left when its owner stayed hidden across swaps to two locations it was not open at', async () => {
			const harness = await createOpenHarness();
			harness.visible.set(new Set(), undefined);
			await switchTo(harness, '/worktreeC', true);
			await switchTo(harness, '/worktreeD', false);
			harness.visible.set(new Set([canvasOwnerKey(harness.owner)]), undefined);
			await timeout(0);
			assert.deepStrictEqual({
				opened: harness.opened.length,
				inactive: harness.openOptions[harness.openOptions.length - 1]?.inactive,
			}, { opened: 2, inactive: false });
		});

		test('active when applying the editors of the location failed and its editor area is emptied instead', async () => {
			const harness = await createOpenHarness();
			const input = harness.opened[0];
			harness.setActiveInput(input);
			harness.setFolderLocation('/worktree');
			harness.setApplyingWorkingSet(true);
			harness.setActiveInput(undefined);
			harness.openEditors.length = 0;
			input.dispose();
			const reopening = harness.delayOpen();
			harness.setApplyingWorkingSet(false);
			// The editor area is emptied while the canvas is still opening again after the failed apply.
			harness.setApplyingWorkingSet(true);
			harness.opened[harness.opened.length - 1].dispose();
			await reopening.complete();
			await timeout(0);
			harness.setApplyingWorkingSet(false);
			await timeout(0);
			assert.deepStrictEqual(harness.openOptions.slice(1).map(options => options?.inactive), [false, false]);
		});

		test('as it was at the location left once that location is the least recently left of too many', async () => {
			const harness = await createOpenHarness();
			await switchTo(harness, '/worktree0', false);
			for (let i = 1; i <= 20; i++) {
				await switchTo(harness, `/worktree${i}`, true);
			}
			assert.deepStrictEqual(await switchTo(harness, '/workspace', true), false);
		});

		test('as it was at the location left once the user closed it while another surface shows it, and showed it again', async () => {
			const harness = createHarness({ presentedElsewhere: true });
			harness.canvases.set([harness.canvas], undefined);
			await timeout(0);
			await switchTo(harness, '/worktree', false);
			const input = harness.opened[harness.opened.length - 1];
			input.dispose();
			await harness.service.revealCanvas(input.reference);
			assert.deepStrictEqual(await switchTo(harness, '/workspace', true), false);
		});
	});

	test('closes the canvas of a hidden owner when the visible owner has not settled its canvases', async () => {
		const harness = createHarness();
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		const input = harness.opened[0];
		const peerOwner = { ...harness.owner, chat: URI.parse('chat:/peer') };
		harness.contexts.set([{ owner: harness.owner, canvases: harness.canvases }, { owner: peerOwner, canvases: observableValue<undefined>('peerCanvases', undefined) }], undefined);
		harness.visible.set(new Set([canvasOwnerKey(peerOwner)]), undefined);
		await timeout(0);
		assert.deepStrictEqual(harness.closed.map(closed => closed === input), [true]);
	});

	test('closes the canvas of a hidden owner whose canvases became unsettled, or whose context was dropped, when another owner is visible', async () => {
		const harness = createHarness();
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		const input = harness.opened[0];
		const peerOwner = { ...harness.owner, chat: URI.parse('chat:/peer') };
		const peerContext = { owner: peerOwner, canvases: observableValue('peerCanvases', []) };
		harness.contexts.set([{ owner: harness.owner, canvases: harness.canvases }, peerContext], undefined);
		harness.canvases.set(undefined, undefined);
		harness.visible.set(new Set([canvasOwnerKey(peerOwner)]), undefined);
		await timeout(0);
		const closedWhileUnsettled = harness.closed.map(closed => closed === input);

		const droppedHarness = createHarness();
		droppedHarness.canvases.set([droppedHarness.canvas], undefined);
		await timeout(0);
		const droppedInput = droppedHarness.opened[0];
		droppedHarness.contexts.set([{ owner: peerOwner, canvases: observableValue('peerCanvases', []) }], undefined);
		droppedHarness.visible.set(new Set([canvasOwnerKey(peerOwner)]), undefined);
		await timeout(0);
		assert.deepStrictEqual({
			closedWhileUnsettled,
			closedWhenDropped: droppedHarness.closed.map(closed => closed === droppedInput),
		}, { closedWhileUnsettled: [true], closedWhenDropped: [true] });
	});

	test('keeps its canvases while no owner is visible, and with working sets leaves the swap to them', async () => {
		const harness = createHarness({ workingSets: true });
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		const peerOwner = { ...harness.owner, chat: URI.parse('chat:/peer') };
		harness.contexts.set([{ owner: harness.owner, canvases: harness.canvases }, { owner: peerOwner, canvases: observableValue('peerCanvases', []) }], undefined);
		harness.visible.set(new Set([canvasOwnerKey(peerOwner)]), undefined);
		await timeout(0);
		assert.deepStrictEqual(harness.closed.length, 0);
	});

	test('manual reveals enforce exact owner visibility, live sources, and AI enablement', async () => {
		const harness = createHarness();
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		const reference = harness.opened[0].reference;
		await harness.service.revealCanvas({ ...reference, chat: URI.parse('chat:/other') });
		harness.visible.set(new Set(), undefined);
		await harness.service.revealCanvas(reference);
		const afterHidden = harness.opened.length;
		harness.visible.set(new Set([canvasOwnerKey(harness.owner)]), undefined);
		harness.canvases.set([{ ...harness.canvas, source: undefined }], undefined);
		await harness.service.revealCanvas(reference);
		const afterUnavailable = harness.opened.length;
		harness.hideAI();
		await harness.service.revealCanvas(reference);
		assert.deepStrictEqual({ afterHidden, afterUnavailable, afterDisabled: harness.opened.length }, {
			afterHidden: 1, afterUnavailable: 1, afterDisabled: 1,
		});
	});

	test('reveals a canvas through an owner that a pill built outside the chat widget, once the editor was closed', async () => {
		const harness = createHarness();
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		const reference = harness.opened[0].reference;
		harness.opened[0].dispose();
		await harness.service.revealCanvas({ ...reference, providerId: 'session-pill', chat: URI.parse('chat:/pill') });
		assert.strictEqual(harness.opened.length, 2);
	});

	test('preserves manual reveal intent while a dismissed canvas source recovers', async () => {
		const harness = createHarness();
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		const reference = harness.opened[0].reference;
		harness.opened[0].dispose();
		harness.canvases.set([{ ...harness.canvas, source: undefined }], undefined);

		await harness.service.revealCanvas(reference);
		const afterUnavailableReveal = harness.opened.length;
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);

		assert.deepStrictEqual({
			afterUnavailableReveal,
			afterRecovery: harness.opened.length,
			sameLifetime: harness.opened[0].matches(harness.opened[1]),
		}, {
			afterUnavailableReveal: 1,
			afterRecovery: 2,
			sameLifetime: true,
		});
	});

	test('closes a late-opened editor after authoritative removal', async () => {
		const harness = createHarness();
		const pending = harness.delayOpen();
		harness.canvases.set([harness.canvas], undefined);
		harness.canvases.set([], undefined);
		await pending.complete();
		await timeout(0);
		assert.deepStrictEqual({ disposed: harness.opened[0].isDisposed(), closed: harness.closed.length }, { disposed: true, closed: 1 });
	});

	test('surfaces failed opens and permits manual retry without repeatedly revealing the lifetime', async () => {
		const harness = createHarness();
		harness.failOpen(true);
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		harness.failOpen(false);
		harness.visible.set(new Set(), undefined);
		harness.visible.set(new Set([canvasOwnerKey(harness.owner)]), undefined);
		await harness.service.reopenCanvas(harness.opened[0].reference);
		await timeout(0);
		assert.deepStrictEqual({ attempted: harness.opened.length, notifications: harness.notifications.length, sameInput: harness.opened[0] === harness.opened[1] }, { attempted: 2, notifications: 1, sameInput: true });
	});

	test('does not report a cancelled open as a failure after its input was removed', async () => {
		const harness = createHarness();
		const pending = harness.delayOpen();
		harness.failOpen(true);
		harness.canvases.set([harness.canvas], undefined);
		harness.canvases.set([], undefined);
		await pending.complete();
		await timeout(0);
		assert.deepStrictEqual({ notifications: harness.notifications.length, disposed: harness.opened[0].isDisposed() }, { notifications: 0, disposed: true });
	});

	test('updates a source during an in-flight open without repeatedly revealing the lifetime', async () => {
		const harness = createHarness();
		const pending = harness.delayOpen();
		harness.canvases.set([harness.canvas], undefined);
		harness.canvases.set([{ ...harness.canvas, source: URI.parse('https://example.test/replacement') }], undefined);
		const beforeCompletion = harness.opened.length;
		await pending.complete();
		await timeout(0);
		assert.deepStrictEqual({ beforeCompletion, after: harness.opened.length, source: harness.opened[0].canvas.get()?.source?.toString() }, {
			beforeCompletion: 1, after: 1, source: 'https://example.test/replacement',
		});
	});

	test('AI hiding closes presentation and stops eligibility immediately', async () => {
		const harness = createHarness();
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		harness.hideAI();
		await timeout(0);
		assert.deepStrictEqual({
			enabled: harness.service.enabled.get(), presentable: harness.service.isOwnerPresentable(harness.opened[0].reference), closed: harness.closed.length,
		}, { enabled: false, presentable: false, closed: 1 });
	});

	test('keeps user dismissals while AI is hidden and reopens only undismissed canvases', async () => {
		const harness = createHarness();
		harness.canvases.set([harness.canvas, { ...harness.canvas, resource: URI.parse('canvas:/second'), instanceId: 'second' }], undefined);
		await timeout(0);
		harness.opened[0].dispose();
		harness.hideAI();
		await timeout(0);
		harness.showAI();
		await timeout(0);
		assert.deepStrictEqual({
			opened: harness.opened.map(input => input.reference.canvas.toString()),
			reopenable: harness.service.reopenableCanvases.get().map(target => target.canvas.instanceId),
		}, { opened: ['canvas:/preview', 'canvas:/second', 'canvas:/second'], reopenable: ['preview'] });
	});

	test('moves an open canvas into a newly selected group instead of duplicating it', async () => {
		const harness = createHarness();
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		harness.selectGroup(2);
		await harness.service.revealCanvas(harness.opened[0].reference);
		assert.deepStrictEqual({
			openCalls: harness.opened.length,
			moves: harness.moves,
			groups: harness.openEditors.map(editor => editor.groupId),
			disposed: harness.opened[0].isDisposed(),
			reopenable: harness.service.reopenableCanvases.get().length,
		}, { openCalls: 1, moves: ['1->2'], groups: [2], disposed: false, reopenable: 0 });
	});

	test('closes a canvas in a chat window once its chat leaves the window, without dismissing it, and shows it again beside its chat', async () => {
		const harness = createHarness();
		harness.selectGroup(3);
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		const inChatWindow = harness.openEditors.map(editor => editor.groupId);
		// The chat leaves the chat window, and no window shows it.
		transaction(tx => {
			harness.chatWindowOwners.set(new Set(), tx);
			harness.visible.set(new Set(), tx);
		});
		await timeout(0);
		const afterLeaving = { open: harness.openEditors.map(editor => editor.groupId), closed: harness.closed.length, reopenable: harness.service.reopenableCanvases.get().length };
		// The main window shows the chat.
		harness.selectGroup(1);
		harness.visible.set(new Set([canvasOwnerKey(harness.owner)]), undefined);
		await timeout(0);

		assert.deepStrictEqual({ inChatWindow, afterLeaving, shownAgain: harness.openEditors.map(editor => editor.groupId) }, {
			inChatWindow: [3],
			afterLeaving: { open: [], closed: 1, reopenable: 0 },
			shownAgain: [1],
		});
	});

	test('keeps a canvas open in a main window group whichever chats the chat windows show', async () => {
		const harness = createHarness();
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		harness.chatWindowOwners.set(new Set(), undefined);
		await timeout(0);

		assert.deepStrictEqual({ open: harness.openEditors.map(editor => editor.groupId), closed: harness.closed.length }, { open: [1], closed: 0 });
	});

	test('closes a canvas the user moved into a chat window once its chat leaves the window', async () => {
		const harness = createHarness();
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		harness.moveByUser(3);
		await timeout(0);
		const moved = { open: harness.openEditors.map(editor => editor.groupId), closed: harness.closed.length };
		transaction(tx => {
			harness.chatWindowOwners.set(new Set(), tx);
			harness.visible.set(new Set(), tx);
		});
		await timeout(0);

		assert.deepStrictEqual({ moved, afterLeaving: { open: harness.openEditors.map(editor => editor.groupId), closed: harness.closed.length } }, {
			moved: { open: [3], closed: 0 },
			afterLeaving: { open: [], closed: 1 },
		});
	});

	test('with working sets, shows a canvas closed as its chat left a chat window beside the chat where it shows next, not as a working-set restore', async () => {
		const harness = createHarness({ workingSets: true });
		harness.selectGroup(3);
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		transaction(tx => {
			harness.chatWindowOwners.set(new Set(), tx);
			harness.visible.set(new Set(), tx);
		});
		await timeout(0);
		// The chat shows in the chat window again.
		transaction(tx => {
			harness.chatWindowOwners.set(new Set([canvasOwnerKey(harness.owner)]), tx);
			harness.visible.set(new Set([canvasOwnerKey(harness.owner)]), tx);
		});
		await timeout(0);

		assert.deepStrictEqual({ open: harness.openEditors.map(editor => editor.groupId), restores: harness.groupRestores, reopenable: harness.service.reopenableCanvases.get().length }, {
			open: [3],
			restores: [false, false],
			reopenable: 0,
		});
	});

	test('keeps the presentation of a canvas another surface shows once its chat leaves a chat window, and shows it again with it', async () => {
		const harness = createHarness({ workingSets: true, presentedElsewhere: true });
		harness.selectGroup(3);
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		const shownFirst = harness.opened[0].serializationId;
		transaction(tx => {
			harness.chatWindowOwners.set(new Set(), tx);
			harness.visible.set(new Set(), tx);
		});
		await timeout(0);
		const afterLeaving = { open: harness.openEditors.length, closed: harness.closed.length };
		transaction(tx => {
			harness.chatWindowOwners.set(new Set([canvasOwnerKey(harness.owner)]), tx);
			harness.visible.set(new Set([canvasOwnerKey(harness.owner)]), tx);
		});
		await timeout(0);

		assert.deepStrictEqual({ afterLeaving, open: harness.openEditors.map(editor => editor.groupId), samePresentation: harness.opened.at(-1)?.serializationId === shownFirst, restores: harness.groupRestores }, {
			afterLeaving: { open: 0, closed: 1 },
			open: [3],
			samePresentation: true,
			restores: [false, false],
		});
	});

	test('shows a canvas beside its chat in the main window once the chat moves there from a chat window, also while its editor there is still closing', async () => {
		const harness = createHarness({ workingSets: true });
		harness.selectGroup(3);
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		const close = harness.delayClose();
		// The chat moves to the main window, which is active and shows it.
		harness.selectNoGroup();
		harness.chatWindowOwners.set(new Set(), undefined);
		await timeout(0);
		const whileClosing = harness.openEditors.map(editor => editor.groupId);
		close.complete();
		await timeout(0);
		await timeout(0);

		assert.deepStrictEqual({ whileClosing, open: harness.openEditors.map(editor => editor.groupId), reopenable: harness.service.reopenableCanvases.get().length }, {
			whileClosing: [3],
			open: [1],
			reopenable: 0,
		});
	});

	test('revealing a canvas while its editor is closing reveals what the canvas is once that closed: nothing once it is gone, nor once the service is disposed', async () => {
		const reveal = async (meanwhile: (harness: ReturnType<typeof createHarness>) => void) => {
			const harness = createHarness({ workingSets: true });
			harness.selectGroup(3);
			harness.canvases.set([harness.canvas], undefined);
			await timeout(0);
			const close = harness.delayClose();
			harness.selectNoGroup();
			harness.chatWindowOwners.set(new Set(), undefined);
			await timeout(0);
			const revealed = harness.service.revealCanvas({ ...harness.owner, canvas: harness.canvas.resource });
			meanwhile(harness);
			close.complete();
			await revealed;
			await timeout(0);
			return { opens: harness.opened.length, open: harness.openEditors.map(editor => editor.groupId) };
		};

		assert.deepStrictEqual({
			canvasGone: await reveal(harness => harness.canvases.set([], undefined)),
			serviceDisposed: await reveal(harness => harness.service.dispose()),
		}, {
			canvasGone: { opens: 1, open: [] },
			serviceDisposed: { opens: 1, open: [] },
		});
	});
});
