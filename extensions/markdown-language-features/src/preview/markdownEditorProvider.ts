/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { HubRpcConnection, type InterfaceHandlers } from '@vscode/hubrpc';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Disposable, disposeAll } from '../util/dispose';
import { getRangeFromPositionOrRange, MdLinkOpener } from '../util/openDocumentLink';
import { areUrisEqual, getMarkdownLocalResourceRoots } from '../util/resources';
import { ChangedLineRange, MarkdownPreviewLineDiffProvider } from './lineDiff';
import { TextDocumentSync } from '@vscode/web-editors';
import { vsCodeLineBreak, vsCodeTextDocument } from '@vscode/web-editors/vscode';
import { encodeWebviewInitialState } from './webviewInitialState';
import type { ILogger } from '../logging';
import type { ResolvedDocumentLinkTarget } from '../client/protocol';
import {
	codeBlockEditorPresentationEqual,
	type MarkdownCodeBlockEditorProvider,
	type MarkdownCodeBlockEditorSandbox,
	type MarkdownContributionProvider,
} from '../markdownExtensions';
import { generateUuid } from '../util/uuid';
import { MarkdownEditorRichLinkController } from './markdownEditorRichLinks';
import { codeBlockEditorPresentation, markdownEditorHost, markdownEditorRenderer, mergeCodeBlockEditorPresentation, type CodeBlockEditorProviderDefinition, type MarkdownEditorConfiguration, type ResolvedCodeBlockEditor } from './markdownEditorProtocol';
import { createMarkdownEditorRpcConnection, MarkdownEditorRpcTransport } from './markdownEditorRpc';
import { MarkdownEditorRename } from './markdownEditorRename';
import { MarkdownEditorLanguageFeatures } from './markdownEditorLanguageFeatures';
import { MarkdownEditorImagePaste } from './markdownEditorImagePaste';
import { MarkdownEditorNavigation } from './markdownEditorNavigation';

export interface MarkdownCodeBlockEditorApiV1 {
	getProvider(providerId: string): MarkdownCodeBlockEditorProviderApi | undefined;
}

export interface MarkdownCodeBlockEditorApiV2 {
	getProvider(providerId: string): MarkdownCodeBlockEditorProviderApi | undefined;
}

interface MarkdownCodeBlockEditorProviderApi {
	resolve(
		request: {
			readonly providerId: string;
			readonly language: string;
			readonly documentUri: vscode.Uri;
		},
		token: vscode.CancellationToken,
	): vscode.ProviderResult<ProviderResolvedCodeBlockEditor>;
	createHostTransport?(
		transport: MarkdownCodeBlockEditorHostTransport,
		token: vscode.CancellationToken,
	): vscode.ProviderResult<vscode.Disposable>;
	/** Fires when {@link resolve} would return a different descriptor, for example after a setting changed. Open editors resolve again. */
	readonly onDidChange?: vscode.Event<void>;
}

interface ProviderResolvedCodeBlockEditor {
	readonly content:
	| { readonly html: string; readonly baseUri?: vscode.Uri; readonly uri?: undefined }
	| { readonly html?: undefined; readonly uri: vscode.Uri };
	readonly contentType?: 'text' | 'json';
	readonly cacheKey?: string;
	readonly runtimeKey?: string;
	readonly initialHeight?: number;
	readonly presentation?: ResolvedCodeBlockEditor['presentation'];
	readonly sandbox?: MarkdownCodeBlockEditorSandbox;
}

interface MarkdownCodeBlockEditorHostTransport {
	readonly runtimeKey: string;
	readonly onDidReceiveMessage: vscode.Event<unknown>;
	readonly onDidDispose: vscode.Event<void>;
	sendMessage(message: unknown): void;
}

/**
 * Owns the private RPC connection for one webview, replacing it on each HTML reload.
 */
class AuthenticatedWebview implements vscode.Disposable {

	#messageSecret = generateUuid();
	#connection: HubRpcConnection<undefined>;
	#handlers: InterfaceHandlers<typeof markdownEditorHost> | undefined;
	readonly #onReady = new vscode.EventEmitter<void>();
	readonly onReady = this.#onReady.event;
	#ready = false;
	#publishedReady = false;
	#disposed = false;

	/** @param onDidConnect Receives each new connection, to sync the editor's content over it. */
	constructor(readonly webview: vscode.Webview, readonly logger: ILogger, private readonly onDidConnect: (connection: HubRpcConnection) => void) {
		this.#connection = this.#connect();
	}

