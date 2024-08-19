/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from 'vs/base/common/collections';
import { PerformanceMark } from 'vs/base/common/performance';
import { isLinux, isMacintosh, isNative, isWeb } from 'vs/base/common/platform';
import { URI, UriComponents, UriDto } from 'vs/base/common/uri';
import { ISandboxConfiguration } from 'vs/base/parts/sandbox/common/sandboxTypes';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { FileType } from 'vs/platform/files/common/files';
import { ILoggerResource, LogLevel } from 'vs/platform/log/common/log';
import { PolicyDefinition, PolicyValue } from 'vs/platform/policy/common/policy';
import product from 'vs/platform/product/common/product';
import { IPartsSplash } from 'vs/platform/theme/common/themeService';
import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IAnyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export const WindowMinimumSize = {
	WIDTH: 400,
	WIDTH_WITH_VERTICAL_PANEL: 600,
	HEIGHT: 270
};

export interface IPoint {
	readonly x: number;
	readonly y: number;
}

export interface IRectangle extends IPoint {
	readonly width: number;
	readonly height: number;
}

export interface IBaseOpenWindowsOptions {

	/**
	 * Whether to reuse the window or open a new one.
	 */
	readonly forceReuseWindow?: boolean;

	/**
	 * The remote authority to use when windows are opened with either
	 * - no workspace (empty window)
	 * - a workspace that is neither `file://` nor `vscode-remote://`
	 * Use 'null' for a local window.
	 * If not set, defaults to the remote authority of the current window.
	 */
	readonly remoteAuthority?: string | null;

	readonly forceProfile?: string;
	readonly forceTempProfile?: boolean;
}

export interface IOpenWindowOptions extends IBaseOpenWindowsOptions {
	readonly forceNewWindow?: boolean;
	readonly preferNewWindow?: boolean;

	readonly noRecentEntry?: boolean;

	readonly addMode?: boolean;

	readonly diffMode?: boolean;
	readonly mergeMode?: boolean;
	readonly gotoLineMode?: boolean;

	readonly waitMarkerFileURI?: URI;
}

export interface IAddFoldersRequest {
	readonly foldersToAdd: UriComponents[];
}

interface IOpenedWindow {
	readonly id: number;
	readonly title: string;
	readonly filename?: string;
}

export interface IOpenedMainWindow extends IOpenedWindow {
	readonly workspace?: IAnyWorkspaceIdentifier;
	readonly dirty: boolean;
}

export interface IOpenedAuxiliaryWindow extends IOpenedWindow {
	readonly parentId: number;
}

export function isOpenedAuxiliaryWindow(candidate: IOpenedMainWindow | IOpenedAuxiliaryWindow): candidate is IOpenedAuxiliaryWindow {
	return typeof (candidate as IOpenedAuxiliaryWindow).parentId === 'number';
}

export interface IOpenEmptyWindowOptions extends IBaseOpenWindowsOptions { }

export type IWindowOpenable = IWorkspaceToOpen | IFolderToOpen | IFileToOpen;

export interface IBaseWindowOpenable {
	label?: string;
}

export interface IWorkspaceToOpen extends IBaseWindowOpenable {
	readonly workspaceUri: URI;
}

export interface IFolderToOpen extends IBaseWindowOpenable {
	readonly folderUri: URI;
}

export interface IFileToOpen extends IBaseWindowOpenable {
	readonly fileUri: URI;
}

export function isWorkspaceToOpen(uriToOpen: IWindowOpenable): uriToOpen is IWorkspaceToOpen {
	return !!(uriToOpen as IWorkspaceToOpen).workspaceUri;
}

export function isFolderToOpen(uriToOpen: IWindowOpenable): uriToOpen is IFolderToOpen {
	return !!(uriToOpen as IFolderToOpen).folderUri;
}

export function isFileToOpen(uriToOpen: IWindowOpenable): uriToOpen is IFileToOpen {
	return !!(uriToOpen as IFileToOpen).fileUri;
}

export type MenuBarVisibility = 'classic' | 'visible' | 'toggle' | 'hidden' | 'compact';

