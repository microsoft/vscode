/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorCommand, ServicesAccessor, registerEditorContribution, registerEditorCommand } from 'vs/editor/browser/editorExtensions';
import { IPosition } from 'vs/editor/common/core/position';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/zoneWidget';
import { KeyCode } from 'vs/editor/editor.main';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { CONTEXT_WEBVIEW_WIDGET_VISIBLE } from 'vs/workbench/parts/webview/common/webview';
import { WebviewElement } from 'vs/workbench/parts/webview/electron-browser/webviewElement';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

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
	private _webviewWidgetVisible: IContextKey<boolean>;

	constructor(
		private editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		this._webviewWidgetVisible = CONTEXT_WEBVIEW_WIDGET_VISIBLE.bindTo(contextKeyService);
	}

	showWebviewWidget(position: IPosition, delegate: (view: WebviewElement) => void): void {
		if (this._webviewWidget) {
			this._webviewWidget.dispose();
		}

		this._webviewWidget = this.instantiationService.createInstance(WebviewWidget, this.editor, delegate);
		this._webviewWidget.show(position, 20);
		this._webviewWidgetVisible.set(true);
	}

	public closeWebviewWidget(): void {
		if (this._webviewWidget) {
			this._webviewWidget.dispose();
			this._webviewWidget = null;
			this._webviewWidgetVisible.reset();
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


class CloseWebviewWidgetCommand extends EditorCommand {

	constructor() {
		super({
			id: 'closeWebviewWidget',
			precondition: CONTEXT_WEBVIEW_WIDGET_VISIBLE,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyCode.Escape,
				secondary: [KeyMod.Shift | KeyCode.Escape]
			}
		});
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		const webviewContribution = editor.getContribution<IWebviewWidgetContribution>(EDITOR_CONTRIBUTION_ID);
		if (webviewContribution) {
			// if focus is in outer editor we need to use the debug contribution to close
			return webviewContribution.closeWebviewWidget();
		}
	}
}

registerEditorCommand(new CloseWebviewWidgetCommand());
