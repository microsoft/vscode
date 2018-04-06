/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/zoneWidget';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { WebviewElement } from 'vs/workbench/parts/webview/electron-browser/webviewElement';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPosition } from 'vs/editor/common/core/position';

export const EDITOR_CONTRIBUTION_ID = 'editor.contrib.webview';

export class WebviewWidget extends ZoneWidget {

	private _webview: WebviewElement;
	private _scrollable: DomScrollableElement;

	constructor(
		editor: ICodeEditor,
		private readonly _delegate: (view: WebviewElement) => void,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService private readonly _themeService: IThemeService,
		@IPartService private readonly _partService: IPartService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService
	) {
		super(editor, {});

		// this._applyTheme(_themeService.getTheme());
		// this._callOnDispose.push(_themeService.onThemeChange(this._applyTheme.bind(this)));

		this.create();
	}

	protected _fillContainer(container: HTMLElement): void {
		this._webview = new WebviewElement(
			this._partService.getContainer(Parts.EDITOR_PART),
			this._themeService,
			this._environmentService,
			this._contextViewService,
			undefined,
			undefined,
			{
				enableWrappedPostMessage: true,
				useSameOriginForRoot: false
			});
		this._webview.mountTo(container);

		this._scrollable = new DomScrollableElement(this._webview.getDomNode(), {});
		this._scrollable.getDomNode().style.width = '100%';
		this._scrollable.getDomNode().style.height = '100%';
		container.appendChild(this._scrollable.getDomNode());
		this._delegate(this._webview);
	}
}

export interface IWebviewWidgetContribution extends IEditorContribution {
	showWebviewWidget(position: IPosition, delegate: (view: WebviewElement) => void): void;
	closeWebviewWidget(): void;
}


export class WebviewWidgetContribution implements IWebviewWidgetContribution {
	private _webviewWidget: WebviewWidget;

	constructor(
		private editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	showWebviewWidget(position: IPosition, delegate: (view: WebviewElement) => void): void {
		if (this._webviewWidget) {
			this._webviewWidget.dispose();
		}

		this._webviewWidget = this.instantiationService.createInstance(WebviewWidget, this.editor, delegate);
		this._webviewWidget.show(position, 20);
		// this.webviewWidgetVisible.set(true);
	}

	public closeWebviewWidget(): void {
		if (this._webviewWidget) {
			this._webviewWidget.dispose();
			this._webviewWidget = null;
			// this.webviewWidgetVisible.reset();
			this.editor.focus();
		}
	}

	getId(): string {
		return EDITOR_CONTRIBUTION_ID;
	}

	dispose(): void {
		this.closeWebviewWidget();
	}
}

registerEditorContribution(WebviewWidgetContribution);