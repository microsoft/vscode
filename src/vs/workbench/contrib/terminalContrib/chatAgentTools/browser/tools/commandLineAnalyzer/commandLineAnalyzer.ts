/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import type { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import type { OperatingSystem } from '../../../../../../../base/common/platform.js';
import type { ToolConfirmationAction } from '../../../../../chat/common/languageModelToolsService.js';
import type { ITerminalInstance } from '../../../../../terminal/browser/terminal.js';
import type { TreeSitterCommandParserLanguage } from '../../treeSitterCommandParser.js';

export interface ICommandLineAnalyzer extends IDisposable {
	analyze(options: ICommandLineAnalyzerOptions): Promise<ICommandLineAnalyzerResult>;
}

export interface ICommandLineAnalyzerOptions {
	commandLine: string;
	instance: ITerminalInstance | undefined;
	shell: string;
	os: OperatingSystem;
	treeSitterLanguage: TreeSitterCommandParserLanguage;
	terminalToolSessionId: string;
}

export interface ICommandLineAnalyzerResult {
	readonly isAutoApproveAllowed: boolean;
	readonly disclaimers?: readonly string[];
	readonly autoApproveInfo?: IMarkdownString;
	readonly customActions?: ToolConfirmationAction[];
}
