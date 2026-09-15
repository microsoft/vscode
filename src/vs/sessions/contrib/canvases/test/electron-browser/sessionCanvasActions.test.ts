/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceCancellationError, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDialogService, type IConfirmationResult } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProgressService, Progress, ProgressLocation, type IProgress, type IProgressOptions, type IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputService, QuickInputHideReason, type IInputOptions, type IQuickInputHideEvent, type IQuickPick, type IQuickPickDidAcceptEvent, type IQuickPickItem, type QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { ISessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { CanvasSourceKind, SessionCanvasUri, type CanvasTypeDeclaration, type SessionCanvasOpenOptions } from '../../../../services/sessions/common/sessionCanvases.js';
import { makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { ISessionCanvasService, SessionCanvasInput, type ISessionCanvasTarget } from '../../common/sessionCanvas.js';
import { canvasReferenceFromContext, SessionCanvasActions } from '../../electron-browser/sessionCanvasActions.js';
import { createCanvasState, TestSessionCanvases } from '../common/sessionCanvasTestUtils.js';

suite('Session canvas command ownership', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const declaration: CanvasTypeDeclaration = { source: { kind: CanvasSourceKind.Extension, extensionId: 'fixture.counter' }, canvasType: 'counter', title: 'Counter', openInputSchema: { type: 'object' } };

	function fixture() {
		const instantiationService = store.add(new TestInstantiationService());
		const a = makeSession(URI.parse('session:/a'));
		const b = makeSession(URI.parse('session:/b'));
		const represented = observableValue('represented', a);
		instantiationService.stub(ISessionContext, { session: represented });
		const canvases = store.add(new TestSessionCanvases());
		const otherCanvases = store.add(new TestSessionCanvases(createCanvasState('ahp-session:/b/chat/default', 'ahp-canvas:/b')));
		const target: ISessionCanvasTarget = { session: a, chat: a.mainChat.get(), canvases };
		const otherTarget: ISessionCanvasTarget = { session: b, chat: b.mainChat.get(), canvases: otherCanvases };
		const reference = { providerId: a.providerId, session: a.resource, chat: target.chat.resource, canvas: URI.parse(canvases.entries.get()[0].resource) };
		const opens: { target: ISessionCanvasTarget; options: SessionCanvasOpenOptions }[] = [];
		instantiationService.stub(ISessionCanvasService, new class extends mock<ISessionCanvasService>() {
			override readonly enabled = observableValue(this, true);
			override getTarget(session: URI, chat: URI) {
				return [target, otherTarget].find(target => isEqual(target.session.resource, session) && isEqual(target.chat.resource, chat));
			}
			override async open(target: ISessionCanvasTarget, options: SessionCanvasOpenOptions): Promise<URI> {
				opens.push({ target, options });
				return SessionCanvasUri.create(reference);
			}
		});
		const accepted = store.add(new Emitter<IQuickPickDidAcceptEvent>());
		const hidden = store.add(new Emitter<IQuickInputHideEvent>());
		const input = new DeferredPromise<string | undefined>();
		let inputOptions: IInputOptions | undefined;
		let selectedLabel = 'Counter';
		let disposedPickers = 0;
		let createdPickers = 0;
		let pickerItems: () => readonly QuickPickInput<IQuickPickItem>[] = () => [];
		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
			override createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
			override createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T>;
			override createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: true }> | IQuickPick<T> {
				assert.strictEqual(options?.useSeparators, true);
				createdPickers++;
				const picker = new class extends mock<IQuickPick<T, { useSeparators: true }>>() {
					override items: readonly QuickPickInput<T>[] = [];
					override get selectedItems(): readonly T[] { return this.items.filter((item): item is T => item.type !== 'separator' && item.label === selectedLabel); }
					override readonly onDidAccept = accepted.event;
					override readonly onDidHide = hidden.event;
					override show(): void { }
					override hide(): void { hidden.fire({ reason: QuickInputHideReason.Other }); }
					override dispose(): void { disposedPickers++; }
				}();
				pickerItems = () => picker.items;
				return picker;
			}
			override input(options?: IInputOptions): Promise<string | undefined> {
				inputOptions = options;
				return input.p;
			}
		});
		const confirmation = new DeferredPromise<IConfirmationResult>();
		instantiationService.stub(IDialogService, { confirm: () => confirmation.p });
		let progressOptions: IProgressOptions | undefined;
		let cancelProgress: (() => void) | undefined;
		instantiationService.stub(IProgressService, new class extends mock<IProgressService>() {
			override withProgress<R>(options: IProgressOptions, task: (progress: IProgress<IProgressStep>) => Promise<R>, onDidCancel?: () => void): Promise<R> {
				progressOptions = options;
				cancelProgress = onDidCancel;
				return task(Progress.None);
			}
		});
		const actions = instantiationService.createInstance(SessionCanvasActions);
		return {
			a, b, target, otherTarget, reference, represented, canvases, otherCanvases, actions, confirmation, input, opens,
			inputOptions: () => inputOptions, pickerCounts: () => ({ created: createdPickers, disposed: disposedPickers }),
			pickerLabels: () => pickerItems().map(item => item.label), progressOptions: () => progressOptions,
			cancelProgress: () => cancelProgress?.(),
			select: (label: string) => { selectedLabel = label; accepted.fire({ inBackground: false }); },
			hide: () => hidden.fire({ reason: QuickInputHideReason.Gesture }),
		};
	}

	test('explicit session/chat targets and header contexts never fall back to a later active owner', () => {
		const f = fixture();
		f.represented.set(f.b, undefined);
		assert.deepStrictEqual([
			f.actions.resolveTarget(f.a).session.resource.toString(),
			f.actions.resolveTarget({ sessionResource: f.a.resource.toString(), chatResource: f.a.mainChat.get().resource.toString() }).session.resource.toString(),
			f.actions.resolveTarget(null).session.resource.toString(),
		], ['session:/a', 'session:/a', 'session:/b']);
		assert.throws(() => f.actions.resolveTarget({ sessionResource: 'session:/missing', chatResource: f.a.mainChat.get().resource.toString() }), /Select a supported local conversation/);
	});

	test('initialization closes the pure picker before execution and returns to the same owner catalog', async () => {
		const f = fixture();
		f.canvases.entries.set([], undefined);
		let beforeExecution: ReturnType<typeof f.pickerCounts> | undefined;
		f.canvases.onInitialize = async () => {
			beforeExecution = f.pickerCounts();
			f.canvases.catalog.set([declaration], undefined);
		};
		const managing = f.actions.manage();
		const beforeSelection = [...f.canvases.effects];
		f.select('Initialize Canvas Providers');
		await timeout(0);
		const labels = f.pickerLabels();
		f.hide();
		await managing;
		assert.deepStrictEqual({
			beforeSelection, beforeExecution, effects: f.canvases.effects, catalogShown: labels.includes('Counter'),
			picker: f.pickerCounts(), progress: { location: f.progressOptions()?.location, cancellable: f.progressOptions()?.cancellable },
		}, {
			beforeSelection: [], beforeExecution: { created: 1, disposed: 1 }, effects: ['initialize'], catalogShown: true,
			picker: { created: 2, disposed: 2 }, progress: { location: ProgressLocation.Notification, cancellable: true },
		});
	});

	test('initialization stays with its captured owner and does not reopen a picker after navigation', async () => {
		const f = fixture();
		const pending = new DeferredPromise<void>();
		f.canvases.onInitialize = () => pending.p;
		const managing = f.actions.manage();
		f.select('Initialize Canvas Providers');
		await timeout(0);
		f.represented.set(f.b, undefined);
		await pending.complete();
		await managing;
		assert.deepStrictEqual({
			original: f.canvases.effects, other: f.otherCanvases.effects, picker: f.pickerCounts(),
		}, { original: ['initialize'], other: [], picker: { created: 1, disposed: 1 } });
	});

	test('progress cancellation cancels only the selected initialization and never repeats it', async () => {
		const f = fixture();
		const pending = new DeferredPromise<void>();
		let token = CancellationToken.None;
		f.canvases.onInitialize = current => { token = current; return raceCancellationError(pending.p, current); };
		const managing = f.actions.manage();
		f.select('Initialize Canvas Providers');
		await timeout(0);
		f.cancelProgress();
		await managing;
		await pending.complete();
		assert.deepStrictEqual({ cancelled: token.isCancellationRequested, effects: f.canvases.effects, picker: f.pickerCounts() },
			{ cancelled: true, effects: ['initialize'], picker: { created: 1, disposed: 1 } });
	});

	test('an unsupported host offers only pure catalog browsing and initialization errors remain errors', async () => {
		const f = fixture();
		f.canvases.supportsInitialization.set(false, undefined);
		const browsing = f.actions.manage();
		const labels = f.pickerLabels();
		f.hide();
		await browsing;
		const before = [...f.canvases.effects];
		f.canvases.supportsInitialization.set(true, undefined);
		f.canvases.onInitialize = async () => { throw new Error('Controlled initialization failure'); };
		const rejected = assert.rejects(f.actions.manage(), /Controlled initialization failure/);
		f.select('Initialize Canvas Providers');
		await rejected;
		assert.deepStrictEqual({
			offeredInitialization: labels.includes('Initialize Canvas Providers'), before, effects: f.canvases.effects, picker: f.pickerCounts(),
		}, { offeredInitialization: false, before: [], effects: ['initialize'], picker: { created: 2, disposed: 2 } });
	});

	test('malformed explicit editor references cannot fall back to the active canvas', () => {
		const f = fixture();
		const input = store.add(new SessionCanvasInput(SessionCanvasUri.create(f.reference)));
		assert.deepStrictEqual([
			canvasReferenceFromContext(f.reference),
			canvasReferenceFromContext(input),
			canvasReferenceFromContext({ groupId: 1, editorIndex: 0 }),
			canvasReferenceFromContext(undefined),
		], [f.reference, input.reference, undefined, undefined]);
		assert.strictEqual(SessionCanvasUri.create(canvasReferenceFromContext(input.resource)!).toString(), input.resource.toString());
		assert.throws(() => canvasReferenceFromContext({ ...f.reference, session: f.reference.session.toString() }), /valid logical canvas reference/);
		assert.throws(() => canvasReferenceFromContext({ ...f.reference, canvas: URI.parse('https://example.invalid/not-a-logical-canvas') }), /valid logical canvas reference/);
		assert.throws(() => canvasReferenceFromContext(URI.file('/another-editor.txt')), /valid logical canvas reference/);
	});

	test('catalog selection and structured input remain attached to the captured owner through navigation', async () => {
		const f = fixture();
		f.canvases.entries.set([], undefined);
		f.canvases.catalog.set([declaration], undefined);
		const managing = f.actions.manage();
		f.select('Counter');
		await timeout(0);
		f.represented.set(f.b, undefined);
		const validate = f.inputOptions()?.validateInput;
		const invalid = await validate?.('{');
		const valid = await validate?.('{"count":3}');
		await f.input.complete('{"count":3}');
		await managing;
		assert.deepStrictEqual({
			invalid: typeof invalid, valid, owner: f.opens[0].target.session.resource.toString(), input: f.opens[0].options.input,
			type: f.opens[0].options.canvasType, picker: f.pickerCounts(),
		}, { invalid: 'string', valid: undefined, owner: 'session:/a', input: { count: 3 }, type: 'counter', picker: { created: 1, disposed: 1 } });
	});

	test('refresh stays in the same live picker and never starts or replays an effect', async () => {
		const f = fixture();
		let refreshes = 0;
		f.canvases.onRefresh = async () => { refreshes++; };
		const managing = f.actions.manage();
		f.select('Refresh Live Catalog');
		await timeout(0);
		f.hide();
		await managing;
		assert.deepStrictEqual({ refreshes, picker: f.pickerCounts(), effects: f.canvases.effects }, { refreshes: 2, picker: { created: 1, disposed: 1 }, effects: [] });
	});

	test('restart retains the pre-confirmation incarnation and provider/chat target', async () => {
		const f = fixture();
		const original = f.canvases.entries.get()[0];
		const restarting = f.actions.restart(f.reference);
		f.represented.set(f.b, undefined);
		f.canvases.setState({ ...createCanvasState(), revision: 2, identity: { ...original.identity, incarnation: 'replacement' } });
		await f.confirmation.complete({ confirmed: true });
		await restarting;
		assert.deepStrictEqual({ restarted: f.canvases.restarts, otherEffects: f.otherCanvases.effects }, { restarted: [original], otherEffects: [] });
	});

	test('cancelled restart and mismatched provider references produce no effect', async () => {
		const f = fixture();
		const restarting = f.actions.restart(f.reference);
		await f.confirmation.complete({ confirmed: false });
		await restarting;
		await assert.rejects(f.actions.restart({ ...f.reference, providerId: 'another-provider' }), /owning chat/);
		assert.deepStrictEqual(f.canvases.effects, []);
	});
});
