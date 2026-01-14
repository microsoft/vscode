/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../../../base/common/platform.js';
import type { ICommandLineRewriter, ICommandLineRewriterOptions, ICommandLineRewriterResult } from './commandLineRewriter.js';

/**
 * Rewriter that detects and removes the `timeout` command prefix, extracting the timeout value
 * to be handled by the tool's built-in timeout mechanism. This handles cases where models suggest
 * using `timeout <seconds> <command>` which doesn't work well with auto-approve and may not be
 * available on all systems.
 *
 * Supported patterns:
 * - Unix/Linux: `timeout <seconds> <command>` or `timeout <seconds>s <command>`
 * - Windows: Not directly supported as Windows doesn't have a standard timeout command for this use case
 */
export class CommandLineTimeoutRewriter extends Disposable implements ICommandLineRewriter {
	rewrite(options: ICommandLineRewriterOptions): ICommandLineRewriterResult | undefined {
		// Windows doesn't have a standard timeout command in the same way Unix/Linux does
		// The Windows `timeout` command is for delays, not for limiting command execution
		if (options.os === OperatingSystem.Windows) {
			return undefined;
		}

		// Match patterns like:
		// - timeout 10 npm test
		// - timeout 10s npm test
		// - timeout --signal=KILL 10 npm test
		// - timeout -s KILL 10s npm test
		const timeoutMatch = options.commandLine.match(/^timeout(?:\s+(?:-s|--signal)(?:=|\s+)\S+)?\s+(\d+)s?\s+(.+)$/);
		if (!timeoutMatch) {
			return undefined;
		}

		const timeoutSeconds = parseInt(timeoutMatch[1], 10);
		const remainingCommand = timeoutMatch[2];

		if (isNaN(timeoutSeconds) || timeoutSeconds < 0 || !remainingCommand) {
			return undefined;
		}

		// Convert seconds to milliseconds for the tool's timeout mechanism
		const timeoutMs = timeoutSeconds * 1000;

		return {
			rewritten: remainingCommand,
			reasoning: `Removed timeout command prefix, will enforce ${timeoutSeconds}s timeout using built-in mechanism`,
			metadata: {
				extractedTimeout: timeoutMs
			}
		};
	}
}
