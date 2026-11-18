/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The identifier for the first numeric parameter (`Ps`) for OSC commands used by shell integration.
 */
const enum ShellIntegrationOscPs {
	/**
	 * Sequences pioneered by FinalTerm.
	 */
	FinalTerm = 133,
	/**
	 * Sequences pioneered by VS Code. The number is derived from the least significant digit of
	 * "VSC" when encoded in hex ("VSC" = 0x56, 0x53, 0x43).
	 */
	VSCode = 633,
	/**
	 * Sequences pioneered by iTerm.
	 */
	ITerm = 1337
}

/**
 * VS Code-specific shell integration sequences. Some of these are based on common alternatives like
 * those pioneered in FinalTerm. The decision to move to entirely custom sequences was to try to
 * improve reliability and prevent the possibility of applications confusing the terminal.
 */
export const enum VSCodeOscPt {
	/**
	 * The start of the prompt, this is expected to always appear at the start of a line.
	 * Based on FinalTerm's `OSC 133 ; A ST`.
	 */
	PromptStart = 'A',

	/**
	 * The start of a command, ie. where the user inputs their command.
	 * Based on FinalTerm's `OSC 133 ; B ST`.
	 */
	CommandStart = 'B',

	/**
	 * Sent just before the command output begins.
	 * Based on FinalTerm's `OSC 133 ; C ST`.
	 */
	CommandExecuted = 'C',

	/**
	 * Sent just after a command has finished. The exit code is optional, when not specified it
	 * means no command was run (ie. enter on empty prompt or ctrl+c).
	 * Based on FinalTerm's `OSC 133 ; D [; <ExitCode>] ST`.
	 */
	CommandFinished = 'D',

	/**
	 * Explicitly set the command line. This helps workaround problems with conpty not having a
	 * passthrough mode by providing an option on Windows to send the command that was run. With
	 * this sequence there's no need for the guessing based on the unreliable cursor positions that
	 * would otherwise be required.
	 */
	CommandLine = 'E',

	/**
	 * Similar to prompt start but for line continuations.
	 */
	ContinuationStart = 'F',

	/**
	 * Similar to command start but for line continuations.
	 */
	ContinuationEnd = 'G',

	/**
	 * The start of the right prompt.
	 */
	RightPromptStart = 'H',

	/**
	 * The end of the right prompt.
	 */
	RightPromptEnd = 'I',

	/**
	 * Set an arbitrary property: `OSC 633 ; P ; <Property>=<Value> ST`, only known properties will
	 * be handled.
	 */
	Property = 'P'
}

export const enum VSCodeOscProperty {
	Task = 'Task',
	Cwd = 'Cwd',
	HasRichCommandDetection = 'HasRichCommandDetection',
}

/**
 * ITerm sequences
 */
export const enum ITermOscPt {
	/**
	 * Based on ITerm's `OSC 1337 ; SetMark` sets a mark on the scrollbar
	 */
	SetMark = 'SetMark'
}

export function VSCodeSequence(osc: VSCodeOscPt, data?: string | VSCodeOscProperty): string {
	return oscSequence(ShellIntegrationOscPs.VSCode, osc, data);
}

export function ITermSequence(osc: ITermOscPt, data?: string): string {
	return oscSequence(ShellIntegrationOscPs.ITerm, osc, data);
}

function oscSequence(ps: number, pt: string, data?: string): string {
	let result = `\x1b]${ps};${pt}`;
	if (data) {
		result += `;${data}`;
	}
	result += `\x07`;
	return result;

}
