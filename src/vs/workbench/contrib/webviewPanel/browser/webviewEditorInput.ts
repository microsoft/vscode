/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeWindow } from '../../../../base/browser/window.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { isDark } from '../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorInputCapabilities, GroupIdentifier, IUntypedEditorInput, Verbosity } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IOverlayWebview } from '../../webview/browser/webview.js';

export interface WebviewInputInitInfo {
	readonly viewType: string;
	readonly providedId: string | undefined;
	readonly name: string;
	readonly iconPath: WebviewIcons | undefined;
}

export class WebviewInput extends EditorInput {

	public static typeId = 'workbench.editors.webviewInput';

	public override get typeId(): string {
		return WebviewInput.typeId;
	}

	public override get editorId(): string {
		return this.viewType;
	}

	public override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.CanDropIntoEditor;
	}

	private readonly _resourceId = generateUuid();

	private _webviewTitle: string;
	private _iconPath?: WebviewIcons;
	private _group?: GroupIdentifier;

	private _webview: IOverlayWebview;

	private _hasTransfered = false;

	get resource() {
		return URI.from({
			scheme: Schemas.webviewPanel,
			path: `webview-panel/webview-${this.providerId}-${this._resourceId}`
		});
	}

	public readonly viewType: string;
	public readonly providerId: string | undefined;

	constructor(
		init: WebviewInputInitInfo,
		webview: IOverlayWebview,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();

		this.viewType = init.viewType;
		this.providerId = init.providedId;

		this._webviewTitle = init.name;
		this._iconPath = init.iconPath;
		this._webview = webview;

		this._register(_themeService.onDidColorThemeChange(() => {
			// Potentially update icon
			this._onDidChangeLabel.fire();
		}));
	}

	override dispose() {
		if (!this.isDisposed()) {
			if (!this._hasTransfered) {
				this._webview?.dispose();
			}
		}
		super.dispose();
	}

	public override getName(): string {
		return this._webviewTitle;
	}

	public override getTitle(_verbosity?: Verbosity): string {
		return this.getName();
	}

	public override getDescription(): string | undefined {
		return undefined;
	}

	public setWebviewTitle(value: string): void {
		this._webviewTitle = value;
		this.webview.setTitle(value);
		this._onDidChangeLabel.fire();
	}

	public getWebviewTitle(): string | undefined {
		return this._webviewTitle;
	}

	public get webview(): IOverlayWebview {
		return this._webview;
	}

	public get extension() {
		return this.webview.extension;
	}

	override getIcon(): URI | undefined {
		if (!this._iconPath) {
			return;
		}

		return isDark(this._themeService.getColorTheme().type)
			? this._iconPath.dark
			: (this._iconPath.light ?? this._iconPath.dark);
	}

	public get iconPath() {
		return this._iconPath;
	}

	public set iconPath(value: WebviewIcons | undefined) {
		this._iconPath = value;
		this._onDidChangeLabel.fire();
	}

	public override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(other) || other === this;
	}

	public get group(): GroupIdentifier | undefined {
		return this._group;
	}

	public updateGroup(group: GroupIdentifier): void {
		this._group = group;
	}

	protected transfer(other: WebviewInput): WebviewInput | undefined {
		if (this._hasTransfered) {
			return undefined;
		}
		this._hasTransfered = true;
		other._webview = this._webview;
		return other;
	}

	public claim(claimant: unknown, targetWindow: CodeWindow, scopedContextKeyService: IContextKeyService | undefined): void {
		return this._webview.claim(claimant, targetWindow, scopedContextKeyService);
	}
}
export interface WebviewIcons {
	readonly light: URI;
	readonly dark: URI;
}

