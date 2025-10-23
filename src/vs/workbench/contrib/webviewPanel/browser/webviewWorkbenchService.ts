/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { memoize } from '../../../../base/common/decorators.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { combinedDisposable, Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { EditorActivation } from '../../../../platform/editor/common/editor.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { GroupIdentifier } from '../../../common/editor.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP_TYPE, IEditorService, SIDE_GROUP_TYPE } from '../../../services/editor/common/editorService.js';
import { IOverlayWebview, IWebviewService, WebviewInitInfo } from '../../webview/browser/webview.js';
import { CONTEXT_ACTIVE_WEBVIEW_PANEL_ID } from './webviewEditor.js';
import { WebviewIcons, WebviewInput, WebviewInputInitInfo } from './webviewEditorInput.js';

export interface IWebViewShowOptions {
	readonly group?: IEditorGroup | GroupIdentifier | ACTIVE_GROUP_TYPE | SIDE_GROUP_TYPE;
	readonly preserveFocus?: boolean;
}

export const IWebviewWorkbenchService = createDecorator<IWebviewWorkbenchService>('webviewEditorService');

/**
 * Service responsible for showing and managing webview editors in the workbench.
 */
export interface IWebviewWorkbenchService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when focus switches to a different webview editor.
	 *
	 * Fires `undefined` if focus switches to a non-webview editor.
	 */
	readonly onDidChangeActiveWebviewEditor: Event<WebviewInput | undefined>;

	/**
	 * Create a new webview editor and open it in the workbench.
	 */
	openWebview(
		webviewInitInfo: WebviewInitInfo,
		viewType: string,
		title: string,
		iconPath: WebviewIcons | undefined,
		showOptions: IWebViewShowOptions,
	): WebviewInput;

	/**
	 * Open a webview that is being restored from serialization.
	 */
	openRevivedWebview(options: {
		webviewInitInfo: WebviewInitInfo;
		viewType: string;
		title: string;
		iconPath: WebviewIcons | undefined;
		state: any;
		group: number | undefined;
	}): WebviewInput;

	/**
	 * Reveal an already opened webview editor in the workbench.
	 */
	revealWebview(
		webview: WebviewInput,
		group: IEditorGroup | GroupIdentifier | ACTIVE_GROUP_TYPE | SIDE_GROUP_TYPE,
		preserveFocus: boolean
	): void;

	/**
	 * Register a new {@link WebviewResolver}.
	 *
	 * If there are any webviews awaiting revival that this resolver can handle, they will be resolved by it.
	 */
	registerResolver(resolver: WebviewResolver): IDisposable;

	/**
	 * Check if a webview should be serialized across window reloads.
	 */
	shouldPersist(input: WebviewInput): boolean;

	/**
	 * Try to resolve a webview. This will block until a resolver is registered for the webview.
	 */
	resolveWebview(webview: WebviewInput, token: CancellationToken): Promise<void>;
}

/**
 * Handles filling in the content of webview before it can be shown to the user.
 */
interface WebviewResolver {
	/**
	 * Returns true if the resolver can resolve the given webview.
	 */
	canResolve(webview: WebviewInput): boolean;

	/**
	 * Resolves the webview.
	 */
	resolveWebview(webview: WebviewInput, token: CancellationToken): Promise<void>;
}

function canRevive(reviver: WebviewResolver, webview: WebviewInput): boolean {
	return reviver.canResolve(webview);
}

export class LazilyResolvedWebviewEditorInput extends WebviewInput {

	private _resolved = false;
	private _resolvePromise?: CancelablePromise<void>;

	constructor(
		init: WebviewInputInitInfo,
		webview: IOverlayWebview,
		@IThemeService themeService: IThemeService,
		@IWebviewWorkbenchService private readonly _webviewWorkbenchService: IWebviewWorkbenchService,
	) {
		super(init, webview, themeService);
	}

	override dispose() {
		super.dispose();
		this._resolvePromise?.cancel();
		this._resolvePromise = undefined;
	}

