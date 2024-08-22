/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom';
import { CancellationToken } from '../../../../base/common/cancellation';
import { Emitter, Event } from '../../../../base/common/event';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle';
import { isWeb } from '../../../../base/common/platform';
import { generateUuid } from '../../../../base/common/uuid';
import * as nls from '../../../../nls';
import { IContextKeyService, IScopedContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey';
import { IEditorOptions } from '../../../../platform/editor/common/editor';
import { IStorageService } from '../../../../platform/storage/common/storage';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { IThemeService } from '../../../../platform/theme/common/themeService';
import { EditorPane } from '../../../browser/parts/editor/editorPane';
import { IEditorOpenContext } from '../../../common/editor';
import { EditorInput } from '../../../common/editor/editorInput';
import { IOverlayWebview } from '../../webview/browser/webview';
import { WebviewWindowDragMonitor } from '../../webview/browser/webviewWindowDragMonitor';
import { WebviewInput } from './webviewEditorInput';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService';
import { IEditorService } from '../../../services/editor/common/editorService';
import { IHostService } from '../../../services/host/browser/host';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService';

/**
 * Tracks the id of the actively focused webview.
 */
export const CONTEXT_ACTIVE_WEBVIEW_PANEL_ID = new RawContextKey<string>('activeWebviewPanelId', '', {
	type: 'string',
	description: nls.localize('context.activeWebviewId', "The viewType of the currently active webview panel."),
});

export class WebviewEditor extends EditorPane {

	public static readonly ID = 'WebviewEditor';

	private _element?: HTMLElement;
	private _dimension?: DOM.Dimension;
	private _visible = false;
	private _isDisposed = false;

	private readonly _webviewVisibleDisposables = this._register(new DisposableStore());
	private readonly _onFocusWindowHandler = this._register(new MutableDisposable());

	private readonly _onDidFocusWebview = this._register(new Emitter<void>());
	public override get onDidFocus(): Event<any> { return this._onDidFocusWebview.event; }

	private readonly _scopedContextKeyService = this._register(new MutableDisposable<IScopedContextKeyService>());

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService private readonly _editorService: IEditorService,
		@IWorkbenchLayoutService private readonly _workbenchLayoutService: IWorkbenchLayoutService,
		@IHostService private readonly _hostService: IHostService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super(WebviewEditor.ID, group, telemetryService, themeService, storageService);

		const part = _editorGroupsService.getPart(group);
		this._register(Event.any(part.onDidScroll, part.onDidAddGroup, part.onDidRemoveGroup, part.onDidMoveGroup)(() => {
			if (this.webview && this._visible) {
				this.synchronizeWebviewContainerDimensions(this.webview);
			}
		}));
	}

	private get webview(): IOverlayWebview | undefined {
		return this.input instanceof WebviewInput ? this.input.webview : undefined;
	}

	override get scopedContextKeyService(): IContextKeyService | undefined {
		return this._scopedContextKeyService.value;
	}

	protected createEditor(parent: HTMLElement): void {
		const element = document.createElement('div');
		this._element = element;
		this._element.id = `webview-editor-element-${generateUuid()}`;
		parent.appendChild(element);

		this._scopedContextKeyService.value = this._register(this._contextKeyService.createScoped(element));
	}

	public override dispose(): void {
		this._isDisposed = true;

		this._element?.remove();
		this._element = undefined;

		super.dispose();
	}

	public override layout(dimension: DOM.Dimension): void {
		this._dimension = dimension;
		if (this.webview && this._visible) {
			this.synchronizeWebviewContainerDimensions(this.webview, dimension);
		}
	}

	public override focus(): void {
		super.focus();
		if (!this._onFocusWindowHandler.value && !isWeb) {
			// Make sure we restore focus when switching back to a VS Code window
			this._onFocusWindowHandler.value = this._hostService.onDidChangeFocus(focused => {
				if (focused && this._editorService.activeEditorPane === this && this._workbenchLayoutService.hasFocus(Parts.EDITOR_PART)) {
					this.focus();
				}
			});
		}
		this.webview?.focus();
	}

	protected override setEditorVisible(visible: boolean): void {
		this._visible = visible;
		if (this.input instanceof WebviewInput && this.webview) {
			if (visible) {
				this.claimWebview(this.input);
			} else {
				this.webview.release(this);
			}
		}
		super.setEditorVisible(visible);
	}

	public override clearInput() {
		if (this.webview) {
			this.webview.release(this);
			this._webviewVisibleDisposables.clear();
		}

		super.clearInput();
	}

	public override async setInput(input: EditorInput, options: IEditorOptions, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		if (this.input && input.matches(this.input)) {
			return;
		}

		const alreadyOwnsWebview = input instanceof WebviewInput && input.webview === this.webview;
		if (this.webview && !alreadyOwnsWebview) {
			this.webview.release(this);
		}

		await super.setInput(input, options, context, token);
		await input.resolve();

		if (token.isCancellationRequested || this._isDisposed) {
			return;
		}

		if (input instanceof WebviewInput) {
			input.updateGroup(this.group.id);

			if (!alreadyOwnsWebview) {
				this.claimWebview(input);
			}
			if (this._dimension) {
				this.layout(this._dimension);
			}
		}
	}

	private claimWebview(input: WebviewInput): void {
		input.claim(this, this.window, this.scopedContextKeyService);

		if (this._element) {
			this._element.setAttribute('aria-flowto', input.webview.container.id);
			DOM.setParentFlowTo(input.webview.container, this._element);
		}

		this._webviewVisibleDisposables.clear();

		// Webviews are not part of the normal editor dom, so we have to register our own drag and drop handler on them.
		this._webviewVisibleDisposables.add(this._editorGroupsService.createEditorDropTarget(input.webview.container, {
			containsGroup: (group) => this.group.id === group.id
		}));

		this._webviewVisibleDisposables.add(new WebviewWindowDragMonitor(this.window, () => this.webview));

		this.synchronizeWebviewContainerDimensions(input.webview);
		this._webviewVisibleDisposables.add(this.trackFocus(input.webview));
	}

	private synchronizeWebviewContainerDimensions(webview: IOverlayWebview, dimension?: DOM.Dimension) {
		if (!this._element?.isConnected) {
			return;
		}

		const rootContainer = this._workbenchLayoutService.getContainer(this.window, Parts.EDITOR_PART);
		webview.layoutWebviewOverElement(this._element.parentElement!, dimension, rootContainer);
	}

	private trackFocus(webview: IOverlayWebview): IDisposable {
		const store = new DisposableStore();

		// Track focus in webview content
		const webviewContentFocusTracker = DOM.trackFocus(webview.container);
		store.add(webviewContentFocusTracker);
		store.add(webviewContentFocusTracker.onDidFocus(() => this._onDidFocusWebview.fire()));

		// Track focus in webview element
		store.add(webview.onDidFocus(() => this._onDidFocusWebview.fire()));

		return store;
	}
}
