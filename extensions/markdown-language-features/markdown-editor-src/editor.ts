/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncClipboardStrategy, CommentModeController, CommentsModel, CommentsView, EditorController, EditorModel, EditorView, GutterMarker, OffsetRange, Selection, StringEdit, StringReplacement, StringValue, commands, findNodeOffsetById, vscodeHostKeyboardProfile, vscodeLocalKeyboardProfile, type CodeBlockAstNode, type LinkPresentationKind } from '@vscode/markdown-editor';
import { VirtualizedIframeEmbeddedEditorFactory, type IframeEmbeddedEditorProvider, type IframeEmbeddedEditorProviderSelector, type ResolvedIframeEmbeddedEditor } from '@vscode/markdown-editor/web-editors';
import { Disposable, autorun, observableValue } from '@vscode/observables';
import 'katex/dist/katex.min.css';
import '@vscode/markdown-editor/editor.css';
import '@vscode/markdown-editor/themes/vscode-default.css';
import '@vscode/markdown-editor/commentInput.css';
import '@vscode/markdown-editor/commentWidget.css';
import './markdownEditor.css';
import { WebviewSyntaxHighlighter } from './syntaxHighlighter';
import { WebviewLinkPresentationProvider } from './linkPresentationProvider';

interface VsCodeApi {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/**
 * The editor's view state, persisted as webview state (`getState`/`setState`) so
 * the scroll and cursor position are restored when the webview is reloaded or the
 * custom editor is re-created (e.g. after switching sessions and back).
 */
interface PersistedViewState {
	scrollTop?: number;
	selection?: { anchor: number; active: number };
}

interface CodeBlockEditorProviderDefinition {
	readonly id: string;
	readonly selector: IframeEmbeddedEditorProviderSelector;
	readonly source: { readonly kind: 'static'; readonly descriptor: ResolvedIframeEmbeddedEditor } | { readonly kind: 'exportApi' };
}

/** The editor-model state produced by a host history operation. */
interface HistoryRestoration {
	readonly sourceText: StringValue;
	readonly selection: Selection | undefined;
}

/**
 * The causally attributed outcome of a forwarded history command. Mirrors the
 * `@vscode/markdown-editor` asynchronous history contract without importing it,
 * so this file also compiles against package versions that only declare the
 * synchronous strategy.
 */
type HistoryOperationResult =
	| { readonly kind: 'restored'; readonly state: HistoryRestoration }
	| { readonly kind: 'unchanged' };

interface PendingHistoryRequest {
	readonly resolve: (result: HistoryOperationResult) => void;
	readonly reject: (error: unknown) => void;
}

interface InitialState {
	readonly content: string;
	readonly documentVersion: number;
	readonly readonly: boolean;
	readonly richLinksEnabled: boolean;
	readonly linkPresentationRules: readonly { id: string; source: string; flags: string; kind: LinkPresentationKind }[];
}

class Editor extends Disposable {
	readonly model = new EditorModel();
	isUpdatingFromExtension = false;
	#isUpdatingComments = false;
	#mermaidCounter = 0;
	#codeBlockEditorProviders: readonly CodeBlockEditorProviderDefinition[] = [];
	#nextCodeBlockEditorRequestId = 1;
	readonly #codeBlockEditorRequests = new Map<number, (descriptor: ResolvedIframeEmbeddedEditor | undefined) => void>();
	#nextHistoryRequestId = 1;
	readonly #historyRequests = new Map<number, PendingHistoryRequest>();
	/**
	 * The host document version whose content this webview last applied. Host
	 * messages that carry an older version describe a superseded document and are
	 * dropped, so a slow reply cannot resurrect stale text.
	 */
	#lastDocumentVersion: number;
	#controller: EditorController | undefined;
	#view: EditorView | undefined;
	#embeddedCodeEditorFactory: VirtualizedIframeEmbeddedEditorFactory | undefined;

	readonly #comments = new CommentsModel();
	#commentsView: CommentsView | undefined;
	/** Whether the workbench feedback store currently accepts new comments for this resource. */
	readonly #acceptsComments = observableValue<boolean>('acceptsComments', false);
	// the message secret allows to distinguish vscode sending us a message vs a nested iframe
	readonly #messageSecret: string;
	readonly #vscode = acquireVsCodeApi();
	readonly #syntaxHighlighter = new WebviewSyntaxHighlighter((message) => this.#vscode.postMessage(message));
	readonly #linkPresentationProvider: WebviewLinkPresentationProvider | undefined;

