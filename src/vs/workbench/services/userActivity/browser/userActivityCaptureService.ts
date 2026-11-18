/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { basenameOrAuthority } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IModelContentChangedEvent } from '../../../../editor/common/textModelEvents.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IHostService } from '../../host/browser/host.js';
import { getUserActivitySources, IUserActivityCaptureService, IUserActivityEvent, IUserActivitySource, IUserActivityTarget, USER_ACTIVITY_MAX_CONTEXT, USER_ACTIVITY_MAX_TEXT } from '../common/userActivityCapture.js';
import { capText, headAndTail, IdleCoalescer, isNoisyCommand, isPasswordField, isPlainTextField, isSearchField, linesAround, normalizeWhitespace, resolveArea, resolveDomTarget, resolveFrame, resolveLabel, textAround, TypingBuffer } from './userActivityCaptureHelpers.js';

/** Keyboard focus settles this long before it is recorded. */
const FOCUS_DEBOUNCE = 300;
/** Typing in an input box is one event until it pauses this long. */
const FIELD_TYPING_IDLE = 1500;
/** Typing in a code editor is one event until it pauses this long. */
const EDITOR_TYPING_IDLE = 2000;
/** A selection settles this long before it is recorded. */
const SELECTION_DEBOUNCE = 700;
/** A command that runs this long after a keystroke or a click is the user's; later ones are the program's. */
const GESTURE_WINDOW = 800;
/** Lines around an edit, and around a selection, that read it in place. */
const TYPING_CONTEXT_LINES = 2;
/** Lines kept around the cursor, as they read before an edit, so the edit can say what it changed. */
const EDIT_CONTEXT_LINES = 1;
const MAX_EDIT_LINES = 40;
const MAX_EDIT_BEFORE = 1500;
/** Reading: lines kept in view in a focused editor this long or longer are recorded, once scrolling settles this long. */
const READ_MIN = 15_000;
const READ_SETTLE = 1000;
const READ_CONTEXT = 800;
/** A reading span stops counting this long after the user's last keystroke, pointer move or scroll in the window. */
const READ_IDLE = 60_000;
const SELECTION_CONTEXT_LINES = 5;
/** The most lines of a selection that are read. */
const MAX_SELECTION_LINES = 200;
/** Text selected in a view reads in place within this much of the text around it, from blocks no longer than the max. */
const SELECTION_BLOCK_CONTEXT = 1500;
const MAX_SELECTION_BLOCK = 50_000;

/** Edits that are not the user's, even in an editor they have focused. */
const NON_USER_EDIT_SOURCES = new Set(['Chat.applyEdits', 'Chat.undoEdits', 'Chat.reset', 'inlineChat.applyEdits', 'reloadFromDisk', 'setValue', 'eolChange']);

const LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };

interface IEditorTyping {
	readonly buffer: TypingBuffer;
	uri?: URI;
	line?: number;
	context?: string;
	/** The lines the edit touched as they read before it, while the edit stays within them. */
	before?: IEditorLines;
	/** Lines the edit added (or, below zero, removed) so far. */
	lineDelta: number;
	/** The edit left the lines known before it, or the document changed under them. */
	beforeLost?: boolean;
}

/** Lines of a document as they read at a version. */
interface IEditorLines {
	readonly uri: string;
	readonly version: number;
	readonly start: number;
	readonly lines: readonly string[];
}

interface IFieldTyping {
	readonly buffer: TypingBuffer;
	readonly target: IUserActivityTarget;
	compositionLength: number;
}

interface IGesture {
	readonly kind: 'key' | 'pointer';
	readonly element: Element | undefined;
	readonly time: number;
}

/**
 * Records what the user does in the window while at least one {@link start} is live. Every
 * listener is attached when capture starts and disposed when it stops; each is guarded so a
 * failure is logged, never thrown into the workbench.
 */
