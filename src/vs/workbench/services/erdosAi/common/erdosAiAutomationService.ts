/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IErdosAiAutomationService = createDecorator<IErdosAiAutomationService>('erdosAiAutomationService');

export interface IErdosAiAutomationService {
	readonly _serviceBrand: undefined;

	getAutoAcceptEdits(): Promise<boolean>;
	setAutoAcceptEdits(enabled: boolean): Promise<boolean>;
	getAutoAcceptConsole(): Promise<boolean>;
	setAutoAcceptConsole(enabled: boolean): Promise<boolean>;
	getAutoRunFiles(): Promise<boolean>;
	setAutoRunFiles(enabled: boolean): Promise<boolean>;
	getAutoDeleteFiles(): Promise<boolean>;
	setAutoDeleteFiles(enabled: boolean): Promise<boolean>;
	getAutoRunFilesAllowAnything(): Promise<boolean>;
	setAutoRunFilesAllowAnything(enabled: boolean): Promise<boolean>;
	getAutoDeleteFilesAllowAnything(): Promise<boolean>;
	setAutoDeleteFilesAllowAnything(enabled: boolean): Promise<boolean>;
	getRunFilesAutomationList(): Promise<string[]>;
	setRunFilesAutomationList(files: string[]): Promise<boolean>;
	getDeleteFilesAutomationList(): Promise<string[]>;
	setDeleteFilesAutomationList(files: string[]): Promise<boolean>;
}