	constructor(host: HTMLElement, initialState: InitialState) {
		super();

		const messageSecret = document.querySelector<HTMLMetaElement>('meta[name="vscode-markdown-editor-message-secret"]')?.content;
		if (!messageSecret) {
			throw new Error('Missing Markdown editor message secret');
		}
		this.#messageSecret = messageSecret;
		this.#linkPresentationProvider = initialState.richLinksEnabled
			? this._register(new WebviewLinkPresentationProvider(
				initialState.linkPresentationRules,
				message => this.#vscode.postMessage(message),
			))
			: undefined;

		this.#lastDocumentVersion = initialState.documentVersion;
		this.model.sourceText.set(new StringValue(initialState.content), undefined);
		this.model.readonlyMode.set(initialState.readonly, undefined);

		window.addEventListener('message', (event) => {
			const message = event.data;
			if (!message || typeof message !== 'object' || message.messageSecret !== this.#messageSecret) {
				return;
			}
			if (this.#syntaxHighlighter.handleMessage(message)) {
				return;
			}
			if (this.#linkPresentationProvider?.handleMessage(message)) {
				return;
			}
			switch (message.type) {
				case 'update': {
					if (!this.#acceptDocumentVersion(message.documentVersion)) {
						break;
					}
					// `replaceSourceText` (not `sourceText.set`) applies authoritative host
					// text: it maps the selection through the change and clears stale
					// pending-paragraph state, so the caret stays valid after an undo shrinks
					// the document. The guard stops this echoing back as a user edit.
					this.#applyHostContent(message.content);
					break;
				}
				case 'historyResult': {
					this.#handleHistoryResult(message);
					break;
				}
				case 'codeBlockEditorProviders': {
					const providers = readCodeBlockEditorProviderDefinitions(message.codeBlockEditorProviders);
					this.#codeBlockEditorProviders = providers;
					this.#embeddedCodeEditorFactory?.updateProviders(this.#createIframeProviders(providers));
					break;
				}
				case 'resolvedCodeBlockEditor': {
					if (typeof message.requestId !== 'number') {
						break;
					}
					const resolve = this.#codeBlockEditorRequests.get(message.requestId);
					if (resolve) {
						this.#codeBlockEditorRequests.delete(message.requestId);
						resolve(readResolvedCodeBlockEditor(message.descriptor));
					}
					break;
				}
				case 'gutterMarkers': {
					const markers: GutterMarker[] = message.markers.map((marker: { start: number; endExclusive: number; type: GutterMarker['type'] }) => ({
						range: OffsetRange.fromTo(marker.start, marker.endExclusive),
						type: marker.type,
					}));
					this.model.gutterMarkers.set(markers, undefined);
					break;
				}
				case 'comments': {
					this.#isUpdatingComments = true;
					this.#comments.set(message.comments.map((comment: { id: string; start: number; endExclusive: number; body: string; author?: string }) => ({
						id: comment.id,
						range: OffsetRange.fromTo(comment.start, comment.endExclusive),
						body: comment.body,
						author: comment.author,
					})));
					this.#isUpdatingComments = false;
					this.#acceptsComments.set(!!message.acceptsComments, undefined);
					break;
				}
				case 'revealComment': {
					this.#commentsView?.revealComment(message.id);
					break;
				}
				case 'command': {
					const command = commands.find(command => command.id === message.command);
					if (command) {
						this.#controller?.executeCommand(command);
					}
					break;
				}
			}
		});

		this.#createView(host, initialState.content);
		this.#vscode.postMessage({ type: 'ready', documentVersion: initialState.documentVersion });
		this._register({
			dispose: () => {
				for (const resolve of this.#codeBlockEditorRequests.values()) {
					resolve(undefined);
				}
				this.#codeBlockEditorRequests.clear();
				// Settle in-flight history requests so the controller's continuations
				// cannot run against a disposed editor.
				for (const request of this.#historyRequests.values()) {
					request.resolve({ kind: 'unchanged' });
				}
				this.#historyRequests.clear();
			},
		});
	}

	/**
	 * Whether a host message describes the current or a newer document revision.
	 * Messages without a version (older hosts) are always accepted.
	 */
	#acceptDocumentVersion(documentVersion: unknown): boolean {
		if (typeof documentVersion !== 'number') {
			return true;
		}
		if (documentVersion < this.#lastDocumentVersion) {
			return false;
		}
		this.#lastDocumentVersion = documentVersion;
		return true;
	}

	#applyHostContent(content: string): void {
		this.isUpdatingFromExtension = true;
		try {
			this.model.replaceSourceText(new StringValue(content));
		} finally {
			this.isUpdatingFromExtension = false;
		}
	}

	#handleHistoryResult(message: { requestId?: unknown; status?: unknown; content?: unknown; documentVersion?: unknown; message?: unknown }): void {
		if (typeof message.requestId !== 'number') {
			return;
		}
		const request = this.#historyRequests.get(message.requestId);
		if (!request) {
			return;
		}
		this.#historyRequests.delete(message.requestId);
		if (message.status === 'failed') {
			request.reject(new Error(typeof message.message === 'string' ? message.message : 'Markdown editor history command failed'));
			return;
		}
		if (message.status !== 'restored' || typeof message.content !== 'string') {
			request.resolve({ kind: 'unchanged' });
			return;
		}
		if (!this.#acceptDocumentVersion(message.documentVersion)) {
			// A newer update already superseded this restore; nothing to reveal.
			request.resolve({ kind: 'unchanged' });
			return;
		}
		this.#applyHostContent(message.content);
		request.resolve({
			kind: 'restored',
			state: {
				sourceText: this.model.sourceText.get(),
				selection: this.model.selection.get(),
			},
		});
	}

	#requestHistory(command: 'undo' | 'redo'): Promise<HistoryOperationResult> {
		const requestId = this.#nextHistoryRequestId++;
		return new Promise<HistoryOperationResult>((resolve, reject) => {
			this.#historyRequests.set(requestId, { resolve, reject });
			this.#vscode.postMessage({ type: 'history', command, requestId });
		});
	}

	#createView(host: HTMLElement, content: string): void {
		const model = this.model;
		const scriptNonce = document.querySelector<HTMLMetaElement>('meta[name="vscode-markdown-editor-script-nonce"]')?.content;
		const embeddedCodeEditorFactory = this._register(new VirtualizedIframeEmbeddedEditorFactory({
			providers: this.#createIframeProviders(this.#codeBlockEditorProviders),
			scriptNonce,
			themeCss: () => `:root { ${document.documentElement.getAttribute('style') ?? ''} }`,
			onAmbiguous: (language, providers) => this.#vscode.postMessage({
				type: 'codeBlockEditorDiagnostic',
				message: `Ambiguous providers for ${language}: ${providers.map(provider => provider.id).join(', ')}`,
			}),
			onDidChange: () => this.#view?.refreshEmbeddedCodeEditors(),
		}));
		this.#embeddedCodeEditorFactory = embeddedCodeEditorFactory;
		// The scroll + cursor position last persisted for this document, captured
		// before any listener below can overwrite it, so it survives the editor being
		// re-created (e.g. after a session switch).
		const savedViewState = this.#getViewState();

		const view = this._register(new EditorView(model, {
			classNames: ['md-theme-vscode-default'],
			syntaxHighlighter: this.#syntaxHighlighter,
			linkPresentationProvider: this.#linkPresentationProvider,
			embeddedCodeEditorFactory,
			onEmbeddedCodeEditorEdit: (block: CodeBlockAstNode, contentEdit: StringEdit) => {
				const doc = model.document.get();
				const blockOffset = findNodeOffsetById(doc, block);
				if (blockOffset === undefined) { return; }
				const contentStart = blockOffset + block.codeOffset;
				model.applyEdit(new StringEdit(
					contentEdit.replacements.map(replacement => StringReplacement.replace(
						replacement.replaceRange.delta(contentStart),
						replacement.newText,
					)),
				));
			},
			onOpenLink: url => {
				this.#vscode.postMessage({ type: 'openLink', href: url });
			},
			onToggleCheckbox: (item, newChecked) => {
				model.setTaskCheckboxChecked(item, newChecked);
			},
			renderCustomCodeBlock: (language, content) => {
				if (language !== 'mermaid') {
					return undefined;
				}
				const div = document.createElement('div');
				div.className = 'md-mermaid';
				div.textContent = content;
				div.setAttribute('aria-busy', 'true');
				const id = `mermaid-${this.#mermaidCounter++}`;
				loadMermaid()
					.then(mermaid => mermaid.render(id, content))
					.then(({ svg }) => {
						div.innerHTML = svg;
						div.setAttribute('aria-busy', 'false');
					})
					.catch(error => {
						div.textContent = content;
						div.setAttribute('aria-busy', 'false');
						this.#vscode.postMessage({
							type: 'codeBlockEditorDiagnostic',
							message: `Failed to render Mermaid diagram: ${error instanceof Error ? error.message : String(error)}`,
						});
					});
				return div;
			},
		}));
		this.#view = view;

		// Wire history chords (undo/redo) to the extension so they run against the
		// backing TextDocument's own undo stack. `record` is deliberately omitted:
		// the TextDocument owns the history, and a second local stack would drift
		// from the Edit menu, dirty state and hot exit.
		//
		// The strategy is a variable rather than an inline literal on purpose: the
		// extra `asynchronous`/`onError` members are recognized by newer package
		// versions that correlate forwarded restores, while remaining assignable to
		// the currently published synchronous `IHistoryStrategy` (which ignores them
		// and tolerates the returned promise as a `void` result).
		const historyStrategy = {
			asynchronous: true as const,
			undo: () => this.#requestHistory('undo'),
			redo: () => this.#requestHistory('redo'),
			onError: (error: unknown) => {
				// Surface the failure without posting another history message, so a
				// broken request cannot feed a protocol loop.
				console.error('Markdown editor history command failed', error);
			},
		};
		this.#controller = this._register(new EditorController(model, view, {
			clipboardStrategy: new AsyncClipboardStrategy(),
			keyboardProfile: vscodeLocalKeyboardProfile,
			forwardedKeyboardProfile: vscodeHostKeyboardProfile,
			historyStrategy,
		}));
		let lastEditorFocus: boolean | undefined;
		const postEditorFocus = (): void => {
			const focused = document.hasFocus() && document.activeElement === view.element;
			if (focused === lastEditorFocus) {
				return;
			}
			lastEditorFocus = focused;
			this.#vscode.postMessage({ type: 'editorFocusChanged', focused });
		};
		const onFocusOut = (): void => queueMicrotask(postEditorFocus);
		document.addEventListener('focusin', postEditorFocus);
		document.addEventListener('focusout', onFocusOut);
		window.addEventListener('focus', postEditorFocus);
		window.addEventListener('blur', postEditorFocus);
		this._register({
			dispose: () => {
				document.removeEventListener('focusin', postEditorFocus);
				document.removeEventListener('focusout', onFocusOut);
				window.removeEventListener('focus', postEditorFocus);
				window.removeEventListener('blur', postEditorFocus);
			},
		});
		host.appendChild(view.element);
		postEditorFocus();

		// Render comments as the VS Code V2 markdown cards. The card colours come
		this.#commentsView = this._register(new CommentsView(this.#comments, view));
		// The comment input (the gdocs-style "add a comment" affordance) is only
		// useful when the workbench feedback store will actually accept the comment;
		// otherwise submitting is a no-op. Mount the controller only while the
		// resource is in scope for a session, and tear it down when it leaves scope.
		let commentController: CommentModeController | undefined;
		this._register(autorun((reader) => {
			const accepts = reader.readObservable(this.#acceptsComments);
			if (accepts && !commentController) {
				commentController = new CommentModeController(model, view, {
					onSubmit: ({ text, range }) => {
						this.#vscode.postMessage({ type: 'addComment', start: range.start, endExclusive: range.endExclusive, text });
					},
				});
			} else if (!accepts && commentController) {
				commentController.dispose();
				commentController = undefined;
			}
		}));
		this._register({ dispose: () => commentController?.dispose() });

		// The comment card's delete button mutates the local CommentsModel
		// directly. Mirror those removals back to the extension so the shared
		// store (and the code editor) stay in sync. Removals coming from an
		// extension-driven update set `#isUpdatingComments`, so they are not
		// echoed back.
		let knownCommentIds = new Set(this.#comments.comments.get().map(comment => comment.id));
		this._register(autorun((reader) => {
			const currentIds = new Set(reader.readObservable(this.#comments.comments).map(comment => comment.id));
			if (!this.#isUpdatingComments) {
				for (const id of knownCommentIds) {
					if (!currentIds.has(id)) {
						this.#vscode.postMessage({ type: 'deleteComment', id });
					}
				}
			}
			knownCommentIds = currentIds;
		}));

		if (savedViewState.selection) {
			const max = content.length;
			const anchor = Math.min(savedViewState.selection.anchor, max);
			const active = Math.min(savedViewState.selection.active, max);
			model.selection.set(new Selection(anchor, active), undefined);
		}

		// Persist scroll as webview state (throttled to a frame). Registered after the
		// restore above so it never clobbers the values we are about to restore.
		let scrollSaveScheduled = false;
		const saveScroll = (): void => {
			scrollSaveScheduled = false;
			this.#patchViewState({ scrollTop: host.scrollTop });
		};
		const onScroll = (): void => {
			if (scrollSaveScheduled) { return; }
			scrollSaveScheduled = true;
			requestAnimationFrame(saveScroll);
		};
		host.addEventListener('scroll', onScroll, { passive: true });
		this._register({ dispose: () => host.removeEventListener('scroll', onScroll) });

		// Flush the latest scroll synchronously before the webview is hidden or torn
		// down, since the frame-throttled save above may not have run yet.
		const onHide = (): void => {
			if (document.visibilityState === 'hidden') {
				this.#patchViewState({ scrollTop: host.scrollTop });
			}
		};
		document.addEventListener('visibilitychange', onHide);
		window.addEventListener('pagehide', saveScroll);
		this._register({ dispose: () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', saveScroll); } });

		// Persist the cursor whenever it moves.
		this._register(autorun((reader) => {
			const sel = reader.readObservable(this.model.selection);
			this.#patchViewState({ selection: sel ? { anchor: sel.anchor, active: sel.active } : undefined });
		}));

		// Persist the edit/read-only mode as the global default whenever the lock
		// toggle flips it, so the next Markdown editor opens in the same mode. The
		// initial (restored) value is skipped so opening an editor doesn't re-write it.
		let firstReadonly = true;
		this._register(autorun((reader) => {
			const isReadonly = reader.readObservable(this.model.readonlyMode);
			if (!firstReadonly) {
				this.#vscode.postMessage({ type: 'setReadonly', readonly: isReadonly });
			}
			firstReadonly = false;
		}));

		// Forward user edits to the extension. Edits are ignored by the model while
		// read-only, so this is a no-op in that mode; keeping it always registered
		// means unlocking a read-only editor immediately resumes edit forwarding.
		let previousText = this.model.sourceText.get().value;
		this._register(autorun((reader) => {
			const text = reader.readObservable(this.model.sourceText).value;
			if (!this.isUpdatingFromExtension && text !== previousText) {
				this.#vscode.postMessage({ type: 'edit', ...computeTextEdit(previousText, text) });
			}
			previousText = text;
		}));

		// Restore scroll last: content height settles over a few frames (async parse,
		// syntax highlighting, mermaid), so re-apply until it sticks.
		// TODO@copilot: Consider using a more robust method for restoring scroll position, e.g. by waiting for the editor to stabilize
		this.#restoreScroll(host, savedViewState.scrollTop);
	}

	#createIframeProviders(definitions: readonly CodeBlockEditorProviderDefinition[]): readonly IframeEmbeddedEditorProvider[] {
		return definitions.map(definition => ({
			id: definition.id,
			selector: definition.selector,
			resolve: definition.source.kind === 'static'
				? async () => definition.source.kind === 'static' ? definition.source.descriptor : undefined
				: language => this.#resolveCodeBlockEditor(definition.id, language),
		}));
	}

	#resolveCodeBlockEditor(providerId: string, language: string): Promise<ResolvedIframeEmbeddedEditor | undefined> {
		const requestId = this.#nextCodeBlockEditorRequestId++;
		return new Promise(resolve => {
			this.#codeBlockEditorRequests.set(requestId, resolve);
			this.#vscode.postMessage({
				type: 'resolveCodeBlockEditor',
				requestId,
				providerId,
				language,
			});
		});
	}

	#getViewState(): PersistedViewState {
		return (this.#vscode.getState() as PersistedViewState | undefined) ?? {};
	}

	#patchViewState(patch: PersistedViewState): void {
		this.#vscode.setState({ ...this.#getViewState(), ...patch });
	}

	#restoreScroll(host: HTMLElement, scrollTop: number | undefined): void {
		if (typeof scrollTop !== 'number' || scrollTop <= 0) {
			return;
		}
		let tries = 0;
		const apply = (): void => {
			host.scrollTop = scrollTop;
			if (++tries < 6 && Math.abs(host.scrollTop - scrollTop) > 1) {
				requestAnimationFrame(apply);
			}
		};
		requestAnimationFrame(apply);
	}
}

