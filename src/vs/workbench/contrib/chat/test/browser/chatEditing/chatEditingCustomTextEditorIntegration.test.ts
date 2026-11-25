/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { EditOperation } from '../../../../../../editor/common/core/editOperation.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../../../editor/common/core/range.js';
import { LineRange } from '../../../../../../editor/common/core/ranges/lineRange.js';
import { ISelection, Selection } from '../../../../../../editor/common/core/selection.js';
import { IDocumentDiff } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping, RangeMapping } from '../../../../../../editor/common/diff/rangeMapping.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IActiveEditorChangeEvent, IEditorPane, IVisibleEditorPane } from '../../../../../common/editor.js';
import { IEditorGroup } from '../../../../../services/editor/common/editorGroupsService.js';
import { IGroupModelChangeEvent } from '../../../../../common/editor/editorGroupModel.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { CustomEditorInput } from '../../../../customEditor/browser/customEditorInput.js';
import { CustomEditorCapabilities, ICustomEditorService } from '../../../../customEditor/common/customEditor.js';
import { ICustomTextEditorNavigation } from '../../../../customEditor/common/customTextEditorNavigation.js';
import { IOverlayWebview } from '../../../../webview/browser/webview.js';
import { IWebviewWorkbenchService } from '../../../../webviewPanel/browser/webviewWorkbenchService.js';
import { IDocumentDiff2 } from '../../../browser/chatEditing/chatEditingCodeEditorIntegration.js';
import { ChatEditingCustomTextEditorIntegration } from '../../../browser/chatEditing/chatEditingCustomTextEditorIntegration.js';
import { ctxCursorInChangeRange } from '../../../browser/chatEditing/chatEditingEditorContextKeys.js';
import { ChatEditingOverlayController } from '../../../browser/chatEditing/chatEditingEditorOverlay.js';
import { ChatEditingTextModelChangeService } from '../../../browser/chatEditing/chatEditingTextModelChangeService.js';
import { IChatEditingService, IChatEditingSession, IModifiedFileEntry, IModifiedFileEntryEditorIntegration, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';

class TestNavigation extends Disposable implements ICustomTextEditorNavigation {
	private readonly _onDidChangeSelection = this._register(new Emitter<void>());
	readonly onDidChangeSelection = this._onDidChangeSelection.event;
	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose = this._onDidDispose.event;

	selection: ISelection | undefined;
	readonly revealed: { readonly range: IRange; readonly selection: ISelection | undefined; readonly preserveFocus: boolean; readonly token: CancellationToken }[] = [];

	constructor(readonly model: ITextModel) {
		super();
	}

	setSelection(selection: ISelection | undefined): void {
		this.selection = selection;
		this._onDidChangeSelection.fire();
	}

	async revealRange(range: IRange, selection: ISelection | undefined, preserveFocus: boolean, token: CancellationToken): Promise<void> {
		const validatedRange = this.model.validateRange(range);
		assert.ok(validatedRange.equalsRange(range), `Invalid range passed to revealRange: ${Range.lift(range).toString()} (expected ${validatedRange.toString()})`);
		if (selection) {
			const selRange = Selection.liftSelection(selection);
			const validatedSel = this.model.validateRange(selRange);
			assert.ok(validatedSel.equalsRange(selRange), `Invalid selection passed to revealRange`);
		}
		this.revealed.push({ range, selection, preserveFocus, token });
	}

	captureViewState() {
		return Disposable.None;
	}

	override dispose(): void {
		this._onDidDispose.fire();
		super.dispose();
	}
}

suite('ChatEditingCustomTextEditorIntegration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSetup(capabilities?: CustomEditorCapabilities) {
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(ICustomEditorService, {
			getCustomEditorCapabilities: () => capabilities,
		});
		instantiation.stub(IWebviewWorkbenchService, {});

		const openedDiffs: unknown[] = [];
		instantiation.stub(IEditorService, {
			openEditor: async (editor: unknown) => {
				openedDiffs.push(editor);
				return undefined;
			},
			getEditors: () => [],
		});

		const originalModel = store.add(createTextModel('line 1\nline 2\nline 3\nline 4\nline 5', 'markdown', undefined, URI.parse('chat-editing-snapshot-text-model:/doc.md')));
		const modifiedModel = store.add(createTextModel('line 1 edited\nline 2\nline 3\nline 4 edited\nline 5', 'markdown', undefined, URI.file('/workspace/doc.md')));

		const webview = upcastPartial<IOverlayWebview>({ onMessage: Event.None, dispose: () => { } });
		const input = store.add(instantiation.createInstance(CustomEditorInput, {
			resource: modifiedModel.uri,
			viewType: 'vscode.markdown.editor',
			webviewTitle: undefined,
			preferredName: 'doc.md',
			iconPath: undefined,
		}, webview, {}));

		const paneContextKeyService = store.add(new MockContextKeyService());
		const groupContextKeyService = store.add(new MockContextKeyService());
		const onDidActiveEditorChange = store.add(new Emitter<IActiveEditorChangeEvent>());
		const onDidModelChange = store.add(new Emitter<IGroupModelChangeEvent>());
		let activeEditorPane: IVisibleEditorPane | undefined;
		const group = upcastPartial<IEditorGroup>({
			scopedContextKeyService: groupContextKeyService,
			onDidActiveEditorChange: onDidActiveEditorChange.event,
			onDidModelChange: onDidModelChange.event,
			get activeEditorPane() { return activeEditorPane; },
			get activeEditor() { return activeEditorPane?.input; },
			focus: () => { },
		});

		const pane = upcastPartial<IVisibleEditorPane>({
			input,
			group,
			scopedContextKeyService: paneContextKeyService,
			getControl: () => undefined,
			getId: () => 'workbench.editor.webviewEditor',
		});
		activeEditorPane = pane;

		const change1 = new DetailedLineRangeMapping(new LineRange(1, 2), new LineRange(1, 2), undefined);
		const change2 = new DetailedLineRangeMapping(new LineRange(4, 5), new LineRange(4, 5), undefined);

		const kept: DetailedLineRangeMapping[] = [];
		const undone: DetailedLineRangeMapping[] = [];
		const diffObs = observableValue<IDocumentDiff2>('diff', {
			identical: false,
			quitEarly: false,
			changes: [change1, change2],
			moves: [],
			originalModel,
			modifiedModel,
			keep: async change => { kept.push(change); return true; },
			undo: async change => { undone.push(change); return true; },
		});

		const entryState = observableValue('entryState', ModifiedFileEntryState.Modified);
		const isBeingModified = observableValue<{ responseModel: undefined; undoStopId: undefined } | undefined>('isBeingModified', undefined);
		const entry = new class extends mock<IModifiedFileEntry>() {
			override readonly originalURI = originalModel.uri;
			override readonly modifiedURI = modifiedModel.uri;
			override readonly state = entryState;
			override readonly isCurrentlyBeingModifiedBy = isBeingModified;
			override readonly lastModifyingRequestId = 'req-1';
			override readonly waitsForLastEdits = constObservable(false);
			override readonly reviewMode = constObservable(true);
			override readonly autoAcceptController = constObservable(undefined);
			override readonly changesCount = diffObs.map(d => d.changes.length);
			private _integration: IModifiedFileEntryEditorIntegration | undefined;
			override getEditorIntegration(targetPane: IEditorPane): IModifiedFileEntryEditorIntegration {
				if (!this._integration) {
					this._integration = store.add(instantiation.createInstance(ChatEditingCustomTextEditorIntegration, this, targetPane, diffObs));
				}
				return this._integration;
			}
		}();

		const navigation = store.add(new TestNavigation(modifiedModel));

		return {
			instantiation,
			input,
			pane,
			group,
			onDidActiveEditorChange,
			entry,
			entryState,
			diffObs,
			change1,
			change2,
			kept,
			undone,
			openedDiffs,
			navigation,
			paneContextKeyService,
			groupContextKeyService,
			setActivePane: (nextPane: IVisibleEditorPane | undefined) => {
				activeEditorPane = nextPane;
				onDidActiveEditorChange.fire({ editor: nextPane?.input });
			},
		};
	}

	test('navigates between changes via custom text editor navigation with valid ranges and cancels superseded reveals', () => {
		const ctx = createSetup({ isTextEditor: true });
		ctx.input.navigation = ctx.navigation;
		const integration = store.add(ctx.instantiation.createInstance(ChatEditingCustomTextEditorIntegration, ctx.entry, ctx.pane, ctx.diffObs));

		integration.reveal(true);
		assert.strictEqual(integration.currentIndex.get(), 0);
		assert.strictEqual(ctx.navigation.revealed.length, 1);
		assert.deepStrictEqual(ctx.navigation.revealed[0].range, new Range(1, 1, 1, 14));
		assert.strictEqual(ctx.navigation.revealed[0].token.isCancellationRequested, false);

		assert.strictEqual(integration.next(false), true);
		assert.strictEqual(integration.currentIndex.get(), 1);
		assert.strictEqual(ctx.navigation.revealed.length, 2);
		assert.strictEqual(ctx.navigation.revealed[0].token.isCancellationRequested, true);
		assert.strictEqual(ctx.navigation.revealed[1].token.isCancellationRequested, false);
		assert.deepStrictEqual(ctx.navigation.revealed[1].range, new Range(4, 1, 4, 14));

		// At the last change, strict next returns false; wrap returns true and goes to 0.
		assert.strictEqual(integration.next(false), false);
		assert.strictEqual(integration.next(true), true);
		assert.strictEqual(integration.currentIndex.get(), 0);

		// At the first change, strict previous returns false; wrap goes to last.
		assert.strictEqual(integration.previous(false), false);
		assert.strictEqual(integration.previous(true), true);
		assert.strictEqual(integration.currentIndex.get(), 1);

		const lastToken = ctx.navigation.revealed[ctx.navigation.revealed.length - 1].token;
		assert.strictEqual(lastToken.isCancellationRequested, false);
		integration.dispose();
		assert.strictEqual(lastToken.isCancellationRequested, true);
	});

	test('clamps EOF deletion range to a valid document range and enables cursorInChangeRange after reveal', async () => {
		const ctx = createSetup({ isTextEditor: true });
		ctx.input.navigation = ctx.navigation;
		const eofDeletion = new DetailedLineRangeMapping(new LineRange(5, 6), new LineRange(6, 6), undefined);
		ctx.diffObs.set({ ...ctx.diffObs.get(), changes: [eofDeletion] }, undefined);

		const integration = store.add(ctx.instantiation.createInstance(ChatEditingCustomTextEditorIntegration, ctx.entry, ctx.pane, ctx.diffObs));
		integration.reveal(true);
		assert.strictEqual(ctx.navigation.revealed.length, 1);
		assert.deepStrictEqual(ctx.navigation.revealed[0].range, new Range(5, 7, 5, 7));

		// Simulate the custom editor moving its selection to the revealed clamped range.
		ctx.navigation.setSelection(ctx.navigation.revealed[0].selection);
		assert.strictEqual(ctx.paneContextKeyService.getContextKeyValue(ctxCursorInChangeRange.key), true);

		await integration.acceptNearestChange();
		assert.deepStrictEqual(ctx.kept, [eofDeletion]);
	});

	test('does not consume next/previous when custom editor has no navigation bridge', () => {
		const ctx = createSetup({ isTextEditor: true });
		const integration = store.add(ctx.instantiation.createInstance(ChatEditingCustomTextEditorIntegration, ctx.entry, ctx.pane, ctx.diffObs));

		const initialIndex = integration.currentIndex.get();
		assert.strictEqual(integration.next(false), false);
		assert.strictEqual(integration.next(true), false);
		assert.strictEqual(integration.previous(false), false);
		assert.strictEqual(integration.previous(true), false);
		assert.strictEqual(integration.currentIndex.get(), initialIndex);
	});

	test('scopes cursorInChangeRange to the active editor pane and prevents inactive integrations from resetting it', () => {
		const ctx = createSetup({ isTextEditor: true });
		ctx.input.navigation = ctx.navigation;
		const globalContextKeyService = ctx.instantiation.get(IContextKeyService);

		const integration1 = store.add(ctx.instantiation.createInstance(ChatEditingCustomTextEditorIntegration, ctx.entry, ctx.pane, ctx.diffObs));

		// Split group with its own pane & scoped context key service
		const splitPaneCtx = store.add(new MockContextKeyService());
		const splitGroupCtx = store.add(new MockContextKeyService());
		const splitRef: { pane?: IVisibleEditorPane } = {};
		const splitGroup: IEditorGroup = upcastPartial<IEditorGroup>({
			scopedContextKeyService: splitGroupCtx,
			onDidActiveEditorChange: Event.None,
			onDidModelChange: Event.None,
			get activeEditorPane() { return splitRef.pane; },
			get activeEditor() { return ctx.input; },
			focus: () => { },
		});
		const splitPane = upcastPartial<IVisibleEditorPane>({
			input: ctx.input,
			group: splitGroup,
			scopedContextKeyService: splitPaneCtx,
			getControl: () => undefined,
			getId: () => 'workbench.editor.webviewEditor',
		});
		splitRef.pane = splitPane;
		const integration2 = store.add(ctx.instantiation.createInstance(ChatEditingCustomTextEditorIntegration, ctx.entry, splitPane, ctx.diffObs));

		ctx.navigation.setSelection(new Selection(4, 1, 4, 5));
		assert.strictEqual(ctx.paneContextKeyService.getContextKeyValue(ctxCursorInChangeRange.key), true);
		assert.strictEqual(splitPaneCtx.getContextKeyValue(ctxCursorInChangeRange.key), true);
		assert.strictEqual(globalContextKeyService.getContextKeyValue(ctxCursorInChangeRange.key), undefined);

		// Disposing the split integration resets only its own scoped key, not the primary pane's key.
		integration2.dispose();
		assert.strictEqual(splitPaneCtx.getContextKeyValue(ctxCursorInChangeRange.key), false);
		assert.strictEqual(ctx.paneContextKeyService.getContextKeyValue(ctxCursorInChangeRange.key), true);

		// Switching tabs in the same pane to a second modified custom editor: inactive integration1 must not clobber integrationB.
		const otherModel = store.add(createTextModel('a edited\nb', 'markdown', undefined, URI.file('/workspace/other.md')));
		const otherOrig = store.add(createTextModel('a\nb', 'markdown', undefined, URI.parse('chat-editing-snapshot-text-model:/other.md')));
		const otherWebview = upcastPartial<IOverlayWebview>({ onMessage: Event.None, dispose: () => { } });
		const otherInput = store.add(ctx.instantiation.createInstance(CustomEditorInput, {
			resource: otherModel.uri, viewType: 'vscode.markdown.editor', webviewTitle: undefined, preferredName: 'other.md', iconPath: undefined,
		}, otherWebview, {}));
		const otherNav = store.add(new TestNavigation(otherModel));
		otherNav.setSelection(new Selection(1, 1, 1, 2));
		otherInput.navigation = otherNav;
		const otherChange = new DetailedLineRangeMapping(new LineRange(1, 2), new LineRange(1, 2), undefined);
		const otherDiff = observableValue<IDocumentDiff2>('otherDiff', {
			identical: false, quitEarly: false, changes: [otherChange], moves: [],
			originalModel: otherOrig, modifiedModel: otherModel,
			keep: async () => true, undo: async () => true,
		});
		const otherEntry = new class extends mock<IModifiedFileEntry>() {
			override readonly originalURI = otherOrig.uri;
			override readonly modifiedURI = otherModel.uri;
			override readonly state = constObservable(ModifiedFileEntryState.Modified);
			override readonly isCurrentlyBeingModifiedBy = constObservable(undefined);
			override readonly lastModifyingRequestId = 'req-2';
		}();

		// Switch pane input to otherInput
		(ctx.pane as unknown as { input: CustomEditorInput }).input = otherInput;
		ctx.onDidActiveEditorChange.fire({ editor: otherInput });
		store.add(ctx.instantiation.createInstance(ChatEditingCustomTextEditorIntegration, otherEntry, ctx.pane, otherDiff));
		assert.strictEqual(ctx.paneContextKeyService.getContextKeyValue(ctxCursorInChangeRange.key), true);

		// Updating selection or disposing the now-inactive integration1 must not reset the pane's key.
		ctx.navigation.setSelection(new Selection(2, 1, 2, 1));
		assert.strictEqual(ctx.paneContextKeyService.getContextKeyValue(ctxCursorInChangeRange.key), true);
		integration1.dispose();
		assert.strictEqual(ctx.paneContextKeyService.getContextKeyValue(ctxCursorInChangeRange.key), true);
	});

	test('rejects stale hunk mappings after a user edit while diff recomputation is pending', async () => {
		const originalModel = store.add(createTextModel('header\nline 2\nline 3', 'markdown', undefined, URI.parse('chat-editing-snapshot-text-model:/stale.md')));
		const modifiedModel = store.add(createTextModel('header\nline 2\nline 3', 'markdown', undefined, URI.file('/workspace/stale.md')));

		const initialChange = new DetailedLineRangeMapping(
			new LineRange(3, 4),
			new LineRange(3, 4),
			[new RangeMapping(new Range(3, 1, 3, 7), new Range(3, 1, 3, 14))]
		);
		let diffCallCount = 0;
		const pendingDiff = new DeferredPromise<IDocumentDiff>();
		const editorWorkerService = new class extends mock<IEditorWorkerService>() {
			override async computeDiff(): Promise<IDocumentDiff | null> {
				diffCallCount++;
				if (diffCallCount === 1) {
					return { identical: false, quitEarly: false, changes: [initialChange], moves: [] };
				}
				return pendingDiff.p;
			}
		}();
		const accessibilitySignalService = new class extends mock<IAccessibilitySignalService>() {
			override async playSignal(): Promise<void> { }
		}();

		const stateObs = observableValue('state', ModifiedFileEntryState.Modified);
		const changeService = store.add(new ChatEditingTextModelChangeService(
			originalModel,
			modifiedModel,
			stateObs,
			undefined,
			editorWorkerService,
			accessibilitySignalService,
		));

		// Apply an agent edit on line 3 and let the first diff complete.
		await changeService.resetDocumentValues(undefined, 'header\nline 2\nline 3 edited');
		const diff1 = await changeService.getDiffInfo();
		assert.strictEqual(diff1.changes.length, 1);

		// User inserts two lines above the hunk; recomputation is held pending.
		modifiedModel.applyEdits([EditOperation.insert(new Position(1, 1), 'user line A\nuser line B\n')]);
		const expectedModifiedAfterUserEdit = modifiedModel.getValue();
		const expectedOriginalAfterUserEdit = originalModel.getValue();

		const diff2Obs = changeService.diffInfo.get();
		const staleChange = diff2Obs.changes[0];

		// Both undo and keep must reject the stale mapping without modifying either model.
		assert.strictEqual(await diff2Obs.undo(staleChange), false);
		assert.strictEqual(modifiedModel.getValue(), expectedModifiedAfterUserEdit);
		assert.strictEqual(await diff2Obs.keep(staleChange), false);
		assert.strictEqual(originalModel.getValue(), expectedOriginalAfterUserEdit);

		// Also verify integration does not advance when keep/undo rejects a stale hunk.
		const ctx = createSetup({ isTextEditor: true });
		ctx.input.navigation = ctx.navigation;
		ctx.diffObs.set({
			...ctx.diffObs.get(),
			keep: async () => false,
			undo: async () => false,
		}, undefined);
		const integration = store.add(ctx.instantiation.createInstance(ChatEditingCustomTextEditorIntegration, ctx.entry, ctx.pane, ctx.diffObs));
		integration.reveal(true);
		const revealsBefore = ctx.navigation.revealed.length;
		await integration.rejectNearestChange();
		await integration.acceptNearestChange();
		assert.strictEqual(ctx.navigation.revealed.length, revealsBefore);
		assert.strictEqual(integration.currentIndex.get(), 0);

		pendingDiff.complete({ identical: false, quitEarly: false, changes: [], moves: [] });
	});

	test('replays reveal once custom text editor navigation attaches and cancels on navigation change', () => {
		const ctx = createSetup({ isTextEditor: true });
		const integration = store.add(ctx.instantiation.createInstance(ChatEditingCustomTextEditorIntegration, ctx.entry, ctx.pane, ctx.diffObs));

		integration.reveal(false);
		assert.strictEqual(integration.currentIndex.get(), 1);
		assert.strictEqual(ctx.navigation.revealed.length, 0);

		ctx.input.navigation = ctx.navigation;
		assert.strictEqual(ctx.navigation.revealed.length, 1);
		assert.deepStrictEqual(ctx.navigation.revealed[0].range, new Range(4, 1, 4, 14));
		assert.strictEqual(ctx.navigation.revealed[0].token.isCancellationRequested, false);

		ctx.input.navigation = undefined;
		assert.strictEqual(ctx.navigation.revealed[0].token.isCancellationRequested, true);
	});

	test('tracks cursorInChangeRange and prioritizes cursor hunk for keep/undo/toggleDiff', async () => {
		const ctx = createSetup({ isTextEditor: true });
		ctx.input.navigation = ctx.navigation;
		const integration = store.add(ctx.instantiation.createInstance(ChatEditingCustomTextEditorIntegration, ctx.entry, ctx.pane, ctx.diffObs));

		ctx.navigation.setSelection(new Selection(2, 1, 2, 1));
		assert.strictEqual(ctx.paneContextKeyService.getContextKeyValue(ctxCursorInChangeRange.key), false);

		// Reveal hunk 1 so _currentIndex is 0, then move cursor to hunk 2.
		integration.reveal(true);
		assert.strictEqual(integration.currentIndex.get(), 0);

		ctx.navigation.setSelection(new Selection(4, 1, 4, 5));
		assert.strictEqual(ctx.paneContextKeyService.getContextKeyValue(ctxCursorInChangeRange.key), true);

		// Keep should target hunk 2 (where the cursor is), not hunk 1.
		await integration.acceptNearestChange();
		assert.deepStrictEqual(ctx.kept, [ctx.change2]);

		// Move cursor back to hunk 1 and Undo should target hunk 1.
		ctx.navigation.setSelection(new Selection(1, 1, 1, 5));
		await integration.rejectNearestChange();
		assert.deepStrictEqual(ctx.undone, [ctx.change1]);

		await integration.toggleDiff(undefined, true);
		assert.strictEqual(ctx.openedDiffs.length, 1);
	});

	test('overlay attaches to custom text editors and hides when accepted', () => {
		const ctx = createSetup({ isTextEditor: true });
		ctx.input.navigation = ctx.navigation;

		const session = new class extends mock<IChatEditingSession>() {
			override readonly isGlobalEditingSession = constObservable(true);
			override readonly entries = constObservable<readonly IModifiedFileEntry[]>([ctx.entry]);
			override readEntry(uri: URI): IModifiedFileEntry | undefined {
				return uri.toString() === ctx.entry.modifiedURI.toString() ? ctx.entry : undefined;
			}
		}();

		ctx.instantiation.stub(IChatEditingService, {
			editingSessionsObs: constObservable([session]),
		});

		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));

		store.add(ctx.instantiation.createInstance(ChatEditingOverlayController, container, ctx.group));
		assert.ok(container.querySelector('.chat-editing-editor-overlay'), 'overlay should be attached for custom text editor');

		ctx.entryState.set(ModifiedFileEntryState.Accepted, undefined);
		assert.strictEqual(container.querySelector('.chat-editing-editor-overlay'), null, 'overlay should hide once accepted');
	});

	test('overlay does not attach to non-text custom editors without navigation', () => {
		const ctx = createSetup({ isTextEditor: false });

		const session = new class extends mock<IChatEditingSession>() {
			override readonly isGlobalEditingSession = constObservable(true);
			override readonly entries = constObservable<readonly IModifiedFileEntry[]>([ctx.entry]);
			override readEntry(uri: URI): IModifiedFileEntry | undefined {
				return uri.toString() === ctx.entry.modifiedURI.toString() ? ctx.entry : undefined;
			}
		}();

		ctx.instantiation.stub(IChatEditingService, {
			editingSessionsObs: constObservable([session]),
		});

		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));

		store.add(ctx.instantiation.createInstance(ChatEditingOverlayController, container, ctx.group));
		assert.strictEqual(container.querySelector('.chat-editing-editor-overlay'), null, 'overlay should not attach to binary custom editor');

		// Once navigation attaches, overlay appears.
		ctx.input.navigation = ctx.navigation;
		assert.ok(container.querySelector('.chat-editing-editor-overlay'), 'overlay should appear when navigation attaches');
	});
});
