/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, Dimension, EventType, findParentWithClass } from 'vs/base/browser/dom';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { withNullAsUndefined } from 'vs/base/common/types';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ViewPane, ViewPaneShowActions } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { Memento, MementoObject } from 'vs/workbench/common/memento';
import { IViewBadge, IViewDescriptorService, IViewsService } from 'vs/workbench/common/views';
import { ExtensionKeyedWebviewOriginStore, IOverlayWebview, IWebviewService, WebviewContentPurpose } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewWindowDragMonitor } from 'vs/workbench/contrib/webview/browser/webviewWindowDragMonitor';
import { IWebviewViewService, WebviewView } from 'vs/workbench/contrib/webviewView/browser/webviewViewService';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

declare const ResizeObserver: any;

const storageKeys = {
	webviewState: 'webviewState',
} as const;

export class WebviewViewPane extends ViewPane {

	private static _originStore?: ExtensionKeyedWebviewOriginStore;

	private static getOriginStore(storageService: IStorageService): ExtensionKeyedWebviewOriginStore {
		this._originStore ??= new ExtensionKeyedWebviewOriginStore('webviewViews.origins', storageService);
		return this._originStore;
	}

	private readonly _webview = this._register(new MutableDisposable<IOverlayWebview>());
	private readonly _webviewDisposables = this._register(new DisposableStore());
	private _activated = false;

	private _container?: HTMLElement;
	private _rootContainer?: HTMLElement;
	private _resizeObserver?: any;

	private readonly defaultTitle: string;
	private setTitle: string | undefined;

	private badge: IViewBadge | undefined;
	private activity: IDisposable | undefined;

	private readonly memento: Memento;
	private readonly viewState: MementoObject;
	private readonly extensionId?: ExtensionIdentifier;

	private _repositionTimeout?: any;

	constructor(
		options: IViewletViewOptions,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IActivityService private readonly activityService: IActivityService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IProgressService private readonly progressService: IProgressService,
		@IStorageService private readonly storageService: IStorageService,
		@IViewsService private readonly viewService: IViewsService,
		@IWebviewService private readonly webviewService: IWebviewService,
		@IWebviewViewService private readonly webviewViewService: IWebviewViewService,
	) {
		super({ ...options, titleMenuId: MenuId.ViewTitle, showActions: ViewPaneShowActions.WhenExpanded }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);
		this.extensionId = options.fromExtensionId;
		this.defaultTitle = this.title;

		this.memento = new Memento(`webviewView.${this.id}`, storageService);
		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);

		this._register(this.onDidChangeBodyVisibility(() => this.updateTreeVisibility()));

		this._register(this.webviewViewService.onNewResolverRegistered(e => {
			if (e.viewType === this.id) {
				// Potentially re-activate if we have a new resolver
				this.updateTreeVisibility();
			}
		}));

