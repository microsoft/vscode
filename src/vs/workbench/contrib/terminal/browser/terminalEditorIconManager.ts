/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TerminalSettingPrefix } from 'vs/platform/terminal/common/terminal';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';

export class TerminalEditorIconManager implements IDisposable {

	private _styleElement: HTMLStyleElement | undefined;

	constructor(
		@IConfigurationService _configurationService: IConfigurationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		_configurationService.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration(TerminalSettingPrefix.DefaultProfile + _terminalService.getPlatformKey()) ||
				e.affectsConfiguration(TerminalSettingPrefix.Profiles + _terminalService.getPlatformKey())) {
				this.updateStyleSheet();
			}
		});
	}

	dispose() {
		this._styleElement?.remove();
		this._styleElement = undefined;
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention
	// private get styleElement(): HTMLStyleElement {
	// 	if (!this._styleElement) {
	// 		this._styleElement = dom.createStyleSheet();
	// 		this._styleElement.className = 'terminal-editor-icon';
	// 	}
	// 	return this._styleElement;
	// }

	async updateStyleSheet() {
		// const cssRules: string[] = [];
		// await this._lifecycleService.when(LifecyclePhase.Starting);
		for (const instance of this._terminalService.terminalInstances) {
			const icon = instance.icon;
			if (!icon) {
				continue;
			}

			// const cssRules: string[] = [];
			// if (icon instanceof Codicon) {
			// 	const terminalSelector = dom.$(`.tab .${instance.title}-name-file-icon`);
			// console.log(`${terminalSelector}`);
			// cssRules.push(`.monaco-workbench ${terminalSelector} ${icon.classNames} { content: ""; }`);
		}
		// const iconClasses = getUriClasses(instance, this._themeService.getColorTheme().type);
		// let uri = undefined;
		// if (icon instanceof URI) {
		// 	uri = icon;
		// } else if (icon instanceof Object && 'light' in icon && 'dark' in icon) {
		// 	uri = this._themeService.getColorTheme().type === ColorScheme.LIGHT ? icon.light : icon.dark;
		// }
		// if (uri instanceof URI && iconClasses && iconClasses.length > 1) {
		// 	const terminalSelector = `.${instance.title}-name-file-icon::before`;
		// 	console.log(terminalSelector);
		// 	try {
		// 		cssRules.push(`.monaco-workbench .${iconClasses[0]} ${terminalSelector} { content: ""; background-image: ${dom.asCSSUrl(uri)}; }`);
		// 	} catch {
		// 		// noop
		// 	}
		// }
	}
	// this.styleElement.textContent = cssRules.join('\n');
	// }
}
