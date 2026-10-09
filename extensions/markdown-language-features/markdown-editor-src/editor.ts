/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommentModeController, CommentsModel, CommentsView, EditorController, EditorModel, EditorView, GutterMarker, OffsetRange, Selection, StringEdit, StringReplacement, StringValue, commands, findNodeOffsetById, vscodeHostKeyboardProfile, vscodeLocalKeyboardProfile, type CodeBlockAstNode, type LinkPresentationKind } from '@vscode/markdown-editor';
import type { IframeEmbeddedEditorHostTransport, IframeEmbeddedEditorProvider, ResolvedIframeEmbeddedEditor } from '@vscode/markdown-editor/web-editors';
import { Disposable, autorun, observableValue, transaction } from '@vscode/observables';
import { HubRpcConnection } from '@vscode/hubrpc';
import 'katex/dist/katex.min.css';
import '@vscode/markdown-editor/editor.css';
import '@vscode/markdown-editor/themes/vscode-default.css';
import '@vscode/markdown-editor/commentInput.css';
import '@vscode/markdown-editor/commentWidget.css';
import './markdownEditor.css';
import { WebviewSyntaxHighlighter } from './syntaxHighlighter';
import { WebviewLinkPresentationProvider } from './linkPresentationProvider';
import { markdownEditorHost, markdownEditorRenderer, type CodeBlockEditorProviderDefinition, type MarkdownEditorHost } from '../src/preview/markdownEditorProtocol';
import { createMarkdownEditorRpcConnection, MarkdownEditorRpcTransport } from '../src/preview/markdownEditorRpc';
import { LazyCodeBlockEditorFactory } from '../src/preview/lazyCodeBlockEditorFactory';
import { RenameController } from './renameController';
import { CompletionController } from './completionController';
import { DiagnosticsController } from './diagnosticsController';
import { ImagePasteController } from './imagePasteController';

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

interface InitialState {
	readonly content: string;
	readonly documentVersion: number;
	/** Identifies the authoritative text baseline against which local edits are computed. */
	readonly editEpoch: number;
	readonly readonly: boolean;
	readonly highlightActiveBlock: boolean;
	readonly richLinksEnabled: boolean;
	readonly linkPresentationRules: readonly { id: string; source: string; flags: string; kind: LinkPresentationKind }[];
}

class CodeBlockEditorHostTransport implements IframeEmbeddedEditorHostTransport {
	readonly #listeners = new Set<(message: unknown) => void>();
	readonly #pendingMessages: unknown[] = [];
	readonly #postMessage: (message: unknown) => void;
	readonly #onDispose: () => void;
	#activated = false;
	#disposed = false;

	readonly onMessage: IframeEmbeddedEditorHostTransport['onMessage'] = (listener: (message: unknown) => void) => {
		if (this.#disposed) {
			throw new Error('Code block editor host transport is disposed');
		}
		this.#listeners.add(listener);
		if (!this.#activated) {
			this.#activated = true;
			for (const message of this.#pendingMessages.splice(0)) {
				listener(message);
			}
		}
		return { dispose: () => this.#listeners.delete(listener) };
	};

	constructor(
		readonly runtimeId: string,
		postMessage: (message: unknown) => void,
		onDispose: () => void,
	) {
		this.#postMessage = postMessage;
		this.#onDispose = onDispose;
	}

	sendMessage(message: unknown): void {
		if (this.#disposed) {
			throw new Error('Code block editor host transport is disposed');
		}
		this.#postMessage(message);
	}

	acceptMessage(message: unknown): void {
		if (this.#disposed) {
			return;
		}
		if (!this.#activated) {
			this.#pendingMessages.push(message);
			return;
		}
		for (const listener of this.#listeners) {
			listener(message);
		}
	}

	dispose(): void {
		if (this.#disposed) {
			return;
		}
		this.#disposed = true;
		this.#pendingMessages.length = 0;
		this.#listeners.clear();
		this.#onDispose();
	}
}

class Editor extends Disposable {
	readonly model = new EditorModel();
	isUpdatingFromExtension = false;
	#isUpdatingComments = false;
	#mermaidCounter = 0;
	#codeBlockEditorProviders: readonly CodeBlockEditorProviderDefinition[] = [];
	#nextCodeBlockEditorRuntimeId = 1;
	readonly #codeBlockEditorHostTransports = new Map<string, CodeBlockEditorHostTransport>();
	#controller: EditorController | undefined;
	#rename: RenameController | undefined;
	#completion: CompletionController | undefined;
	#diagnostics: DiagnosticsController | undefined;
	#view: EditorView | undefined;
	#embeddedCodeEditorFactory: LazyCodeBlockEditorFactory | undefined;
	/** Identifies the authoritative text baseline against which local edits are computed. */
	#editEpoch: number;
	#navigationRevision = 0;
	#navigationReady = false;
	#navigationReportScheduled = false;
	readonly #pendingEdits = new Set<Promise<void>>();
	readonly #scrollHost: HTMLElement;

