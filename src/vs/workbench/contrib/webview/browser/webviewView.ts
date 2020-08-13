/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { generateUuid } from 'vs/base/common/uuid';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Extensions as ViewsExtensions, IViewResolverRegistry } from 'vs/workbench/api/browser/viewsExtensionPoint';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IViewDescriptor, IViewDescriptorService } from 'vs/workbench/common/views';
import { IWebviewService, Webview, WebviewOverlay } from 'vs/workbench/contrib/webview/browser/webview';

declare const ResizeObserver: any;

class WebviewViewPane extends ViewPane {

	private _webview?: WebviewOverlay;

	private _container?: HTMLElement;
	private _resizeObserver?: any;

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
		@IProgressService private readonly progressService: IProgressService,
		@IWebviewService private readonly webviewService: IWebviewService,
	) {
		super({ ...options, titleMenuId: MenuId.ViewTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);

		this._register(this.onDidChangeBodyVisibility(() => this.updateTreeVisibility()));
		this.updateTreeVisibility();
	}

	focus(): void {
		super.focus();
		this._webview?.focus();
	}

	renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._container = container;

		if (!this._webview) {
			const webview = this.webviewService.createWebviewOverlay(generateUuid(), {}, {}, undefined);
			this._webview = webview;

			this._register(toDisposable(() => {
				this._webview?.release(this);
			}));

			this.withProgress(() => {
				return Registry.as<IViewWebviewViewResolverRegistry>(Extensions.WebviewViewResolverRegistry)
					.resolve(this.id, webview);
			});
		}

		if (!this._resizeObserver) {
			this._resizeObserver = new ResizeObserver(() => {
				setImmediate(() => {
					if (this._container) {
						this._webview?.layoutWebviewOverElement(this._container);
					}
				});
			});

			this._register(toDisposable(() => {
				this._resizeObserver.unobserve();
			}));
			this._resizeObserver.observe(container);
		}

		this._webview.claim(this);
		this._webview.layoutWebviewOverElement(container);
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
		if (!this._webview) {
			return;
		}

		if (this.isBodyVisible()) {
			this._webview.claim(this);
		} else {
			this._webview.release(this);
		}
	}

	private withProgress(task: () => Promise<void>): Promise<void> {
		return this.progressService.withProgress({ location: this.getProgressLocation(), delay: 500 }, task);
	}
}

const viewResolverRegistry = Registry.as<IViewResolverRegistry>(ViewsExtensions.ViewResolverRegistry);
viewResolverRegistry.register('webview', {
	resolve: (viewDescriptor: IViewDescriptor): IViewDescriptor => {
		return {
			...viewDescriptor,
			ctorDescriptor: new SyncDescriptor(WebviewViewPane)
		};
	}
});


export namespace Extensions {
	export const WebviewViewResolverRegistry = 'workbench.registry.webviewViewResolvers';
}

export interface IWebviewViewResolver {
	resolve(webview: Webview): Promise<void>;
}

export interface IViewWebviewViewResolverRegistry {
	register(type: string, resolver: IWebviewViewResolver): IDisposable;

	resolve(viewType: string, webview: Webview): Promise<void>;
}

class WebviewViewResolverRegistry extends Disposable implements IViewWebviewViewResolverRegistry {

	private readonly _views = new Map<string, IWebviewViewResolver>();

	private readonly _awaitingRevival = new Map<string, { webview: Webview, resolve: () => void }>();

	register(viewType: string, resolver: IWebviewViewResolver): IDisposable {
		if (this._views.has(viewType)) {
			throw new Error(`View resolver already registered for ${viewType}`);
		}

		this._views.set(viewType, resolver);

		const pending = this._awaitingRevival.get(viewType);
		if (pending) {
			resolver.resolve(pending.webview).then(() => {
				this._awaitingRevival.delete(viewType);
				pending.resolve();
			});
		}

		return toDisposable(() => {
			this._views.delete(viewType);
		});
	}

	resolve(viewType: string, webview: Webview): Promise<void> {
		const resolver = this._views.get(viewType);
		if (!resolver) {
			if (this._awaitingRevival.has(viewType)) {
				throw new Error('View already awaiting revival');
			}

			let resolve: () => void;
			const p = new Promise<void>(r => resolve = r);
			this._awaitingRevival.set(viewType, { webview, resolve: resolve! });
			return p;
		}

		return resolver.resolve(webview);
	}
}

Registry.add(Extensions.WebviewViewResolverRegistry, new WebviewViewResolverRegistry());


/**
 * class RevivalPool {
	private _awaitingRevival: Array<{ input: WebviewInput, resolve: () => void }> = [];

	public add(input: WebviewInput, resolve: () => void) {
		this._awaitingRevival.push({ input, resolve });
	}

	public reviveFor(reviver: WebviewResolver, cancellation: CancellationToken) {
		const toRevive = this._awaitingRevival.filter(({ input }) => canRevive(reviver, input));
		this._awaitingRevival = this._awaitingRevival.filter(({ input }) => !canRevive(reviver, input));

		for (const { input, resolve } of toRevive) {
			reviver.resolveWebview(input, cancellation).then(resolve);
		}
	}
}
 */
