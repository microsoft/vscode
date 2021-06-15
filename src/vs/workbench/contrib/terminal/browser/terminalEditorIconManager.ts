/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TerminalIcon, TerminalSettingPrefix } from 'vs/platform/terminal/common/terminal';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

export class TerminalEditorIconManager implements IDisposable {

	private readonly _icons = new Map<string, TerminalIcon>();

	private _styleElement: HTMLStyleElement | undefined;

	constructor(
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalService terminalService: ITerminalService
	) {
		_configurationService.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration(TerminalSettingPrefix.DefaultProfile + terminalService.getPlatformKey()) ||
				e.affectsConfiguration(TerminalSettingPrefix.Profiles + terminalService.getPlatformKey())) {
				this._updateStyleSheet();
			}
		});
	}

	dispose() {
		this._styleElement?.remove();
		this._styleElement = undefined;
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention
	private get styleElement(): HTMLStyleElement {
		if (!this._styleElement) {
			this._styleElement = dom.createStyleSheet();
			this._styleElement.className = 'terminal-icons';
		}
		return this._styleElement;
	}

	public setIcons(
		webviewId: string,
		iconPath?: TerminalIcon
	) {
		if (iconPath) {
			this._icons.set(webviewId, iconPath);
		} else {
			this._icons.delete(webviewId);
		}

		this._updateStyleSheet();
	}

	private async _updateStyleSheet() {
		await this._lifecycleService.when(LifecyclePhase.Starting);

		const cssRules: string[] = [];
		if (this._configurationService.getValue('workbench.iconTheme') !== null) {
			for (const [key, value] of this._icons) {
				const webviewSelector = `.show-file-icons .terminal-${key}-name-file-icon::before`;
				try {
					if (typeof value === 'object' && 'light' in value && 'dark' in value) {
						cssRules.push(
							`.monaco-workbench.vs ${webviewSelector} { content: ""; background-image: ${dom.asCSSUrl(value.light)}; }`,
							`.monaco-workbench.vs-dark ${webviewSelector}, .monaco-workbench.hc-black ${webviewSelector} { content: ""; background-image: ${dom.asCSSUrl(value.dark)}; }`
						);
					} else if (URI.isUri(value)) {

					} else {

					}
				} catch {
					// noop
				}
			}
		}
		this.styleElement.textContent = cssRules.join('\n');
	}
}
