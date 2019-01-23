/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as path from 'path';
import * as platform from 'vs/base/common/platform';
import { EDITOR_FONT_DEFAULTS, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITerminalConfiguration, ITerminalConfigHelper, ITerminalFont, IShellLaunchConfig, IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY, TERMINAL_CONFIG_SECTION, DEFAULT_LETTER_SPACING, DEFAULT_LINE_HEIGHT, MINIMUM_LETTER_SPACING } from 'vs/workbench/parts/terminal/common/terminal';
import Severity from 'vs/base/common/severity';
import { isFedora, isUbuntu } from 'vs/workbench/parts/terminal/node/terminal';
import { Terminal as XTermTerminal } from 'vscode-xterm';
import { INotificationService } from 'vs/platform/notification/common/notification';

const MINIMUM_FONT_SIZE = 6;
const MAXIMUM_FONT_SIZE = 25;

/**
 * Encapsulates terminal configuration logic, the primary purpose of this file is so that platform
 * specific test cases can be written.
 */
export class TerminalConfigHelper implements ITerminalConfigHelper {
	public panelContainer: HTMLElement;

	private _charMeasureElement: HTMLElement;
	private _lastFontMeasurement: ITerminalFont;
	public config: ITerminalConfiguration;

	public constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceConfigurationService private readonly _workspaceConfigurationService: IWorkspaceConfigurationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IStorageService private readonly _storageService: IStorageService
	) {
		this._updateConfig();
		this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TERMINAL_CONFIG_SECTION)) {
				this._updateConfig();
			}
		});
	}

	private _updateConfig(): void {
		this.config = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION);
	}

	public configFontIsMonospace(): boolean {
		this._createCharMeasureElementIfNecessary();
		const fontSize = 15;
		const fontFamily = this.config.fontFamily || this._configurationService.getValue<IEditorOptions>('editor').fontFamily || EDITOR_FONT_DEFAULTS.fontFamily;
		const i_rect = this._getBoundingRectFor('i', fontFamily, fontSize);
		const w_rect = this._getBoundingRectFor('w', fontFamily, fontSize);

		const invalidBounds = !i_rect.width || !w_rect.width;
		if (invalidBounds) {
			// There is no reason to believe the font is not Monospace.
			return true;
		}

		return i_rect.width === w_rect.width;
	}

	private _createCharMeasureElementIfNecessary() {
		// Create charMeasureElement if it hasn't been created or if it was orphaned by its parent
		if (!this._charMeasureElement || !this._charMeasureElement.parentElement) {
			this._charMeasureElement = document.createElement('div');
			this.panelContainer.appendChild(this._charMeasureElement);
		}
	}

	private _getBoundingRectFor(char: string, fontFamily: string, fontSize: number): ClientRect | DOMRect {
		const style = this._charMeasureElement.style;
		style.display = 'inline-block';
		style.fontFamily = fontFamily;
		style.fontSize = fontSize + 'px';
		style.lineHeight = 'normal';
		this._charMeasureElement.innerText = char;
		const rect = this._charMeasureElement.getBoundingClientRect();
		style.display = 'none';

		return rect;
	}

	private _measureFont(fontFamily: string, fontSize: number, letterSpacing: number, lineHeight: number): ITerminalFont {
		this._createCharMeasureElementIfNecessary();

		const rect = this._getBoundingRectFor('X', fontFamily, fontSize);

		// Bounding client rect was invalid, use last font measurement if available.
		if (this._lastFontMeasurement && !rect.width && !rect.height) {
			return this._lastFontMeasurement;
		}

		this._lastFontMeasurement = {
			fontFamily,
			fontSize,
			letterSpacing,
			lineHeight,
			charWidth: rect.width,
			charHeight: Math.ceil(rect.height)
		};
		return this._lastFontMeasurement;
	}

	/**
	 * Gets the font information based on the terminal.integrated.fontFamily
	 * terminal.integrated.fontSize, terminal.integrated.lineHeight configuration properties
	 */
	public getFont(xterm?: XTermTerminal, excludeDimensions?: boolean): ITerminalFont {
		const editorConfig = this._configurationService.getValue<IEditorOptions>('editor');

		let fontFamily = this.config.fontFamily || editorConfig.fontFamily || EDITOR_FONT_DEFAULTS.fontFamily;
		let fontSize = this._toInteger(this.config.fontSize, MINIMUM_FONT_SIZE, MAXIMUM_FONT_SIZE, EDITOR_FONT_DEFAULTS.fontSize);

		// Work around bad font on Fedora/Ubuntu
		if (!this.config.fontFamily) {
			if (isFedora) {
				fontFamily = '\'DejaVu Sans Mono\', monospace';
			}
			if (isUbuntu) {
				fontFamily = '\'Ubuntu Mono\', monospace';

				// Ubuntu mono is somehow smaller, so set fontSize a bit larger to get the same perceived size.
				fontSize = this._toInteger(fontSize + 2, MINIMUM_FONT_SIZE, MAXIMUM_FONT_SIZE, EDITOR_FONT_DEFAULTS.fontSize);
			}
		}

		const letterSpacing = this.config.letterSpacing ? Math.max(Math.floor(this.config.letterSpacing), MINIMUM_LETTER_SPACING) : DEFAULT_LETTER_SPACING;
		const lineHeight = this.config.lineHeight ? Math.max(this.config.lineHeight, 1) : DEFAULT_LINE_HEIGHT;

		if (excludeDimensions) {
			return {
				fontFamily,
				fontSize,
				letterSpacing,
				lineHeight
			};
		}

		// Get the character dimensions from xterm if it's available
		if (xterm) {
			if (xterm._core.charMeasure && xterm._core.charMeasure.width && xterm._core.charMeasure.height) {
				return {
					fontFamily,
					fontSize,
					letterSpacing,
					lineHeight,
					charHeight: xterm._core.charMeasure.height,
					charWidth: xterm._core.charMeasure.width
				};
			}
		}

		// Fall back to measuring the font ourselves
		return this._measureFont(fontFamily, fontSize, letterSpacing, lineHeight);
	}

	public setWorkspaceShellAllowed(isAllowed: boolean): void {
		this._storageService.store(IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY, isAllowed, StorageScope.WORKSPACE);
	}

	public mergeDefaultShellPathAndArgs(shell: IShellLaunchConfig, platformOverride: platform.Platform = platform.platform): void {
		// Check whether there is a workspace setting
		const platformKey = platformOverride === platform.Platform.Windows ? 'windows' : platformOverride === platform.Platform.Mac ? 'osx' : 'linux';
		const shellConfigValue = this._workspaceConfigurationService.inspect<string>(`terminal.integrated.shell.${platformKey}`);
		const shellArgsConfigValue = this._workspaceConfigurationService.inspect<string[]>(`terminal.integrated.shellArgs.${platformKey}`);

		// Check if workspace setting exists and whether it's whitelisted
		let isWorkspaceShellAllowed: boolean | undefined = false;
		if (shellConfigValue.workspace !== undefined || shellArgsConfigValue.workspace !== undefined) {
			isWorkspaceShellAllowed = this._storageService.getBoolean(IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY, StorageScope.WORKSPACE, undefined);
		}

		// Always allow [] args as it would lead to an odd error message and should not be dangerous
		if (shellConfigValue.workspace === undefined && shellArgsConfigValue.workspace && shellArgsConfigValue.workspace.length === 0) {
			isWorkspaceShellAllowed = true;
		}

		// Check if the value is neither blacklisted (false) or whitelisted (true) and ask for
		// permission
		if (isWorkspaceShellAllowed === undefined) {
			let shellString: string | undefined;
			if (shellConfigValue.workspace) {
				shellString = `"${shellConfigValue.workspace}"`;
			}
			let argsString: string | undefined;
			if (shellArgsConfigValue.workspace) {
				argsString = `[${shellArgsConfigValue.workspace.map(v => '"' + v + '"').join(', ')}]`;
			}
			// Should not be localized as it's json-like syntax referencing settings keys
			let changeString: string;
			if (shellString) {
				if (argsString) {
					changeString = `shell: ${shellString}, shellArgs: ${argsString}`;
				} else {
					changeString = `shell: ${shellString}`;
				}
			} else { // if (shellArgsConfigValue.workspace !== undefined)
				changeString = `shellArgs: ${argsString}`;
			}
			this._notificationService.prompt(Severity.Info, nls.localize('terminal.integrated.allowWorkspaceShell', "Do you allow {0} (defined as a workspace setting) to be launched in the terminal?", changeString),
				[{
					label: nls.localize('allow', "Allow"),
					run: () => this._storageService.store(IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY, true, StorageScope.WORKSPACE)
				},
				{
					label: nls.localize('disallow', "Disallow"),
					run: () => this._storageService.store(IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY, false, StorageScope.WORKSPACE)
				}]
			);
		}

		shell.executable = (isWorkspaceShellAllowed ? shellConfigValue.value : shellConfigValue.user) || shellConfigValue.default;
		shell.args = (isWorkspaceShellAllowed ? shellArgsConfigValue.value : shellArgsConfigValue.user) || shellArgsConfigValue.default;

		// Change Sysnative to System32 if the OS is Windows but NOT WoW64. It's
		// safe to assume that this was used by accident as Sysnative does not
		// exist and will break the terminal in non-WoW64 environments.
		if (platform.isWindows && !process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432') && process.env.windir) {
			const sysnativePath = path.join(process.env.windir, 'Sysnative').toLowerCase();
			if (shell.executable.toLowerCase().indexOf(sysnativePath) === 0) {
				shell.executable = path.join(process.env.windir, 'System32', shell.executable.substr(sysnativePath.length));
			}
		}

		// Convert / to \ on Windows for convenience
		if (platform.isWindows) {
			shell.executable = shell.executable.replace(/\//g, '\\');
		}
	}

	private _toInteger(source: any, minimum: number, maximum: number, fallback: number): number {
		let r = parseInt(source, 10);
		if (isNaN(r)) {
			return fallback;
		}
		if (typeof minimum === 'number') {
			r = Math.max(minimum, r);
		}
		if (typeof maximum === 'number') {
			r = Math.min(maximum, r);
		}
		return r;
	}
}
