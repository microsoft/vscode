/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';

export interface IOutputAnalyzerOptions {
	readonly exitCode: number | undefined;
	readonly exitResult: string;
	readonly commandLine: string;
	readonly chatSessionResource: URI | undefined;
	readonly chatRequestId: string | undefined;
	readonly token: CancellationToken;
}

export interface IOutputAnalyzer {
	analyze(options: IOutputAnalyzerOptions): Promise<string | undefined>;
}