	#connect(): HubRpcConnection<undefined> {
		const connection = createMarkdownEditorRpcConnection(new MarkdownEditorRpcTransport(
			this.#messageSecret,
			message => this.webview.postMessage(message),
			listener => this.webview.onDidReceiveMessage(listener),
		), (operation, error) => {
			if (!this.#disposed) {
				this.logger.trace('Markdown editor RPC', operation, error);
			}
		});
		this.onDidConnect(connection);
		return connection;
	}

	get renderer() {
		return this.#connection.get(markdownEditorRenderer);
	}

	get ready(): boolean {
		return this.#ready;
	}

	async whenReady(token: vscode.CancellationToken): Promise<void> {
		if (this.#disposed || token.isCancellationRequested) {
			throw new vscode.CancellationError();
		}
		if (this.#publishedReady) {
			return;
		}
		const pending = Promise.withResolvers<void>();
		const ready = this.onReady(() => {
			if (this.#disposed) { pending.reject(new vscode.CancellationError()); } else { pending.resolve(); }
		});
		const cancel = token.onCancellationRequested(() => pending.reject(new vscode.CancellationError()));
		try {
			if (this.#disposed || token.isCancellationRequested) { pending.reject(new vscode.CancellationError()); }
			else if (this.#publishedReady) { pending.resolve(); }
			await pending.promise;
		} finally {
			ready.dispose();
			cancel.dispose();
		}
	}

	setHandlers(handlers: InterfaceHandlers<typeof markdownEditorHost>): void {
		this.#handlers = handlers;
		this.#connection.register(markdownEditorHost, handlers);
	}

	acceptReady(): void {
		this.#ready = true;
	}

	publishReady(): void {
		this.#publishedReady = true;
		this.#onReady.fire();
	}

	reset(): void {
		this.#ready = false;
		this.#publishedReady = false;
		this.#connection.close();
		this.#messageSecret = generateUuid();
		this.#connection = this.#connect();
		if (this.#handlers) {
			this.#connection.register(markdownEditorHost, this.#handlers);
		}
	}

	get messageSecret(): string {
		return this.#messageSecret;
	}

	report(operation: string, request: Promise<void> | void): void {
		void request?.catch(error => {
			if (!this.#disposed) {
				this.logger.trace('Markdown editor RPC', operation, error);
			}
		});
	}

	dispose(): void {
		this.#disposed = true;
		this.#ready = false;
		this.#connection.close();
		this.#onReady.fire();
		this.#onReady.dispose();
	}
}

class CodeBlockEditorHostTransportState implements vscode.Disposable {
	readonly #onDidReceiveMessage = new vscode.EventEmitter<unknown>();
	readonly #onDidDispose = new vscode.EventEmitter<void>();
	readonly #pendingMessages: unknown[] = [];
	#providerDisposable: vscode.Disposable | undefined;
	#ready = false;
	#disposed = false;

	readonly transport: MarkdownCodeBlockEditorHostTransport;

	constructor(runtimeKey: string, sendMessage: (message: unknown) => void) {
		this.transport = Object.freeze({
			runtimeKey,
			onDidReceiveMessage: this.#onDidReceiveMessage.event,
			onDidDispose: this.#onDidDispose.event,
			sendMessage: (message: unknown) => {
				if (this.#disposed) {
					throw new Error('Code block editor host transport is disposed');
				}
				sendMessage(message);
			},
		});
	}

	acceptMessage(message: unknown): void {
		if (this.#disposed) {
			return;
		}
		if (!this.#ready) {
			this.#pendingMessages.push(message);
			return;
		}
		this.#onDidReceiveMessage.fire(message);
	}

	setReady(providerDisposable: vscode.Disposable | undefined): void {
		if (this.#disposed) {
			providerDisposable?.dispose();
			return;
		}
		this.#providerDisposable = providerDisposable;
		this.#ready = true;
		for (const message of this.#pendingMessages.splice(0)) {
			this.#onDidReceiveMessage.fire(message);
		}
	}

	dispose(): void {
		if (this.#disposed) {
			return;
		}
		this.#disposed = true;
		this.#pendingMessages.length = 0;
		this.#onDidDispose.fire();
		this.#providerDisposable?.dispose();
		this.#onDidReceiveMessage.dispose();
		this.#onDidDispose.dispose();
	}
}

/**
 * Experimental hybrid (WYSIWYG) Markdown editor backed by the
 * `@vscode/markdown-editor` component. The {@link vscode.TextDocument} remains
 * the single source of truth, so native undo/redo, dirty state and hot-exit are
 * preserved.
 */
export class MarkdownEditorProvider extends Disposable implements vscode.CustomTextEditorProvider {

	public static readonly viewType = 'vscode.markdown.editor';

	/**
	 * Memento key under which the last chosen edit/read-only mode is remembered.
	 * The value is a single global default shared by every Markdown editor, so
	 * flipping the lock in one editor becomes the initial mode for the next.
	 */
	static readonly #readonlyStateKey = 'markdown.editor.readonly';

	readonly #mediaRoot: vscode.Uri;
	readonly #extensionUri: vscode.Uri;
	readonly #globalState: vscode.Memento;
	readonly #linkOpener: MdLinkOpener;
	readonly #contributions: MarkdownContributionProvider;
	readonly #logger: ILogger;
	readonly #tryOpenLink: (href: string, fromResource: vscode.Uri) => Promise<boolean>;
	readonly #webviewPanels = new Map<vscode.WebviewPanel, AuthenticatedWebview>();
	readonly #navigation = new Map<vscode.WebviewPanel, MarkdownEditorNavigation>();
	readonly #focusedWebviewPanels = new Set<vscode.WebviewPanel>();
	readonly #providerApis = new Map<string, Promise<MarkdownCodeBlockEditorProviderApi | undefined>>();
	readonly #resolvedCodeBlockEditors = new Map<string, Promise<ResolvedCodeBlockEditor | undefined>>();
	readonly #resolvedCodeBlockEditorResources = new Set<string>();
	readonly #providerApiListeners: vscode.Disposable[] = [];
	readonly #onDidChangeCodeBlockEditorProvider = this._register(new vscode.EventEmitter<void>());

	constructor(
		extensionUri: vscode.Uri,
		globalState: vscode.Memento,
		linkOpener: MdLinkOpener,
		contributions: MarkdownContributionProvider,
		logger: ILogger,
		tryOpenLink: (href: string, fromResource: vscode.Uri) => Promise<boolean>,
	) {
		super();
		this.#extensionUri = extensionUri;
		this.#globalState = globalState;
		this.#linkOpener = linkOpener;
		this.#contributions = contributions;
		this.#logger = logger;
		this.#tryOpenLink = tryOpenLink;
		this.#mediaRoot = vscode.Uri.joinPath(this.#extensionUri, 'markdown-editor-out');
		this._register(new vscode.Disposable(() => {
			void vscode.commands.executeCommand('setContext', 'markdownEditorFocus', false);
		}));
		this._register(new vscode.Disposable(() => disposeAll(this.#providerApiListeners.splice(0))));
	}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		token: vscode.CancellationToken,
	): Promise<void> {
		// Opening a new plain text file in the Markdown editor turns it into a Markdown scratchpad
		if (document.uri.scheme === 'untitled' && document.languageId === 'plaintext') {
			document = await vscode.languages.setTextDocumentLanguage(document, 'markdown');
		}
		await this.#resolveEditor(document, webviewPanel, token);
	}

	public async resolveCustomTextEditorInlineDiff(
		documents: vscode.CustomEditorDiffDocuments<vscode.TextDocument>,
		webviewPanel: vscode.WebviewPanel,
		token: vscode.CancellationToken,
	): Promise<void> {
		await this.#resolveEditor(documents.modified, webviewPanel, token, documents.original);
	}

	public resolveCustomTextEditorNavigation(
		_document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		token: vscode.CancellationToken,
	): vscode.CustomTextEditorNavigation {
		const navigation = this.#navigation.get(webviewPanel);
		if (!navigation || token.isCancellationRequested) {
			throw new vscode.CancellationError();
		}
		return navigation;
	}

	async #resolveEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken, originalDocument?: vscode.TextDocument): Promise<void> {
		if (!vscode.workspace.isTrusted) {
			const cancel = { title: vscode.l10n.t("Cancel"), isCloseAffordance: true };
			const openAnyway = { title: vscode.l10n.t("Open Anyway") };
			const choice = await vscode.window.showWarningMessage(
				vscode.l10n.t("This Markdown file is in an untrusted workspace. Do you want to open it anyway?"),
				{
					modal: true,
					detail: vscode.l10n.t("For your security, only continue if you trust the source of this Markdown file."),
				},
				cancel,
				openAnyway,
			);
			if (choice !== openAnyway || token.isCancellationRequested) {
				webviewPanel.dispose();
				return;
			}
		}

		if (token.isCancellationRequested) {
			return;
		}
		const syncedDocument = vsCodeTextDocument(document);
		const sync = new TextDocumentSync(syncedDocument, { onError: (message, error) => this.#logger.trace('Markdown editor', message, error) });
		webviewPanel.onDidDispose(() => syncedDocument.dispose());
		const webview = new AuthenticatedWebview(webviewPanel.webview, this.#logger, connection => sync.connect(connection));
		this.#webviewPanels.set(webviewPanel, webview);
		const codeBlockEditorProviders = this.#loadCodeBlockEditorProviders(webviewPanel.webview);
		this.#wireSingle(document, webviewPanel, originalDocument, codeBlockEditorProviders, webview, sync);
	}

	#configureWebview(document: vscode.TextDocument, editorWebview: AuthenticatedWebview, text: string): void {
		const webview = editorWebview.webview;
		const codeBlockEditorResourceRoots = vscode.workspace.isTrusted
			? this.#contributions.contributions.codeBlockEditorProviders.map(provider => provider.extension.extensionUri)
			: [];
		webview.options = {
			enableScripts: true,
			localResourceRoots: getMarkdownLocalResourceRoots(document.uri, [this.#mediaRoot, ...codeBlockEditorResourceRoots], {
				includeWorkspaceResources: vscode.workspace.isTrusted,
			}),
		};
		webview.html = this.#getHtml(document, webview, editorWebview.messageSecret, text);
	}

	#wireSingle(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		originalDocument: vscode.TextDocument | undefined,
		initialCodeBlockEditorProviders: Promise<readonly CodeBlockEditorProviderDefinition[]>,
		editorWebview: AuthenticatedWebview,
		sync: TextDocumentSync,
	): void {
		let webviewReady = false;
		let readonly = this.#globalState.get(MarkdownEditorProvider.#readonlyStateKey, true);
		let codeBlockEditorProviders: readonly CodeBlockEditorProviderDefinition[] | undefined;
		let contributionUpdate = 0;
		const resolveCancellation = new vscode.CancellationTokenSource();
		const hostTransports = new Map<string, CodeBlockEditorHostTransportState>();
		const disposeHostTransport = (runtimeId: string, expected?: CodeBlockEditorHostTransportState): void => {
			const transport = hostTransports.get(runtimeId);
			if (transport && (!expected || transport === expected)) {
				hostTransports.delete(runtimeId);
				transport.dispose();
			}
		};
		const disposeHostTransports = (): void => {
			for (const runtimeId of Array.from(hostTransports.keys())) {
				disposeHostTransport(runtimeId);
			}
		};
		const createHostTransport = (
			runtimeId: string,
			providerId: string,
			runtimeKey: string,
		): void => {
			disposeHostTransport(runtimeId);
			const contribution = this.#contributions.contributions.codeBlockEditorProviders.find(candidate => candidate.id === providerId);
			if (contribution?.source.kind !== 'exportApi' || contribution.source.apiVersion < 2 || !vscode.workspace.isTrusted) {
				return;
			}
			const state = new CodeBlockEditorHostTransportState(
				runtimeKey,
				message => editorWebview.report('Publish code block editor message', editorWebview.renderer.codeBlockEditorHostTransportMessage({
					runtimeId,
					message,
				})),
			);
			hostTransports.set(runtimeId, state);
			void this.#initializeCodeBlockEditorHostTransport(contribution, state, resolveCancellation.token).then(initialized => {
				if (!initialized) {
					disposeHostTransport(runtimeId, state);
				}
			}, error => {
				if (!resolveCancellation.token.isCancellationRequested) {
					this.#logger.trace('Markdown code block editor', `Provider ${providerId} failed to initialize a host transport`, error);
				}
				disposeHostTransport(runtimeId, state);
			});
		};
		const richLinks = new MarkdownEditorRichLinkController(
			document,
			this.#linkOpener,
			this.#logger,
			params => editorWebview.renderer.richLinkPresentations(params),
		);
		const postConfiguration = (): void => {
			editorWebview.report('Update configuration', editorWebview.renderer.configurationChanged(this.#getEditorConfiguration(document)));
		};
		const postCodeBlockEditorProviders = (): void => {
			if (webviewReady && codeBlockEditorProviders) {
				editorWebview.renderer.codeBlockEditorProviders({ codeBlockEditorProviders });
			}
		};
		const initialContributionUpdate = contributionUpdate;
		void initialCodeBlockEditorProviders.then(providers => {
			if (initialContributionUpdate !== contributionUpdate || resolveCancellation.token.isCancellationRequested) {
				return;
			}
			codeBlockEditorProviders = providers;
			postCodeBlockEditorProviders();
		}).catch(error => {
			if (!resolveCancellation.token.isCancellationRequested) {
				this.#logger.trace('Markdown code block editor', 'Failed to initialize contributed editors', error);
			}
		});

		const comments = this.#wireComments(document, editorWebview, sync);
		const rename = new MarkdownEditorRename(document, sync,
			() => webviewPanel.active && !resolveCancellation.token.isCancellationRequested);
		const languageFeatures = new MarkdownEditorLanguageFeatures(document, sync,
			() => webviewPanel.active && !resolveCancellation.token.isCancellationRequested);
		const imagePaste = new MarkdownEditorImagePaste(document, sync,
			() => !readonly && webviewPanel.active && !resolveCancellation.token.isCancellationRequested,
			request => editorWebview.renderer.readClipboardMedia(request));
		const navigation = new MarkdownEditorNavigation(document, sync,
			() => editorWebview.renderer, token => editorWebview.whenReady(token));
		this.#navigation.set(webviewPanel, navigation);
		const diagnosticsChanged = (): void => {
			if (webviewReady && !resolveCancellation.token.isCancellationRequested) {
				void editorWebview.renderer.diagnosticsChanged({}).catch(error =>
					this.#logger.trace('Markdown editor', 'Failed to refresh diagnostics', error));
			}
		};
		const diagnosticListener = vscode.languages.onDidChangeDiagnostics(event => {
			if (event.uris.some(uri => uri.toString() === document.uri.toString())) { diagnosticsChanged(); }
		});
		editorWebview.setHandlers({
			selectionChanged: message => navigation.acceptSelection(message),
			getDiagnostics: () => languageFeatures.diagnostics(),
			completions: message => languageFeatures.completions(message),
			acceptCompletion: message => languageFeatures.accept(message),
			cancelCompletions: message => languageFeatures.cancel(message.requestId),
			pasteImages: message => imagePaste.paste(message),
			prepareRename: message => rename.prepare(message),
			rename: message => rename.rename(message),
			cancelRename: message => rename.cancel(message.requestId),
			ready: async (_message, _context, { signal }) => {
				richLinks.clear();
				webviewReady = true;
				editorWebview.acceptReady();
				signal.throwIfAborted();
				editorWebview.publishReady();
				postConfiguration();
				postCodeBlockEditorProviders();
				diagnosticsChanged();
			},

			resolveCodeBlockEditor: async (message, _context, { signal }) => {
				const provider = this.#contributions.contributions.codeBlockEditorProviders.find(candidate => candidate.id === message.providerId);
				const descriptor = provider
					? await this.#resolveCodeBlockEditor(provider, document.uri, message.language, editorWebview.webview)
					: undefined;
				signal.throwIfAborted();
				return { descriptor };
			},

			createCodeBlockEditorHostTransport: message => {
				createHostTransport(message.runtimeId, message.providerId, message.runtimeKey);
			},

			codeBlockEditorHostTransportMessage: message => {
				hostTransports.get(message.runtimeId)?.acceptMessage(message.message);
			},

			disposeCodeBlockEditorHostTransport: message => {
				disposeHostTransport(message.runtimeId);
			},

			codeBlockEditorDiagnostic: message => {
				this.#logger.trace('Markdown code block editor', message.message);
			},

			richLinkSubscriptions: message => {
				richLinks.updateSubscriptions(message);
			},

			editorFocusChanged: async message => {
				if (message.focused) {
					this.#focusedWebviewPanels.add(webviewPanel);
				} else {
					this.#focusedWebviewPanels.delete(webviewPanel);
				}
				await this.#updateEditorFocusContext();
			},


			setReadonly: async message => {
				readonly = message.readonly;
				await this.#globalState.update(MarkdownEditorProvider.#readonlyStateKey, message.readonly);
			},
			history: async (message, _context, { signal }) => {
				// The TextDocument owns undo/redo, so route the chord to the built-in
				// command; the active custom editor input scopes it to this resource's
				// history, shared with the Edit menu and Command Palette. Write the
				// editor's changes first and only act while this panel is active, so the
				// chord cannot race a pending edit or land on a different document.
				await sync.drain();
				signal.throwIfAborted();
				if (webviewPanel.active && !resolveCancellation.token.isCancellationRequested) {
					await vscode.commands.executeCommand(message.command);
				}
			},
			openLink: async (message, _context, { signal }) => {
				// Link targets resolve against the document. Write the editor's
				// changes first so the resolved line/column matches the editor text.
				await sync.drain();
				signal.throwIfAborted();
				if (await this.#tryOpenLink(message.href, document.uri)) {
					return;
				}
				signal.throwIfAborted();
				const target = await this.#linkOpener.resolveDocumentLink(message.href, document.uri);
				signal.throwIfAborted();
				if (message.href.includes('#')) {
					const range = getInDocumentLinkTargetRange(document, target, sync.text);
					const version = sync.version;
					if (range && version) {
						await editorWebview.renderer.revealLinkTarget({ ...range, version });
						return;
					}
				}
				await this.#linkOpener.openResolvedDocumentLink(message.href, document.uri, target);
			},
			addComment: comments.addComment,
			deleteComment: comments.deleteComment,
			highlight: async ({ source, languageId }) => vscode.languages.computeFullSyntaxHighlighting(source, languageId),
		});

		let lineBreak = vsCodeLineBreak(document);
		const onDocumentChange = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() === document.uri.toString() && e.contentChanges.length > 0) {
				diagnosticsChanged();
				if (vsCodeLineBreak(document) !== lineBreak) {
					lineBreak = vsCodeLineBreak(document);
					if (editorWebview.ready) {
						postConfiguration();
					}
				}
			}
		});

		const highlight = this.#wireHighlight(editorWebview);
		const quickDiff = originalDocument
			? this.#wireDocumentDiff(originalDocument, document, editorWebview, sync)
			: this.#wireQuickDiff(document, editorWebview, sync);
		const reloadWebview = (): void => {
			navigation.reset();
			richLinks.clear();
			imagePaste.dispose();
			rename.cancel();
			languageFeatures.cancel();
			webviewReady = false;
			if (resolveCancellation.token.isCancellationRequested) {
				return;
			}
			disposeHostTransports();
			editorWebview.reset();
			this.#configureWebview(document, editorWebview, sync.text);
			void refreshCodeBlockEditorProviders(true, true);
		};
		const onDidGrantWorkspaceTrust = vscode.workspace.onDidGrantWorkspaceTrust(() => {
			reloadWebview();
		});
		const refreshCodeBlockEditorProviders = async (clearProviderApis: boolean, force: boolean): Promise<void> => {
			const update = ++contributionUpdate;
			if (clearProviderApis) {
				this.#clearCodeBlockEditorCaches();
			} else {
				this.#resolvedCodeBlockEditors.clear();
				this.#resolvedCodeBlockEditorResources.clear();
			}
			const updatedCodeBlockEditorProviders = await this.#loadCodeBlockEditorProviders(editorWebview.webview);
			if (
				update !== contributionUpdate
				|| (!force && codeBlockEditorProviders && codeBlockEditorDefinitionsEqual(codeBlockEditorProviders, updatedCodeBlockEditorProviders))
			) {
				return;
			}
			codeBlockEditorProviders = updatedCodeBlockEditorProviders;
			postCodeBlockEditorProviders();
		};
		const onContributionsChanged = this.#contributions.onContributionsChanged(() => {
			void refreshCodeBlockEditorProviders(true, false);
		});
		const onDidChangeCodeBlockEditorProvider = this.#onDidChangeCodeBlockEditorProvider.event(() => {
			void refreshCodeBlockEditorProviders(false, true);
		});
		const invalidateResourceCache = (resources: readonly vscode.Uri[]): void => {
			const resourceKeys = resources.map(resource => resource.toString());
			const dynamicResourceChanged = resourceKeys.some(resource => this.#resolvedCodeBlockEditorResources.has(resource));
			const staticResourceChanged = this.#contributions.contributions.codeBlockEditorProviders.some(provider =>
				provider.source.kind === 'static' && resourceKeys.includes(provider.source.resource.toString()));
			if (dynamicResourceChanged || staticResourceChanged) {
				void refreshCodeBlockEditorProviders(false, dynamicResourceChanged);
			}
		};
		const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument(document => invalidateResourceCache([document.uri]));
		const onDidCreateFiles = vscode.workspace.onDidCreateFiles(event => invalidateResourceCache(event.files));
		const onDidDeleteFiles = vscode.workspace.onDidDeleteFiles(event => invalidateResourceCache(event.files));
		const onDidRenameFiles = vscode.workspace.onDidRenameFiles(event => invalidateResourceCache(
			event.files.flatMap(file => [file.oldUri, file.newUri])));
		const onDidChangeViewState = webviewPanel.onDidChangeViewState(() => this.#updateEditorFocusContext());
		const onDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('markdown.experimental.richLinks.enabled', document.uri)) {
				reloadWebview();
			}
			if (event.affectsConfiguration('markdown.editor.highlightActiveBlock', document.uri) && editorWebview.ready) {
				postConfiguration();
			}
		});
		const onDidChangeLinkPresentationRules = vscode.window.onDidChangeLinkPresentationRules(() => {
			reloadWebview();
		});

		this.#configureWebview(document, editorWebview, sync.text);

		webviewPanel.onDidDispose(() => {
			navigation.dispose();
			this.#navigation.delete(webviewPanel);
			imagePaste.dispose();
			rename.cancel();
			languageFeatures.cancel();
			diagnosticListener.dispose();
			contributionUpdate++;
			resolveCancellation.cancel();
			resolveCancellation.dispose();
			disposeHostTransports();
			this.#webviewPanels.delete(webviewPanel);
			this.#focusedWebviewPanels.delete(webviewPanel);
			this.#updateEditorFocusContext();
			editorWebview.dispose();
			sync.dispose();
			onDocumentChange.dispose();
			highlight.dispose();
			quickDiff.dispose();
			comments.dispose();
			onDidGrantWorkspaceTrust.dispose();
			onContributionsChanged.dispose();
			onDidChangeCodeBlockEditorProvider.dispose();
			onDidSaveTextDocument.dispose();
			onDidCreateFiles.dispose();
			onDidDeleteFiles.dispose();
			onDidRenameFiles.dispose();
			onDidChangeViewState.dispose();
			onDidChangeConfiguration.dispose();
			onDidChangeLinkPresentationRules.dispose();
			richLinks.dispose();
		});
	}

	public async executeCommand(command: string): Promise<void> {
		const activeWebview = Array.from(this.#webviewPanels).find(([panel]) => panel.active)?.[1];
		if (!activeWebview) {
			this.#logger.trace('Markdown editor command', `Ignored ${command} because no Markdown editor is active`);
			return;
		}
		await activeWebview.renderer.command({ command });
	}

	async #updateEditorFocusContext(): Promise<void> {
		const focused = Array.from(this.#focusedWebviewPanels).some(panel => panel.active);
		await vscode.commands.executeCommand('setContext', 'markdownEditorFocus', focused);
	}

	async #loadCodeBlockEditorProviders(webview: vscode.Webview): Promise<readonly CodeBlockEditorProviderDefinition[]> {
		if (!vscode.workspace.isTrusted) {
			return [];
		}
		const result: CodeBlockEditorProviderDefinition[] = [];
		for (const provider of this.#contributions.contributions.codeBlockEditorProviders) {
			if (provider.source.kind === 'exportApi') {
				if (!isSupportedMarkdownCodeBlockEditorApiVersion(provider.source.apiVersion)) {
					this.#logger.trace('Markdown code block editor', `Ignoring provider ${provider.id} because API version ${provider.source.apiVersion} is not supported`);
					continue;
				}
				result.push({
					id: provider.id,
					selector: provider.selector,
					source: { kind: 'exportApi' },
				});
				continue;
			}
			try {
				const bytes = await vscode.workspace.fs.readFile(provider.source.resource);
				result.push({
					id: provider.id,
					selector: provider.selector,
					source: {
						kind: 'static',
						descriptor: {
							html: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
							runtimeKey: provider.runtimeKey ?? `${provider.id}@${provider.extensionVersion}`,
							resourceBaseUrl: getCodeBlockEditorResourceBaseUrl(webview, provider.source.resource),
							contentType: provider.contentType,
							initialHeight: provider.initialHeight,
							presentation: provider.presentation,
							sandbox: provider.sandbox,
						},
					},
				});
			} catch (error) {
				this.#logger.trace('Markdown code block editor', `Failed to load ${provider.id} from ${provider.source.resource.toString()}`, error);
			}
		}
		return result;
	}

	async #resolveCodeBlockEditor(
		contribution: MarkdownCodeBlockEditorProvider,
		documentUri: vscode.Uri,
		language: string,
		webview: vscode.Webview,
	): Promise<ResolvedCodeBlockEditor | undefined> {
		if (contribution.source.kind !== 'exportApi' || !vscode.workspace.isTrusted) {
			return undefined;
		}
		const requestCacheKey = `${contribution.id}\0${documentUri.toString()}\0${language}`;
		let cached = this.#resolvedCodeBlockEditors.get(requestCacheKey);
		if (!cached) {
			cached = this.#doResolveCodeBlockEditor(contribution, documentUri, language, webview);
			this.#resolvedCodeBlockEditors.set(requestCacheKey, cached);
			cached.then(result => {
				if (!result) {
					if (this.#resolvedCodeBlockEditors.get(requestCacheKey) === cached) {
						this.#resolvedCodeBlockEditors.delete(requestCacheKey);
					}
				} else if (result.cacheKey) {
					this.#resolvedCodeBlockEditors.set(`${contribution.id}\0${result.cacheKey}`, Promise.resolve(result));
				}
			}, () => {
				this.#resolvedCodeBlockEditors.delete(requestCacheKey);
			});
		}
		return cached;
	}

	async #doResolveCodeBlockEditor(
		contribution: MarkdownCodeBlockEditorProvider,
		documentUri: vscode.Uri,
		language: string,
		webview: vscode.Webview,
	): Promise<ResolvedCodeBlockEditor | undefined> {
		const cancellation = new vscode.CancellationTokenSource();
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			cancellation.cancel();
		}, 10_000);
		let cancellationListener: vscode.Disposable | undefined;
		const cancelled = new Promise<undefined>(resolve => {
			cancellationListener = cancellation.token.onCancellationRequested(() => resolve(undefined));
		});
		try {
			const operation = async (): Promise<ResolvedCodeBlockEditor | undefined> => {
				const provider = await this.#getCodeBlockEditorProvider(contribution);
				if (!provider || cancellation.token.isCancellationRequested) {
					return undefined;
				}
				const value = await provider.resolve({
					providerId: contribution.providerId,
					language,
					documentUri,
				}, cancellation.token);
				if (!value || cancellation.token.isCancellationRequested) {
					return undefined;
				}
				if (value.content.uri !== undefined) {
					this.#resolvedCodeBlockEditorResources.add(value.content.uri.toString());
				}
				return await this.#readResolvedCodeBlockEditor(
					contribution,
					value,
					language,
					webview,
					typeof provider.createHostTransport === 'function',
				);
			};
			const result = await Promise.race([operation(), cancelled]);
			if (timedOut) {
				this.#logger.trace('Markdown code block editor', `Provider ${contribution.id} timed out resolving ${language}`);
				return undefined;
			}
			return result;
		} catch (error) {
			this.#logger.trace('Markdown code block editor', `Provider ${contribution.id} failed to resolve ${language}`, error);
			return undefined;
		} finally {
			clearTimeout(timeout);
			cancellationListener?.dispose();
			cancellation.dispose();
		}
	}

	async #getCodeBlockEditorProvider(contribution: MarkdownCodeBlockEditorProvider): Promise<MarkdownCodeBlockEditorProviderApi | undefined> {
		const source = contribution.source;
		if (source.kind !== 'exportApi' || !isSupportedMarkdownCodeBlockEditorApiVersion(source.apiVersion)) {
			return undefined;
		}
		let cached = this.#providerApis.get(contribution.id);
		if (!cached) {
			cached = (async () => {
				const exports = await contribution.extension.activate();
				const api = source.apiVersion === 1
					? getMarkdownCodeBlockEditorApiV1(exports)
					: getMarkdownCodeBlockEditorApiV2(exports);
				if (!api) {
					this.#logger.trace('Markdown code block editor', `Extension ${contribution.extension.id} does not export markdownCodeBlockEditors.apiV${source.apiVersion}`);
					return undefined;
				}
				const provider = api.getProvider(contribution.providerId);
				if (!isMarkdownCodeBlockEditorProviderApi(provider)) {
					this.#logger.trace('Markdown code block editor', `Extension ${contribution.extension.id} did not return provider ${contribution.providerId}`);
					return undefined;
				}
				if (provider.onDidChange) {
					this.#providerApiListeners.push(provider.onDidChange(() => this.#onDidChangeCodeBlockEditorProvider.fire()));
				}
				return provider;
			})();
			this.#providerApis.set(contribution.id, cached);
		}
		return cached;
	}

	async #readResolvedCodeBlockEditor(
		contribution: MarkdownCodeBlockEditorProvider,
		value: ProviderResolvedCodeBlockEditor,
		language: string,
		webview: vscode.Webview,
		hasHostTransport: boolean,
	): Promise<ResolvedCodeBlockEditor | undefined> {
		if (!isProviderResolvedCodeBlockEditor(value)) {
			this.#logger.trace('Markdown code block editor', `Provider ${contribution.id} returned an invalid descriptor`);
			return undefined;
		}
		let html: string;
		let baseUri: vscode.Uri | undefined;
		if (value.content.html !== undefined) {
			html = value.content.html;
			baseUri = value.content.baseUri;
		} else {
			if (!isAllowedCodeBlockEditorResource(value.content.uri, contribution.extension.extensionUri)) {
				this.#logger.trace('Markdown code block editor', `Provider ${contribution.id} returned a resource outside its extension and the workspace`);
				return undefined;
			}
			const bytes = await vscode.workspace.fs.readFile(value.content.uri);
			html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
			baseUri = value.content.uri;
		}
		if (baseUri && !isAllowedCodeBlockEditorResource(baseUri, contribution.extension.extensionUri)) {
			this.#logger.trace('Markdown code block editor', `Provider ${contribution.id} returned a base URI outside its extension and the workspace`);
			return undefined;
		}
		return {
			cacheKey: value.cacheKey,
			html,
			runtimeKey: value.runtimeKey ?? contribution.runtimeKey ?? value.cacheKey ?? `${contribution.id}@${contribution.extensionVersion}:${language}`,
			resourceBaseUrl: baseUri ? getCodeBlockEditorResourceBaseUrl(webview, baseUri, value.content.html === undefined) : undefined,
			hostTransport: hasHostTransport && contribution.source.kind === 'exportApi' && contribution.source.apiVersion >= 2,
			contentType: value.contentType ?? contribution.contentType,
			initialHeight: value.initialHeight ?? contribution.initialHeight,
			presentation: mergeCodeBlockEditorPresentation(contribution.presentation, value.presentation),
			sandbox: intersectSandbox(contribution.sandbox, value.sandbox),
		};
	}

	async #initializeCodeBlockEditorHostTransport(
		contribution: MarkdownCodeBlockEditorProvider,
		state: CodeBlockEditorHostTransportState,
		token: vscode.CancellationToken,
	): Promise<boolean> {
		const provider = await this.#getCodeBlockEditorProvider(contribution);
		if (!provider?.createHostTransport || token.isCancellationRequested) {
			return false;
		}
		const disposable = await provider.createHostTransport(state.transport, token);
		state.setReady(disposable ?? undefined);
		return !token.isCancellationRequested;
	}

	#clearCodeBlockEditorCaches(): void {
		disposeAll(this.#providerApiListeners.splice(0));
		this.#providerApis.clear();
		this.#resolvedCodeBlockEditors.clear();
		this.#resolvedCodeBlockEditorResources.clear();
	}

	/**
	 * Forwards the source-control change information for the document (the same
	 * added/modified/deleted line changes shown in the editor gutter) to the
	 * webview, where it is painted in the Markdown editor's gutter. Line ranges
	 * are converted to source character offsets here, since the webview works in
	 * offsets.
	 */
	#wireQuickDiff(document: vscode.TextDocument, editorWebview: AuthenticatedWebview, sync: TextDocumentSync): vscode.Disposable {
		const diffProvider = vscode.window.createSourceControlDiffInformation(document.uri);

		const postMarkers = async () => {
			// Offsets into the editor text are document offsets once the editor's changes are written.
			await sync.drain();
			const diffInformation = diffProvider.diffInformation;
			// The changes are computed asynchronously against a specific document
			// version. Only map them to offsets while that version still matches the
			// document we hold, otherwise the line positions could be stale. A newer
			// diff for the current version will arrive via onDidChange.
			const version = sync.version;
			if (!editorWebview.ready || !diffInformation || diffInformation.isStale || !version) {
				return;
			}
			editorWebview.renderer.gutterMarkers({ version, markers: toGutterMarkers(document, diffInformation.changes) });
		};
		const publishMarkers = () => editorWebview.report('Publish quick diff', postMarkers());

		const onChange = diffProvider.onDidChange(publishMarkers);
		// Re-send once the webview has (re)initialized its model, and whenever the
		// document settles on the version the changes were computed for.
		const onReady = editorWebview.onReady(publishMarkers);
		const onDocumentChange = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() === document.uri.toString()) {
				publishMarkers();
			}
		});

		return vscode.Disposable.from(diffProvider, onChange, onReady, onDocumentChange);
	}

	#wireDocumentDiff(originalDocument: vscode.TextDocument, modifiedDocument: vscode.TextDocument, editorWebview: AuthenticatedWebview, sync: TextDocumentSync): vscode.Disposable {
		const lineDiffProvider = new MarkdownPreviewLineDiffProvider(originalDocument, modifiedDocument);
		const postMarkers = async () => {
			if (!editorWebview.ready) {
				return;
			}
			await sync.drain();
			const originalVersion = originalDocument.version;
			const modifiedVersion = modifiedDocument.version;
			const revision = sync.revision;
			const changes = await lineDiffProvider.getChangedLineRanges();
			const version = sync.version;
			// Typing in the meantime may not be in the document yet; its write triggers a new publication.
			if (originalVersion !== originalDocument.version || modifiedVersion !== modifiedDocument.version || revision !== sync.revision || !version) {
				return;
			}
			editorWebview.renderer.gutterMarkers({ version, markers: lineRangesToGutterMarkers(modifiedDocument, changes) });
		};

		const publishMarkers = () => editorWebview.report('Publish document diff', postMarkers());
		const onReady = editorWebview.onReady(publishMarkers);
		const onDocumentChange = vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.uri.toString() === originalDocument.uri.toString() || event.document.uri.toString() === modifiedDocument.uri.toString()) {
				publishMarkers();
			}
		});

		return vscode.Disposable.from(onReady, onDocumentChange);
	}

	/**
	 * Bridges the workbench's agent/session comments (the same store the code
	 * editor renders its comments from) to the webview: existing comments are
	 * forwarded for rendering, and comments the user adds in the Markdown editor
	 * are written back to the shared store so they appear in the code editor too.
	 * Comment ranges are converted between {@link vscode.Range} and offsets into
	 * the editor text.
	 */
	#wireComments(document: vscode.TextDocument, editorWebview: AuthenticatedWebview, sync: TextDocumentSync): vscode.Disposable & Pick<InterfaceHandlers<typeof markdownEditorHost>, 'addComment' | 'deleteComment'> {
		const commentsProvider = vscode.window.createAgentEditorComments(document.uri);
		let revealedCommentId: string | undefined;

		const postComments = async () => {
			await sync.drain();
			const version = sync.version;
			if (!editorWebview.ready || !version) {
				return;
			}
			const comments = commentsProvider.comments.map(comment => ({
				id: comment.id,
				start: document.offsetAt(comment.range.start),
				endExclusive: document.offsetAt(comment.range.end),
				body: comment.body,
				author: comment.author,
			}));
			await editorWebview.renderer.comments({ version, comments, acceptsComments: commentsProvider.acceptsComments });
		};
		const publishComments = () => editorWebview.report('Publish comments', postComments());
		const postReveal = () => {
			if (editorWebview.ready && revealedCommentId) {
				editorWebview.report('Reveal comment', editorWebview.renderer.revealComment({ id: revealedCommentId }));
			}
		};

		const onChange = commentsProvider.onDidChange(publishComments);
		const onDidRevealComment = commentsProvider.onDidRevealComment(id => {
			revealedCommentId = id;
			postReveal();
		});
		const onReady = editorWebview.onReady(() => {
			publishComments();
			postReveal();
		});

		return {
			addComment: async message => {
				const start = message.start <= message.endExclusive ? sync.trackFromEditor(message.version, message.start) : undefined;
				const end = start && sync.trackFromEditor(message.version, message.endExclusive);
				try {
					if (!start || !end) {
						throw new Error(vscode.l10n.t('The document changed. Add the comment again.'));
					}
					await sync.drain();
					commentsProvider.addComment(new vscode.Range(document.positionAt(start.offset), document.positionAt(end.offset)), message.text);
				} finally {
					start?.dispose();
					end?.dispose();
				}
			},
			deleteComment: message => {
				commentsProvider.deleteComment(message.id);
			},
			dispose: () => vscode.Disposable.from(commentsProvider, onChange, onDidRevealComment, onReady).dispose(),
		};
	}


	/**
	 * Proxies the webview's syntax highlighting requests to the
	 * `documentSyntaxHighlighting` proposed API, since the webview cannot call
	 * it directly. Also forwards theme changes so the webview can re-highlight.
	 */
	#wireHighlight(editorWebview: AuthenticatedWebview): vscode.Disposable {
		return vscode.languages.onDidChangeSyntaxHighlighting(() => {
			if (editorWebview.ready) {
				editorWebview.report('Refresh highlighting', editorWebview.renderer.highlightThemeChanged({}));
			}
		});
	}

	#getHtml(document: vscode.TextDocument, webview: vscode.Webview, messageSecret: string, text: string): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.#mediaRoot, 'editor.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.#mediaRoot, 'editor.css'));
		const baseUri = webview.asWebviewUri(document.uri);
		const nonce = getNonce();
		const initialState = encodeWebviewInitialState({
			...this.#getEditorConfiguration(document),
			taskProgressLabels: {
				title: vscode.l10n.t("Task Progress"),
				summary: vscode.l10n.t("{0} of {1} tasks completed"),
				language: vscode.env.language,
			},
			content: text,
			readonly: this.#globalState.get(MarkdownEditorProvider.#readonlyStateKey, true),
			richLinksEnabled: vscode.workspace.getConfiguration('markdown').get<boolean>('experimental.richLinks.enabled', true),
			linkPresentationRules: vscode.window.linkPresentationRules.map(rule => ({
				id: rule.id,
				source: rule.uriPattern.source,
				flags: rule.uriPattern.flags,
				kind: rule.kind === 'chat' ? 'session' : rule.kind,
			})),
		});

		const body = /* html */ `
	<div id="editor"></div>`;

		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; media-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}' ${webview.cspSource}; worker-src ${webview.cspSource} blob:; connect-src ${webview.cspSource}; frame-src 'self';" />
	<meta name="vscode-markdown-editor-script-nonce" content="${nonce}" />
	<meta name="vscode-markdown-editor-message-secret" content="${messageSecret}" />
	<meta id="vscode-markdown-editor-initial-state" content="${initialState}" />
	<base href="${baseUri}" />
	<link rel="stylesheet" href="${styleUri}" />
	<title>Markdown Editor</title>