	readonly #comments = new CommentsModel();
	#commentsView: CommentsView | undefined;
	/** Whether the workbench feedback store currently accepts new comments for this resource. */
	readonly #acceptsComments = observableValue<boolean>('acceptsComments', false);
	readonly #vscode = acquireVsCodeApi();
	readonly #connection: HubRpcConnection;
	readonly #transport: MarkdownEditorRpcTransport;
	readonly #host: MarkdownEditorHost;
	readonly #syntaxHighlighter: WebviewSyntaxHighlighter;
	readonly #linkPresentationProvider: WebviewLinkPresentationProvider | undefined;
	#disposed = false;

	constructor(host: HTMLElement, initialState: InitialState) {
		super();
		this.#scrollHost = host;

		const messageSecret = document.querySelector<HTMLMetaElement>('meta[name="vscode-markdown-editor-message-secret"]')?.content;
		if (!messageSecret) {
			throw new Error('Missing Markdown editor message secret');
		}
		this.#transport = new MarkdownEditorRpcTransport(
			messageSecret,
			message => this.#vscode.postMessage(message),
			listener => {
				const onMessage = (event: MessageEvent): void => listener(event.data);
				window.addEventListener('message', onMessage);
				return { dispose: () => window.removeEventListener('message', onMessage) };
			},
		);
		this.#connection = createMarkdownEditorRpcConnection(this.#transport, (operation, error) => {
			if (!this.#disposed) {
				console.error(`Markdown editor ${operation} failed`, error);
			}
		});
		this.#host = this.#connection.get(markdownEditorHost);
		this.#syntaxHighlighter = new WebviewSyntaxHighlighter(this.#host);
		this.#editEpoch = initialState.editEpoch;
		this.#linkPresentationProvider = initialState.richLinksEnabled
			? this._register(new WebviewLinkPresentationProvider(
				initialState.linkPresentationRules,
				this.#host,
			))
			: undefined;

		this.model.sourceText.set(new StringValue(initialState.content), undefined);
		this.model.readonlyMode.set(initialState.readonly, undefined);

		this._register(this.#connection.register(markdownEditorRenderer, {
			diagnosticsChanged: () => this.#diagnostics?.refresh(),
			update: ({ content, editEpoch }) => {
				// Applying authoritative text maps selection and clears stale pending-paragraph state.
				this.#editEpoch = editEpoch;
				this.isUpdatingFromExtension = true;
				try {
					this.model.replaceSourceText(new StringValue(content));
				} finally {
					this.isUpdatingFromExtension = false;
				}
				this.#scheduleSelectionReport();
			},
			codeBlockEditorProviders: ({ codeBlockEditorProviders }) => {
				this.#codeBlockEditorProviders = codeBlockEditorProviders;
				this.#embeddedCodeEditorFactory?.updateProviders(this.#createIframeProviders(codeBlockEditorProviders));
			},
			codeBlockEditorHostTransportMessage: ({ runtimeId, message }) => {
				this.#codeBlockEditorHostTransports.get(runtimeId)?.acceptMessage(message);
			},
			gutterMarkers: ({ markers }) => {
				const converted: GutterMarker[] = markers.map(marker => ({
					range: OffsetRange.fromTo(marker.start, marker.endExclusive),
					type: marker.type,
				}));
				this.model.gutterMarkers.set(converted, undefined);
			},
			comments: ({ comments, acceptsComments }) => {
				this.#isUpdatingComments = true;
				try {
					this.#comments.set(comments.map(comment => ({
						id: comment.id,
						range: OffsetRange.fromTo(comment.start, comment.endExclusive),
						body: comment.body,
						author: comment.author,
					})));
				} finally {
					this.#isUpdatingComments = false;
				}
				this.#acceptsComments.set(acceptsComments, undefined);
			},
			revealComment: ({ id }) => {
				this.#commentsView?.revealComment(id);
			},
			revealLinkTarget: ({ start, endExclusive, selectionStart }) => {
				this.#revealRange(start, endExclusive, { anchor: selectionStart, active: selectionStart }, false);
			},
			captureNavigationState: async (_message, _context, { signal }) => {
				await this.#drainEdits();
				signal.throwIfAborted();
				const selection = this.model.selection.get();
				return {
					editEpoch: this.#editEpoch, revision: this.#navigationRevision,
					selection: selection ? { anchor: selection.anchor, active: selection.active } : undefined,
					scrollTop: this.#scrollHost.scrollTop,
				};
			},
			revealRange: (message, _context, { signal }) => {
				signal.throwIfAborted();
				this.#checkNavigationState(message);
				this.#revealRange(message.start, message.endExclusive, message.selection, message.preserveFocus);
			},
			restoreNavigationState: (state, _context, { signal }) => {
				signal.throwIfAborted();
				this.#checkNavigationState(state);
				if (state.selection) {
					this.#revealRange(state.selection.active, state.selection.active, state.selection, true);
				} else {
					this.model.selection.set(undefined, undefined);
				}
				this.#scrollHost.scrollTop = state.scrollTop;
			},
			command: async ({ command: commandId }) => {
				if (commandId === 'markdown.editor.triggerSuggest') {
					await this.#completion?.start();
					return;
				}
				if (commandId === 'markdown.editor.rename') {
					await this.#rename?.start();
					return;
				}
				const command = commands.find(command => command.id === commandId);
				if (command) {
					this.#controller?.executeCommand(command);
				}
			},
			highlightThemeChanged: () => {
				this.#syntaxHighlighter.themeChanged();
			},
			configurationChanged: ({ highlightActiveBlock }) => {
				this.#view?.highlightActiveBlock.set(highlightActiveBlock, undefined);
			},
			richLinkPresentations: ({ presentations }) => {
				this.#linkPresentationProvider?.updatePresentations(presentations);
			},
		}));
		this.#createView(host, initialState.content, initialState.highlightActiveBlock);
		this.#send('ready', this.#host.ready({
			documentVersion: initialState.documentVersion,
			editEpoch: this.#editEpoch,
		}).then(() => {
			this.#navigationReady = true;
			this.#scheduleSelectionReport();
		}));
		window.addEventListener('pagehide', this.#onPageHide);
	}

	readonly #onPageHide = (): void => this.dispose();

	#checkNavigationState(state: { editEpoch: number; revision: number }): void {
		if (this.#disposed || state.editEpoch !== this.#editEpoch || state.revision !== this.#navigationRevision) {
			throw new Error('The Markdown document changed during navigation. Try again.');
		}
	}

	#revealRange(start: number, endExclusive: number, selection: { anchor: number; active: number } | undefined, preserveFocus: boolean): void {
		const length = this.model.sourceText.get().value.length;
		if (start > endExclusive || endExclusive > length || selection && Math.max(selection.anchor, selection.active) > length) {
			throw new Error('Invalid Markdown editor navigation range');
		}
		if (selection) {
			transaction(tx => {
				this.model.pendingParagraph.set(undefined, tx);
				this.model.selectionSource.set('user', tx);
				this.model.selection.set(new Selection(selection.anchor, selection.active), tx);
			});
		}
		if (!preserveFocus) { this.#view?.focus(); }
		this.#view?.revealRangeAtTop(OffsetRange.fromTo(start, endExclusive));
	}

	async #drainEdits(): Promise<void> {
		while (this.#pendingEdits.size) {
			await Promise.all(this.#pendingEdits);
		}
		if (this.#disposed) { throw new Error('Markdown editor is disposed'); }
	}

	#scheduleSelectionReport(): void {
		if (!this.#navigationReady || this.#navigationReportScheduled || this.#disposed) { return; }
		this.#navigationReportScheduled = true;
		queueMicrotask(() => {
			this.#navigationReportScheduled = false;
			if (this.#disposed) { return; }
			this.#send('selectionChanged', this.#drainEdits().then(() => {
				const selection = this.model.selection.get();
				return this.#host.selectionChanged({
					editEpoch: this.#editEpoch,
					selection: selection ? { anchor: selection.anchor, active: selection.active } : undefined,
				});
			}));
		});
	}

	#send(operation: string, request: Promise<void> | void): void {
		void request?.catch(error => {
			if (!this.#disposed) {
				console.error(`Markdown editor ${operation} failed`, error);
			}
		});
	}

	override dispose(): void {
		if (this.#disposed) {
			return;
		}
		window.removeEventListener('pagehide', this.#onPageHide);
		for (const transport of Array.from(this.#codeBlockEditorHostTransports.values())) {
			transport.dispose();
		}
		this.#disposed = true;
		this.#syntaxHighlighter.dispose();
		super.dispose();
		this.#connection.close();
	}

	#createView(host: HTMLElement, content: string, highlightActiveBlock: boolean): void {
		const model = this.model;
		const scriptNonce = document.querySelector<HTMLMetaElement>('meta[name="vscode-markdown-editor-script-nonce"]')?.content;
		const iframeBootstrapUrl = new URL(location.href);
		// Nested frames must use the empty webview bootstrap, not the restricted index.html entrypoint.
		iframeBootstrapUrl.pathname = '/fake.html';
		const embeddedCodeEditorFactory = this._register(new LazyCodeBlockEditorFactory({
			providers: this.#createIframeProviders(this.#codeBlockEditorProviders),
			scriptNonce,
			themeCss: () => `:root { ${document.documentElement.getAttribute('style') ?? ''} }`,
			iframeBootstrapUrl: iframeBootstrapUrl.href,
			onAmbiguous: (language, providers) => this.#send('codeBlockEditorDiagnostic', this.#host.codeBlockEditorDiagnostic({
				message: `Ambiguous providers for ${language}: ${providers.map(provider => provider.id).join(', ')}`,
			})),
			onDidChange: () => this.#view?.refreshEmbeddedCodeEditors(),
		}, async () => {
			const { VirtualizedIframeEmbeddedEditorFactory } = await import('@vscode/markdown-editor/web-editors');
			return options => new VirtualizedIframeEmbeddedEditorFactory(options);
		}, error => {
			console.error('Markdown editor loading embedded editors failed', error);
			this.#send('codeBlockEditorDiagnostic', this.#host.codeBlockEditorDiagnostic({
				message: `Failed to load embedded editors: ${error instanceof Error ? error.message : String(error)}. Reopen the editor to retry.`,
			}));
		}));
		this.#embeddedCodeEditorFactory = embeddedCodeEditorFactory;
		// The scroll + cursor position last persisted for this document, captured
		// before any listener below can overwrite it, so it survives the editor being
		// re-created (e.g. after a session switch).
		const savedViewState = this.#getViewState();

		const view = this._register(new EditorView(model, {
			classNames: ['md-theme-vscode-default'],
			highlightActiveBlock,
			presentation: model.readonlyMode.get() ? 'reading' : 'editing',
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
				this.#send('openLink', this.#host.openLink({ href: url }));
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
						this.#send('codeBlockEditorDiagnostic', this.#host.codeBlockEditorDiagnostic({
							message: `Failed to render Mermaid diagram: ${error instanceof Error ? error.message : String(error)}`,
						}));
					});
				return div;
			},
		}));
		this.#view = view;
		this.#rename = this._register(new RenameController(model, view, this.#host, () => this.#editEpoch));
		this.#completion = this._register(new CompletionController(model, view, this.#host, () => this.#editEpoch));
		this.#diagnostics = this._register(new DiagnosticsController(model, view, this.#host, () => this.#editEpoch));

		// Wire history chords (undo/redo) to the extension so they run against the
		// backing TextDocument's own undo stack. `record` is deliberately omitted:
		// the TextDocument owns the history, and a second local stack would drift
		// from the Edit menu, dirty state and hot exit.
		this.#controller = this._register(new EditorController(model, view, {
			clipboardStrategy: this._register(new ImagePasteController(model, view, this.#host, () => this.#editEpoch)),
			keyboardProfile: vscodeLocalKeyboardProfile,
			forwardedKeyboardProfile: vscodeHostKeyboardProfile,
			historyStrategy: {
				undo: () => this.#send('history undo', this.#host.history({ command: 'undo' })),
				redo: () => this.#send('history redo', this.#host.history({ command: 'redo' })),
			},
		}));
		let lastEditorFocus: boolean | undefined;
		const postEditorFocus = (): void => {
			const focused = document.hasFocus() && document.activeElement === view.element;
			if (focused === lastEditorFocus) {
				return;
			}
			lastEditorFocus = focused;
			this.#send('editorFocusChanged', this.#host.editorFocusChanged({ focused }));
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
						this.#send('addComment', this.#host.addComment({ start: range.start, endExclusive: range.endExclusive, text }));
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
						this.#send('deleteComment', this.#host.deleteComment({ id }));
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
			this.#scheduleSelectionReport();
		}));

		// Persist the edit/read-only mode as the global default whenever the lock
		// toggle flips it, so the next Markdown editor opens in the same mode. The
		// initial (restored) value is skipped so opening an editor doesn't re-write it.
		let firstReadonly = true;
		this._register(autorun((reader) => {
			const isReadonly = reader.readObservable(this.model.readonlyMode);
			this.model.presentation.set(isReadonly ? 'reading' : 'editing', undefined);
			if (!firstReadonly) {
				this.#send('setReadonly', this.#host.setReadonly({ readonly: isReadonly }));
			}
			firstReadonly = false;
		}));

		// Forward user edits to the extension. Edits are ignored by the model while
		// read-only, so this is a no-op in that mode; keeping it always registered
		// means unlocking a read-only editor immediately resumes edit forwarding.
		let previousText = this.model.sourceText.get().value;
		this._register(autorun((reader) => {
			const text = reader.readObservable(this.model.sourceText).value;
			if (text !== previousText) {
				this.#navigationRevision++;
				this.#scheduleSelectionReport();
			}
			if (!this.isUpdatingFromExtension && text !== previousText) {
				const edit = this.#host.edit({
					...computeTextEdit(previousText, text),
					editEpoch: this.#editEpoch,
				});
				this.#pendingEdits.add(edit);
				this.#send('edit', edit.finally(() => this.#pendingEdits.delete(edit)));
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
			createHostTransport: runtimeKey => this.#createCodeBlockEditorHostTransport(definition.id, runtimeKey),
			resolve: definition.source.kind === 'static'
				? async () => definition.source.kind === 'static' ? definition.source.descriptor : undefined
				: language => this.#resolveCodeBlockEditor(definition.id, language),
		}));
	}

	#createCodeBlockEditorHostTransport(providerId: string, runtimeKey: string): CodeBlockEditorHostTransport {
		const runtimeId = `${providerId}:${this.#nextCodeBlockEditorRuntimeId++}`;
		const transport = new CodeBlockEditorHostTransport(
			runtimeId,
			message => this.#send('codeBlockEditorHostTransportMessage', this.#host.codeBlockEditorHostTransportMessage({
				runtimeId,
				message,
			})),
			() => {
				this.#codeBlockEditorHostTransports.delete(runtimeId);
				this.#send('disposeCodeBlockEditorHostTransport', this.#host.disposeCodeBlockEditorHostTransport({
					runtimeId,
				}));
			},
		);
		this.#codeBlockEditorHostTransports.set(runtimeId, transport);
		this.#send('createCodeBlockEditorHostTransport', this.#host.createCodeBlockEditorHostTransport({
			runtimeId,
			providerId,
			runtimeKey,
		}));
		return transport;
	}

	async #resolveCodeBlockEditor(providerId: string, language: string): Promise<ResolvedIframeEmbeddedEditor | undefined> {
		try {
			const result = await this.#host.resolveCodeBlockEditor({ providerId, language });
			return this.#disposed ? undefined : result.descriptor;
		} catch (error) {
			if (!this.#disposed) {
				console.error('Markdown editor resolveCodeBlockEditor failed', error);
			}
			throw error;
		}
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
		&& typeof candidate.editEpoch === 'number'
		&& Number.isInteger(candidate.editEpoch)
		&& candidate.editEpoch >= 0
		&& typeof candidate.readonly === 'boolean'
		&& typeof candidate.highlightActiveBlock === 'boolean'
		&& typeof candidate.richLinksEnabled === 'boolean'
		&& Array.isArray(candidate.linkPresentationRules);
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