	@memoize
	public override async resolve() {
		if (!this._resolved) {
			this._resolved = true;
			this._resolvePromise = createCancelablePromise(token => this._webviewWorkbenchService.resolveWebview(this, token));
			try {
				await this._resolvePromise;
			} catch (e) {
				if (!isCancellationError(e)) {
					throw e;
				}
			}
		}
		return super.resolve();
	}

	protected override transfer(other: LazilyResolvedWebviewEditorInput): WebviewInput | undefined {
		if (!super.transfer(other)) {
			return;
		}

		other._resolved = this._resolved;
		return other;
	}
}


class RevivalPool {
	private _awaitingRevival: Array<{
		readonly input: WebviewInput;
		readonly promise: DeferredPromise<void>;
		readonly disposable: IDisposable;
	}> = [];

	public enqueueForRestoration(input: WebviewInput, token: CancellationToken): Promise<void> {
		const promise = new DeferredPromise<void>();

		const remove = () => {
			const index = this._awaitingRevival.findIndex(entry => input === entry.input);
			if (index >= 0) {
				this._awaitingRevival.splice(index, 1);
			}
		};

		const disposable = combinedDisposable(
			input.webview.onDidDispose(remove),
			token.onCancellationRequested(() => {
				remove();
				promise.cancel();
			}),
		);

		this._awaitingRevival.push({ input, promise, disposable });

		return promise.p;
	}

	public reviveFor(reviver: WebviewResolver, token: CancellationToken) {
		const toRevive = this._awaitingRevival.filter(({ input }) => canRevive(reviver, input));
		this._awaitingRevival = this._awaitingRevival.filter(({ input }) => !canRevive(reviver, input));

		for (const { input, promise: resolve, disposable } of toRevive) {
			reviver.resolveWebview(input, token).then(x => resolve.complete(x), err => resolve.error(err)).finally(() => {
				disposable.dispose();
			});
		}
	}
}


export class WebviewEditorService extends Disposable implements IWebviewWorkbenchService {
	declare readonly _serviceBrand: undefined;

	private readonly _revivers = new Set<WebviewResolver>();
	private readonly _revivalPool = new RevivalPool();

	constructor(
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWebviewService private readonly _webviewService: IWebviewService,
	) {
		super();

		this._register(editorGroupsService.registerContextKeyProvider({
			contextKey: CONTEXT_ACTIVE_WEBVIEW_PANEL_ID,
			getGroupContextKeyValue: (group) => this.getWebviewId(group.activeEditor),
		}));

		this._register(_editorService.onDidActiveEditorChange(() => {
			this.updateActiveWebview();
		}));

		// The user may have switched focus between two sides of a diff editor
		this._register(_webviewService.onDidChangeActiveWebview(() => {
			this.updateActiveWebview();
		}));

		this.updateActiveWebview();
	}

	private _activeWebview: WebviewInput | undefined;

	private readonly _onDidChangeActiveWebviewEditor = this._register(new Emitter<WebviewInput | undefined>());
	public readonly onDidChangeActiveWebviewEditor = this._onDidChangeActiveWebviewEditor.event;

	private getWebviewId(input: EditorInput | null): string {
		let webviewInput: WebviewInput | undefined;
		if (input instanceof WebviewInput) {
			webviewInput = input;
		} else if (input instanceof DiffEditorInput) {
			if (input.primary instanceof WebviewInput) {
				webviewInput = input.primary;
			} else if (input.secondary instanceof WebviewInput) {
				webviewInput = input.secondary;
			}
		}

		return webviewInput?.webview.providedViewType ?? '';
	}

	private updateActiveWebview() {
		const activeInput = this._editorService.activeEditor;

		let newActiveWebview: WebviewInput | undefined;
		if (activeInput instanceof WebviewInput) {
			newActiveWebview = activeInput;
		} else if (activeInput instanceof DiffEditorInput) {
			if (activeInput.primary instanceof WebviewInput && activeInput.primary.webview === this._webviewService.activeWebview) {
				newActiveWebview = activeInput.primary;
			} else if (activeInput.secondary instanceof WebviewInput && activeInput.secondary.webview === this._webviewService.activeWebview) {
				newActiveWebview = activeInput.secondary;
			}
		}
		if (newActiveWebview !== this._activeWebview) {
			this._activeWebview = newActiveWebview;
			this._onDidChangeActiveWebviewEditor.fire(newActiveWebview);
		}
	}

