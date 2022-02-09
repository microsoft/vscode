/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalAddon, Terminal } from 'xterm';
import { IShellIntegration } from 'vs/workbench/contrib/terminal/common/terminal';
import { Disposable } from 'vs/base/common/lifecycle';
import { TerminalCapabilityStore } from 'vs/workbench/contrib/terminal/common/capabilities/terminalCapabilityStore';
import { CommandDetectionCapability } from 'vs/workbench/contrib/terminal/browser/capabilities/commandDetectionCapability';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CwdDetectionCapability } from 'vs/workbench/contrib/terminal/common/capabilities/cwdDetectionCapability';
import { ICommandDetectionCapability, TerminalCapability } from 'vs/workbench/contrib/terminal/common/capabilities/capabilities';
import { PartialCommandDetectionCapability } from 'vs/workbench/contrib/terminal/browser/capabilities/partialCommandDetectionCapability';

/**
 * Shell integration is a feature that enhances the terminal's understanding of what's happening
 * in the shell by injecting special sequences into the shell's prompt using the "Set Text
 * Parameters" sequence (`OSC Ps ; Pt ST`).
 *
 * Definitions:
 * - OSC: `\x1b]`
 * - Ps:  A single (usually optional) numeric parameter, composed of one or more digits.
 * - Pt:  A text parameter composed of printable characters.
 * - ST: `\x7`
 *
 * This is inspired by a feature of the same name in the FinalTerm, iTerm2 and kitty terminals.
 */

/**
 * The identifier for the first numeric parameter (`Ps`) for OSC commands used by shell integration.
 */
const enum ShellIntegrationOscPs {
	/**
	 * Sequences pioneered by FinalTerm.
	 */
	FinalTerm = 133,
	/**
	 * Sequences pioneered by VS Code.
	 */
	VSCode = 633,
	/**
	 * Sequences pioneered by iTerm.
	 */
	ITerm = 1337
}

/**
 * The identifier for the textural parameter (`Pt`) for FinalTerm OSC commands.
 */
const enum FinalTermOscPt {
	/**
	 * The start of the prompt, this is expected to always appear at the start of a line.
	 */
	PromptStart = 'A',
	/**
	 * The start of a command, ie. where the user inputs their command.
	 */
	CommandStart = 'B',
	/**
	 * Sent just before the command output begins.
	 */
	CommandExecuted = 'C',
	// TODO: Understand this sequence better and add docs
	CommandFinished = 'D',
}

const enum VSCodeOscPt {
	/**
	 * Explicitly set the command line. This helps workaround problems with conpty not having a
	 * passthrough mode by providing an option on Windows to send the command that was run. With
	 * this sequence there's no need for the guessing based on the unreliable cursor positions that
	 * would otherwise be required.
	 */
	CommandLine = 'A',

	Property = 'P'
}

export const enum ShellIntegrationInfo {
	CurrentDir = 'CurrentDir',
}

export const enum ShellIntegrationInteraction {
	PromptStart = 'PROMPT_START',
	CommandStart = 'COMMAND_START',
	CommandExecuted = 'COMMAND_EXECUTED',
	CommandFinished = 'COMMAND_FINISHED'
}

/**
 * The shell integration addon extends xterm by reading shell integration sequences and creating
 * capabilities and passing along relevant sequences to the capabilities. This is meant to
 * encapsulate all handling/parsing of sequences so the capabilities don't need to.
 */
export class ShellIntegrationAddon extends Disposable implements IShellIntegration, ITerminalAddon {
	private _terminal?: Terminal;
	readonly capabilities = new TerminalCapabilityStore();

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
	}

	activate(xterm: Terminal) {
		this._terminal = xterm;
		this.capabilities.add(TerminalCapability.PartialCommandDetection, new PartialCommandDetectionCapability(this._terminal));
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.FinalTerm, data => this._handleFinalTermSequence(data)));
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.ITerm, data => this._handleITermSequence(data)));
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.VSCode, data => this._handleVSCodeSequence(data)));
	}

	private _handleFinalTermSequence(data: string): boolean {
		if (!this._terminal) {
			return false;
		}

		// Pass the sequence along to the capability
		const [command, arg] = data.split(';');
		switch (command) {
			case FinalTermOscPt.PromptStart:
				this._createOrGetCommandDetection(this._terminal).handlePromptStart();
				return true;
			case FinalTermOscPt.CommandStart:
				this._createOrGetCommandDetection(this._terminal).handleCommandStart();
				return true;
			case FinalTermOscPt.CommandExecuted:
				this._createOrGetCommandDetection(this._terminal).handleCommandExecuted();
				return true;
			case FinalTermOscPt.CommandFinished: {
				const exitCode = parseInt(arg);
				this._createOrGetCommandDetection(this._terminal).handleCommandFinished(exitCode);
				return true;
			}
		}

		// Unrecognized sequence
		return false;
	}

	private _handleVSCodeSequence(data: string): boolean {
		if (!this._terminal) {
			return false;
		}

		// Pass the sequence along to the capability
		const [command, arg] = data.split(';');
		switch (command) {
			case VSCodeOscPt.CommandLine: {
				const commandLine = (arg
					.replace(/<LF>/g, '\n')
					.replace(/<CL>/g, ';'));
				this._createOrGetCommandDetection(this._terminal).setCommandLine(commandLine);
				return true;
			}
			case VSCodeOscPt.Property: {
				const [key, value] = arg.split('=');
				switch (key) {
					case 'IsWindows': {
						this._createOrGetCommandDetection(this._terminal).setIsWindowsPty(value === 'True' ? true : false);
					}
				}
			}
		}

		// Unrecognized sequence
		return false;
	}

	private _handleITermSequence(data: string): boolean {
		// Pass the sequence along to the capability
		const [type, value] = data.split('=');
		switch (type) {
			case ShellIntegrationInfo.CurrentDir: {
				this._createOrGetCwdDetection().updateCwd(value);
				const commandDetection = this.capabilities.get(TerminalCapability.CommandDetection);
				if (commandDetection) {
					commandDetection.setCwd(value);
				}
				return true;
			}
		}

		// Unrecognized sequence
		return false;
	}

	protected _createOrGetCwdDetection(): CwdDetectionCapability {
		let cwdDetection = this.capabilities.get(TerminalCapability.CwdDetection);
		if (!cwdDetection) {
			cwdDetection = new CwdDetectionCapability();
			this.capabilities.add(TerminalCapability.CwdDetection, cwdDetection);
		}
		return cwdDetection;
	}

	protected _createOrGetCommandDetection(terminal: Terminal): ICommandDetectionCapability {
		let commandDetection = this.capabilities.get(TerminalCapability.CommandDetection);
		if (!commandDetection) {
			commandDetection = this._instantiationService.createInstance(CommandDetectionCapability, terminal);
			this.capabilities.add(TerminalCapability.CommandDetection, commandDetection);
		}
		return commandDetection;
	}
}