let mermaidPromise: Promise<(typeof import('mermaid'))['default']> | undefined;

function loadMermaid(): Promise<(typeof import('mermaid'))['default']> {
	if (!mermaidPromise) {
		mermaidPromise = import('mermaid').then(module => {
			module.default.initialize({ startOnLoad: false, theme: 'default' });
			return module.default;
		});
	}
	return mermaidPromise;
}

function readInitialState(): InitialState {
	const element = document.getElementById('vscode-markdown-editor-initial-state');
	if (!(element instanceof HTMLMetaElement)) {
		throw new Error('Markdown editor initial state was not found.');
	}
	element.remove();
	const value: unknown = JSON.parse(decodeURIComponent(element.content));
	if (!isInitialState(value)) {
		throw new Error('Markdown editor initial state is invalid.');
	}
	return value;
}

function isInitialState(value: unknown): value is InitialState {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return typeof candidate.content === 'string'
		&& typeof candidate.documentVersion === 'number'
		&& typeof candidate.readonly === 'boolean'
		&& typeof candidate.richLinksEnabled === 'boolean'
		&& Array.isArray(candidate.linkPresentationRules);
}

function readCodeBlockEditorProviderDefinitions(value: unknown): readonly CodeBlockEditorProviderDefinition[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const values: unknown[] = value;
	return values.filter(isCodeBlockEditorProviderDefinition);
}