</head>
<body>${body}
	<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
	}

	#getEditorConfiguration(document: vscode.TextDocument): MarkdownEditorConfiguration {
		return {
			highlightActiveBlock: vscode.workspace.getConfiguration('markdown.editor', document.uri).get<boolean>('highlightActiveBlock', true),
			lineBreak: vsCodeLineBreak(document),
		};
	}
}

function codeBlockEditorDefinitionsEqual(
	a: readonly CodeBlockEditorProviderDefinition[],
	b: readonly CodeBlockEditorProviderDefinition[],
): boolean {
	return a.length === b.length && a.every((editor, index) => {
		const other = b[index];
		return editor.id === other.id
			&& editor.selector.language === other.selector.language
			&& editor.selector.languagePrefix === other.selector.languagePrefix
			&& editor.source.kind === other.source.kind
			&& (editor.source.kind !== 'static'
				|| (other.source.kind === 'static' && resolvedCodeBlockEditorsEqual(editor.source.descriptor, other.source.descriptor)));
	});
}

function resolvedCodeBlockEditorsEqual(a: ResolvedCodeBlockEditor, b: ResolvedCodeBlockEditor): boolean {
	return a.cacheKey === b.cacheKey
		&& a.html === b.html
		&& a.runtimeKey === b.runtimeKey
		&& a.resourceBaseUrl === b.resourceBaseUrl
		&& a.hostTransport === b.hostTransport
		&& a.contentType === b.contentType
		&& a.initialHeight === b.initialHeight
		&& codeBlockEditorPresentationEqual(a.presentation, b.presentation)
		&& a.sandbox?.forms === b.sandbox?.forms
		&& a.sandbox?.downloads === b.sandbox?.downloads
		&& a.sandbox?.pointerLock === b.sandbox?.pointerLock
		&& a.sandbox?.clipboardWrite === b.sandbox?.clipboardWrite;
}

