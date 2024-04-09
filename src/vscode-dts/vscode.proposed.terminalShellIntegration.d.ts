/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/145234

	// TODO: Add missing docs
	// TODO: Review and polish up all docs
	export interface TerminalShellExecution {
		// TODO: Create a a `TerminalShellExecutionStartEvent` for future proofing and consistency with other events
		/**
		 * The {@link Terminal} the command was executed in.
		 */
		readonly terminal: Terminal;

		/**
		 * The full command line that was executed, including both the command and arguments. The
		 * {@link TerminalShellExecutionCommandLineConfidence confidence} of this value depends on
		 * the specific shell's shell integration implementation. This value may become more
		 * accurate after {@link onDidEndTerminalShellExecution} is fired.
		 */
		// TODO: Implement command line fetching via buffer markers
		readonly commandLine: TerminalShellExecutionCommandLine;

		/**
		 * The working directory that was reported by the shell when this command executed. This
		 * will be a {@link Uri} if the path reported by the shell can reliably be mapped to the
		 * connected machine. This requires the shell integration to support working directory
		 * reporting.
		 */
		readonly cwd: Uri | undefined;

		/**
		 * Creates a stream of raw data (including escape sequences) that is written to the
		 * terminal. This will only include data that was written after `stream` was called for the
		 * first time, ie. you must call `dataStream` immediately after the command is executed via
		 * {@link executeCommand} or {@link onDidStartTerminalShellExecution} to not miss any data.
		 *
		 * @example
		 * // Log all data written to the terminal for a command
		 * const command = term.shellIntegration.executeCommand({ commandLine: 'echo "Hello world"' });
		 * const stream = command.readData();
		 * for await (const data of stream) {
		 *   console.log(data);
		 * }
		 */
		// TODO: read? "data" typically means Uint8Array. What's the encoding of the string? Usage here will typically be checking for substrings
		// TODO: dispose function?
		readData(): AsyncIterable<string>;
	}

	/**
	 * A command line that was executed in a terminal.
	 */
	export interface TerminalShellExecutionCommandLine {
		/**
		 * The full command line that was executed, including both the command and its arguments.
		 */
		value: string;

		/**
		 * Whether the command line value came from a trusted source and is therefore safe to
		 * execute without user additional confirmation (eg. a notification "Do you want to execute
		 * (command)?".
		 *
		 * This is false when the command line was reported explicitly by the shell integration
		 * script (ie. {@link TerminalShellExecutionCommandLineConfidence.High high confidence}),
		 * but did not include a nonce for verification.
		 */
		isTrusted: boolean;

		/**
		 * The confidence of the command line value which is determined by how the value was
		 * obtained. This depends upon the implementation of the shell integration script.
		 */
		confidence: TerminalShellExecutionCommandLineConfidence;
	}

	/**
	 * The confidence of a {@link TerminalShellExecutionCommandLine} value.
	 */
	enum TerminalShellExecutionCommandLineConfidence {
		/**
		 * The command line value confidence is low. This means that the value was read from the
		 * terminal buffer using markers reported by the shell integration script. Additionally the
		 * command either started on the very left-most column which is unusual, or the command is
		 * multi-line which is more difficult to accurately detect due to line continuation
		 * characters and right prompts.
		 */
		Low = 0,

		/**
		 * The command line value confidence is medium. This means that the value was read from the
		 * terminal buffer using markers reported by the shell integration script. The command is
		 * single-line and does not start on the very left-most column (which is unusual).
		 */
		Medium = 1,

		/**
		 * The command line value confidence is high. This means that the value was explicitly send
		 * from the shell integration script.
		 */
		High = 2
	}

	export interface Terminal {
		/**
		 * An object that contains [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration)-powered
		 * features for the terminal. This will always be undefined immediately after the terminal
		 * is created. Listen to {@link window.onDidActivateTerminalShellIntegration} to be notified
		 * when shell integration is activated for a terminal.
		 *
		 * Note that this object may remain undefined if shell integation never activates. For
		 * example Command Prompt does not support shell integration and a user's shell setup could
		 * conflict with the automatic shell integration activation.
		 */
		readonly shellIntegration: TerminalShellIntegration | undefined;
	}

	export interface TerminalShellIntegration {
		/**
		 * The current working directory of the terminal. This will be a {@link Uri} if the path
		 * reported by the shell can reliably be mapped to the connected machine.
		 */
		readonly cwd: Uri | undefined;

		/**
		 * Execute a command, sending ^C as necessary to interrupt any running command if needed.
		 *
		 * @param commandLine The command line to execute, this is the exact text that will be sent
		 * to the terminal.
		 *
		 * @example
		 * // Execute a command in a terminal immediately after being created
		 * const myTerm = window.createTerminal();
		 * window.onDidActivateTerminalShellIntegration(async ({ terminal, shellIntegration }) => {
		 *   if (terminal === myTerm) {
		 *     const command = shellIntegration.executeCommand('echo "Hello world"');
		 *     const code = await command.exitCode;
		 *     console.log(`Command exited with code ${code}`);
		 *   }
		 * }));
		 * // Fallback to sendText if there is no shell integration within 3 seconds of launching
		 * setTimeout(() => {
		 *   if (!myTerm.shellIntegration) {
		 *     myTerm.sendText('echo "Hello world"');
		 *     // Without shell integration, we can't know when the command has finished or what the
		 *     // exit code was.
		 *   }
		 * }, 3000);
		 *
		 * @example
		 * // Send command to terminal that has been alive for a while
		 * const commandLine = 'echo "Hello world"';
		 * if (term.shellIntegration) {
		 *   const command = term.shellIntegration.executeCommand({ commandLine });
		 *   const code = await command.exitCode;
		 *   console.log(`Command exited with code ${code}`);
		 * } else {
		 *   term.sendText(commandLine);
		 *   // Without shell integration, we can't know when the command has finished or what the
		 *   // exit code was.
		 * }
		 */
		executeCommand(commandLine: string): TerminalShellExecution;

		/**
		 * Execute a command, sending ^C as necessary to interrupt any running command if needed.
		 *
		 * *Note* This is not guaranteed to work as [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration)
		 * must be activated. Check whether {@link TerminalShellExecution.exitCode} is rejected to
		 * verify whether it was successful.
		 *
		 * @param command A command to run.
		 * @param args Arguments to launch the executable with which will be automatically escaped
		 * based on the executable type.
		 *
		 * @example
		 * // Execute a command in a terminal immediately after being created
		 * const myTerm = window.createTerminal();
		 * window.onDidActivateTerminalShellIntegration(async ({ terminal, shellIntegration }) => {
		 *   if (terminal === myTerm) {
		 *     const command = shellIntegration.executeCommand({
		 *       command: 'echo',
		 *       args: ['Hello world']
		 *     });
		 *     const code = await command.exitCode;
		 *     console.log(`Command exited with code ${code}`);
		 *   }
		 * }));
		 * // Fallback to sendText if there is no shell integration within 3 seconds of launching
		 * setTimeout(() => {
		 *   if (!myTerm.shellIntegration) {
		 *     myTerm.sendText('echo "Hello world"');
		 *     // Without shell integration, we can't know when the command has finished or what the
		 *     // exit code was.
		 *   }
		 * }, 3000);
		 *
		 * @example
		 * // Send command to terminal that has been alive for a while
		 * const commandLine = 'echo "Hello world"';
		 * if (term.shellIntegration) {
		 *   const command = term.shellIntegration.executeCommand({
		 *     command: 'echo',
		 *     args: ['Hello world']
		 *   });
		 *   const code = await command.exitCode;
		 *   console.log(`Command exited with code ${code}`);
		 * } else {
		 *   term.sendText(commandLine);
		 *   // Without shell integration, we can't know when the command has finished or what the
		 *   // exit code was.
		 * }
		 */
		executeCommand(executable: string, args: string[]): TerminalShellExecution;
	}

	export interface TerminalShellIntegrationChangeEvent {
		/**
		 * The terminal that shell integration has been activated in.
		 */
		readonly terminal: Terminal;

		/**
		 * The shell integration object.
		 */
		readonly shellIntegration: TerminalShellIntegration;
	}

	export interface TerminalShellExecutionEndEvent {
		/**
		 * The terminal shell execution that has ended.
		 */
		readonly execution: TerminalShellExecution;

		/**
		 * The exit code reported by the shell. `undefined` means the shell did not report an exit
		 * code or the shell reported a command started before the command finished.
		 */
		readonly exitCode: number | undefined;
	}

	export namespace window {
		/**
		 * Fires when shell integration activates or one of its properties changes in a terminal.
		 */
		export const onDidChangeTerminalShellIntegration: Event<TerminalShellIntegrationChangeEvent>;

		/**
		 * This will be fired when a terminal command is started. This event will fire only when
		 * [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration) is
		 * activated for the terminal.
		 */
		export const onDidStartTerminalShellExecution: Event<TerminalShellExecution>;

		/**
		 * This will be fired when a terminal command is ended. This event will fire only when
		 * [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration) is
		 * activated for the terminal.
		 */
		export const onDidEndTerminalShellExecution: Event<TerminalShellExecutionEndEvent>;
	}
}