export class UserActivityCaptureService extends Disposable implements IUserActivityCaptureService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidRecord = this._register(new Emitter<IUserActivityEvent>());
	readonly onDidRecord = this._onDidRecord.event;

	private starts = 0;
	private capturing = false;
	private readonly capture = this._register(new MutableDisposable<DisposableStore>());
	private sources: IUserActivitySource[] = [];
	private lastGesture: IGesture | undefined;
	/** Record typing still pending, so that it comes before what ends it. */
	private readonly typingFlushes = new Set<() => void>();
	/** Edits in code editors still coalescing, while capture runs. */
	private editorTyping: IdleCoalescer<ICodeEditor, IEditorTyping> | undefined;
	/** What the user reads in code editors, while capture runs. */
	private reading: ReadingTracker | undefined;
	private lastInputAt = Date.now();
	private readonly windowKind: 'agents' | 'editor';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IEditorService private readonly editorService: IEditorService,
		@ICommandService private readonly commandService: ICommandService,
		@IHostService private readonly hostService: IHostService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.windowKind = environmentService.isSessionsWindow ? 'agents' : 'editor';
	}

	get isCapturing(): boolean {
		return this.capturing;
	}

	start(): IDisposable {
		if (this.starts++ === 0) {
			this.capturing = true;
			this.capture.value = this.startCapture();
		}
		let live = true;
		return toDisposable(() => {
			if (live) {
				live = false;
				if (--this.starts === 0) {
					this.capturing = false;
					this.capture.clear();
				}
			}
		});
	}

	// ---- recording ----

	private record(event: IUserActivityEvent): void {
		if (!this.capturing) {
			return;
		}
		const text = capText(event.text, USER_ACTIVITY_MAX_TEXT);
		const context = capText(event.context, USER_ACTIVITY_MAX_CONTEXT);
		this._onDidRecord.fire({
			kind: event.kind,
			time: event.time,
			target: event.target,
			...(text ? { text } : {}),
			...(context ? { context } : {}),
			detail: { ...event.detail, window: this.windowKind },
		});
	}

	/** `fn`, made unable to throw: a failure is logged. */
	private guard<A extends unknown[]>(what: string, fn: (...args: A) => void): (...args: A) => void {
		return (...args: A) => {
			try {
				fn(...args);
			} catch (e) {
				this.logService.warn(`[userActivity] ${what}: ${e}`);
			}
		};
	}

	private startCapture(): DisposableStore {
		const store = new DisposableStore();
		const attach = (what: string, fn: (store: DisposableStore) => void) => this.guard(`could not capture ${what}`, fn)(store);
		attach('the DOM', s => this.captureDom(s));
		attach('reading', s => this.captureReading(s));
		attach('code editors', s => this.captureEditors(s));
		attach('the active editor', s => this.captureActiveEditor(s));
		attach('commands', s => this.captureCommands(s));
		attach('window focus', s => this.captureWindowFocus(s));
		attach('sources', s => this.startSources(s));
		store.add(toDisposable(() => this.lastGesture = undefined));
		return store;
	}

	// ---- sources from outside the workbench core ----

	private startSources(store: DisposableStore): void {
		for (const ctor of getUserActivitySources()) {
			try {
				const source = store.add(this.instantiationService.createInstance(ctor));
				this.sources.push(source);
				source.start(e => this.guard('record', (ev: IUserActivityEvent) => this.record(ev))(e));
			} catch (e) {
				this.logService.warn(`[userActivity] could not start a source: ${e}`);
			}
		}
		store.add(toDisposable(() => this.sources = []));
	}

	private describeResource(resource: URI): Partial<IUserActivityTarget> {
		let described: Partial<IUserActivityTarget> = {};
		for (const source of this.sources) {
			try {
				const d = source.describeResource?.(resource);
				if (d) {
					described = { ...described, ...d };
				}
			} catch (e) {
				this.logService.warn(`[userActivity] could not describe ${resource.toString()}: ${e}`);
			}
		}
		return described;
	}

	// ---- DOM: clicks, focus, copy and paste, typing in input boxes, selection in rendered text ----

	private captureDom(store: DisposableStore): void {
		const windows = store.add(new DisposableMap<number>());
		const attach = ({ window }: dom.IRegisteredCodeWindow) => windows.set(window.vscodeWindowId, this.captureWindow(window));
		for (const registered of dom.getWindows()) {
			attach(registered);
		}
		store.add(dom.onDidRegisterWindow(this.guard('attach to a window', attach)));
		store.add(dom.onWillUnregisterWindow(window => windows.deleteAndDispose(window.vscodeWindowId)));
	}

	private captureWindow(window: CodeWindow): IDisposable {
		const store = new DisposableStore();
		const doc = window.document;
		const on = <K extends keyof DocumentEventMap>(type: K, handler: (e: DocumentEventMap[K]) => void) =>
			store.add(dom.addDisposableListener(doc, type, this.guard(type, handler), LISTENER_OPTIONS));

		// Gestures, for telling the user's commands from the program's. Synthetic events are the program's.
		on('mousedown', e => {
			if (e.isTrusted) {
				this.lastGesture = { kind: 'pointer', element: elementOf(e.target), time: Date.now() };
			}
		});
		on('keydown', e => {
			// Typing a character runs no command worth recording; a chord, a function key or Enter may.
			if (e.isTrusted && (e.ctrlKey || e.metaKey || e.altKey || e.key.length > 1)) {
				this.lastGesture = { kind: 'key', element: elementOf(e.target), time: Date.now() };
			}
		});

		// Signs the user is there, for reading spans: one stops counting a while after the last of them.
		const present = () => this.lastInputAt = Date.now();
		on('mousemove', present);
		on('keydown', present);
		on('wheel', present);

		on('click', e => {
			const element = elementOf(e.target);
			if (element && e.isTrusted) {
				const target = this.clickTarget(element);
				// What the click acted on: the command an "Allow" approved, the session a row stands for; in a
				// document, the line clicked with one either side, as it reads.
				const editor = element.closest('.monaco-editor') ? this.focusedEditorFor(element) : undefined;
				const model = editor?.getModel();
				const line = editor?.getPosition()?.lineNumber;
				const context = element.closest('.monaco-editor')
					? (model && line && model.uri.scheme !== Schemas.vscodeChatInput ? linesAround(model, line, line, 1) : undefined)
					: resolveFrame(element, target.label);
				this.record({ kind: 'click', time: Date.now(), target, ...(context ? { context } : {}) });
			}
		});

		// Focus, once it settles.
		let focused: Element | undefined;
		let lastFocusKey: string | undefined;
		const focusScheduler = store.add(new RunOnceScheduler(this.guard('focus', () => {
			const element = focused;
			focused = undefined;
			if (!element?.isConnected) {
				return;
			}
			const target = this.focusTarget(element);
			const key = `${target.area}|${target.view}|${target.label}|${target.uri?.toString()}`;
			if (key !== lastFocusKey) {
				lastFocusKey = key;
				this.record({ kind: 'focus', time: Date.now(), target });
			}
		}), FOCUS_DEBOUNCE));
		on('focusin', e => {
			focused = elementOf(e.target);
			focusScheduler.schedule();
		});
		store.add(toDisposable(() => focused = undefined));

		// Copy, cut and paste.
		const clipboard = (kind: 'copy' | 'cut' | 'paste') => (e: ClipboardEvent) => {
			const element = elementOf(e.target) ?? undefined;
			const active = doc.activeElement ?? undefined;
			if (isPasswordField(element) || isPasswordField(active)) {
				return;
			}
			const editor = this.focusedEditorFor(element);
			const text = kind === 'paste' ? e.clipboardData?.getData('text/plain') : this.selectedText(editor, active, window);
			if (!text) {
				return;
			}
			const target = editor ? this.editorTarget(editor, editor.getPosition()?.lineNumber) : element ? this.domTarget(element) : { area: 'other' };
			this.record({ kind, time: Date.now(), target, text });
		};
		on('copy', clipboard('copy'));
		on('cut', clipboard('cut'));
		on('paste', clipboard('paste'));

		// Typing in plain input boxes and text areas, until it pauses; a search or find box records its query.
		const fields = store.add(new IdleCoalescer<HTMLInputElement | HTMLTextAreaElement, IFieldTyping>(
			FIELD_TYPING_IDLE,
			field => ({ buffer: new TypingBuffer(), target: this.domTarget(field), compositionLength: 0 }),
			this.guard('typing in a field', (field, typing) => this.recordFieldTyping(field, typing)),
		));
		on('input', e => {
			const field = elementOf(e.target);
			if (!e.isTrusted || !isPlainTextField(field)) {
				return;
			}
			const input = e as InputEvent;
			fields.update(field, typing => {
				const inserted = input.data ?? (input.inputType === 'insertLineBreak' || input.inputType === 'insertParagraph' ? '\n' : '');
				if (input.inputType === 'insertCompositionText') {
					typing.buffer.apply(inserted, typing.compositionLength);
					typing.compositionLength = inserted.length;
				} else {
					typing.compositionLength = 0;
					typing.buffer.apply(inserted, input.inputType?.startsWith('delete') ? 1 : 0);
				}
			});
		});
		on('focusout', e => {
			const field = elementOf(e.target);
			if (isPlainTextField(field)) {
				fields.flush(field);
			}
		});
		this.flushTypingWith(store, () => fields.flushAll());

		// Text selected outside editors and input boxes: a chat transcript, a hover, a view.
		let lastSelection: string | undefined;
		const selectionScheduler = store.add(new RunOnceScheduler(this.guard('selection', () => {
			const selection = window.getSelection();
			const text = selection?.toString();
			const anchor = selection?.anchorNode ? (dom.isHTMLElement(selection.anchorNode) ? selection.anchorNode : selection.anchorNode.parentElement) : undefined;
			if (!selection || selection.isCollapsed || !text?.trim() || !anchor || anchor.closest('.monaco-editor') || isPlainTextField(doc.activeElement)) {
				lastSelection = undefined;
				return;
			}
			if (text === lastSelection) {
				return;
			}
			lastSelection = text;
			const common = selection.rangeCount ? selection.getRangeAt(0).commonAncestorContainer : anchor;
			const container = dom.isHTMLElement(common) ? common : common.parentElement ?? anchor;
			const block = container.closest('.rendered-markdown, .monaco-list-row, p, li, pre, td') ?? container;
			const blockText = block === doc.body ? '' : block.textContent ?? '';
			this.record({
				kind: 'selection',
				time: Date.now(),
				target: this.domTarget(anchor),
				text,
				...(blockText && blockText.length <= MAX_SELECTION_BLOCK ? { context: textAround(blockText, text, SELECTION_BLOCK_CONTEXT) } : {}),
			});
		}), SELECTION_DEBOUNCE));
		on('selectionchange', () => selectionScheduler.schedule());

		return store;
	}

	private flushTypingWith(store: DisposableStore, flush: () => void): void {
		this.typingFlushes.add(flush);
		store.add(toDisposable(() => this.typingFlushes.delete(flush)));
	}

	private domTarget(element: Element): IUserActivityTarget {
		return resolveDomTarget(element, el => this.viewOf(el));
	}

	private viewOf(element: Element): string | undefined {
		try {
			const view = this.contextKeyService.getContext(element as HTMLElement).getValue<string>('view');
			return typeof view === 'string' && view ? view : undefined;
		} catch {
			return undefined;
		}
	}

	/** A click in a code editor's text is a click at a line of its document; elsewhere, on what the element says. */
	private clickTarget(element: Element): IUserActivityTarget {
		const editor = this.editorOf(element);
		if (editor && element.closest('.view-lines, .lines-content, .margin')) {
			return this.editorTarget(editor, editor.getPosition()?.lineNumber);
		}
		return this.domTarget(element);
	}

	private focusTarget(element: Element): IUserActivityTarget {
		const editor = this.editorOf(element);
		if (editor && (element.classList.contains('native-edit-context') || element.tagName === 'TEXTAREA')) {
			return this.editorTarget(editor, editor.getPosition()?.lineNumber);
		}
		return this.domTarget(element);
	}

	private recordFieldTyping(field: HTMLInputElement | HTMLTextAreaElement, typing: IFieldTyping): void {
		if (!typing.buffer.edited || isPasswordField(field)) {
			return;
		}
		if (isSearchField(field)) {
			if (field.value.trim()) {
				this.record({ kind: 'search', time: Date.now(), target: typing.target, text: field.value });
			}
			return;
		}
		this.record({ kind: 'type', time: Date.now(), target: typing.target, text: typing.buffer.text, context: field.value });
	}

	/** What a copy or cut takes: the focused editor's selection (its line when empty), a field's selection, or the page's. */
	private selectedText(editor: ICodeEditor | undefined, active: Element | undefined, window: Window): string | undefined {
		if (editor) {
			const model = editor.getModel();
			const selections = editor.getSelections() ?? [];
			if (!model || !selections.length) {
				return undefined;
			}
			if (selections.every(s => s.isEmpty())) {
				return model.getLineContent(selections[0].startLineNumber);
			}
			return selections.filter(s => !s.isEmpty()).map(s => model.getValueInRange(clipRange(s))).join('\n');
		}
		if (isPlainTextField(active)) {
			const { selectionStart, selectionEnd, value } = active;
			return selectionStart !== null && selectionEnd !== null && selectionEnd > selectionStart ? value.substring(selectionStart, selectionEnd) : undefined;
		}
		return window.getSelection()?.toString() || undefined;
	}

	// ---- code editors: typing and selections ----

	/** The code editor whose DOM holds an element (the innermost, for an editor embedded in another). */
	private editorOf(element: Element | undefined): ICodeEditor | undefined {
		const node = element?.closest('.monaco-editor');
		return node ? this.codeEditorService.listCodeEditors().find(e => e.getDomNode() === node) : undefined;
	}

	private focusedEditorFor(element: Element | undefined): ICodeEditor | undefined {
		const editor = this.editorOf(element) ?? this.codeEditorService.getFocusedCodeEditor() ?? undefined;
		return editor?.hasTextFocus() ? editor : undefined;
	}

	private editorTitle(editor: ICodeEditor, uri: URI | undefined): string | undefined {
		const shows = (control: unknown) => control === editor || (isDiffEditor(control) && (control.getModifiedEditor() === editor || control.getOriginalEditor() === editor));
		const pane = this.editorService.visibleEditorPanes.find(p => shows(p.getControl()));
		// A pane that is closing has no input for a moment.
		return pane?.input?.getName() ?? (uri ? basenameOrAuthority(uri) : undefined);
	}

	private editorTarget(editor: ICodeEditor, line?: number, uri = editor.getModel()?.uri): IUserActivityTarget {
		const node = editor.getDomNode();
		const view = node ? this.viewOf(node) : undefined;
		const area = uri?.scheme === Schemas.vscodeChatInput ? 'chatInput' : node ? resolveArea(node, view) : 'editor';
		const title = this.editorTitle(editor, uri);
		return {
			area,
			...(view ? { view } : {}),
			...(uri ? { uri } : {}),
			...(title ? { title } : {}),
			...(line ? { line } : {}),
			...(uri ? this.describeResource(uri) : {}),
		};
	}

	private captureEditors(store: DisposableStore): void {
		const snapshots = new Map<ICodeEditor, IEditorLines>();
		const typing = store.add(new IdleCoalescer<ICodeEditor, IEditorTyping>(
			EDITOR_TYPING_IDLE,
			() => ({ buffer: new TypingBuffer(), lineDelta: 0 }),
			this.guard('typing in an editor', (editor, state) => {
				const change = this.editorChange(editor, state);
				if (state.buffer.text || change) {
					this.record({ kind: 'type', time: Date.now(), target: this.editorTarget(editor, state.line, state.uri), text: state.buffer.text, context: change?.after ?? state.context, ...(change ? { detail: { before: change.before, startLine: change.start } } : {}) });
				}
				this.snapshot(editor, snapshots);
			}),
		));
		store.add(toDisposable(() => snapshots.clear()));
		this.flushTypingWith(store, () => typing.flushAll());
		this.editorTyping = typing;
		store.add(toDisposable(() => this.editorTyping = undefined));
		const editors = store.add(new DisposableMap<ICodeEditor>());
		const add = (editor: ICodeEditor) => {
			if (!editors.has(editor)) {
				editors.set(editor, this.captureEditor(editor, typing, snapshots));
			}
		};
		this.codeEditorService.listCodeEditors().forEach(add);
		store.add(this.codeEditorService.onCodeEditorAdd(this.guard('add an editor', add)));
		store.add(this.codeEditorService.onCodeEditorRemove(this.guard('remove an editor', editor => {
			typing.flush(editor);
			snapshots.delete(editor);
			editors.deleteAndDispose(editor);
		})));
	}

	private captureEditor(editor: ICodeEditor, typing: IdleCoalescer<ICodeEditor, IEditorTyping>, snapshots: Map<ICodeEditor, IEditorLines>): IDisposable {
		const store = new DisposableStore();
		this.snapshot(editor, snapshots);
		store.add(editor.onDidFocusEditorText(() => this.snapshot(editor, snapshots)));
		store.add(editor.onDidChangeModel(() => this.snapshot(editor, snapshots)));
		if (this.reading) {
			store.add(this.reading.watch(editor));
		}

		store.add(editor.onDidChangeModelContent(this.guard('editor content', (e: IModelContentChangedEvent) => {
			const model = editor.getModel();
			const [first] = e.changes;
			if (!model || !first || e.isEolChange) {
				return;
			}
			if (e.isFlush || e.isUndoing || e.isRedoing || !editor.hasTextFocus() || isNonUserEdit(e)) {
				// Not typing (the chat input cleared as its request is sent, an undo, an agent's edit): what was typed before it is one event.
				typing.flush(editor);
				return;
			}
			const same = e.changes.every(c => c.text === first.text && c.rangeLength === first.rangeLength);
			const inserted = same ? first.text : e.changes.map(c => c.text).join('');
			const deleted = same ? first.rangeLength : e.changes.reduce((n, c) => n + c.rangeLength, 0);
			const line = editor.getPosition()?.lineNumber ?? first.range.startLineNumber;
			typing.update(editor, state => {
				if (state.uri && state.uri.toString() !== model.uri.toString()) {
					return;
				}
				// The lines as they read before the edit, if the last snapshot is of the version just before it.
				const snap = snapshots.get(editor);
				const within = (start: number, count: number) => e.changes.every(c => c.range.startLineNumber >= start && c.range.endLineNumber < start + count);
				if (!state.before && !state.beforeLost) {
					if (snap && snap.uri === model.uri.toString() && snap.version === e.versionId - 1 && within(snap.start, snap.lines.length)) {
						state.before = snap;
					} else {
						state.beforeLost = true;
					}
				} else if (state.before && !within(state.before.start, state.before.lines.length + state.lineDelta)) {
					state.beforeLost = true;
				}
				state.lineDelta += e.changes.reduce((n, c) => n + c.text.split('\n').length - 1 - (c.range.endLineNumber - c.range.startLineNumber), 0);
				state.buffer.apply(inserted, deleted);
				state.uri = model.uri;
				state.line = line;
				state.context = linesAround(model, line, line, TYPING_CONTEXT_LINES);
			});
		})));
		store.add(editor.onDidBlurEditorText(() => typing.flush(editor)));
		store.add(editor.onDidChangeModel(() => typing.flush(editor)));

		let lastSelection: string | undefined;
		const selection = store.add(new RunOnceScheduler(this.guard('editor selection', () => {
			const model = editor.getModel();
			const selections = editor.getSelections()?.filter(s => !s.isEmpty()) ?? [];
			if (!model || !selections.length || !editor.hasWidgetFocus()) {
				return;
			}
			const key = `${model.uri.toString()}|${selections.map(s => s.toString()).join(',')}`;
			if (key === lastSelection) {
				return;
			}
			lastSelection = key;
			const [first] = selections;
			const text = selections.map(s => model.getValueInRange(clipRange(s))).join('\n');
			const lastLine = Math.min(first.endLineNumber, first.startLineNumber + MAX_SELECTION_LINES);
			this.record({
				kind: 'selection',
				time: Date.now(),
				target: this.editorTarget(editor, first.startLineNumber),
				text,
				context: selectionContext(model, first.startLineNumber, lastLine),
				...(selections.length > 1 ? { detail: { selections: selections.length } } : {}),
			});
		}), SELECTION_DEBOUNCE));
		store.add(editor.onDidChangeCursorSelection(e => {
			this.snapshot(editor, snapshots);
			if (e.selection.isEmpty() && e.secondarySelections.every(s => s.isEmpty())) {
				selection.cancel();
				lastSelection = undefined;
			} else if (e.source !== 'api' && e.source !== 'model' && e.source !== 'restoreState') {
				selection.schedule();
			}
		}));

		return store;
	}

	/** Keeps the lines around the cursor as they read now, unless an edit there is still coalescing. */
	private snapshot(editor: ICodeEditor, snapshots: Map<ICodeEditor, IEditorLines>): void {
		const model = editor.getModel();
		const selection = editor.getSelection();
		if (!model || !selection || model.uri.scheme === Schemas.vscodeChatInput || this.editorTyping?.has(editor)) {
			return;
		}
		const start = Math.max(1, selection.startLineNumber - EDIT_CONTEXT_LINES);
		const end = Math.min(model.getLineCount(), selection.endLineNumber + EDIT_CONTEXT_LINES, start + MAX_EDIT_LINES - 1);
		const lines: string[] = [];
		for (let line = start; line <= end; line++) {
			lines.push(model.getLineContent(line));
		}
		snapshots.set(editor, { uri: model.uri.toString(), version: model.getVersionId(), start, lines });
	}

	/** What a finished edit changed: its lines before and after, when the edit stayed within lines known before it. */
	private editorChange(editor: ICodeEditor, state: IEditorTyping): { start: number; before: string; after: string } | undefined {
		const model = editor.getModel();
		const before = state.before;
		if (!model || !before || state.beforeLost || before.uri !== model.uri.toString()) {
			return undefined;
		}
		const end = Math.min(model.getLineCount(), before.start + before.lines.length - 1 + state.lineDelta);
		const after: string[] = [];
		for (let line = before.start; line <= end; line++) {
			after.push(model.getLineContent(line));
		}
		const was = before.lines.join('\n');
		const now = after.join('\n');
		return was === now ? undefined : { start: before.start, before: capText(was, MAX_EDIT_BEFORE), after: capText(now, USER_ACTIVITY_MAX_CONTEXT) };
	}

	// ---- reading ----

	private captureReading(store: DisposableStore): void {
		this.reading = store.add(new ReadingTracker(
			() => this.hostService.hasFocus,
			() => this.lastInputAt,
			() => this.codeEditorService.getFocusedCodeEditor() ?? undefined,
			this.guard('reading', (editor: ICodeEditor, uri: URI, start: number, end: number, seconds: number) => {
				const model = editor.getModel();
				if (!model || model.uri.toString() !== uri.toString()) {
					return;
				}
				const last = Math.min(end, model.getLineCount());
				const text = model.getValueInRange(new Range(start, 1, last, model.getLineMaxColumn(last)));
				this.record({ kind: 'read', time: Date.now(), target: this.editorTarget(editor, start, uri), context: headAndTail(text, READ_CONTEXT), detail: { seconds, endLine: last } });
			}),
		));
		store.add(toDisposable(() => this.reading = undefined));
	}

	// ---- the active editor ----

	private captureActiveEditor(store: DisposableStore): void {
		let last: string | undefined;
		store.add(this.editorService.onDidActiveEditorChange(this.guard('active editor', () => {
			const input = this.editorService.activeEditor;
			if (!input) {
				return;
			}
			const uri = EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.PRIMARY });
			const key = uri?.toString() ?? `${input.typeId}:${input.getName()}`;
			if (key === last) {
				return;
			}
			last = key;
			this.record({
				kind: 'openEditor',
				time: Date.now(),
				target: { area: 'editor', ...(uri ? { uri } : {}), title: input.getName(), ...(uri ? this.describeResource(uri) : {}) },
				detail: { editor: input.typeId },
			});
		})));
	}

	// ---- commands ----

	private captureCommands(store: DisposableStore): void {
		store.add(this.commandService.onWillExecuteCommand(this.guard('command', e => {
			const gesture = this.lastGesture;
			if (isNoisyCommand(e.commandId) || !gesture || Date.now() - gesture.time > GESTURE_WINDOW) {
				return;
			}
			// One command per gesture: the commands it runs in turn are not the user's.
			this.lastGesture = undefined;
			for (const flush of this.typingFlushes) {
				flush();
			}
			const area = gesture.element?.isConnected ? resolveArea(gesture.element) : 'other';
			const source = area === 'quickInput' ? 'palette' : gesture.kind === 'key' ? 'keybinding' : 'menu';
			const label = commandLabel(e.commandId) ?? (gesture.kind === 'pointer' && gesture.element?.isConnected ? resolveLabel(gesture.element) : undefined);
			this.record({
				kind: 'command',
				time: Date.now(),
				target: { area, ...(label ? { label } : {}) },
				text: e.commandId,
				detail: { source },
			});
		})));
	}

	// ---- window focus ----

	private captureWindowFocus(store: DisposableStore): void {
		store.add(this.hostService.onDidChangeFocus(this.guard('window focus', (focused: boolean) => {
			this.reading?.windowFocus(focused);
			this.record({ kind: 'windowFocus', time: Date.now(), target: { area: 'other' }, detail: { focused } });
		})));
	}
}

