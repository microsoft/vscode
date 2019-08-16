/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from 'vs/base/browser/dom';
import { memoize } from 'vs/base/common/decorators';
import { URI } from 'vs/base/common/uri';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { EditorInput, EditorModel, GroupIdentifier, IEditorInput } from 'vs/workbench/common/editor';
import { WebviewEditorOverlay } from 'vs/workbench/contrib/webview/common/webview';
import { UnownedDisposable as Unowned } from 'vs/base/common/lifecycle';

class WebviewIconsManager {
	private readonly _icons = new Map<string, { light: URI, dark: URI }>();

	@memoize
	private get _styleElement(): HTMLStyleElement {
		const element = dom.createStyleSheet();
		element.className = 'webview-icons';
		return element;
	}

	public setIcons(
		webviewId: string,
		iconPath: { light: URI, dark: URI } | undefined
	) {
		if (iconPath) {
			this._icons.set(webviewId, iconPath);
		} else {
			this._icons.delete(webviewId);
		}

		this.updateStyleSheet();
	}

	private updateStyleSheet() {
		const cssRules: string[] = [];
		this._icons.forEach((value, key) => {
			const webviewSelector = `.show-file-icons .webview-${key}-name-file-icon::before`;
			if (URI.isUri(value)) {
				cssRules.push(`${webviewSelector} { content: ""; background-image: ${dom.asCSSUrl(value)}; }`);
			}
			else {
				cssRules.push(`.vs ${webviewSelector} { content: ""; background-image: ${dom.asCSSUrl(value.light)}; }`);
				cssRules.push(`.vs-dark ${webviewSelector} { content: ""; background-image: ${dom.asCSSUrl(value.dark)}; }`);
			}
		});
		this._styleElement.innerHTML = cssRules.join('\n');
	}
}

export class WebviewEditorInput extends EditorInput {

	public static readonly typeId = 'workbench.editors.webviewInput';

	private static readonly iconsManager = new WebviewIconsManager();

	private _name: string;
	private _iconPath?: { light: URI, dark: URI };
	private _group?: GroupIdentifier;
	private readonly _webview: WebviewEditorOverlay;

	constructor(
		public readonly id: string,
		public readonly viewType: string,
		name: string,
		public readonly extension: undefined | {
			readonly location: URI;
			readonly id: ExtensionIdentifier;
		},
		webview: Unowned<WebviewEditorOverlay>,
	) {
		super();

		this._name = name;
		this.extension = extension;

		this._webview = this._register(webview.acquire()); // The input owns this webview
	}

	public getTypeId(): string {
		return WebviewEditorInput.typeId;
	}

	public getResource(): URI {
		return URI.from({
			scheme: 'webview-panel',
			path: `webview-panel/webview-${this.id}`
		});
	}

	public getName(): string {
		return this._name;
	}

	public getTitle() {
		return this.getName();
	}

	public getDescription() {
		return undefined;
	}

	public setName(value: string): void {
		this._name = value;
		this._onDidChangeLabel.fire();
	}

	public get webview() {
		return this._webview;
	}

	public get iconPath() {
		return this._iconPath;
	}

	public set iconPath(value: { light: URI, dark: URI } | undefined) {
		this._iconPath = value;
		WebviewEditorInput.iconsManager.setIcons(this.id, value);
	}

	public matches(other: IEditorInput): boolean {
		return other === this;
	}

	public get group(): GroupIdentifier | undefined {
		return this._group;
	}

	public async resolve(): Promise<IEditorModel> {
		return new EditorModel();
	}

	public supportsSplitEditor() {
		return false;
	}

	public updateGroup(group: GroupIdentifier): void {
		this._group = group;
	}
}

export class RevivedWebviewEditorInput extends WebviewEditorInput {
	private _revived: boolean = false;

	constructor(
		id: string,
		viewType: string,
		name: string,
		extension: undefined | {
			readonly location: URI;
			readonly id: ExtensionIdentifier
		},
		private readonly reviver: (input: WebviewEditorInput) => Promise<void>,
		webview: Unowned<WebviewEditorOverlay>,
	) {
		super(id, viewType, name, extension, webview);
	}

	public async resolve(): Promise<IEditorModel> {
		if (!this._revived) {
			this._revived = true;
			await this.reviver(this);
		}
		return super.resolve();
	}
}
