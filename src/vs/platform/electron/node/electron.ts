/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageBoxOptions, MessageBoxReturnValue, OpenDevToolsOptions, SaveDialogOptions, OpenDialogOptions, OpenDialogReturnValue, SaveDialogReturnValue } from 'electron';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { INativeOpenDialogOptions } from 'vs/platform/windows/common/windows';

export const IElectronService = createDecorator<IElectronService>('electronService');

export interface IElectronService {

	_serviceBrand: undefined;

	// Window
	windowCount(): Promise<number>;
	openEmptyWindow(options?: { reuse?: boolean, remoteAuthority?: string }): Promise<void>;
	toggleFullScreen(): Promise<void>;
	handleTitleDoubleClick(): Promise<void>;

	// Dialogs
	showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue>;
	showSaveDialog(options: SaveDialogOptions): Promise<SaveDialogReturnValue>;
	showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>;

	pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void>;

	// OS
	showItemInFolder(path: string): Promise<void>;
	setRepresentedFilename(path: string): Promise<void>;
	setDocumentEdited(edited: boolean): Promise<void>;

	// Lifecycle
	relaunch(options?: { addArgs?: string[], removeArgs?: string[] }): Promise<void>;
	reload(): Promise<void>;
	closeWorkpsace(): Promise<void>;
	quit(): Promise<void>;

	// Development
	openDevTools(options?: OpenDevToolsOptions): Promise<void>;
	toggleDevTools(): Promise<void>;

	// Connectivity
	resolveProxy(url: string): Promise<string | undefined>;
}
