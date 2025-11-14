/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MaybePromise } from '../../../../../../../base/common/async.js';
import type { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import type { OperatingSystem } from '../../../../../../../base/common/platform.js';
import type { URI } from '../../../../../../../base/common/uri.js';

export interface ICommandLineRewriter extends IDisposable {
	rewrite(options: ICommandLineRewriterOptions): MaybePromise<ICommandLineRewriterResult | undefined>;
}

export interface ICommandLineRewriterOptions {
	commandLine: string;
	cwd: URI | undefined;
	shell: string;
	os: OperatingSystem;
}

export interface ICommandLineRewriterResult {
	rewritten: string;
	reasoning: string;
}
