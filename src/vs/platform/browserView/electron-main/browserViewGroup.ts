/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { BrowserView } from './browserView.js';
import { ICDPTarget, CDPBrowserVersion, CDPWindowBounds, CDPTargetInfo, ICDPConnection, ICDPBrowserTarget } from '../common/cdp/types.js';
import { CDPBrowserProxy } from '../common/cdp/proxy.js';
import { IBrowserViewGroup, IBrowserViewGroupViewEvent } from '../common/browserViewGroup.js';
import { IBrowserViewCDPProxyServer } from './browserViewCDPProxyServer.js';
import { IBrowserViewMainService } from './browserViewMainService.js';

/**
 * An isolated group of {@link BrowserView} instances exposed as CDP targets.
 *
 * Each group represents an independent CDP "browser" endpoint
 * (`/devtools/browser/{id}`). Different groups can expose different
 * subsets of browser views, enabling selective target visibility across
 * CDP sessions.
 *
 * Created via {@link BrowserViewGroupMainService.createGroup}.
 */
export class BrowserViewGroup extends Disposable implements ICDPBrowserTarget, IBrowserViewGroup {

	private readonly views = new Map<string, BrowserView>();
	private readonly viewListeners = this._register(new DisposableStore());

	/** All context IDs known to this group, including those from views added to it. */
	private readonly knownContextIds = new Set<string>();
	/** Browser context IDs created by this group via {@link createBrowserContext}. */
	private readonly ownedContextIds = new Set<string>();

	private readonly _onTargetCreated = this._register(new Emitter<BrowserView>());
	readonly onTargetCreated: Event<BrowserView> = this._onTargetCreated.event;

	private readonly _onTargetDestroyed = this._register(new Emitter<BrowserView>());
	readonly onTargetDestroyed: Event<BrowserView> = this._onTargetDestroyed.event;

	private readonly _onDidAddView = this._register(new Emitter<IBrowserViewGroupViewEvent>());
	readonly onDidAddView: Event<IBrowserViewGroupViewEvent> = this._onDidAddView.event;

	private readonly _onDidRemoveView = this._register(new Emitter<IBrowserViewGroupViewEvent>());
	readonly onDidRemoveView: Event<IBrowserViewGroupViewEvent> = this._onDidRemoveView.event;

	private readonly _onDidDestroy = this._register(new Emitter<void>());
	readonly onDidDestroy: Event<void> = this._onDidDestroy.event;

	constructor(
		readonly id: string,
		@IBrowserViewMainService private readonly browserViewMainService: IBrowserViewMainService,
		@IBrowserViewCDPProxyServer private readonly cdpProxyServer: IBrowserViewCDPProxyServer,
	) {
		super();
	}

	// #region View management

	/**
	 * Add a {@link BrowserView} to this group.
	 * Fires {@link onDidAddView} and {@link onTargetCreated}.
	 * Automatically removes the view when it closes.
	 */
	async addView(viewId: string): Promise<void> {
		if (this.views.has(viewId)) {
			return;
		}
		const view = this.browserViewMainService.tryGetBrowserView(viewId);
		if (!view) {
			throw new Error(`Browser view ${viewId} not found`);
		}
		this.views.set(view.id, view);
		this.knownContextIds.add(view.session.id);
		this._onDidAddView.fire({ viewId: view.id });
		this._onTargetCreated.fire(view);

		this.viewListeners.add(Event.once(view.onDidClose)(() => {
			this.removeView(viewId);
		}));
	}

	/**
	 * Remove a {@link BrowserView} from this group.
	 * Fires {@link onDidRemoveView} and {@link onTargetDestroyed} if the view was tracked.
	 */
	async removeView(viewId: string): Promise<void> {
		const view = this.views.get(viewId);
		if (view && this.views.delete(viewId)) {
			this._onDidRemoveView.fire({ viewId: view.id });
			this._onTargetDestroyed.fire(view);
		}
	}

	// #endregion

	// #region ICDPBrowserTarget implementation

	getVersion(): CDPBrowserVersion {
		return this.browserViewMainService.getVersion();
	}

	getWindowForTarget(target: ICDPTarget): { windowId: number; bounds: CDPWindowBounds } {
		return this.browserViewMainService.getWindowForTarget(target);
	}

	async attach(): Promise<ICDPConnection> {
		return new CDPBrowserProxy(this);
	}

	async getTargetInfo(): Promise<CDPTargetInfo> {
		return {
			targetId: this.id,
			type: 'browser',
			title: this.getVersion().product,
			url: '',
			attached: true,
			canAccessOpener: false
		};
	}

	getTargets(): IterableIterator<BrowserView> {
		return this.views.values();
	}

	async createTarget(url: string, browserContextId?: string): Promise<ICDPTarget> {
		if (browserContextId && !this.knownContextIds.has(browserContextId)) {
			throw new Error(`Unknown browser context ${browserContextId}`);
		}

		const target = await this.browserViewMainService.createTarget(url, browserContextId);
		if (target instanceof BrowserView) {
			await this.addView(target.id);
		}
		return target;
	}

	async activateTarget(target: ICDPTarget): Promise<void> {
		return this.browserViewMainService.activateTarget(target);
	}

	async closeTarget(target: ICDPTarget): Promise<boolean> {
		if (target instanceof BrowserView) {
			await this.removeView(target.id);
		}
		return this.browserViewMainService.closeTarget(target);
	}

	// Browser context management

	/**
	 * Returns only the browser context IDs that are visible to this group,
	 * i.e. contexts used by views currently in the group.
	 */
	getBrowserContexts(): string[] {
		return [...this.knownContextIds];
	}

	async createBrowserContext(): Promise<string> {
		const contextId = await this.browserViewMainService.createBrowserContext();
		this.knownContextIds.add(contextId);
		this.ownedContextIds.add(contextId);
		return contextId;
	}

	async disposeBrowserContext(browserContextId: string): Promise<void> {
		if (!this.ownedContextIds.has(browserContextId)) {
			throw new Error('Can only dispose browser contexts created by this group');
		}

		// Close views in this group that belong to the context before disposing
		for (const view of this.views.values()) {
			if (view.session.id === browserContextId) {
				await this.removeView(view.id);
			}
		}

		this.knownContextIds.delete(browserContextId);
		this.ownedContextIds.delete(browserContextId);
		return this.browserViewMainService.disposeBrowserContext(browserContextId);
	}

	// #endregion

	// #region CDP endpoint

	/**
	 * Get a WebSocket endpoint URL for connecting to this group's CDP
	 * session. The URL contains a short-lived, single-use token.
	 */
	async getDebugWebSocketEndpoint(): Promise<string> {
		return this.cdpProxyServer.getWebSocketEndpointForTarget(this);
	}

	// #endregion

	override dispose(): void {
		this._onDidDestroy.fire();
		this.cdpProxyServer.removeTarget(this);
		super.dispose();
	}
}
