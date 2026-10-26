/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derivedOpts, IReader, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CanvasesEnabledSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotification, INotificationHandle } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IEditorIdentifier, ITextDiffEditorPane } from '../../../../common/editor.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IBrowserViewWorkbenchService } from '../../../browserView/common/browserView.js';
import { CanvasInput, canvasOwnerKey, ICanvas, ICanvasContext, ICanvasContextService, ICanvasOpenRequest, ICanvasOwner, ICanvasWorkingSets, ICanvasWorkingSetState, isCanvasOwner } from '../../common/canvas.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { CanvasService } from '../../electron-browser/canvasService.js';

suite('CanvasService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(harnessOptions?: { readonly workingSet?: ICanvasWorkingSetState; readonly presentsOutsideWorkingSets?: boolean | ((owner: ICanvasOwner, reader?: IReader) => boolean) }) {
		const owner: ICanvasOwner = { providerId: 'local', session: URI.parse('session:/owner'), chat: URI.parse('chat:/owner') };
		const canvas: ICanvas = {
			resource: URI.parse('canvas:/preview'), instanceId: 'preview', title: 'Preview', source: URI.parse('https://example.test'),
		};
		const canvases = observableValue<readonly ICanvas[] | undefined>('canvases', []);
		const openRequests = observableValue<ReadonlyMap<string, ICanvasOpenRequest>>('openRequests', new Map());
		const contexts = observableValue<readonly ICanvasContext[]>('contexts', [{ owner, canvases, openRequests }]);
		const visible = observableValue<ReadonlySet<string>>('visible', new Set([canvasOwnerKey(owner)]));
		const removed = store.add(new Emitter<ICanvasOwner>());
		const contextService = upcastPartial<ICanvasContextService>({
			contexts, onDidRemoveOwner: removed.event,
			isOwnerVisible: (owner, reader) => visible.read(reader).has(canvasOwnerKey(owner)),
			getContext: (owner, reader) => contexts.read(reader).find(context => isCanvasOwner(context.owner, owner)),
			getEditorGroup: () => targetGroup,
			...(harnessOptions?.workingSet ? { workingSets: upcastPartial<ICanvasWorkingSets>({ state: constObservable(harnessOptions.workingSet), registerEditorToRetain: () => Disposable.None, suppressEditorPartAutoVisibility: () => Disposable.None }) } : {}),
			...(typeof harnessOptions?.presentsOutsideWorkingSets === 'function' ? { presentsOutsideWorkingSets: harnessOptions.presentsOutsideWorkingSets }
				: harnessOptions?.presentsOutsideWorkingSets !== undefined ? { presentsOutsideWorkingSets: () => harnessOptions.presentsOutsideWorkingSets === true } : {}),
		});
		const opened: CanvasInput[] = [];
		const openEditors: IEditorIdentifier[] = [];
		const closed: CanvasInput[] = [];
		const moves: string[] = [];
		const groups = [1, 2].map(id => upcastPartial<IEditorGroup>({
			id, windowId: 1,
			moveEditor: (editor, target) => {
				openEditors.splice(openEditors.findIndex(candidate => candidate.editor === editor && candidate.groupId === id), 1, { groupId: target.id, editor });
				moves.push(`${id}->${target.id}`);
				return true;
			},
		}));
		let targetGroup = groups[0];
		let pendingOpen: DeferredPromise<void> | undefined;
		let failOpen = false;
		const notifications: INotification[] = [];
		const notificationService = new class extends TestNotificationService {
			override notify(notification: INotification): INotificationHandle {
				notifications.push(notification);
				return super.notify(notification);
			}
		}();
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<ITextDiffEditorPane | undefined> {
				const input = args[0];
				if (!(input instanceof CanvasInput)) {
					throw new Error('Expected a canvas input');
				}
				opened.push(input);
				if (pendingOpen) {
					await pendingOpen.p;
				}
				if (failOpen) {
					return undefined;
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
				for (const editor of editors) {
					if (editor.editor instanceof CanvasInput) {
						closed.push(editor.editor);
						openEditors.splice(openEditors.indexOf(editor), 1);
					}
				}
			}
		}();
		const instantiationService = store.add(new TestInstantiationService());
		const editorGroupsService = upcastPartial<IEditorGroupsService>({
			mainPart: upcastPartial<IEditorPart>({ windowId: 1 }),
			getGroup: id => groups.find(group => group.id === id),
		});
		instantiationService.stub(IEditorGroupsService, editorGroupsService);
		const sentiment = store.add(new Emitter<void>());
		let hidden = false;
		const entitlementService = upcastPartial<IChatEntitlementService>({
			get sentiment() { return { hidden }; },
			onDidChangeSentiment: sentiment.event,
		});
		const service = store.add(new CanvasService(contextService, editorService, editorGroupsService, instantiationService, upcastPartial<IBrowserViewWorkbenchService>({}), entitlementService,
			new TestConfigurationService({ [CanvasesEnabledSettingId]: true }), new NullLogService(), notificationService));
		return {
			owner, canvas, canvases, contexts, openRequests, visible, removed, opened, openEditors, closed, moves, notifications, service,
			delayOpen: () => pendingOpen = new DeferredPromise<void>(),
			failOpen: (value: boolean) => failOpen = value,
			hideAI: () => { hidden = true; sentiment.fire(); },
			showAI: () => { hidden = false; sentiment.fire(); },
			selectGroup: (id: number) => targetGroup = groups[id - 1],
		};
	}

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

	test('presents canvases outside the working set of another owner only when the context service opts in', async () => {
		const other = { sessionResource: URI.parse('session:/other'), chatResource: undefined };
		const own = { sessionResource: URI.parse('session:/owner'), chatResource: undefined };
		const workingSets: Record<string, ICanvasWorkingSetState> = {
			own: { owner: own, restoring: false, applying: false },
			other: { owner: other, restoring: false, applying: false },
			restoring: { owner: other, restoring: true, applying: false },
		};
		const presented: Record<string, Record<string, number>> = {};
		for (const [hook, presentsOutsideWorkingSets] of [['without hook', undefined], ['hook declines', false], ['hook allows', true]] as const) {
			presented[hook] = {};
			for (const [name, workingSet] of Object.entries(workingSets)) {
				const harness = createHarness({ workingSet, presentsOutsideWorkingSets });
				harness.canvases.set([harness.canvas], undefined);
				await timeout(0);
				presented[hook][name] = harness.opened.length;
			}
		}

		assert.deepStrictEqual(presented, {
			'without hook': { own: 1, other: 0, restoring: 0 },
			'hook declines': { own: 1, other: 0, restoring: 0 },
			'hook allows': { own: 1, other: 1, restoring: 1 },
		});
	});

	test('does no presentation work for window changes that keep the presented owners', async () => {
		const ownerKey = canvasOwnerKey({ providerId: 'local', session: URI.parse('session:/owner'), chat: URI.parse('chat:/owner') });
		const run = async (workingSetOwner: URI) => {
			// Windows that show chats; only the set of their owners matters to presentation.
			const windows = observableValue<readonly { readonly owner: string; readonly title: string }[]>('windows', [{ owner: ownerKey, title: 'first' }]);
			const presentedOwners = derivedOpts<ReadonlySet<string>>({ equalsFn: (a, b) => a.size === b.size && [...a].every(key => b.has(key)) },
				reader => new Set(windows.read(reader).map(window => window.owner)));
			let hookCalls = 0;
			const harness = createHarness({
				workingSet: { owner: { sessionResource: workingSetOwner, chatResource: undefined }, restoring: false, applying: false },
				presentsOutsideWorkingSets: (owner, reader) => {
					hookCalls++;
					return presentedOwners.read(reader).has(canvasOwnerKey(owner));
				},
			});
			harness.canvases.set([harness.canvas], undefined);
			await timeout(0);
			harness.canvases.set([{ ...harness.canvas, instanceId: undefined }], undefined);
			await timeout(0);
			let canvasChanges = -1;
			store.add(autorun(reader => { harness.opened[0]?.canvas.read(reader); canvasChanges++; }));
			const before = hookCalls;
			windows.set([{ owner: ownerKey, title: 'navigated' }, { owner: ownerKey, title: 'second' }], undefined);
			const afterWindowChange = hookCalls - before;
			harness.canvases.set([{ ...harness.canvas, instanceId: undefined }], undefined);
			harness.visible.set(new Set(harness.visible.get()), undefined);
			await timeout(0);
			return { opened: harness.opened.length, hookCalled: hookCalls > 0, hookCallsPerWindowChange: afterWindowChange, canvasChangesPerRerun: canvasChanges };
		};

		assert.deepStrictEqual({
			otherWorkingSet: await run(URI.parse('session:/other')),
			ownWorkingSet: await run(URI.parse('session:/owner')),
		}, {
			otherWorkingSet: { opened: 1, hookCalled: true, hookCallsPerWindowChange: 0, canvasChangesPerRerun: 0 },
			ownWorkingSet: { opened: 1, hookCalled: false, hookCallsPerWindowChange: 0, canvasChangesPerRerun: 0 },
		});
	});

	test('reopens a dismissed lifetime only for a new successful model open request', async () => {
		const harness = createHarness();
		harness.openRequests.set(new Map([['preview', { id: 'first', succeeded: true }]]), undefined);
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		harness.opened[0].dispose();
		harness.canvases.set([{ ...harness.canvas, title: 'Updated', source: URI.parse('https://example.test/replacement') }], undefined);
		const afterMetadata = harness.opened.length;
		harness.openRequests.set(new Map([['preview', { id: 'second', succeeded: false }]]), undefined);
		const beforeSuccess = harness.opened.length;
		harness.openRequests.set(new Map([['preview', { id: 'second', succeeded: true }]]), undefined);
		await timeout(0);
		assert.deepStrictEqual({
			afterMetadata, beforeSuccess, afterSuccess: harness.opened.length, sameLifetime: harness.opened[0].matches(harness.opened[1]),
		}, { afterMetadata: 1, beforeSuccess: 1, afterSuccess: 2, sameLifetime: true });
	});

	test('does not undo a user close after the corresponding model open started', async () => {
		const harness = createHarness();
		harness.openRequests.set(new Map([['preview', { id: 'opening', succeeded: false }]]), undefined);
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		harness.opened[0].dispose();
		harness.openRequests.set(new Map([['preview', { id: 'opening', succeeded: true }]]), undefined);
		assert.strictEqual(harness.opened.length, 1);
	});

	test('acknowledges successful opens of a visible canvas without repeatedly revealing it', async () => {
		const harness = createHarness();
		harness.openRequests.set(new Map([['preview', { id: 'first', succeeded: false }]]), undefined);
		harness.canvases.set([harness.canvas], undefined);
		await timeout(0);
		harness.openRequests.set(new Map([['preview', { id: 'first', succeeded: true }]]), undefined);
		harness.openRequests.set(new Map([['preview', { id: 'second', succeeded: true }]]), undefined);
		assert.strictEqual(harness.opened.length, 1);
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
});