/**
 * Spans of a document the user kept in view in a focused editor, recorded once each ends (a scroll,
 * a blur, the window losing focus) if it lasted {@link READ_MIN} or longer, counted up to
 * {@link READ_IDLE} past their last keystroke, pointer move or scroll. A span starts once
 * scrolling settles for {@link READ_SETTLE}.
 */
class ReadingTracker extends Disposable {
	private span: { editor: ICodeEditor; uri: URI; start: number; end: number; since: number } | undefined;
	private readonly reopen: RunOnceScheduler;

	constructor(
		private readonly windowHasFocus: () => boolean,
		private readonly lastInputAt: () => number,
		private readonly focusedEditor: () => ICodeEditor | undefined,
		private readonly onRead: (editor: ICodeEditor, uri: URI, start: number, end: number, seconds: number) => void,
	) {
		super();
		this.reopen = this._register(new RunOnceScheduler(() => this.open(), READ_SETTLE));
		this._register(toDisposable(() => this.span = undefined));
	}

	watch(editor: ICodeEditor): IDisposable {
		const store = new DisposableStore();
		store.add(editor.onDidFocusEditorWidget(() => this.settle()));
		// Focus may be moving to another editor: look again once it settles.
		store.add(editor.onDidBlurEditorWidget(() => this.settle()));
		store.add(editor.onDidScrollChange(e => {
			if (e.scrollTopChanged) {
				this.settle();
			}
		}));
		store.add(editor.onDidChangeModel(() => this.settle()));
		store.add(toDisposable(() => {
			if (this.span?.editor === editor) {
				this.span = undefined;
			}
		}));
		return store;
	}

