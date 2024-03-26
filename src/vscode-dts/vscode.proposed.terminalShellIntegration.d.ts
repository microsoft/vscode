/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/145234

	export interface TerminalShellExecution {
		// TODO: This is circular, is that fine? Should we add a `TerminalShellExecutionEvent`?
		/**
		 * The {@link Terminal} the command was executed in.
		 */
		readonly terminal: Terminal;

		/**
		 * The full command line that was executed, including both the command and arguments.
		 * The accuracy of this value depends on the shell integration implementation:
		 *
		 * - It may be undefined or the empty string until {@link onDidEndTerminalShellExecution} is
		 *   fired.
		 * - It may be inaccurate initially if the command line is pulled from the buffer directly
		 *   via the [`OSC 633/133 ; A`, `B` and `C` sequences](https://code.visualstudio.com/docs/terminal/shell-integration#_vs-code-custom-sequences-osc-633-st).
		 * - It may contain line continuation characters and/or parts of the right prompt.
		 * - It may be inaccurate if the shell integration does not support command line reporting
		 *   via the [`OSC 633 ; E` sequence](https://code.visualstudio.com/docs/terminal/shell-integration#_vs-code-custom-sequences-osc-633-st).
		 */
		readonly commandLine: string | undefined;

		/**
		 * The working directory that was reported by the shell when this command executed. This
		 * will be a {@link Uri} if the string reported by the shell can reliably be mapped to the
		 * connected machine. This requires the shell integration to support working directory
		 * reporting via the [`OSC 633 ; P`](https://code.visualstudio.com/docs/terminal/shell-integration#_vs-code-custom-sequences-osc-633-st)
		 * or `OSC 1337 ; CurrentDir=<Cwd> ST` sequences.
		 */
		readonly cwd: Uri | string | undefined;

		/**
		 * The exit code reported by the shell.
		 */
		readonly exitCode: Thenable<number | undefined>;

		/**
		 * Creates a stream of raw data (including escape sequences) that is written to the
		 * terminal. This will only include data that was written after `stream` was called for the
		 * first time, ie. you must call `dataStream` immediately after the command is executed via
		 * {@link executeCommand} or {@link onDidStartTerminalShellExecution} to not miss any data.
		 *
		 * @example
		 * // Log all data written to the terminal for a command
		 * const command = term.shellIntegration.executeCommand({ commandLine: 'echo "Hello world"' });
		 * const stream = command.createDataStream();
		 * for await (const data of stream) {
		 *   console.log(data);
		 * }
		 */
		createDataStream(): AsyncIterable<string>;
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
		// TODO: Is this fine to share the TerminalShellIntegrationChangeEvent event?
		/**
		 * The current working directory of the terminal. This will be a {@link Uri} if the string
		 * reported by the shell can reliably be mapped to the connected machine.
		 */
		readonly cwd: Uri | string | undefined;

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
		export const onDidEndTerminalShellExecution: Event<TerminalShellExecution>;
	}
}
