/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { toDisposable } from 'vs/base/common/lifecycle';
import { setImmediate } from 'vs/base/common/platform';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { Memento, MementoObject } from 'vs/workbench/common/memento';
import { IViewDescriptorService, IViewsService } from 'vs/workbench/common/views';
import { IWebviewService, WebviewOverlay } from 'vs/workbench/contrib/webview/browser/webview';
import { IWebviewViewService, WebviewView } from 'vs/workbench/contrib/webviewView/browser/webviewViewService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

declare const ResizeObserver: any;

const storageKeys = {
	webviewState: 'webviewState',
} as const;

export class WebviewViewPane extends ViewPane {

	private _webview?: WebviewOverlay;
	private _activated = false;

	private _container?: HTMLElement;
	private _resizeObserver?: any;

	private readonly defaultTitle: string;
	private setTitle: string | undefined;

	private readonly memento: Memento;
	private readonly viewState: MementoObject;

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
	) {
		super({ ...options, titleMenuId: MenuId.ViewTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);
		this.defaultTitle = this.title;

		this.memento = new Memento(`webviewView.${this.id}`, storageService);
		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE);

		this._register(this.onDidChangeBodyVisibility(() => this.updateTreeVisibility()));
		this.updateTreeVisibility();
	}

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	private readonly _onDispose = this._register(new Emitter<void>());
	readonly onDispose = this._onDispose.event;

	dispose() {
		this._onDispose.fire();

		this._webview?.dispose();

		super.dispose();
	}

	focus(): void {
		super.focus();
		this._webview?.focus();
	}

	renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._container = container;

		if (!this._resizeObserver) {
			this._resizeObserver = new ResizeObserver(() => {
				setImmediate(() => {
					if (this._container) {
						this._webview?.layoutWebviewOverElement(this._container);
					}
				});
			});

			this._register(toDisposable(() => {
				this._resizeObserver.disconnect();
			}));
			this._resizeObserver.observe(container);
		}
	}

	public saveState() {
		if (this._webview) {
			this.viewState[storageKeys.webviewState] = this._webview.state;
		}

		this.memento.saveMemento();
		super.saveState();
	}

	protected layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		if (!this._webview) {
			return;
		}

		if (this._container) {
			this._webview.layoutWebviewOverElement(this._container, { width, height });
		}
	}

	private updateTreeVisibility() {
		if (this.isBodyVisible()) {
			this.activate();
			this._webview?.claim(this);
		} else {
			this._webview?.release(this);
		}
	}

	private activate() {
		if (!this._activated) {
			this._activated = true;

			const webviewId = `webviewView-${this.id.replace(/[^a-z0-9]/gi, '-')}`.toLowerCase();
			const webview = this.webviewService.createWebviewOverlay(webviewId, {}, {}, undefined);
			webview.state = this.viewState[storageKeys.webviewState];
			this._webview = webview;

			this._register(toDisposable(() => {
				this._webview?.release(this);
			}));

			this._register(webview.onDidUpdateState(() => {
				this.viewState[storageKeys.webviewState] = webview.state;
			}));

			const source = this._register(new CancellationTokenSource());

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

					show: (preserveFocus) => {
						this.viewService.openView(this.id, !preserveFocus);
					}
				};

				await this.webviewViewService.resolve(this.id, webviewView, source.token);
			});
		}
	}

	protected updateTitle(value: string | undefined) {
		this.setTitle = value;
		super.updateTitle(typeof value === 'string' ? value : this.defaultTitle);
	}

	private async withProgress(task: () => Promise<void>): Promise<void> {
		return this.progressService.withProgress({ location: this.id, delay: 500 }, task);
	}
}