		this.updateTreeVisibility();
	}

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	private readonly _onDispose = this._register(new Emitter<void>());
	readonly onDispose = this._onDispose.event;

	override dispose() {
		this._onDispose.fire();

		clearTimeout(this._repositionTimeout);

		super.dispose();
	}

	override focus(): void {
		super.focus();
		this._webview.value?.focus();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._container = container;
		this._rootContainer = undefined;

		if (!this._resizeObserver) {
			this._resizeObserver = new ResizeObserver(() => {
				setTimeout(() => {
					this.layoutWebview();
				}, 0);
			});

			this._register(toDisposable(() => {
				this._resizeObserver.disconnect();
			}));
			this._resizeObserver.observe(container);
		}
	}

	public override saveState() {
		if (this._webview.value) {
			this.viewState[storageKeys.webviewState] = this._webview.value.state;
		}

		this.memento.saveMemento();
		super.saveState();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this.layoutWebview(new Dimension(width, height));
	}

	private updateTreeVisibility() {
		if (this.isBodyVisible()) {
			this.activate();
			this._webview.value?.claim(this, undefined);
		} else {
			this._webview.value?.release(this);
		}
	}

	private activate() {
		if (this._activated) {
			return;
		}

		this._activated = true;

		const origin = this.extensionId ? WebviewViewPane.getOriginStore(this.storageService).getOrigin(this.id, this.extensionId) : undefined;
		const webview = this.webviewService.createWebviewOverlay({
			origin,
			providedViewType: this.id,
			title: this.title,
			options: { purpose: WebviewContentPurpose.WebviewView },
			contentOptions: {},
			extension: this.extensionId ? { id: this.extensionId } : undefined
		});
		webview.state = this.viewState[storageKeys.webviewState];
		this._webview.value = webview;

		if (this._container) {
			this.layoutWebview();
		}

		this._webviewDisposables.add(toDisposable(() => {
			this._webview.value?.release(this);
		}));

		this._webviewDisposables.add(webview.onDidUpdateState(() => {
			this.viewState[storageKeys.webviewState] = webview.state;
		}));

		// Re-dispatch all drag events back to the drop target to support view drag drop
		for (const event of [EventType.DRAG, EventType.DRAG_END, EventType.DRAG_ENTER, EventType.DRAG_LEAVE, EventType.DRAG_START]) {
			this._webviewDisposables.add(addDisposableListener(this._webview.value.container!, event, e => {
				e.preventDefault();
				e.stopImmediatePropagation();
				this.dropTargetElement.dispatchEvent(new DragEvent(e.type, e));
			}));
		}

		this._webviewDisposables.add(new WebviewWindowDragMonitor(() => this._webview.value));

		const source = this._webviewDisposables.add(new CancellationTokenSource());

		this.withProgress(async () => {
			await this.extensionService.activateByEvent(`onView:${this.id}`);

			const self = this;
			const webviewView: WebviewView = {
				webview,
				onDidChangeVisibility: this.onDidChangeBodyVisibility,
				onDispose: this.onDispose,

				get title(): string | undefined { return self.setTitle; },
				set title(value: string | undefined) { self.updateTitle(value); },

				get description(): string | undefined { return self.titleDescription; },
				set description(value: string | undefined) { self.updateTitleDescription(value); },

				get badge(): IViewBadge | undefined { return self.badge; },
				set badge(badge: IViewBadge | undefined) { self.updateBadge(badge); },

				dispose: () => {
					// Only reset and clear the webview itself. Don't dispose of the view container
					this._activated = false;
					this._webview.clear();
					this._webviewDisposables.clear();
				},

				show: (preserveFocus) => {
					this.viewService.openView(this.id, !preserveFocus);
				}
			};

			await this.webviewViewService.resolve(this.id, webviewView, source.token);
		});
	}

	protected override updateTitle(value: string | undefined) {
		this.setTitle = value;
		super.updateTitle(typeof value === 'string' ? value : this.defaultTitle);
	}

	protected updateBadge(badge: IViewBadge | undefined) {

		if (this.badge?.value === badge?.value &&
			this.badge?.tooltip === badge?.tooltip) {
			return;
		}

		if (this.activity) {
			this.activity.dispose();
			this.activity = undefined;
		}

		this.badge = badge;
		if (badge) {
			const activity = {
				badge: new NumberBadge(badge.value, () => badge.tooltip),
				priority: 150
			};
			this.activityService.showViewActivity(this.id, activity);
		}
	}

	private async withProgress(task: () => Promise<void>): Promise<void> {
		return this.progressService.withProgress({ location: this.id, delay: 500 }, task);
	}

	override onDidScrollRoot() {
		this.layoutWebview();
	}

	private doLayoutWebview(dimension?: Dimension) {
		const webviewEntry = this._webview.value;
		if (!this._container || !webviewEntry) {
			return;
		}

		if (!this._rootContainer || !this._rootContainer.isConnected) {
			this._rootContainer = this.findRootContainer(this._container);
		}

		webviewEntry.layoutWebviewOverElement(this._container, dimension, this._rootContainer);
	}

	private layoutWebview(dimension?: Dimension) {
		this.doLayoutWebview(dimension);
		// Temporary fix for https://github.com/microsoft/vscode/issues/110450
		// There is an animation that lasts about 200ms, update the webview positioning once this animation is complete.
		clearTimeout(this._repositionTimeout);
		this._repositionTimeout = setTimeout(() => this.doLayoutWebview(dimension), 200);
	}

	private findRootContainer(container: HTMLElement): HTMLElement | undefined {
		return withNullAsUndefined(findParentWithClass(container, 'monaco-scrollable-element'));
	}
}
