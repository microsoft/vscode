/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ShowOptions, SimpleBrowserView } from './simpleBrowserView';

interface SimpleBrowserViewLike {
	readonly onDispose: vscode.Event<void>;
	dispose(): void;
	show(url: string, options?: ShowOptions): void;
}

interface SimpleBrowserViewFactory {
	create(extensionUri: vscode.Uri, url: string, showOptions?: ShowOptions): SimpleBrowserViewLike;
	restore(extensionUri: vscode.Uri, url: string, webviewPanel: vscode.WebviewPanel): SimpleBrowserViewLike;
}

interface SimpleBrowserState {
	readonly url?: string;
}

const simpleBrowserViewFactory: SimpleBrowserViewFactory = {
	create: (extensionUri, url, showOptions) => SimpleBrowserView.create(extensionUri, url, showOptions),
	restore: (extensionUri, url, webviewPanel) => SimpleBrowserView.restore(extensionUri, url, webviewPanel),
};

export class SimpleBrowserManager {

	private _activeView?: SimpleBrowserViewLike;
	private _pendingShow?: { readonly url: string; readonly options?: ShowOptions };
	private _restorationCompleted = false;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly _viewFactory: SimpleBrowserViewFactory = simpleBrowserViewFactory,
		private readonly _hasRestorableView = () => SimpleBrowserManager.hasRestorableView(),
	) { }

	dispose() {
		this._activeView?.dispose();
		this._activeView = undefined;
		this._pendingShow = undefined;
	}

	public show(inputUri: string | vscode.Uri, options?: ShowOptions): void {
		const url = typeof inputUri === 'string' ? inputUri : inputUri.toString(true);
		if (this._activeView) {
			this._activeView.show(url, options);
			return;
		}

		// A webview panel can already exist in the workbench while its serializer is
		// still being invoked. Keep the latest request until the restored view is
		// available instead of creating a second panel.
		if (!this._restorationCompleted && this._hasRestorableView()) {
			this._pendingShow = { url, options };
			return;
		}

		this._pendingShow = undefined;
		const view = this._viewFactory.create(this.extensionUri, url, options);
		this.registerWebviewListeners(view);

		this._activeView = view;
	}

	public restore(panel: vscode.WebviewPanel, state: SimpleBrowserState | null | undefined): void {
		const url = state?.url ?? '';
		const view = this._viewFactory.restore(this.extensionUri, url, panel);
		this._restorationCompleted = true;

		if (this._activeView) {
			// If tab discovery lost the race, show() may have created a view already.
			// Dispose the restored panel so it cannot become an orphaned duplicate.
			view.dispose();
			return;
		}

		this.registerWebviewListeners(view);
		this._activeView = view;

		if (this._pendingShow) {
			const { url: pendingUrl, options: pendingOptions } = this._pendingShow;
			this._pendingShow = undefined;
			view.show(pendingUrl, pendingOptions);
		}
	}

	private static hasRestorableView(): boolean {
		return vscode.window.tabGroups.all.some(tabGroup => tabGroup.tabs.some(tab =>
			tab.input instanceof vscode.TabInputWebview && tab.input.viewType === `mainThreadWebview-${SimpleBrowserView.viewType}`));
	}

	private registerWebviewListeners(view: SimpleBrowserViewLike) {
		view.onDispose(() => {
			if (this._activeView === view) {
				this._activeView = undefined;
				this._restorationCompleted = true;
			}
		});
	}

}
