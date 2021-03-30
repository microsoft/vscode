/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import { EDITOR_FONT_DEFAULTS, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITerminalConfiguration, ITerminalFont, IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY, TERMINAL_CONFIG_SECTION, DEFAULT_LETTER_SPACING, DEFAULT_LINE_HEIGHT, MINIMUM_LETTER_SPACING, LinuxDistro, MINIMUM_FONT_WEIGHT, MAXIMUM_FONT_WEIGHT, DEFAULT_FONT_WEIGHT, DEFAULT_BOLD_FONT_WEIGHT, FontWeight, ITerminalProfile } from 'vs/workbench/contrib/terminal/common/terminal';
import Severity from 'vs/base/common/severity';
import { INotificationService, NeverShowAgainScope } from 'vs/platform/notification/common/notification';
import { IBrowserTerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminal';
import { Emitter, Event } from 'vs/base/common/event';
import { basename } from 'vs/base/common/path';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstallRecommendedExtensionAction } from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import { IProductService } from 'vs/platform/product/common/productService';
import { XTermCore } from 'vs/workbench/contrib/terminal/browser/xterm-private';
import { IShellLaunchConfig } from 'vs/platform/terminal/common/terminal';

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
	private _linuxDistro: LinuxDistro = LinuxDistro.Unknown;
	public config!: ITerminalConfiguration;

	private readonly _onWorkspacePermissionsChanged = new Emitter<boolean>();
	public get onWorkspacePermissionsChanged(): Event<boolean> { return this._onWorkspacePermissionsChanged.event; }

	private readonly _onConfigChanged = new Emitter<void>();
	public get onConfigChanged(): Event<void> { return this._onConfigChanged.event; }

	public constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExtensionManagementService private readonly _extensionManagementService: IExtensionManagementService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
	) {
		this._updateConfig();
		this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TERMINAL_CONFIG_SECTION)) {
				this._updateConfig();
			}
		});
	}

	public setLinuxDistro(linuxDistro: LinuxDistro) {
		this._linuxDistro = linuxDistro;
	}

	private _updateConfig(): void {
		const configValues = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION);
		configValues.fontWeight = this._normalizeFontWeight(configValues.fontWeight, DEFAULT_FONT_WEIGHT);
		configValues.fontWeightBold = this._normalizeFontWeight(configValues.fontWeightBold, DEFAULT_BOLD_FONT_WEIGHT);

		this.config = configValues;
		this._onConfigChanged.fire();
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
			charWidth: 0,
			charHeight: 0
		};

		if (rect && rect.width && rect.height) {
			this._lastFontMeasurement.charHeight = Math.ceil(rect.height);
			// Char width is calculated differently for DOM and the other renderer types. Refer to
			// how each renderer updates their dimensions in xterm.js
			if (this.config.gpuAcceleration === 'off') {
				this._lastFontMeasurement.charWidth = rect.width;
			} else {
				const scaledCharWidth = Math.floor(rect.width * window.devicePixelRatio);
				const scaledCellWidth = scaledCharWidth + Math.round(letterSpacing);
				const actualCellWidth = scaledCellWidth / window.devicePixelRatio;
				this._lastFontMeasurement.charWidth = actualCellWidth - Math.round(letterSpacing) / window.devicePixelRatio;
			}
		}

		return this._lastFontMeasurement;
	}

	/**
	 * Gets the font information based on the terminal.integrated.fontFamily
	 * terminal.integrated.fontSize, terminal.integrated.lineHeight configuration properties
	 */
	public getFont(xtermCore?: XTermCore, excludeDimensions?: boolean): ITerminalFont {
		const editorConfig = this._configurationService.getValue<IEditorOptions>('editor');

		let fontFamily = this.config.fontFamily || editorConfig.fontFamily || EDITOR_FONT_DEFAULTS.fontFamily;
		let fontSize = this._clampInt(this.config.fontSize, MINIMUM_FONT_SIZE, MAXIMUM_FONT_SIZE, EDITOR_FONT_DEFAULTS.fontSize);

		// Work around bad font on Fedora/Ubuntu
		if (!this.config.fontFamily) {
			if (this._linuxDistro === LinuxDistro.Fedora) {
				fontFamily = '\'DejaVu Sans Mono\', monospace';
			}
			if (this._linuxDistro === LinuxDistro.Ubuntu) {
				fontFamily = '\'Ubuntu Mono\', monospace';

				// Ubuntu mono is somehow smaller, so set fontSize a bit larger to get the same perceived size.
				fontSize = this._clampInt(fontSize + 2, MINIMUM_FONT_SIZE, MAXIMUM_FONT_SIZE, EDITOR_FONT_DEFAULTS.fontSize);
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
		if (xtermCore) {
			if (xtermCore._renderService && xtermCore._renderService.dimensions?.actualCellWidth && xtermCore._renderService.dimensions?.actualCellHeight) {
				return {
					fontFamily,
					fontSize,
					letterSpacing,
					lineHeight,
					charHeight: xtermCore._renderService.dimensions.actualCellHeight / lineHeight,
					charWidth: xtermCore._renderService.dimensions.actualCellWidth - Math.round(letterSpacing) / window.devicePixelRatio
				};
			}
		}

		// Fall back to measuring the font ourselves
		return this._measureFont(fontFamily, fontSize, letterSpacing, lineHeight);
	}

	public setWorkspaceShellAllowed(isAllowed: boolean): void {
		this._onWorkspacePermissionsChanged.fire(isAllowed);
		this._storageService.store(IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY, isAllowed, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	public isWorkspaceShellAllowed(defaultValue: boolean | undefined = undefined): boolean | undefined {
		return this._storageService.getBoolean(IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY, StorageScope.WORKSPACE, defaultValue);
	}

	public checkIsProcessLaunchSafe(osOverride: platform.OperatingSystem = platform.OS, profile?: ITerminalProfile): boolean {
		// Check whether there is a workspace setting
		const platformKey = osOverride === platform.OperatingSystem.Windows ? 'windows' : osOverride === platform.OperatingSystem.Macintosh ? 'osx' : 'linux';
		const shellConfigValue = this._configurationService.inspect<string>(`terminal.integrated.shell.${platformKey}`);
		const shellArgsConfigValue = this._configurationService.inspect<string[]>(`terminal.integrated.shellArgs.${platformKey}`);
		const envConfigValue = this._configurationService.inspect<{ [key: string]: string }>(`terminal.integrated.env.${platformKey}`);

		// Check if the workspace terminals are allowed:
		// - undefined: Unknown - always ask
		// - false: Disallowed - never ask
		// - true: Allowed - never ask
		let isTerminalLaunchSafe: boolean | undefined = false;

		// Check whether the shell is defined in workspace settings
		const workspaceDefinedShell = profile?.isWorkspaceProfile ? profile.path : shellConfigValue.workspaceValue;

		// Check whether the shell args is defined in workspace settings
		let workspaceDefinedShellArgs = profile?.isWorkspaceProfile ? profile.args : shellArgsConfigValue.workspaceValue;
		if (typeof workspaceDefinedShellArgs === 'string') {
			workspaceDefinedShellArgs = [workspaceDefinedShellArgs];
		}

		// Check whether the environment is defined in workspace settings
		const workspaceDefinedEnv = envConfigValue.workspaceValue;

		// Return safe if no workspace settings are used
		if (
			workspaceDefinedShell === undefined &&
			workspaceDefinedShellArgs === undefined &&
			workspaceDefinedEnv === undefined
		) {
			return true;
		}

		// Check whether the user has already been prompted about this workspace's permissions
		isTerminalLaunchSafe = this.isWorkspaceShellAllowed(undefined);

		// If the user has already answered, return the response
		if (isTerminalLaunchSafe !== undefined) {
			return isTerminalLaunchSafe;
		}

		// Format string message for workspace settings, note that this is not localized because
		// they reference settings keys
		const shellString = workspaceDefinedShell ? `shell: "${workspaceDefinedShell}"` : undefined;
		const argsString = workspaceDefinedShellArgs ? `shellArgs: [${workspaceDefinedShellArgs.map(v => '"' + v + '"').join(', ')}]` : undefined;
		const envString = workspaceDefinedEnv ? `env: {${Object.keys(workspaceDefinedEnv).map(k => `${k}:${workspaceDefinedEnv![k]}`).join(', ')}}` : undefined;
		const workspaceConfigStrings: string[] = [];
		if (shellString) { workspaceConfigStrings.push(shellString); }
		if (argsString) { workspaceConfigStrings.push(argsString); }
		if (envString) { workspaceConfigStrings.push(envString); }
		const workspaceConfigString = workspaceConfigStrings.join(', ');

		// Ask the user's permissions whether to allow or disallow this workspace and remember their
		// selection
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

		// TODO: We should await this instead when trusted workspaces modal is adopted
		// Always return false when asking, since we don't await the notification
		return false;
	}

	private _clampInt<T>(source: any, minimum: number, maximum: number, fallback: T): number | T {
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
			const exeBasedExtensionTips = this.productService.exeBasedExtensionTips;
			if (!exeBasedExtensionTips || !exeBasedExtensionTips.wsl) {
				return;
			}
			const extId = Object.keys(exeBasedExtensionTips.wsl.recommendations).find(extId => exeBasedExtensionTips.wsl.recommendations[extId].important);
			if (extId && ! await this.isExtensionInstalled(extId)) {
				this._notificationService.prompt(
					Severity.Info,
					nls.localize(
						'useWslExtension.title', "The '{0}' extension is recommended for opening a terminal in WSL.", exeBasedExtensionTips.wsl.friendlyName),
					[
						{
							label: nls.localize('install', 'Install'),
							run: () => {
								/* __GDPR__
								"terminalLaunchRecommendation:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
									"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
								}
								*/
								this.telemetryService.publicLog('terminalLaunchRecommendation:popup', { userReaction: 'install', extId });
								this.instantiationService.createInstance(InstallRecommendedExtensionAction, extId).run();
							}
						}
					],
					{
						sticky: true,
						neverShowAgain: { id: 'terminalConfigHelper/launchRecommendationsIgnore', scope: NeverShowAgainScope.GLOBAL },
						onCancel: () => {
							/* __GDPR__
								"terminalLaunchRecommendation:popup" : {
									"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
								}
							*/
							this.telemetryService.publicLog('terminalLaunchRecommendation:popup', { userReaction: 'cancelled' });
						}
					}
				);
			}
		}
	}

	private async isExtensionInstalled(id: string): Promise<boolean> {
		const extensions = await this._extensionManagementService.getInstalled();
		return extensions.some(e => e.identifier.id === id);
	}

	private _normalizeFontWeight(input: any, defaultWeight: FontWeight): FontWeight {
		if (input === 'normal' || input === 'bold') {
			return input;
		}
		return this._clampInt(input, MINIMUM_FONT_WEIGHT, MAXIMUM_FONT_WEIGHT, defaultWeight);
	}
}