export function getMarkdownCodeBlockEditorApiV1(value: unknown): MarkdownCodeBlockEditorApiV1 | undefined {
	return getMarkdownCodeBlockEditorApi(value, 1);
}

export function getMarkdownCodeBlockEditorApiV2(value: unknown): MarkdownCodeBlockEditorApiV2 | undefined {
	return getMarkdownCodeBlockEditorApi(value, 2);
}

function getMarkdownCodeBlockEditorApi(value: unknown, apiVersion: 1): MarkdownCodeBlockEditorApiV1 | undefined;
function getMarkdownCodeBlockEditorApi(value: unknown, apiVersion: 2): MarkdownCodeBlockEditorApiV2 | undefined;
function getMarkdownCodeBlockEditorApi(value: unknown, apiVersion: 1 | 2): MarkdownCodeBlockEditorApiV1 | MarkdownCodeBlockEditorApiV2 | undefined;
function getMarkdownCodeBlockEditorApi(value: unknown, apiVersion: 1 | 2): MarkdownCodeBlockEditorApiV1 | MarkdownCodeBlockEditorApiV2 | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const namespace = (value as Record<string, unknown>).markdownCodeBlockEditors;
	if (!namespace || typeof namespace !== 'object') {
		return undefined;
	}
	const api = (namespace as Record<string, unknown>)[`apiV${apiVersion}`];
	return isMarkdownCodeBlockEditorApi(api) ? api : undefined;
}

