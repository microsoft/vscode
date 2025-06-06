/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface EnvironmentVariable {
	key: string;
	value?: string;
}

export interface ShellContext {
	/** The current PID of the shell process */
	pid?: number;
	/** /dev/ttys## of terminal session */
	ttys?: string;
	/** the name of the process */
	processName?: string;
	/** the directory where the user ran the command */
	currentWorkingDirectory?: string;
	/** the value of $TERM_SESSION_ID */
	sessionId?: string;
	/** the integration version of figterm */
	integrationVersion?: number;
	/** the parent terminal of figterm */
	terminal?: string;
	/** the hostname of the computer figterm is running on */
	hostname?: string;
	/** path to the shell being used in the terminal */
	shellPath?: string;
	/** the environment variables of the shell, note that only exported variables are included */
	environmentVariables?: EnvironmentVariable[];
	/** the raw output of alias */
	alias?: string;
}
