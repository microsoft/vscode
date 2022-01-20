/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalAddon, Terminal } from 'xterm';
import { IShellIntegration } from 'vs/workbench/contrib/terminal/common/terminal';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { TerminalCapability } from 'vs/platform/terminal/common/terminal';
import { TerminalCapabilityStore } from 'vs/workbench/contrib/terminal/browser/capabilities/terminalCapabilityStore';
import { CommandDetectionCapability } from 'vs/workbench/contrib/terminal/browser/capabilities/commandDetectionCapability';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CwdDetectionCapability } from 'vs/workbench/contrib/terminal/browser/capabilities/cwdDetectionCapability';

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
 * The identifier for the textural parameter (`Pt`) for OSC commands used by shell integration.
 */
const enum ShellIntegrationOscPt {
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

export const enum ShellIntegrationInfo {
	CurrentDir = 'CurrentDir',
}

export const enum ShellIntegrationInteraction {
	PromptStart = 'PROMPT_START',
	CommandStart = 'COMMAND_START',
	CommandExecuted = 'COMMAND_EXECUTED',
	CommandFinished = 'COMMAND_FINISHED'
}

export class ShellIntegrationAddon extends Disposable implements IShellIntegration, ITerminalAddon {
	private _terminal?: Terminal;
	readonly capabilities = new TerminalCapabilityStore();

	private readonly _onIntegratedShellChange = new Emitter<{ type: string, value: string }>();
	readonly onIntegratedShellChange = this._onIntegratedShellChange.event;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
	}

	activate(xterm: Terminal) {
		this._terminal = xterm;
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
			case ShellIntegrationOscPt.PromptStart:
				this._createOrGetCommandDetection(this._terminal).handlePromptStart();
				return true;
			case ShellIntegrationOscPt.CommandStart:
				this._createOrGetCommandDetection(this._terminal).handleCommandStart();
				return true;
			case ShellIntegrationOscPt.CommandExecuted:
				this._createOrGetCommandDetection(this._terminal).handleCommandExecuted();
				return true;
			case ShellIntegrationOscPt.CommandFinished: {
				const exitCode = parseInt(arg);
				this._createOrGetCommandDetection(this._terminal).handleCommandFinished(exitCode);
				return true;
			}
		}
		return false;
	}

	private _handleVSCodeSequence(data: string): boolean {
		if (!this._terminal) {
			return false;
		}
		console.log('vscode sequence!', data, data.split('').map(e => e.charCodeAt(0)));
		return false;
	}

	private _handleITermSequence(data: string): boolean {
		const [type, value] = data.split('=');
		switch (type) {
			case ShellIntegrationInfo.CurrentDir: {
				this._createOrGetCwdDetection().updateCwd(value);
				const commandDetection = this.capabilities.get(TerminalCapability.CommandDetection);
				if (commandDetection) {
					commandDetection.cwd = value;
				}
				return true;
			}
		}
		return false;
	}

	private _createOrGetCwdDetection(): CwdDetectionCapability {
		let cwdDetection = this.capabilities.get(TerminalCapability.CwdDetection);
		if (!cwdDetection) {
			cwdDetection = new CwdDetectionCapability();
			this.capabilities.add(TerminalCapability.CwdDetection, cwdDetection);
		}
		return cwdDetection;
	}

	private _createOrGetCommandDetection(terminal: Terminal): CommandDetectionCapability {
		let commandDetection = this.capabilities.get(TerminalCapability.CommandDetection);
		if (!commandDetection) {
			commandDetection = this._instantiationService.createInstance(CommandDetectionCapability, terminal);
			this.capabilities.add(TerminalCapability.CommandDetection, commandDetection);
		}
		return commandDetection;
	}
}