	public openWebview(
		webviewInitInfo: WebviewInitInfo,
		viewType: string,
		title: string,
		iconPath: WebviewIcons | undefined,
		showOptions: IWebViewShowOptions,
	): WebviewInput {
		const webview = this._webviewService.createWebviewOverlay(webviewInitInfo);
		const webviewInput = this._instantiationService.createInstance(WebviewInput, { viewType, name: title, providedId: webviewInitInfo.providedViewType, iconPath }, webview);
		this._editorService.openEditor(webviewInput, {
			pinned: true,
			preserveFocus: showOptions.preserveFocus,
			// preserve pre 1.38 behaviour to not make group active when preserveFocus: true
			// but make sure to restore the editor to fix https://github.com/microsoft/vscode/issues/79633
			activation: showOptions.preserveFocus ? EditorActivation.RESTORE : undefined
		}, showOptions.group);
		return webviewInput;
	}

	public revealWebview(
		webview: WebviewInput,
		group: IEditorGroup | GroupIdentifier | ACTIVE_GROUP_TYPE | SIDE_GROUP_TYPE,
		preserveFocus: boolean
	): void {
		const topLevelEditor = this.findTopLevelEditorForWebview(webview);

		this._editorService.openEditor(topLevelEditor, {
			preserveFocus,
			// preserve pre 1.38 behaviour to not make group active when preserveFocus: true
			// but make sure to restore the editor to fix https://github.com/microsoft/vscode/issues/79633
			activation: preserveFocus ? EditorActivation.RESTORE : undefined
		}, group);
	}

	private findTopLevelEditorForWebview(webview: WebviewInput): EditorInput {
		for (const editor of this._editorService.editors) {
			if (editor === webview) {
				return editor;
			}
			if (editor instanceof DiffEditorInput) {
				if (webview === editor.primary || webview === editor.secondary) {
					return editor;
				}
			}
		}
		return webview;
	}

	public openRevivedWebview(options: {
		webviewInitInfo: WebviewInitInfo;
		viewType: string;
		title: string;
		iconPath: WebviewIcons | undefined;
		state: any;
		group: number | undefined;
	}): WebviewInput {
		const webview = this._webviewService.createWebviewOverlay(options.webviewInitInfo);
		webview.state = options.state;

		const webviewInput = this._instantiationService.createInstance(LazilyResolvedWebviewEditorInput, {
			viewType: options.viewType,
			providedId: options.webviewInitInfo.providedViewType,
			name: options.title,
			iconPath: options.iconPath
		}, webview);
		webviewInput.iconPath = options.iconPath;

		if (typeof options.group === 'number') {
			webviewInput.updateGroup(options.group);
		}
		return webviewInput;
	}

	public registerResolver(reviver: WebviewResolver): IDisposable {
		this._revivers.add(reviver);

		const cts = new CancellationTokenSource();
		this._revivalPool.reviveFor(reviver, cts.token);

		return toDisposable(() => {
			this._revivers.delete(reviver);
			cts.dispose(true);
		});
	}

	public shouldPersist(webview: WebviewInput): boolean {
		// Revived webviews may not have an actively registered reviver but we still want to persist them
		// since a reviver should exist when it is actually needed.
		if (webview instanceof LazilyResolvedWebviewEditorInput) {
			return true;
		}

		return Iterable.some(this._revivers.values(), reviver => canRevive(reviver, webview));
	}

	private async tryRevive(webview: WebviewInput, token: CancellationToken): Promise<boolean> {
		for (const reviver of this._revivers.values()) {
			if (canRevive(reviver, webview)) {
				await reviver.resolveWebview(webview, token);
				return true;
			}
		}
		return false;
	}

	public async resolveWebview(webview: WebviewInput, token: CancellationToken): Promise<void> {
		const didRevive = await this.tryRevive(webview, token);
		if (!didRevive && !token.isCancellationRequested) {
			// A reviver may not be registered yet. Put into pool and resolve promise when we can revive
			return this._revivalPool.enqueueForRestoration(webview, token);
		}
	}
}
