/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, computeClippingRect, EventType } from 'vs/base/browser/dom';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { generateUuid } from 'vs/base/common/uuid';
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
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { Memento, MementoObject } from 'vs/workbench/common/memento';
import { IViewBadge, IViewDescriptorService, IViewsService } from 'vs/workbench/common/views';
import { IOverlayWebview, IWebviewService, WebviewContentPurpose } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewWindowDragMonitor } from 'vs/workbench/contrib/webview/browser/webviewWindowDragMonitor';
import { IWebviewViewService, WebviewView } from 'vs/workbench/contrib/webviewView/browser/webviewViewService';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

declare const ResizeObserver: any;

const storageKeys = {
	webviewState: 'webviewState',
} as const;

export class WebviewViewPane extends ViewPane {

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

	constructor(
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IProgressService private readonly progressService: IProgressService,
		@IWebviewService private readonly webviewService: IWebviewService,
		@IWebviewViewService private readonly webviewViewService: IWebviewViewService,
		@IViewsService private readonly viewService: IViewsService,
		@IActivityService private activityService: IActivityService
	) {
		super({ ...options, titleMenuId: MenuId.ViewTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);
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

		super.dispose();
	}

	override focus(): void {
		super.focus();
		this._webview.value?.focus();
	}

	override renderBody(container: HTMLElement): void {
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

		if (!this._webview.value) {
			return;
		}

		this.layoutWebview();
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

		const webviewId = generateUuid();
		const webview = this.webviewService.createWebviewOverlay({
			id: webviewId,
			options: { purpose: WebviewContentPurpose.WebviewView },
			contentOptions: {},
			extension: this.extensionId ? { id: this.extensionId } : undefined
		});
		webview.state = this.viewState[storageKeys.webviewState];
		this._webview.value = webview;

		if (this._container) {
			this._webview.value?.layoutWebviewOverElement(this._container);
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

			let self = this;
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

	private layoutWebview() {
		const webviewEntry = this._webview.value;
		if (!this._container || !webviewEntry) {
			return;
		}

		webviewEntry.layoutWebviewOverElement(this._container);

		if (!this._rootContainer || !this._rootContainer.isConnected) {
			this._rootContainer = this.findRootContainer(this._container);
		}

		if (this._rootContainer) {
			const clip = computeClippingRect(this._container, this._rootContainer);
			webviewEntry.container.style.clip = `rect(${clip.top}px, ${clip.right}px, ${clip.bottom}px, ${clip.left}px)`;
		}
	}

	private findRootContainer(container: HTMLElement): HTMLElement | undefined {
		for (let el: Node | null = container; el; el = el.parentNode) {
			if (el instanceof HTMLElement) {
				if (el.classList.contains('monaco-scrollable-element')) {
					return el;
				}
			}
		}
		return undefined;
	}
}
