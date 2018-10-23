/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { WebviewElement } from './webviewElement';
import { IStorageService } from 'vs/platform/storage/common/storage';

/**  A context key that is set when the find widget in a webview is visible. */
export const KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE = new RawContextKey<boolean>('webviewFindWidgetVisible', false);


/**
 * This class is only intended to be subclassed and not instantiated.
 */
export abstract class BaseWebviewEditor extends BaseEditor {

	protected _webview: WebviewElement | undefined;
	protected findWidgetVisible: IContextKey<boolean>;

	constructor(
		id: string,
		telemetryService: ITelemetryService,
		themeService: IThemeService,
		contextKeyService: IContextKeyService,
		storageService: IStorageService
	) {
		super(id, telemetryService, themeService, storageService);
		if (contextKeyService) {
			this.findWidgetVisible = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE.bindTo(contextKeyService);
		}
	}

	public showFind() {
		if (this._webview) {
			this._webview.showFind();
			this.findWidgetVisible.set(true);
		}
	}

	public hideFind() {
		this.findWidgetVisible.reset();
		if (this._webview) {
			this._webview.hideFind();
		}
	}

	public get isWebviewEditor() {
		return true;
	}

	public reload() {
		if (this._webview) {
			this._webview.reload();
		}
	}

	public layout(dimension: Dimension): void {
		if (this._webview) {
			this._webview.layout();
		}
	}

	public focus(): void {
		if (this._webview) {
			this._webview.focus();
		}
	}

	public selectAll(): void {
		if (this._webview) {
			this._webview.selectAll();
		}
	}
}
