/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import { IConfiguration as IEditorConfiguration, DefaultConfig } from 'vs/editor/common/config/defaultConfig';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IChoiceService } from 'vs/platform/message/common/message';
import { IStorageService, StorageScope } from "vs/platform/storage/common/storage";
import { ITerminalConfiguration, ITerminalConfigHelper, ITerminalFont, IShellLaunchConfig, IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY } from 'vs/workbench/parts/terminal/common/terminal';
import { Severity } from "vs/editor/common/standalone/standaloneBase";
import { TPromise } from 'vs/base/common/winjs.base';

interface IFullTerminalConfiguration {
	terminal: {
		integrated: ITerminalConfiguration;
	};
}

const DEFAULT_LINE_HEIGHT = 1.2;

/**
 * Encapsulates terminal configuration logic, the primary purpose of this file is so that platform
 * specific test cases can be written.
 */
export class TerminalConfigHelper implements ITerminalConfigHelper {
	public panelContainer: HTMLElement;

	private _charMeasureElement: HTMLElement;
	private _lastFontMeasurement: ITerminalFont;

	public constructor(
		private _platform: platform.Platform,
		@IConfigurationService private _configurationService: IConfigurationService,
		@IWorkspaceConfigurationService private _workspaceConfigurationService: IWorkspaceConfigurationService,
		@IChoiceService private _choiceService: IChoiceService,
		@IStorageService private _storageService: IStorageService) {
	}

	public get config(): ITerminalConfiguration {
		return this._configurationService.getConfiguration<IFullTerminalConfiguration>().terminal.integrated;
	}

	private _measureFont(fontFamily: string, fontSize: number, lineHeight: number): ITerminalFont {
		// Create charMeasureElement if it hasn't been created or if it was orphaned by its parent
		if (!this._charMeasureElement || !this._charMeasureElement.parentElement) {
			this._charMeasureElement = document.createElement('div');
			this.panelContainer.appendChild(this._charMeasureElement);
		}
		const style = this._charMeasureElement.style;
		style.display = 'block';
		style.fontFamily = fontFamily;
		style.fontSize = fontSize + 'px';
		style.lineHeight = lineHeight.toString(10);
		this._charMeasureElement.innerText = 'X';
		const rect = this._charMeasureElement.getBoundingClientRect();
		style.display = 'none';

		// Bounding client rect was invalid, use last font measurement if available.
		if (this._lastFontMeasurement && !rect.width && !rect.height) {
			return this._lastFontMeasurement;
		}

		this._lastFontMeasurement = {
			fontFamily,
			fontSize: fontSize + 'px',
			lineHeight,
			charWidth: rect.width,
			charHeight: rect.height
		};
		return this._lastFontMeasurement;
	}

	/**
	 * Gets the font information based on the terminal.integrated.fontFamily
	 * terminal.integrated.fontSize, terminal.integrated.lineHeight configuration properties
	 */
	public getFont(): ITerminalFont {
		const config = this._configurationService.getConfiguration();
		const editorConfig = (<IEditorConfiguration>config).editor;
		const terminalConfig = this.config;

		const fontFamily = terminalConfig.fontFamily || editorConfig.fontFamily;
		let fontSize = this._toInteger(terminalConfig.fontSize, 0);
		if (fontSize <= 0) {
			fontSize = DefaultConfig.editor.fontSize;
		}
		let lineHeight = terminalConfig.lineHeight <= 0 ? DEFAULT_LINE_HEIGHT : terminalConfig.lineHeight;
		if (!lineHeight) {
			lineHeight = DEFAULT_LINE_HEIGHT;
		}

		return this._measureFont(fontFamily, fontSize, lineHeight);
	}

	public mergeDefaultShellPathAndArgs(shell: IShellLaunchConfig): void {
		// Check whether there is a workspace setting
		const platformKey = platform.isWindows ? 'windows' : platform.isMacintosh ? 'osx' : 'linux';
		const shellConfigValue = this._workspaceConfigurationService.lookup<string>(`terminal.integrated.shell.${platformKey}`);
		const shellArgsConfigValue = this._workspaceConfigurationService.lookup<string[]>(`terminal.integrated.shellArgs.${platformKey}`);

		// Check if workspace setting exists and whether it's whitelisted
		let isWorkspaceShellAllowed = false;
		if (shellConfigValue.workspace !== undefined || shellArgsConfigValue.workspace !== undefined) {
			isWorkspaceShellAllowed = this._storageService.getBoolean(IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY, StorageScope.WORKSPACE, undefined);
		}

		// Check if the value is neither blacklisted (false) or whitelisted (true) and ask for
		// permission
		if (isWorkspaceShellAllowed === undefined) {
			let shellString: string;
			if (shellConfigValue.workspace) {
				shellString = `"${shellConfigValue.workspace}"`;
			}
			let argsString: string;
			if (shellArgsConfigValue.workspace) {
				argsString = `[${shellArgsConfigValue.workspace.map(v => '"' + v + '"').join(', ')}]`;
			}
			// Should not be localized as it's json-like syntax referencing settings keys
			let changeString: string;
			if (shellConfigValue.workspace !== undefined) {
				if (shellArgsConfigValue.workspace !== undefined) {
					changeString = `shell: ${shellString}, shellArgs: ${argsString}`;
				} else {
					changeString = `shell: ${shellString}`;
				}
			} else { // if (shellArgsConfigValue.workspace !== undefined)
				changeString = `shellArgs: ${argsString}`;
			}
			const message = nls.localize('terminal.integrated.allowWorkspaceShell', "This workspace wants to customize the terminal shell, do you want to allow it? ({0})", changeString);
			const options = [nls.localize('allow', "Allow"), nls.localize('cancel', "Cancel"), nls.localize('disallow', "Disallow")];
			this._choiceService.choose(Severity.Warning, message, options).then(choice => {
				switch (choice) {
					case 0:
						this._storageService.store(IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY, true, StorageScope.WORKSPACE);
					case 1:
						return TPromise.as(null);
					case 2:
						this._storageService.store(IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY, false, StorageScope.WORKSPACE);
					default:
						return TPromise.as(null);
				}
			});
		}

		shell.executable = (isWorkspaceShellAllowed ? shellConfigValue.value : shellConfigValue.user) || shellConfigValue.default;
		shell.args = (isWorkspaceShellAllowed ? shellArgsConfigValue.value : shellArgsConfigValue.user) || shellArgsConfigValue.default;
	}

	private _toInteger(source: any, minimum?: number): number {
		let r = parseInt(source, 10);
		if (isNaN(r)) {
			r = 0;
		}
		if (typeof minimum === 'number') {
			r = Math.max(minimum, r);
		}
		return r;
	}
}