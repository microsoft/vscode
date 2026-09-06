/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


export enum TerminalShellExecutionCommandLineConfidence {
	/**
	 * The command line value confidence is low. This means that the value was read from the
	 * terminal buffer using markers reported by the shell integration script. Additionally one
	 * of the following conditions will be met:
	 *
	 * - The command started on the very left-most column which is unusual, or
	 * - The command is multi-line which is more difficult to accurately detect due to line
	 *   continuation characters and right prompts.
	 * - Command line markers were not reported by the shell integration script.
	 */
	Low = 0,

	/**
	 * The command line value confidence is medium. This means that the value was read from the
	 * terminal buffer using markers reported by the shell integration script. The command is
	 * single-line and does not start on the very left-most column (which is unusual).
	 */
	Medium = 1,

	/**
	 * The command line value confidence is high. This means that the value was explicitly sent
	 * from the shell integration script or the command was executed via the
	 * {@link TerminalShellIntegration.executeCommand} API.
	 */
	High = 2
}