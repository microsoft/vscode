/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { session } from 'electron';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IBrowserViewBounds, IBrowserViewKeyDownEvent, IBrowserViewState, IBrowserViewService, BrowserViewStorageScope } from '../common/browserView.js';
import { joinPath } from '../../../base/common/resources.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { BrowserView } from './browserView.js';

export const IBrowserViewMainService = createDecorator<IBrowserViewMainService>('browserViewMainService');

export interface IBrowserViewMainService extends IBrowserViewService {
	// Additional electron-specific methods can be added here if needed in the future
}

// Same as webviews
const allowedPermissions = new Set([
	'pointerLock',
	'notifications',
	'clipboard-read',
	'clipboard-sanitized-write'
]);

export class BrowserViewMainService extends Disposable implements IBrowserViewMainService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Check if a webContents belongs to an integrated browser view
	*/
	private static readonly knownSessions = new WeakSet<Electron.Session>();
	static isBrowserViewWebContents(contents: Electron.WebContents): boolean {
		return BrowserViewMainService.knownSessions.has(contents.session);
	}

	private readonly browserViews = new Map<string, BrowserView>();

	constructor(
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	/**
	 * Get the session for a browser view based on data storage setting and workspace
	 */
	private getSession(viewId: string, scope: BrowserViewStorageScope, workspaceId?: string): Electron.Session {
		switch (scope) {
			case 'global':
				return session.fromPartition('persist:vscode-browser');
			case 'workspace':
				if (workspaceId) {
					const storage = joinPath(this.environmentMainService.workspaceStorageHome, workspaceId, 'browserStorage');
					return session.fromPath(storage.fsPath);
				}
			// fallthrough
			case 'ephemeral':
			default:
				return session.fromPartition(`vscode-browser-${viewId}`);
		}
	}

	private configureSession(viewSession: Electron.Session): void {
		viewSession.setPermissionRequestHandler((_webContents, permission, callback) => {
			return callback(allowedPermissions.has(permission));
		});
		viewSession.setPermissionCheckHandler((_webContents, permission, _origin) => {
			return allowedPermissions.has(permission);
		});
	}

	async getOrCreateBrowserView(id: string, scope: BrowserViewStorageScope, workspaceId?: string): Promise<IBrowserViewState> {
		if (this.browserViews.has(id)) {
			// Note: scope will be ignored if the view already exists.
			// Browser views cannot be moved between sessions after creation.
			const view = this.browserViews.get(id)!;
			return view.getState();
		}

		const viewSession = this.getSession(id, scope, workspaceId);
		this.configureSession(viewSession);
		BrowserViewMainService.knownSessions.add(viewSession);

		const view = this.instantiationService.createInstance(BrowserView, viewSession);
		this.browserViews.set(id, view);

		return view.getState();
	}

	/**
	 * Get a browser view or throw if not found
	 */
	private _getBrowserView(id: string): BrowserView {
		const view = this.browserViews.get(id);
		if (!view) {
			throw new Error(`Browser view ${id} not found`);
		}
		return view;
	}

	onDynamicDidNavigate(id: string) {
		return this._getBrowserView(id).onDidNavigate;
	}

	onDynamicDidChangeLoadingState(id: string) {
		return this._getBrowserView(id).onDidChangeLoadingState;
	}

	onDynamicDidChangeFocus(id: string) {
		return this._getBrowserView(id).onDidChangeFocus;
	}

	onDynamicDidKeyCommand(id: string) {
		return this._getBrowserView(id).onDidKeyCommand;
	}

	onDynamicDidChangeTitle(id: string) {
		return this._getBrowserView(id).onDidChangeTitle;
	}

	onDynamicDidChangeFavicon(id: string) {
		return this._getBrowserView(id).onDidChangeFavicon;
	}

	onDynamicDidRequestNewPage(id: string) {
		return this._getBrowserView(id).onDidRequestNewPage;
	}

	async destroyBrowserView(id: string): Promise<void> {
		this._getBrowserView(id).dispose();
		this.browserViews.delete(id);
	}

	async layout(id: string, bounds: IBrowserViewBounds): Promise<void> {
		return this._getBrowserView(id).layout(bounds);
	}

	async setVisible(id: string, visible: boolean): Promise<void> {
		return this._getBrowserView(id).setVisible(visible);
	}

	async loadURL(id: string, url: string): Promise<void> {
		return this._getBrowserView(id).loadURL(url);
	}

	async getURL(id: string): Promise<string> {
		return this._getBrowserView(id).getURL();
	}

	async goBack(id: string): Promise<void> {
		return this._getBrowserView(id).goBack();
	}

	async goForward(id: string): Promise<void> {
		return this._getBrowserView(id).goForward();
	}

	async reload(id: string): Promise<void> {
		return this._getBrowserView(id).reload();
	}

	async canGoBack(id: string): Promise<boolean> {
		return this._getBrowserView(id).canGoBack();
	}

	async canGoForward(id: string): Promise<boolean> {
		return this._getBrowserView(id).canGoForward();
	}

	async captureScreenshot(id: string, quality = 80): Promise<string> {
		return this._getBrowserView(id).captureScreenshot(quality);
	}

	async dispatchKeyEvent(id: string, keyEvent: IBrowserViewKeyDownEvent): Promise<void> {
		return this._getBrowserView(id).dispatchKeyEvent(keyEvent);
	}

	async setZoomFactor(id: string, zoomFactor: number): Promise<void> {
		return this._getBrowserView(id).setZoomFactor(zoomFactor);
	}

	async focus(id: string): Promise<void> {
		return this._getBrowserView(id).focus();
	}

	override dispose(): void {
		// Clean up all browser views
		for (const view of this.browserViews.values()) {
			view.dispose();
		}
		this.browserViews.clear();
		super.dispose();
	}
}
