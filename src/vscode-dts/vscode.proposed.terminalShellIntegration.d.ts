/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/145234

	/**
	 * A command that was executed in a terminal.
	 */
	export interface TerminalShellExecution {
		/**
		 * The command line that was executed. The {@link TerminalShellExecutionCommandLineConfidence confidence}
		 * of this value depends on the specific shell's shell integration implementation. This
		 * value may become more accurate after {@link window.onDidEndTerminalShellExecution} is
		 * fired.
		 *
		 * @example
		 * // Log the details of the command line on start and end
		 * window.onDidStartTerminalShellExecution(event => {
		 *   const commandLine = event.execution.commandLine;
		 *   console.log(`Command started\n${summarizeCommandLine(commandLine)}`);
		 * });
		 * window.onDidEndTerminalShellExecution(event => {
		 *   const commandLine = event.execution.commandLine;
		 *   console.log(`Command ended\n${summarizeCommandLine(commandLine)}`);
		 * });
		 * function summarizeCommandLine(commandLine: TerminalShellExecutionCommandLine) {
		 *   return [
		 *     `  Command line: ${command.commandLine.value}`,
		 *     `  Confidence: ${command.commandLine.confidence}`,
		 *     `  Trusted: ${command.commandLine.isTrusted}
		 *   ].join('\n');
		 * }
		 */
		readonly commandLine: TerminalShellExecutionCommandLine;

		/**
		 * The working directory that was reported by the shell when this command executed. This
		 * {@link Uri} may represent a file on another machine (eg. ssh into another machine). This
		 * requires the shell integration to support working directory reporting.
		 */
		readonly cwd: Uri | undefined;

		/**
		 * Creates a stream of raw data (including escape sequences) that is written to the
		 * terminal. This will only include data that was written after `read` was called for
		 * the first time, ie. you must call `read` immediately after the command is executed via
		 * {@link TerminalShellIntegration.executeCommand} or
		 * {@link window.onDidStartTerminalShellExecution} to not miss any data.
		 *
		 * @example
		 * // Log all data written to the terminal for a command
		 * const command = term.shellIntegration.executeCommand({ commandLine: 'echo "Hello world"' });
		 * const stream = command.read();
		 * for await (const data of stream) {
		 *   console.log(data);
		 * }
		 */
		read(): AsyncIterable<string>;
	}

	/**
	 * A command line that was executed in a terminal.
	 */
	export interface TerminalShellExecutionCommandLine {
		/**
		 * The full command line that was executed, including both the command and its arguments.
		 */
		readonly value: string;

		/**
		 * Whether the command line value came from a trusted source and is therefore safe to
		 * execute without user additional confirmation, such as a notification that asks "Do you
		 * want to execute (command)?". This verification is likely only needed if you are going to
		 * execute the command again.
		 *
		 * This is `true` only when the command line was reported explicitly by the shell
		 * integration script (ie. {@link TerminalShellExecutionCommandLineConfidence.High high confidence})
		 * and it used a nonce for verification.
		 */
		readonly isTrusted: boolean;

		/**
		 * The confidence of the command line value which is determined by how the value was
		 * obtained. This depends upon the implementation of the shell integration script.
		 */
		readonly confidence: TerminalShellExecutionCommandLineConfidence;
	}

	/**
	 * The confidence of a {@link TerminalShellExecutionCommandLine} value.
	 */
	enum TerminalShellExecutionCommandLineConfidence {
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

	export interface Terminal {
		/**
		 * An object that contains [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration)-powered
		 * features for the terminal. This will always be `undefined` immediately after the terminal
		 * is created. Listen to {@link window.onDidChangeTerminalShellIntegration} to be notified
		 * when shell integration is activated for a terminal.
		 *
		 * Note that this object may remain undefined if shell integation never activates. For
		 * example Command Prompt does not support shell integration and a user's shell setup could
		 * conflict with the automatic shell integration activation.
		 */
		readonly shellIntegration: TerminalShellIntegration | undefined;
	}

	/**
	 * [Shell integration](https://code.visualstudio.com/docs/terminal/shell-integration)-powered capabilities owned by a terminal.
	 */
	export interface TerminalShellIntegration {
		/**
		 * The current working directory of the terminal. This {@link Uri} may represent a file on
		 * another machine (eg. ssh into another machine). This requires the shell integration to
		 * support working directory reporting.
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
		 * window.onDidChangeTerminalShellIntegration(async ({ terminal, shellIntegration }) => {
		 *   if (terminal === myTerm) {
		 *     const execution = shellIntegration.executeCommand('echo "Hello world"');
		 *     window.onDidEndTerminalShellExecution(event => {
		 *     if (event.execution === execution) {
		 *       console.log(`Command exited with code ${event.exitCode}`);
		 *     }
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
		 *   const execution = shellIntegration.executeCommand({ commandLine });
		 *   window.onDidEndTerminalShellExecution(event => {
		 *   if (event.execution === execution) {
		 *     console.log(`Command exited with code ${event.exitCode}`);
		 *   }
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

	export interface TerminalShellExecutionStartEvent {
		/**
		 * The terminal that shell integration has been activated in.
		 */
		readonly terminal: Terminal;

		/**
		 * The shell integration object.
		 */
		readonly shellIntegration: TerminalShellIntegration;

		/**
		 * The terminal shell execution that has ended.
		 */
		readonly execution: TerminalShellExecution;
	}

	export interface TerminalShellExecutionEndEvent {
		/**
		 * The terminal that shell integration has been activated in.
		 */
		readonly terminal: Terminal;

		/**
		 * The shell integration object.
		 */
		readonly shellIntegration: TerminalShellIntegration;

		/**
		 * The terminal shell execution that has ended.
		 */
		readonly execution: TerminalShellExecution;

		/**
		 * The exit code reported by the shell.
		 *
		 * Note that `undefined` means the shell either did not report an exit  code (ie. the shell
		 * integration script is misbehaving) or the shell reported a command started before the command
		 * finished (eg. a sub-shell was opened). Generally this should not happen, depending on the use
		 * case, it may be best to treat this as a failure.
		 *
		 * @example
		 * const execution = shellIntegration.executeCommand({
		 *   command: 'echo',
		 *   args: ['Hello world']
		 * });
		 * window.onDidEndTerminalShellExecution(event => {
		 *   if (event.execution === execution) {
		 *     if (event.exitCode === undefined) {
		 * 	     console.log('Command finished but exit code is unknown');
		 *     } else if (event.exitCode === 0) {
		 * 	     console.log('Command succeeded');
		 *     } else {
		 * 	     console.log('Command failed');
		 *     }
		 *   }
		 * });
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
		export const onDidStartTerminalShellExecution: Event<TerminalShellExecutionStartEvent>;

		/**
		 * This will be fired when a terminal command is ended. This event will fire only when
		 * [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration) is
		 * activated for the terminal.
		 */
		export const onDidEndTerminalShellExecution: Event<TerminalShellExecutionEndEvent>;
	}
}