function isCodeBlockEditorProviderDefinition(value: unknown): value is CodeBlockEditorProviderDefinition {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return typeof candidate.id === 'string'
		&& isCodeBlockEditorSelector(candidate.selector)
		&& isCodeBlockEditorSource(candidate.source);
}

function isCodeBlockEditorSelector(value: unknown): value is IframeEmbeddedEditorProviderSelector {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const selector = value as Record<string, unknown>;
	return (typeof selector.language === 'string' && selector.languagePrefix === undefined)
		|| (selector.language === undefined && typeof selector.languagePrefix === 'string');
}

function isCodeBlockEditorSource(value: unknown): value is CodeBlockEditorProviderDefinition['source'] {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const source = value as Record<string, unknown>;
	return source.kind === 'exportApi'
		|| (source.kind === 'static' && readResolvedCodeBlockEditor(source.descriptor) !== undefined);
}

function readResolvedCodeBlockEditor(value: unknown): ResolvedIframeEmbeddedEditor | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const descriptor = value as Record<string, unknown>;
	if (
		typeof descriptor.html !== 'string'
		|| (descriptor.contentType !== 'text' && descriptor.contentType !== 'json')
		|| (descriptor.cacheKey !== undefined && typeof descriptor.cacheKey !== 'string')
		|| (descriptor.initialHeight !== undefined && (typeof descriptor.initialHeight !== 'number' || !Number.isFinite(descriptor.initialHeight) || descriptor.initialHeight <= 0))
		|| !isResolvedSandbox(descriptor.sandbox)
	) {
		return undefined;
	}
	return descriptor as unknown as ResolvedIframeEmbeddedEditor;
}

function isResolvedSandbox(value: unknown): boolean {
	if (value === undefined) {
		return true;
	}
	if (!value || typeof value !== 'object') {
		return false;
	}
	const sandbox = value as Record<string, unknown>;
	return ['forms', 'downloads', 'pointerLock', 'clipboardWrite']
		.every(key => sandbox[key] === undefined || typeof sandbox[key] === 'boolean');
}

function computeTextEdit(previousText: string, text: string): { start: number; endExclusive: number; text: string } {
	let start = 0;
	while (start < previousText.length && start < text.length && previousText.charCodeAt(start) === text.charCodeAt(start)) {
		start++;
	}

	let previousEnd = previousText.length;
	let end = text.length;
	while (previousEnd > start && end > start && previousText.charCodeAt(previousEnd - 1) === text.charCodeAt(end - 1)) {
		previousEnd--;
		end--;
	}

	return {
		start,
		endExclusive: previousEnd,
		text: text.slice(start, end),
	};
}

new Editor(document.getElementById('editor')!, readInitialState());