	windowFocus(focused: boolean): void {
		if (focused) {
			this.settle();
		} else {
			this.reopen.cancel();
			this.close();
		}
	}

	private settle(): void {
		this.close();
		this.reopen.schedule();
	}

	private open(): void {
		this.close();
		const editor = this.focusedEditor();
		const model = editor?.getModel();
		if (!editor || !model || !this.windowHasFocus() || !editor.hasWidgetFocus() || model.uri.scheme === Schemas.vscodeChatInput) {
			return;
		}
		const [range] = editor.getVisibleRanges();
		if (range) {
			this.span = { editor, uri: model.uri, start: range.startLineNumber, end: range.endLineNumber, since: Date.now() };
		}
	}

	private close(): void {
		const span = this.span;
		this.span = undefined;
		// Up to a while after the user's last sign of being there, not the time the window sat unattended.
		const ms = span ? Math.min(Date.now(), Math.max(span.since, this.lastInputAt()) + READ_IDLE) - span.since : 0;
		if (span && ms >= READ_MIN) {
			this.onRead(span.editor, span.uri, span.start, span.end, Math.round(ms / 1000));
		}
	}
}

function elementOf(target: EventTarget | null): Element | undefined {
	return target && dom.isHTMLElement(target) ? target : target && (target as Node).nodeType === 1 ? target as Element : undefined;
}

