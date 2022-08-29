/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IShellIntegration, ShellIntegrationStatus } from 'vs/platform/terminal/common/terminal';
import { Disposable, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { CommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/commandDetectionCapability';
import { CwdDetectionCapability } from 'vs/platform/terminal/common/capabilities/cwdDetectionCapability';
import { ICommandDetectionCapability, ICwdDetectionCapability, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { PartialCommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/partialCommandDetectionCapability';
import { ILogService } from 'vs/platform/log/common/log';
// Importing types is safe in any layer
// eslint-disable-next-line @vscode/code-import-patterns
import type { ITerminalAddon, Terminal } from 'xterm-headless';
import { ISerializedCommandDetectionCapability } from 'vs/platform/terminal/common/terminalProcess';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';


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
	 * Sequences pioneered by VS Code. The number is derived from the least significant digit of
	 * "VSC" when encoded in hex ("VSC" = 0x56, 0x53, 0x43).
	 */
	VSCode = 633,
	/**
	 * Sequences pioneered by iTerm.
	 */
	ITerm = 1337,
	SetCwd = 7,
	SetWindowsFriendlyCwd = 9
}

/**
 * VS Code-specific shell integration sequences. Some of these are based on more common alternatives
 * like those pioneered in FinalTerm. The decision to move to entirely custom sequences was to try
 * to improve reliability and prevent the possibility of applications confusing the terminal. If
 * multiple shell integration scripts run, VS Code will prioritize the VS Code-specific ones.
 *
 * It's recommended that authors of shell integration scripts use the common sequences (eg. 133)
 * when building general purpose scripts and the VS Code-specific (633) when targeting only VS Code
 * or when there are no other alternatives.
 */
const enum VSCodeOscPt {
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
	 * Explicitly set the command line. This helps workaround performance and reliability problems
	 * with parsing out the command, such as conpty not guaranteeing the position of the sequence or
	 * the shell not guaranteeing that the entire command is even visible.
	 *
	 * The command line can escape ascii characters using the `\xAB` format, where AB are the
	 * hexadecimal representation of the character code (case insensitive), and escape the `\`
	 * character using `\\`. It's required to escape semi-colon (`0x3b`) and characters 0x20 and
	 * below, this is particularly important for new line and semi-colon.
	 *
	 * Some examples:
	 *
	 * ```
	 * "\"  -> "\\"
	 * "\n" -> "\x0a"
	 * ";"  -> "\x3b"
	 * ```
	 */
	CommandLine = 'E',

	/**
	 * Similar to prompt start but for line continuations.
	 *
	 * WARNING: This sequence is unfinalized, DO NOT use this in your shell integration script.
	 */
	ContinuationStart = 'F',

	/**
	 * Similar to command start but for line continuations.
	 *
	 * WARNING: This sequence is unfinalized, DO NOT use this in your shell integration script.
	 */
	ContinuationEnd = 'G',

	/**
	 * The start of the right prompt.
	 *
	 * WARNING: This sequence is unfinalized, DO NOT use this in your shell integration script.
	 */
	RightPromptStart = 'H',

	/**
	 * The end of the right prompt.
	 *
	 * WARNING: This sequence is unfinalized, DO NOT use this in your shell integration script.
	 */
	RightPromptEnd = 'I',

	/**
	 * Set an arbitrary property: `OSC 633 ; P ; <Property>=<Value> ST`, only known properties will
	 * be handled.
	 *
	 * Known properties:
	 *
	 * - `Cwd` - Reports the current working directory to the terminal.
	 * - `IsWindows` - Indicates whether the terminal is using a Windows backend like winpty or
	 *   conpty. This may be used to enable additional heuristics as the positioning of the shell
	 *   integration sequences are not guaranteed to be correct. Valid values: `True`, `False`.
	 *
	 * WARNING: Any other properties may be changed and are not guaranteed to work in the future.
	 */
	Property = 'P'
}

/**
 * ITerm sequences
 */
const enum ITermOscPt {
	/**
	 * Sets a mark/point-of-interest in the buffer. `OSC 1337 ; SetMark`
	 */
	SetMark = 'SetMark',

	/**
	 * Reports current working directory (CWD). `OSC 1337 ; CurrentDir=<Cwd> ST`
	 */
	CurrentDir = 'CurrentDir'
}

/**
 * The shell integration addon extends xterm by reading shell integration sequences and creating
 * capabilities and passing along relevant sequences to the capabilities. This is meant to
 * encapsulate all handling/parsing of sequences so the capabilities don't need to.
 */
export class ShellIntegrationAddon extends Disposable implements IShellIntegration, ITerminalAddon {
	private _terminal?: Terminal;
	readonly capabilities = new TerminalCapabilityStore();
	private _hasUpdatedTelemetry: boolean = false;
	private _activationTimeout: any;
	private _commonProtocolDisposables: IDisposable[] = [];
	private _status: ShellIntegrationStatus = ShellIntegrationStatus.Off;

	get status(): ShellIntegrationStatus { return this._status; }

	private readonly _onDidChangeStatus = new Emitter<ShellIntegrationStatus>();
	readonly onDidChangeStatus = this._onDidChangeStatus.event;

	constructor(
		private readonly _disableTelemetry: boolean | undefined,
		private readonly _telemetryService: ITelemetryService | undefined,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._register(toDisposable(() => {
			this._clearActivationTimeout();
			this._disposeCommonProtocol();
		}));
	}

	private _disposeCommonProtocol(): void {
		dispose(this._commonProtocolDisposables);
		this._commonProtocolDisposables.length = 0;
	}

	activate(xterm: Terminal) {
		this._terminal = xterm;
		this.capabilities.add(TerminalCapability.PartialCommandDetection, new PartialCommandDetectionCapability(this._terminal));
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.VSCode, data => this._handleVSCodeSequence(data)));
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.ITerm, data => this._doHandleITermSequence(data)));
		this._commonProtocolDisposables.push(
			xterm.parser.registerOscHandler(ShellIntegrationOscPs.FinalTerm, data => this._handleFinalTermSequence(data))
		);
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.SetCwd, data => this._doHandleSetCwd(data)));
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.SetWindowsFriendlyCwd, data => this._doHandleSetWindowsFriendlyCwd(data)));
		this._ensureCapabilitiesOrAddFailureTelemetry();
	}

	private _handleFinalTermSequence(data: string): boolean {
		const didHandle = this._doHandleFinalTermSequence(data);
		if (this._status === ShellIntegrationStatus.Off) {
			this._status = ShellIntegrationStatus.FinalTerm;
			this._onDidChangeStatus.fire(this._status);
		}
		return didHandle;
	}

	private _doHandleFinalTermSequence(data: string): boolean {
		if (!this._terminal) {
			return false;
		}

		// Pass the sequence along to the capability
		// It was considered to disable the common protocol in order to not confuse the VS Code
		// shell integration if both happen for some reason. This doesn't work for powerlevel10k
		// when instant prompt is enabled though. If this does end up being a problem we could pass
		// a type flag through the capability calls
		const [command, ...args] = data.split(';');
		switch (command) {
			case 'A':
				this._createOrGetCommandDetection(this._terminal).handlePromptStart();
				return true;
			case 'B':
				// Ignore the command line for these sequences as it's unreliable for example in powerlevel10k
				this._createOrGetCommandDetection(this._terminal).handleCommandStart({ ignoreCommandLine: true });
				return true;
			case 'C':
				this._createOrGetCommandDetection(this._terminal).handleCommandExecuted();
				return true;
			case 'D': {
				const exitCode = args.length === 1 ? parseInt(args[0]) : undefined;
				this._createOrGetCommandDetection(this._terminal).handleCommandFinished(exitCode);
				return true;
			}
		}
		return false;
	}

	private _handleVSCodeSequence(data: string): boolean {
		const didHandle = this._doHandleVSCodeSequence(data);
		if (!this._hasUpdatedTelemetry && didHandle) {
			this._telemetryService?.publicLog2<{}, { owner: 'meganrogge'; comment: 'Indicates shell integration was activated' }>('terminal/shellIntegrationActivationSucceeded');
			this._hasUpdatedTelemetry = true;
			this._clearActivationTimeout();
		}
		if (this._status !== ShellIntegrationStatus.VSCode) {
			this._status = ShellIntegrationStatus.VSCode;
			this._onDidChangeStatus.fire(this._status);
		}
		return didHandle;
	}

	private async _ensureCapabilitiesOrAddFailureTelemetry(): Promise<void> {
		if (!this._telemetryService || this._disableTelemetry) {
			return;
		}
		this._activationTimeout = setTimeout(() => {
			if (!this.capabilities.get(TerminalCapability.CommandDetection) && !this.capabilities.get(TerminalCapability.CwdDetection)) {
				this._telemetryService?.publicLog2<{ classification: 'SystemMetaData'; purpose: 'FeatureInsight' }>('terminal/shellIntegrationActivationTimeout');
				this._logService.warn('Shell integration failed to add capabilities within 10 seconds');
			}
			this._hasUpdatedTelemetry = true;
		}, 10000);
	}

	private _clearActivationTimeout(): void {
		if (this._activationTimeout !== undefined) {
			clearTimeout(this._activationTimeout);
			this._activationTimeout = undefined;
		}
	}

	private _doHandleVSCodeSequence(data: string): boolean {
		if (!this._terminal) {
			return false;
		}

		// Pass the sequence along to the capability
		const [command, ...args] = data.split(';');
		switch (command) {
			case VSCodeOscPt.PromptStart:
				this._createOrGetCommandDetection(this._terminal).handlePromptStart();
				return true;
			case VSCodeOscPt.CommandStart:
				this._createOrGetCommandDetection(this._terminal).handleCommandStart();
				return true;
			case VSCodeOscPt.CommandExecuted:
				this._createOrGetCommandDetection(this._terminal).handleCommandExecuted();
				return true;
			case VSCodeOscPt.CommandFinished: {
				const exitCode = args.length === 1 ? parseInt(args[0]) : undefined;
				this._createOrGetCommandDetection(this._terminal).handleCommandFinished(exitCode);
				return true;
			}
			case VSCodeOscPt.CommandLine: {
				let commandLine: string;
				if (args.length === 1) {
					commandLine = deserializeMessage(args[0]);
				} else {
					commandLine = '';
				}
				this._createOrGetCommandDetection(this._terminal).setCommandLine(commandLine);
				return true;
			}
			case VSCodeOscPt.ContinuationStart: {
				this._createOrGetCommandDetection(this._terminal).handleContinuationStart();
				return true;
			}
			case VSCodeOscPt.ContinuationEnd: {
				this._createOrGetCommandDetection(this._terminal).handleContinuationEnd();
				return true;
			}
			case VSCodeOscPt.RightPromptStart: {
				this._createOrGetCommandDetection(this._terminal).handleRightPromptStart();
				return true;
			}
			case VSCodeOscPt.RightPromptEnd: {
				this._createOrGetCommandDetection(this._terminal).handleRightPromptEnd();
				return true;
			}
			case VSCodeOscPt.Property: {
				const { key, value } = parseKeyValueAssignment(args[0]);
				if (value === undefined) {
					return true;
				}
				switch (key) {
					case 'Cwd': {
						this._updateCwd(value);
						return true;
					}
					case 'IsWindows': {
						this._createOrGetCommandDetection(this._terminal).setIsWindowsPty(value === 'True' ? true : false);
						return true;
					}
					case 'Task': {
						this.capabilities.get(TerminalCapability.CommandDetection)?.setIsCommandStorageDisabled();
					}
				}
			}
		}

		// Unrecognized sequence
		return false;
	}

	private _updateCwd(value: string) {
		this._createOrGetCwdDetection().updateCwd(value);
		const commandDetection = this.capabilities.get(TerminalCapability.CommandDetection);
		commandDetection?.setCwd(value);
	}

	private _doHandleITermSequence(data: string): boolean {
		if (!this._terminal) {
			return false;
		}

		const [command] = data.split(';');
		switch (command) {
			case ITermOscPt.SetMark: {
				this._createOrGetCommandDetection(this._terminal).handleGenericCommand({ genericMarkProperties: { disableCommandStorage: true } });
			}
			default: {
				// Checking for known `<key>=<value>` pairs.
				const { key, value } = parseKeyValueAssignment(command);

				if (value === undefined) {
					// No '=' was found, so it's not a property assignment.
					return true;
				}

				switch (key) {
					case ITermOscPt.CurrentDir:
						// Encountered: `OSC 1337 ; CurrentDir=<Cwd> ST`
						this._updateCwd(value);
						return true;
				}
			}
		}

		// Unrecognized sequence
		return false;
	}

	private _doHandleSetWindowsFriendlyCwd(data: string): boolean {
		if (!this._terminal) {
			return false;
		}

		const [command, ...args] = data.split(';');
		switch (command) {
			case '9':
				// Encountered `OSC 9 ; 9 ; <cwd> ST`
				if (args.length) {
					this._updateCwd(args[0]);
				}
				return true;
		}

		// Unrecognized sequence
		return false;
	}

	/**
	 * Handles the sequence: `OSC 7 ; scheme://cwd ST`
	 */
	private _doHandleSetCwd(data: string): boolean {
		if (!this._terminal) {
			return false;
		}

		const [command] = data.split(';');

		if (command.match(/^file:\/\/.*\//)) {
			const uri = URI.parse(command);
			if (uri.path && uri.path.length > 0) {
				this._updateCwd(uri.path);
				return true;
			}
		}

		// Unrecognized sequence
		return false;
	}

	serialize(): ISerializedCommandDetectionCapability {
		if (!this._terminal || !this.capabilities.has(TerminalCapability.CommandDetection)) {
			return {
				isWindowsPty: false,
				commands: []
			};
		}
		const result = this._createOrGetCommandDetection(this._terminal).serialize();
		return result;
	}

	deserialize(serialized: ISerializedCommandDetectionCapability): void {
		if (!this._terminal) {
			throw new Error('Cannot restore commands before addon is activated');
		}
		this._createOrGetCommandDetection(this._terminal).deserialize(serialized);
	}

	protected _createOrGetCwdDetection(): ICwdDetectionCapability {
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
			commandDetection = new CommandDetectionCapability(terminal, this._logService);
			this.capabilities.add(TerminalCapability.CommandDetection, commandDetection);
		}
		return commandDetection;
	}
}

export function deserializeMessage(message: string): string {
	let result = message.replace(/\\\\/g, '\\');
	const deserializeRegex = /\\x([0-9a-f]{2})/i;
	while (true) {
		const match = result.match(deserializeRegex);
		if (!match?.index || match.length < 2) {
			break;
		}
		result = result.slice(0, match.index) + String.fromCharCode(parseInt(match[1], 16)) + result.slice(match.index + 4);
	}
	return result;
}

export function parseKeyValueAssignment(message: string): { key: string; value: string | undefined } {
	const deserialized = deserializeMessage(message);
	const separatorIndex = deserialized.indexOf('=');
	if (separatorIndex === -1) {
		return { key: deserialized, value: undefined }; // No '=' was found.
	}
	return {
		key: deserialized.substring(0, separatorIndex),
		value: deserialized.substring(1 + separatorIndex)
	};
}
