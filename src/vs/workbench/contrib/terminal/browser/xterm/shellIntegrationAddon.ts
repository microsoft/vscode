/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalAddon, Terminal } from 'xterm';
import { IShellIntegration } from 'vs/workbench/contrib/terminal/common/terminal';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { TerminalCapability } from 'vs/platform/terminal/common/terminal';
import { TerminalCapabilityStore } from 'vs/workbench/contrib/terminal/common/capabilities/terminalCapabilityStore';
import { CommandDetectionCapability } from 'vs/workbench/contrib/terminal/common/capabilities/commandDetectionCapability';
import { CwdDetectionCapability } from 'vs/workbench/contrib/terminal/common/capabilities/cwdDetectionCapability';

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

	activate(xterm: Terminal) {
		this._terminal = xterm;
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.FinalTerm, data => this._handleShellIntegration(data)));
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.ITerm, data => this._updateCwd(data)));
	}

	private _handleShellIntegration(data: string): boolean {
		if (!this._terminal) {
			return false;
		}
		let type: ShellIntegrationInteraction | undefined;
		const [command, exitCode] = data.split(';');
		switch (command) {
			case ShellIntegrationOscPt.PromptStart:
				type = ShellIntegrationInteraction.PromptStart;
				if (!this.capabilities.has(TerminalCapability.CommandDetection)) {
					this.capabilities.add(TerminalCapability.CommandDetection, new CommandDetectionCapability());
				}
			case ShellIntegrationOscPt.CommandStart:
				type = ShellIntegrationInteraction.CommandStart;
				break;
			case ShellIntegrationOscPt.CommandExecuted:
				type = ShellIntegrationInteraction.CommandExecuted;
				break;
			case ShellIntegrationOscPt.CommandFinished:
				type = ShellIntegrationInteraction.CommandFinished;
				break;
			default:
				return false;
		}
		const value = exitCode || type;
		if (!value) {
			return false;
		}
		this._onIntegratedShellChange.fire({ type, value });
		return true;
	}

	private _updateCwd(data: string): boolean {
		let value: string | undefined;
		const [type, info] = data.split('=');
		switch (type) {
			case ShellIntegrationInfo.CurrentDir:
				if (!this.capabilities.has(TerminalCapability.CwdDetection)) {
					this.capabilities.add(TerminalCapability.CwdDetection, new CwdDetectionCapability());
				}
				this.capabilities.get(TerminalCapability.CwdDetection)?.updateCwd(info);
				value = info;
				break;
			default:
				return false;
		}
		if (!value) {
			return false;
		}
		this._onIntegratedShellChange.fire({ type, value });
		return true;
	}
}