export function getMenuBarVisibility(configurationService: IConfigurationService): MenuBarVisibility {
	const nativeTitleBarEnabled = hasNativeTitlebar(configurationService);
	const menuBarVisibility = configurationService.getValue<MenuBarVisibility | 'default'>('window.menuBarVisibility');

	if (menuBarVisibility === 'default' || (nativeTitleBarEnabled && menuBarVisibility === 'compact') || (isMacintosh && isNative)) {
		return 'classic';
	} else {
		return menuBarVisibility;
	}
}

export interface IWindowsConfiguration {
	readonly window: IWindowSettings;
}

export interface IWindowSettings {
	readonly openFilesInNewWindow: 'on' | 'off' | 'default';
	readonly openFoldersInNewWindow: 'on' | 'off' | 'default';
	readonly openWithoutArgumentsInNewWindow: 'on' | 'off';
	readonly restoreWindows: 'preserve' | 'all' | 'folders' | 'one' | 'none';
	readonly restoreFullscreen: boolean;
	readonly zoomLevel: number;
	readonly titleBarStyle: TitlebarStyle;
	readonly autoDetectHighContrast: boolean;
	readonly autoDetectColorScheme: boolean;
	readonly menuBarVisibility: MenuBarVisibility;
	readonly newWindowDimensions: 'default' | 'inherit' | 'offset' | 'maximized' | 'fullscreen';
	readonly nativeTabs: boolean;
	readonly nativeFullScreen: boolean;
	readonly enableMenuBarMnemonics: boolean;
	readonly closeWhenEmpty: boolean;
	readonly clickThroughInactive: boolean;
	readonly newWindowProfile: string;
	readonly density: IDensitySettings;
	readonly experimentalControlOverlay?: boolean;
}

export interface IDensitySettings {
	readonly editorTabHeight: 'default' | 'compact';
}

export const enum TitleBarSetting {
	TITLE_BAR_STYLE = 'window.titleBarStyle',
	CUSTOM_TITLE_BAR_VISIBILITY = 'window.customTitleBarVisibility',
}

export const enum TitlebarStyle {
	NATIVE = 'native',
	CUSTOM = 'custom',
}

export const enum CustomTitleBarVisibility {
	AUTO = 'auto',
	WINDOWED = 'windowed',
	NEVER = 'never',
}

export function hasCustomTitlebar(configurationService: IConfigurationService, titleBarStyle?: TitlebarStyle): boolean {
	// Returns if it possible to have a custom title bar in the curren session
	// Does not imply that the title bar is visible

	return true;
}

export function hasNativeTitlebar(configurationService: IConfigurationService, titleBarStyle?: TitlebarStyle): boolean {
	if (!titleBarStyle) {
		titleBarStyle = getTitleBarStyle(configurationService);
	}
	return titleBarStyle === TitlebarStyle.NATIVE;
}

export function getTitleBarStyle(configurationService: IConfigurationService): TitlebarStyle {
	if (isWeb) {
		return TitlebarStyle.CUSTOM;
	}

	const configuration = configurationService.getValue<IWindowSettings | undefined>('window');
	if (configuration) {
		const useNativeTabs = isMacintosh && configuration.nativeTabs === true;
		if (useNativeTabs) {
			return TitlebarStyle.NATIVE; // native tabs on sierra do not work with custom title style
		}

		const useSimpleFullScreen = isMacintosh && configuration.nativeFullScreen === false;
		if (useSimpleFullScreen) {
			return TitlebarStyle.NATIVE; // simple fullscreen does not work well with custom title style (https://github.com/microsoft/vscode/issues/63291)
		}

		const style = configuration.titleBarStyle;
		if (style === TitlebarStyle.NATIVE || style === TitlebarStyle.CUSTOM) {
			return style;
		}
	}

	return isLinux ? TitlebarStyle.NATIVE : TitlebarStyle.CUSTOM; // default to custom on all macOS and Windows
}

export const DEFAULT_CUSTOM_TITLEBAR_HEIGHT = 35; // includes space for command center

export function useWindowControlsOverlay(configurationService: IConfigurationService): boolean {
	if (isMacintosh || isWeb) {
		return false; // only supported on a Windows/Linux desktop instances
	}

	if (hasNativeTitlebar(configurationService)) {
		return false; // only supported when title bar is custom
	}

	if (isLinux) {
		const setting = configurationService.getValue('window.experimentalControlOverlay');
		if (typeof setting === 'boolean') {
			return setting;
		}

		return product.quality !== 'stable'; // disable by default in stable for now (TODO@bpasero TODO@benibenj flip when custom title is default)
	}

	// Default to true.
	return true;
}

