/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext, MainThreadModalShape, ExtHostContext, ExtHostModalShape } from '../common/extHost.protocol.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import * as dom from '../../../base/browser/dom.js';
import { ILayoutService } from '../../../platform/layout/browser/layoutService.js';

interface IModalPanelEntry {
	backdrop: HTMLElement;
	container: HTMLElement;
	iframe: HTMLIFrameElement;
	disposables: DisposableStore;
}

@extHostNamedCustomer(MainContext.MainThreadModal)
export class MainThreadModal implements MainThreadModalShape {

	private readonly _proxy: ExtHostModalShape;
	private readonly _panels = new Map<number, IModalPanelEntry>();
	private readonly _toDispose = new DisposableStore();

	constructor(
		extHostContext: IExtHostContext,
		@ILayoutService private readonly _layoutService: ILayoutService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostModal);
	}

	$createModalPanel(handle: number, options: { title: string; width: number; height: number }): void {
		const container = this._layoutService.activeContainer;

		// Backdrop overlay
		const backdrop = dom.append(container, dom.$('.modal-panel-backdrop'));
		backdrop.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.5);z-index:2500;display:flex;align-items:center;justify-content:center;';

		// Dialog box
		const dialog = dom.append(backdrop, dom.$('.modal-panel-dialog'));
		dialog.style.cssText = `position:relative;background:var(--vscode-editor-background);border:1px solid var(--vscode-widget-border);border-radius:6px;display:flex;flex-direction:column;width:${options.width}px;height:${options.height}px;overflow:hidden;`;

		// Header
		const header = dom.append(dialog, dom.$('.modal-panel-header'));
		header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--vscode-widget-border);flex-shrink:0;';
		const title = dom.append(header, dom.$('span.modal-panel-title'));
		title.style.cssText = 'font-weight:600;font-size:13px;color:var(--vscode-foreground);';
		title.textContent = options.title;

		const closeBtn = dom.append(header, dom.$('button.modal-panel-close'));
		closeBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--vscode-foreground);font-size:16px;padding:0 4px;line-height:1;';
		closeBtn.textContent = '×';

		// Iframe body
		const iframe = dom.append(dialog, dom.$('iframe.modal-panel-iframe')) as HTMLIFrameElement;
		iframe.style.cssText = 'flex:1;width:100%;border:none;background:transparent;';
		iframe.setAttribute('sandbox', 'allow-scripts');

		const disposables = new DisposableStore();

		disposables.add(dom.addDisposableListener(closeBtn, dom.EventType.CLICK, () => {
			this._disposePanel(handle);
		}));

		disposables.add(dom.addDisposableListener(backdrop, dom.EventType.CLICK, e => {
			if (e.target === backdrop) {
				this._disposePanel(handle);
			}
		}));

		this._panels.set(handle, { backdrop, container: dialog, iframe, disposables });
	}

	$setModalPanelHtml(handle: number, html: string): void {
		const entry = this._panels.get(handle);
		if (entry) {
			entry.iframe.srcdoc = html;
		}
	}

	$disposeModalPanel(handle: number): void {
		this._disposePanel(handle);
	}

	private _disposePanel(handle: number): void {
		const entry = this._panels.get(handle);
		if (!entry) {
			return;
		}
		this._panels.delete(handle);
		entry.disposables.dispose();
		entry.backdrop.remove();
		this._proxy.$onModalPanelDisposed(handle);
	}

	dispose(): void {
		for (const handle of [...this._panels.keys()]) {
			this._disposePanel(handle);
		}
		this._toDispose.dispose();
	}
}