export function isSupportedMarkdownCodeBlockEditorApiVersion(value: number): value is 1 | 2 {
	return value === 1 || value === 2;
}

function isMarkdownCodeBlockEditorApi(value: unknown): value is MarkdownCodeBlockEditorApiV1 | MarkdownCodeBlockEditorApiV2 {
	return typeof value === 'object'
		&& value !== null
		&& typeof (value as Record<string, unknown>).getProvider === 'function';
}

function isMarkdownCodeBlockEditorProviderApi(value: unknown): value is MarkdownCodeBlockEditorProviderApi {
	return typeof value === 'object'
		&& value !== null
		&& typeof (value as Record<string, unknown>).resolve === 'function'
		&& ['undefined', 'function'].includes(typeof (value as Record<string, unknown>).onDidChange);
}

function isProviderResolvedCodeBlockEditor(value: unknown): value is ProviderResolvedCodeBlockEditor {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const descriptor = value as Record<string, unknown>;
	if (
		(descriptor.contentType !== undefined && descriptor.contentType !== 'text' && descriptor.contentType !== 'json')
		|| (descriptor.cacheKey !== undefined && typeof descriptor.cacheKey !== 'string')
		|| (descriptor.runtimeKey !== undefined && (typeof descriptor.runtimeKey !== 'string' || descriptor.runtimeKey.length === 0 || descriptor.runtimeKey.length > 256))
		|| (descriptor.initialHeight !== undefined && (!Number.isFinite(descriptor.initialHeight) || (descriptor.initialHeight as number) <= 0))
		|| (descriptor.presentation !== undefined && !codeBlockEditorPresentation.safeParse(descriptor.presentation).success)
		|| !isSandbox(descriptor.sandbox)
		|| !descriptor.content
		|| typeof descriptor.content !== 'object'
	) {
		return false;
	}
	const content = descriptor.content as Record<string, unknown>;
	return (typeof content.html === 'string' && content.uri === undefined && (content.baseUri === undefined || content.baseUri instanceof vscode.Uri))
		|| (content.html === undefined && content.uri instanceof vscode.Uri);
}