function isNonUserEdit(e: IModelContentChangedEvent): boolean {
	return e.detailedReasons.length > 0 && e.detailedReasons.every(r => NON_USER_EDIT_SOURCES.has(r.metadata.source));
}

/** A selection, read up to {@link MAX_SELECTION_LINES} lines. */
function clipRange(range: Range): Range {
	return range.endLineNumber - range.startLineNumber > MAX_SELECTION_LINES
		? new Range(range.startLineNumber, range.startColumn, range.startLineNumber + MAX_SELECTION_LINES, 1)
		: range;
}

function selectionContext(model: ITextModel, startLine: number, endLine: number): string {
	if (endLine - startLine <= 2 * SELECTION_CONTEXT_LINES) {
		return linesAround(model, startLine, endLine, SELECTION_CONTEXT_LINES);
	}
	// A long selection: the lines around its start and its end.
	return `${linesAround(model, startLine, startLine, SELECTION_CONTEXT_LINES)}\n\u2026\n${linesAround(model, endLine, endLine, SELECTION_CONTEXT_LINES)}`;
}

function localized(value: string | { value: string } | undefined): string | undefined {
	return typeof value === 'string' ? value : value?.value;
}

/** A command's title as menus show it ("Git: Commit"), when it has one. */
function commandLabel(id: string): string | undefined {
	const action = MenuRegistry.getCommand(id);
	const title = localized(action?.title);
	if (title) {
		const category = localized(action?.category);
		return normalizeWhitespace(category ? `${category}: ${title}` : title);
	}
	return localized(CommandsRegistry.getCommand(id)?.metadata?.description);
}

registerSingleton(IUserActivityCaptureService, UserActivityCaptureService, InstantiationType.Delayed);
