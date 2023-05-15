/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from 'vs/base/common/collections';
import { PerformanceMark } from 'vs/base/common/performance';
import { isLinux, isMacintosh, isNative, isWeb, isWindows } from 'vs/base/common/platform';
import { URI, UriComponents, UriDto } from 'vs/base/common/uri';
import { ISandboxConfiguration } from 'vs/base/parts/sandbox/common/sandboxTypes';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { FileType } from 'vs/platform/files/common/files';
import { ILoggerResource, LogLevel } from 'vs/platform/log/common/log';
import { PolicyDefinition, PolicyValue } from 'vs/platform/policy/common/policy';
import { IPartsSplash } from 'vs/platform/theme/common/themeService';
import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IAnyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export const WindowMinimumSize = {
	WIDTH: 400,
	WIDTH_WITH_VERTICAL_PANEL: 600,
	HEIGHT: 270
};

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

	readonly forceProfile?: string;
	readonly forceTempProfile?: boolean;
}

export interface IAddFoldersRequest {
	readonly foldersToAdd: UriComponents[];
}

export interface IOpenedWindow {
	readonly id: number;
	readonly workspace?: IAnyWorkspaceIdentifier;
	readonly title: string;
	readonly filename?: string;
	readonly dirty: boolean;
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
	const titleBarStyle = getTitleBarStyle(configurationService);
	const menuBarVisibility = configurationService.getValue<MenuBarVisibility | 'default'>('window.menuBarVisibility');

	if (menuBarVisibility === 'default' || (titleBarStyle === 'native' && menuBarVisibility === 'compact') || (isMacintosh && isNative)) {
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
	readonly titleBarStyle: 'native' | 'custom';
	readonly autoDetectHighContrast: boolean;
	readonly autoDetectColorScheme: boolean;
	readonly menuBarVisibility: MenuBarVisibility;
	readonly newWindowDimensions: 'default' | 'inherit' | 'offset' | 'maximized' | 'fullscreen';
	readonly nativeTabs: boolean;
	readonly nativeFullScreen: boolean;
	readonly enableMenuBarMnemonics: boolean;
	readonly closeWhenEmpty: boolean;
	readonly clickThroughInactive: boolean;
}

export function getTitleBarStyle(configurationService: IConfigurationService): 'native' | 'custom' {
	if (isWeb) {
		return 'custom';
	}

	const configuration = configurationService.getValue<IWindowSettings | undefined>('window');
	if (configuration) {
		const useNativeTabs = isMacintosh && configuration.nativeTabs === true;
		if (useNativeTabs) {
			return 'native'; // native tabs on sierra do not work with custom title style
		}

		const useSimpleFullScreen = isMacintosh && configuration.nativeFullScreen === false;
		if (useSimpleFullScreen) {
			return 'native'; // simple fullscreen does not work well with custom title style (https://github.com/microsoft/vscode/issues/63291)
		}

		const style = configuration.titleBarStyle;
		if (style === 'native' || style === 'custom') {
			return style;
		}
	}

	return isLinux ? 'native' : 'custom'; // default to custom on all macOS and Windows
}

export function useWindowControlsOverlay(configurationService: IConfigurationService): boolean {
	if (!isWindows || isWeb) {
		return false; // only supported on a desktop Windows instance
	}

	if (getTitleBarStyle(configurationService) === 'native') {
		return false; // only supported when title bar is custom
	}

	const configuredUseWindowControlsOverlay = configurationService.getValue<boolean | undefined>('window.experimental.windowControlsOverlay.enabled');
	if (typeof configuredUseWindowControlsOverlay === 'boolean') {
		return configuredUseWindowControlsOverlay;
	}

	// Default to true.
	return true;
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
}

export interface INativeWindowConfiguration extends IWindowConfiguration, NativeParsedArgs, ISandboxConfiguration {
	mainPid: number;

	machineId: string;

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