export function useNativeFullScreen(configurationService: IConfigurationService): boolean {
	const windowConfig = configurationService.getValue<IWindowSettings | undefined>('window');
	if (!windowConfig || typeof windowConfig.nativeFullScreen !== 'boolean') {
		return true; // default
	}

	if (windowConfig.nativeTabs) {
		return true; // https://github.com/electron/electron/issues/16142
	}

	return windowConfig.nativeFullScreen !== false;
}


export interface IPath<T = IEditorOptions> extends IPathData<T> {

	/**
	 * The file path to open within the instance
	 */
	fileUri?: URI;
}

export interface IPathData<T = IEditorOptions> {

	/**
	 * The file path to open within the instance
	 */
	readonly fileUri?: UriComponents;

	/**
	 * Optional editor options to apply in the file
	 */
	readonly options?: T;

	/**
	 * A hint that the file exists. if true, the
	 * file exists, if false it does not. with
	 * `undefined` the state is unknown.
	 */
	readonly exists?: boolean;

	/**
	 * A hint about the file type of this path.
	 * with `undefined` the type is unknown.
	 */
	readonly type?: FileType;

	/**
	 * Specifies if the file should be only be opened
	 * if it exists.
	 */
	readonly openOnlyIfExists?: boolean;
}

export interface IPathsToWaitFor extends IPathsToWaitForData {
	paths: IPath[];
	waitMarkerFileUri: URI;
}

interface IPathsToWaitForData {
	readonly paths: IPathData[];
	readonly waitMarkerFileUri: UriComponents;
}

export interface IOpenFileRequest {
	readonly filesToOpenOrCreate?: IPathData[];
	readonly filesToDiff?: IPathData[];
	readonly filesToMerge?: IPathData[];
}

/**
 * Additional context for the request on native only.
 */
export interface INativeOpenFileRequest extends IOpenFileRequest {
	readonly termProgram?: string;
	readonly filesToWait?: IPathsToWaitForData;
}

export interface INativeRunActionInWindowRequest {
	readonly id: string;
	readonly from: 'menu' | 'touchbar' | 'mouse';
	readonly args?: any[];
}

export interface INativeRunKeybindingInWindowRequest {
	readonly userSettingsLabel: string;
}

export interface IColorScheme {
	readonly dark: boolean;
	readonly highContrast: boolean;
}

export interface IWindowConfiguration {
	remoteAuthority?: string;

	filesToOpenOrCreate?: IPath[];
	filesToDiff?: IPath[];
	filesToMerge?: IPath[];
}

export interface IOSConfiguration {
	readonly release: string;
	readonly hostname: string;
	readonly arch: string;
}

export interface INativeWindowConfiguration extends IWindowConfiguration, NativeParsedArgs, ISandboxConfiguration {
	mainPid: number;

	machineId: string;
	sqmId: string;
	devDeviceId: string;

	execPath: string;
	backupPath?: string;

	profiles: {
		home: UriComponents;
		all: readonly UriDto<IUserDataProfile>[];
		profile: UriDto<IUserDataProfile>;
	};

	homeDir: string;
	tmpDir: string;
	userDataDir: string;

	partsSplash?: IPartsSplash;

	workspace?: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier;

	isInitialStartup?: boolean;
	logLevel: LogLevel;
	loggers: {
		global: UriDto<ILoggerResource>[];
		window: UriDto<ILoggerResource>[];
	};

	fullscreen?: boolean;
	maximized?: boolean;
	accessibilitySupport?: boolean;
	colorScheme: IColorScheme;
	autoDetectHighContrast?: boolean;
	autoDetectColorScheme?: boolean;
	isCustomZoomLevel?: boolean;

	perfMarks: PerformanceMark[];

	filesToWait?: IPathsToWaitFor;

	os: IOSConfiguration;
	policiesData?: IStringDictionary<{ definition: PolicyDefinition; value: PolicyValue }>;
}

/**
 * According to Electron docs: `scale := 1.2 ^ level`.
 * https://github.com/electron/electron/blob/master/docs/api/web-contents.md#contentssetzoomlevellevel
 */
export function zoomLevelToZoomFactor(zoomLevel = 0): number {
	return Math.pow(1.2, zoomLevel);
}
