/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import { EDITOR_FONT_DEFAULTS, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITerminalConfiguration, ITerminalFont, IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY, TERMINAL_CONFIG_SECTION, DEFAULT_LETTER_SPACING, DEFAULT_LINE_HEIGHT, MINIMUM_LETTER_SPACING, LinuxDistro, IShellLaunchConfig } from 'vs/workbench/contrib/terminal/common/terminal';
import Severity from 'vs/base/common/severity';
import { Terminal as XTermTerminal } from 'xterm';
import { INotificationService, NeverShowAgainScope } from 'vs/platform/notification/common/notification';
import { IBrowserTerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminal';
import { Emitter, Event } from 'vs/base/common/event';
import { basename } from 'vs/base/common/path';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';

const MINIMUM_FONT_SIZE = 6;
const MAXIMUM_FONT_SIZE = 25;

/**
 * Encapsulates terminal configuration logic, the primary purpose of this file is so that platform
 * specific test cases can be written.
 */
export class TerminalConfigHelper implements IBrowserTerminalConfigHelper {
	public panelContainer: HTMLElement | undefined;

	private _charMeasureElement: HTMLElement | undefined;
	private _lastFontMeasurement: ITerminalFont | undefined;
	public config!: ITerminalConfiguration;

	private readonly _onWorkspacePermissionsChanged = new Emitter<boolean>();
	public get onWorkspacePermissionsChanged(): Event<boolean> { return this._onWorkspacePermissionsChanged.event; }

	public constructor(
		private readonly _linuxDistro: LinuxDistro,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExtensionManagementService private readonly _extensionManagementService: IExtensionManagementService,
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
		const fontSize = 15;
		const fontFamily = this.config.fontFamily || this._configurationService.getValue<IEditorOptions>('editor').fontFamily || EDITOR_FONT_DEFAULTS.fontFamily;
		const i_rect = this._getBoundingRectFor('i', fontFamily, fontSize);
		const w_rect = this._getBoundingRectFor('w', fontFamily, fontSize);

		// Check for invalid bounds, there is no reason to believe the font is not monospace
		if (!i_rect || !w_rect || !i_rect.width || !w_rect.width) {
			return true;
		}

		return i_rect.width === w_rect.width;
	}

	private _createCharMeasureElementIfNecessary(): HTMLElement {
		if (!this.panelContainer) {
			throw new Error('Cannot measure element when terminal is not attached');
		}
		// Create charMeasureElement if it hasn't been created or if it was orphaned by its parent
		if (!this._charMeasureElement || !this._charMeasureElement.parentElement) {
			this._charMeasureElement = document.createElement('div');
			this.panelContainer.appendChild(this._charMeasureElement);
		}
		return this._charMeasureElement;
	}

	private _getBoundingRectFor(char: string, fontFamily: string, fontSize: number): ClientRect | DOMRect | undefined {
		let charMeasureElement: HTMLElement;
		try {
			charMeasureElement = this._createCharMeasureElementIfNecessary();
		} catch {
			return undefined;
		}
		const style = charMeasureElement.style;
		style.display = 'inline-block';
		style.fontFamily = fontFamily;
		style.fontSize = fontSize + 'px';
		style.lineHeight = 'normal';
		charMeasureElement.innerText = char;
		const rect = charMeasureElement.getBoundingClientRect();
		style.display = 'none';

		return rect;
	}

	private _measureFont(fontFamily: string, fontSize: number, letterSpacing: number, lineHeight: number): ITerminalFont {
		const rect = this._getBoundingRectFor('X', fontFamily, fontSize);

		// Bounding client rect was invalid, use last font measurement if available.
		if (this._lastFontMeasurement && (!rect || !rect.width || !rect.height)) {
			return this._lastFontMeasurement;
		}

		this._lastFontMeasurement = {
			fontFamily,
			fontSize,
			letterSpacing,
			lineHeight,
			charWidth: rect && rect.width ? rect.width : 0,
			charHeight: rect && rect.height ? Math.ceil(rect.height) : 0
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
			if (this._linuxDistro === LinuxDistro.Fedora) {
				fontFamily = '\'DejaVu Sans Mono\', monospace';
			}
			if (this._linuxDistro === LinuxDistro.Ubuntu) {
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
			if (xterm._core._charSizeService && xterm._core._charSizeService.width && xterm._core._charSizeService.height) {
				return {
					fontFamily,
					fontSize,
					letterSpacing,
					lineHeight,
					charHeight: xterm._core._charSizeService.height,
					charWidth: xterm._core._charSizeService.width
				};
			}
		}

		// Fall back to measuring the font ourselves
		return this._measureFont(fontFamily, fontSize, letterSpacing, lineHeight);
	}

	public setWorkspaceShellAllowed(isAllowed: boolean): void {
		this._onWorkspacePermissionsChanged.fire(isAllowed);
		this._storageService.store(IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY, isAllowed, StorageScope.WORKSPACE);
	}

	public isWorkspaceShellAllowed(defaultValue: boolean | undefined = undefined): boolean | undefined {
		return this._storageService.getBoolean(IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY, StorageScope.WORKSPACE, defaultValue);
	}

	public checkWorkspaceShellPermissions(osOverride: platform.OperatingSystem = platform.OS): boolean {
		// Check whether there is a workspace setting
		const platformKey = osOverride === platform.OperatingSystem.Windows ? 'windows' : osOverride === platform.OperatingSystem.Macintosh ? 'osx' : 'linux';
		const shellConfigValue = this._configurationService.inspect<string>(`terminal.integrated.shell.${platformKey}`);
		const shellArgsConfigValue = this._configurationService.inspect<string[]>(`terminal.integrated.shellArgs.${platformKey}`);
		const envConfigValue = this._configurationService.inspect<{ [key: string]: string }>(`terminal.integrated.env.${platformKey}`);

		// Check if workspace setting exists and whether it's whitelisted
		let isWorkspaceShellAllowed: boolean | undefined = false;
		if (shellConfigValue.workspace !== undefined || shellArgsConfigValue.workspace !== undefined || envConfigValue.workspace !== undefined) {
			isWorkspaceShellAllowed = this.isWorkspaceShellAllowed(undefined);
		}

		// Always allow [] args as it would lead to an odd error message and should not be dangerous
		if (shellConfigValue.workspace === undefined && envConfigValue.workspace === undefined &&
			shellArgsConfigValue.workspace && shellArgsConfigValue.workspace.length === 0) {
			isWorkspaceShellAllowed = true;
		}

		// Check if the value is neither blacklisted (false) or whitelisted (true) and ask for
		// permission
		if (isWorkspaceShellAllowed === undefined) {
			let shellString: string | undefined;
			if (shellConfigValue.workspace) {
				shellString = `shell: "${shellConfigValue.workspace}"`;
			}
			let argsString: string | undefined;
			if (shellArgsConfigValue.workspace) {
				argsString = `shellArgs: [${shellArgsConfigValue.workspace.map(v => '"' + v + '"').join(', ')}]`;
			}
			let envString: string | undefined;
			if (envConfigValue.workspace) {
				envString = `env: {${Object.keys(envConfigValue.workspace).map(k => `${k}:${envConfigValue.workspace![k]}`).join(', ')}}`;
			}
			// Should not be localized as it's json-like syntax referencing settings keys
			const workspaceConfigStrings: string[] = [];
			if (shellString) {
				workspaceConfigStrings.push(shellString);
			}
			if (argsString) {
				workspaceConfigStrings.push(argsString);
			}
			if (envString) {
				workspaceConfigStrings.push(envString);
			}
			const workspaceConfigString = workspaceConfigStrings.join(', ');
			this._notificationService.prompt(Severity.Info, nls.localize('terminal.integrated.allowWorkspaceShell', "Do you allow this workspace to modify your terminal shell? {0}", workspaceConfigString),
				[{
					label: nls.localize('allow', "Allow"),
					run: () => this.setWorkspaceShellAllowed(true)
				},
				{
					label: nls.localize('disallow', "Disallow"),
					run: () => this.setWorkspaceShellAllowed(false)
				}]
			);
		}
		return !!isWorkspaceShellAllowed;
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

	private recommendationsShown = false;

	public async showRecommendations(shellLaunchConfig: IShellLaunchConfig): Promise<void> {
		if (this.recommendationsShown) {
			return;
		}
		this.recommendationsShown = true;

		if (platform.isWindows && shellLaunchConfig.executable && basename(shellLaunchConfig.executable).toLowerCase() === 'wsl.exe') {
			if (! await this.isExtensionInstalled('ms-vscode-remote.remote-wsl')) {
				this._notificationService.prompt(
					Severity.Info,
					nls.localize(
						'useWslExtension.title',
						"Check out the 'Visual Studio Code Remote - WSL' extension for a great development experience in WSL. Click [here]({0}) to learn more.",
						'https://go.microsoft.com/fwlink/?linkid=2097212'
					),
					[],
					{
						sticky: true,
						neverShowAgain: { id: 'terminalConfigHelper/launchRecommendationsIgnore', scope: NeverShowAgainScope.WORKSPACE }
					}
				);
			}
		}
	}

	private isExtensionInstalled(id: string): Promise<boolean> {
		return this._extensionManagementService.getInstalled(ExtensionType.User).then(extensions => {
			return extensions.some(e => e.identifier.id === id);
		});
	}
}