function isSandbox(value: unknown): value is MarkdownCodeBlockEditorSandbox | undefined {
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

function intersectSandbox(
	maximum: MarkdownCodeBlockEditorSandbox | undefined,
	requested: MarkdownCodeBlockEditorSandbox | undefined,
): MarkdownCodeBlockEditorSandbox {
	return {
		forms: maximum?.forms === true && requested?.forms !== false,
		downloads: maximum?.downloads === true && requested?.downloads !== false,
		pointerLock: maximum?.pointerLock === true && requested?.pointerLock !== false,
		clipboardWrite: maximum?.clipboardWrite === true && requested?.clipboardWrite !== false,
	};
}

function isAllowedCodeBlockEditorResource(resource: vscode.Uri, extensionUri: vscode.Uri): boolean {
	if (vscode.workspace.getWorkspaceFolder(resource)) {
		return true;
	}

	if (resource.scheme !== extensionUri.scheme || resource.authority !== extensionUri.authority) {
		return false;
	}
	const caseInsensitive = resource.scheme === 'file';
	const resourcePath = caseInsensitive ? resource.path.toLowerCase() : resource.path;
	const extensionPath = caseInsensitive ? extensionUri.path.toLowerCase() : extensionUri.path;
	const extensionPrefix = extensionPath.endsWith('/') ? extensionPath : `${extensionPath}/`;
	return resourcePath === extensionPath || resourcePath.startsWith(extensionPrefix);
}

function getCodeBlockEditorResourceBaseUrl(webview: vscode.Webview, resource: vscode.Uri, resourceIsEntrypoint = true): string {
	const path = resourceIsEntrypoint
		? resource.path.slice(0, resource.path.lastIndexOf('/') + 1)
		: resource.path.endsWith('/') ? resource.path : `${resource.path}/`;
	return webview.asWebviewUri(resource.with({ path, query: '', fragment: '' })).toString();
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function getInDocumentLinkTargetRange(
	document: vscode.TextDocument,
	target: ResolvedDocumentLinkTarget | undefined,
	webviewText = document.getText(),
): { readonly start: number; readonly endExclusive: number; readonly selectionStart: number } | undefined {
	if (target?.kind !== 'file' || !areUrisEqual(document.uri, vscode.Uri.from(target.uri))) {
		return undefined;
	}
	const targetRange = getRangeFromPositionOrRange(target.positionOrRange);
	if (!targetRange || targetRange.start.line >= document.lineCount || targetRange.end.line >= document.lineCount) {
		return undefined;
	}
	const webviewDocument = TextDocument.create(document.uri.toString(), 'markdown', 0, webviewText);
	if (targetRange.start.line >= webviewDocument.lineCount || targetRange.end.line >= webviewDocument.lineCount) {
		return undefined;
	}
	// Heading links resolve to the line start, whose Markdown marker is hidden while rendered.
	// Reveal the full line so the editor can map the target to visible content.
	let start = webviewDocument.offsetAt(targetRange.start);
	let endExclusive = webviewDocument.offsetAt(targetRange.end);
	if (targetRange.isEmpty) {
		start = webviewDocument.offsetAt({ line: targetRange.start.line, character: 0 });
		endExclusive = targetRange.start.line + 1 < webviewDocument.lineCount
			? webviewDocument.offsetAt({ line: targetRange.start.line + 1, character: 0 })
			: webviewText.length;
		while (endExclusive > start && (webviewText[endExclusive - 1] === '\n' || webviewText[endExclusive - 1] === '\r')) {
			endExclusive--;
		}
	}
	return {
		start,
		endExclusive,
		selectionStart: webviewDocument.offsetAt(targetRange.start),
	};
}

interface GutterMarkerMessage {
	readonly start: number;
	readonly endExclusive: number;
	readonly type: 'added' | 'modified' | 'deleted';
}


/**
 * Converts the line-based source control changes into source character offset
 * ranges understood by the Markdown editor's `gutterMarkers`. Added/modified
 * changes map to the offset span of their modified lines; deleted changes map to
 * an empty range at the boundary where the removed text used to be.
 *
 * Line ranges use {@link vscode.TextEditorLineRange} semantics: 1-based
 * `startLineNumber` and exclusive `endLineNumberExclusive`.
 */
function toGutterMarkers(document: vscode.TextDocument, changes: readonly vscode.TextEditorChange[]): GutterMarkerMessage[] {
	const markers: GutterMarkerMessage[] = [];
	for (const change of changes) {
		if (change.kind === vscode.TextEditorChangeKind.Deletion) {
			// The modified range is empty; place an empty marker at the start of the
			// line where the removed content used to be.
			const line = Math.max(0, change.modified.startLineNumber - 1);
			const offset = document.offsetAt(new vscode.Position(line, 0));
			markers.push({ start: offset, endExclusive: offset, type: 'deleted' });
			continue;
		}

		const start = document.offsetAt(new vscode.Position(change.modified.startLineNumber - 1, 0));
		const endExclusive = document.offsetAt(document.lineAt(change.modified.endLineNumberExclusive - 2).range.end);
		markers.push({
			start,
			endExclusive,
			type: change.kind === vscode.TextEditorChangeKind.Addition ? 'added' : 'modified',
		});
	}
	return markers;
}

export function lineRangesToGutterMarkers(document: vscode.TextDocument, changes: readonly ChangedLineRange[]): GutterMarkerMessage[] {
	return changes.map(change => {
		if (change.modifiedRange.isEmpty) {
			const offset = document.offsetAt(change.modifiedRange.start);
			return { start: offset, endExclusive: offset, type: 'deleted' };
		}

		const start = document.offsetAt(change.modifiedRange.start);
		const endExclusive = document.offsetAt(document.lineAt(change.modifiedRange.end.line - 1).range.end);
		return {
			start,
			endExclusive,
			type: change.originalRange.isEmpty ? 'added' : 'modified',
		};
	});
}
