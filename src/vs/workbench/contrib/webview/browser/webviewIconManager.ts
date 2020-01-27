/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { memoize } from 'vs/base/common/decorators';
import { URI } from 'vs/base/common/uri';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { WebviewIcons } from 'vs/workbench/contrib/webview/browser/webview';

export class WebviewIconManager {

	private readonly _icons = new Map<string, WebviewIcons>();

	constructor(
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
	) { }

	@memoize
	private get _styleElement(): HTMLStyleElement {
		const element = dom.createStyleSheet();
		element.className = 'webview-icons';
		return element;
	}

	public setIcons(
		webviewId: string,
		iconPath: WebviewIcons | undefined,
	) {
		if (iconPath) {
			this._icons.set(webviewId, iconPath);
		} else {
			this._icons.delete(webviewId);
		}

		this.updateStyleSheet(this._lifecycleService);
	}

	private async updateStyleSheet(lifecycleService: ILifecycleService) {
		await lifecycleService.when(LifecyclePhase.Starting);

		try {
			const cssRules: string[] = [];
			this._icons.forEach((value, key) => {
				const webviewSelector = `.show-file-icons .webview-${key}-name-file-icon::before`;
				if (URI.isUri(value)) {
					cssRules.push(`${webviewSelector} { content: ""; background-image: ${dom.asCSSUrl(value)}; }`);
				} else {
					cssRules.push(`.vs ${webviewSelector} { content: ""; background-image: ${dom.asCSSUrl(value.light)}; }`);
					cssRules.push(`.vs-dark ${webviewSelector} { content: ""; background-image: ${dom.asCSSUrl(value.dark)}; }`);
				}
			});
			this._styleElement.innerHTML = cssRules.join('\n');
		} catch {
			// noop
		}
	}
}
