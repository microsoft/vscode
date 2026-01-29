/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IOutputAnalyzerOptions {
	readonly exitCode: number | undefined;
	readonly exitResult: string;
	readonly commandLine: string;
}

export interface IOutputAnalyzer {
	analyze(options: IOutputAnalyzerOptions): Promise<string | undefined>;
}
