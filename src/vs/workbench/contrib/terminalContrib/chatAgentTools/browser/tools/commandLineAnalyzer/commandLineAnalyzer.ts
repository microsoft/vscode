/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { OperatingSystem } from '../../../../../../../base/common/platform.js';
import type { ITerminalInstance } from '../../../../../terminal/browser/terminal.js';
import type { TreeSitterCommandParserLanguage } from '../../treeSitterCommandParser.js';

export interface ICommandLineAnalyzer {
	analyze(options: ICommandLineAnalyzerOptions): Promise<ICommandLineAnalyzerResult>;
}

export interface ICommandLineAnalyzerOptions {
	commandLine: string;
	instance: ITerminalInstance | undefined;
	shell: string;
	os: OperatingSystem;
	treeSitterLanguage: TreeSitterCommandParserLanguage;
}

export interface ICommandLineAnalyzerResult {
	readonly isAutoApproveAllowed: boolean;
	readonly disclaimers: string[];
}
