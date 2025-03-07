/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IShellIntegration, ShellIntegrationStatus } from '../terminal.js';
import { Disposable, dispose, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { TerminalCapabilityStore } from '../capabilities/terminalCapabilityStore.js';
import { CommandDetectionCapability } from '../capabilities/commandDetectionCapability.js';
import { CwdDetectionCapability } from '../capabilities/cwdDetectionCapability.js';
import { IBufferMarkCapability, ICommandDetectionCapability, ICwdDetectionCapability, ISerializedCommandDetectionCapability, IShellEnvDetectionCapability, TerminalCapability } from '../capabilities/capabilities.js';
import { PartialCommandDetectionCapability } from '../capabilities/partialCommandDetectionCapability.js';
import { ILogService } from '../../../log/common/log.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { Emitter } from '../../../../base/common/event.js';
import { BufferMarkCapability } from '../capabilities/bufferMarkCapability.js';
import type { ITerminalAddon, Terminal } from '@xterm/headless';
import { URI } from '../../../../base/common/uri.js';
import { sanitizeCwd } from '../terminalEnvironment.js';
import { removeAnsiEscapeCodesFromPrompt } from '../../../../base/common/strings.js';
import { ShellEnvDetectionCapability } from '../capabilities/shellEnvDetectionCapability.js';


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
export const enum ShellIntegrationOscPs {
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
 * Sequences pioneered by FinalTerm.
 */
const enum FinalTermOscPt {
	/**
	 * The start of the prompt, this is expected to always appear at the start of a line.
	 *
	 * Format: `OSC 133 ; A ST`
	 */
	PromptStart = 'A',

	/**
	 * The start of a command, ie. where the user inputs their command.
	 *
	 * Format: `OSC 133 ; B ST`
	 */
	CommandStart = 'B',

	/**
	 * Sent just before the command output begins.
	 *
	 * Format: `OSC 133 ; C ST`
	 */
	CommandExecuted = 'C',

	/**
	 * Sent just after a command has finished. The exit code is optional, when not specified it
	 * means no command was run (ie. enter on empty prompt or ctrl+c).
	 *
	 * Format: `OSC 133 ; D [; <ExitCode>] ST`
	 */
	CommandFinished = 'D',
}

/**
 * VS Code-specific shell integration sequences. Some of these are based on more common alternatives
 * like those pioneered in {@link FinalTermOscPt FinalTerm}. The decision to move to entirely custom
 * sequences was to try to improve reliability and prevent the possibility of applications confusing
 * the terminal. If multiple shell integration scripts run, VS Code will prioritize the VS
 * Code-specific ones.
 *
 * It's recommended that authors of shell integration scripts use the common sequences (`133`)
 * when building general purpose scripts and the VS Code-specific (`633`) when targeting only VS
 * Code or when there are no other alternatives (eg. {@link CommandLine `633 ; E`}). These sequences
 * support mix-and-matching.
 */
const enum VSCodeOscPt {
	/**
	 * The start of the prompt, this is expected to always appear at the start of a line.
	 *
	 * Format: `OSC 633 ; A ST`
	 *
	 * Based on {@link FinalTermOscPt.PromptStart}.
	 */
	PromptStart = 'A',

	/**
	 * The start of a command, ie. where the user inputs their command.
	 *
	 * Format: `OSC 633 ; B ST`
	 *
	 * Based on  {@link FinalTermOscPt.CommandStart}.
	 */
	CommandStart = 'B',

	/**
	 * Sent just before the command output begins.
	 *
	 * Format: `OSC 633 ; C ST`
	 *
	 * Based on {@link FinalTermOscPt.CommandExecuted}.
	 */
	CommandExecuted = 'C',

	/**
	 * Sent just after a command has finished. The exit code is optional, when not specified it
	 * means no command was run (ie. enter on empty prompt or ctrl+c).
	 *
	 * Format: `OSC 633 ; D [; <ExitCode>] ST`
	 *
	 * Based on {@link FinalTermOscPt.CommandFinished}.
	 */
	CommandFinished = 'D',

	/**
	 * Explicitly set the command line. This helps workaround performance and reliability problems
	 * with parsing out the command, such as conpty not guaranteeing the position of the sequence or
	 * the shell not guaranteeing that the entire command is even visible. Ideally this is called
	 * immediately before {@link CommandExecuted}, immediately before {@link CommandFinished} will
	 * also work but that means terminal will only know the accurate command line when the command is
	 * finished.
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
	 *
	 * An optional nonce can be provided which is may be required by the terminal in order enable
	 * some features. This helps ensure no malicious command injection has occurred.
	 *
	 * Format: `OSC 633 ; E [; <CommandLine> [; <Nonce>]] ST`
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
	 * Set the value of an arbitrary property, only known properties will be handled by VS Code.
	 *
	 * Format: `OSC 633 ; P ; <Property>=<Value> ST`
	 *
	 * Known properties:
	 *
	 * - `Cwd` - Reports the current working directory to the terminal.
	 * - `IsWindows` - Indicates whether the terminal is using a Windows backend like winpty or
	 *   conpty. This may be used to enable additional heuristics as the positioning of the shell
	 *   integration sequences are not guaranteed to be correct. Valid values: `True`, `False`.
	 * - `ContinuationPrompt` - Reports the continuation prompt that is printed at the start of
	 *   multi-line inputs.
	 *
	 * WARNING: Any other properties may be changed and are not guaranteed to work in the future.
	 */
	Property = 'P',

	/**
	 * Sets a mark/point-of-interest in the buffer.
	 *
	 * Format: `OSC 633 ; SetMark [; Id=<string>] [; Hidden]`
	 *
	 * `Id` - The identifier of the mark that can be used to reference it
	 * `Hidden` - When set, the mark will be available to reference internally but will not visible
	 *
	 * WARNING: This sequence is unfinalized, DO NOT use this in your shell integration script.
	 */
	SetMark = 'SetMark',

	/**
	 * Sends the shell's complete environment in JSON format.
	 *
	 * Format: `OSC 633 ; EnvJson ; <Environment> ; <Nonce>`
	 *
	 * - `Environment` - A stringified JSON object containing the shell's complete environment. The
	 *    variables and values use the same encoding rules as the {@link CommandLine} sequence.
	 * - `Nonce` - An _mandatory_ nonce can be provided which may be required by the terminal in order
	 *   to enable some features. This helps ensure no malicious command injection has occurred.
	 *
	 * WARNING: This sequence is unfinalized, DO NOT use this in your shell integration script.
	 */
	EnvJson = 'EnvJson',

	/**
	 * Delete a single environment variable from cached environment.
	 *
	 * Format: `OSC 633 ; EnvSingleDelete ; <EnvironmentKey> ; <EnvironmentValue> [; <Nonce>]`
	 *
	 * - `Nonce` - An optional nonce can be provided which may be required by the terminal in order
	 *   to enable some features. This helps ensure no malicious command injection has occurred.
	 *
	 * WARNING: This sequence is unfinalized, DO NOT use this in your shell integration script.
	 */
	EnvSingleDelete = 'EnvSingleDelete',

	/**
	 * The start of the collecting user's environment variables individually.
	 *
	 * Format: `OSC 633 ; EnvSingleStart ; <Clear> [; <Nonce>]`
	 *
	 * - `Clear` - An _mandatory_ flag indicating any cached environment variables will be cleared.
	 * - `Nonce` - An optional nonce can be provided which may be required by the terminal in order
	 *   to enable some features. This helps ensure no malicious command injection has occurred.
	 *
	 * WARNING: This sequence is unfinalized, DO NOT use this in your shell integration script.
	 */
	EnvSingleStart = 'EnvSingleStart',

	/**
	 * Sets an entry of single environment variable to transactional pending map of environment variables.
	 *
	 * Format: `OSC 633 ; EnvSingleEntry ; <EnvironmentKey> ; <EnvironmentValue> [; <Nonce>]`
	 *
	 * - `Nonce` - An optional nonce can be provided which may be required by the terminal in order
	 *   to enable some features. This helps ensure no malicious command injection has occurred.
	 *
	 * WARNING: This sequence is unfinalized, DO NOT use this in your shell integration script.
	 */
	EnvSingleEntry = 'EnvSingleEntry',

	/**
	 * The end of the collecting user's environment variables individually.
	 * Clears any pending environment variables and fires an event that contains user's environment.
	 *
	 * Format: `OSC 633 ; EnvSingleEnd [; <Nonce>]`
	 *
	 * - `Nonce` - An optional nonce can be provided which may be required by the terminal in order
	 *   to enable some features. This helps ensure no malicious command injection has occurred.
	 *
	 * WARNING: This sequence is unfinalized, DO NOT use this in your shell integration script.
	 */
	EnvSingleEnd = 'EnvSingleEnd'
}

/**
 * ITerm sequences
 */
const enum ITermOscPt {
	/**
	 * Sets a mark/point-of-interest in the buffer.
	 *
	 * Format: `OSC 1337 ; SetMark`
	 */
	SetMark = 'SetMark',

	/**
	 * Reports current working directory (CWD).
	 *
	 * Format: `OSC 1337 ; CurrentDir=<Cwd> ST`
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
	readonly capabilities = this._register(new TerminalCapabilityStore());
	private _hasUpdatedTelemetry: boolean = false;
	private _activationTimeout: any;
	private _commonProtocolDisposables: IDisposable[] = [];
	private _status: ShellIntegrationStatus = ShellIntegrationStatus.Off;

	get status(): ShellIntegrationStatus { return this._status; }

	private readonly _onDidChangeStatus = new Emitter<ShellIntegrationStatus>();
	readonly onDidChangeStatus = this._onDidChangeStatus.event;

	constructor(
		private _nonce: string,
		private readonly _disableTelemetry: boolean | undefined,
		private readonly _telemetryService: ITelemetryService | undefined,
		private readonly _logService: ILogService
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
		this.capabilities.add(TerminalCapability.PartialCommandDetection, this._register(new PartialCommandDetectionCapability(this._terminal)));
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.VSCode, data => this._handleVSCodeSequence(data)));
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.ITerm, data => this._doHandleITermSequence(data)));
		this._commonProtocolDisposables.push(
			xterm.parser.registerOscHandler(ShellIntegrationOscPs.FinalTerm, data => this._handleFinalTermSequence(data))
		);
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.SetCwd, data => this._doHandleSetCwd(data)));
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.SetWindowsFriendlyCwd, data => this._doHandleSetWindowsFriendlyCwd(data)));
		this._ensureCapabilitiesOrAddFailureTelemetry();
	}

	getMarkerId(terminal: Terminal, vscodeMarkerId: string) {
		this._createOrGetBufferMarkDetection(terminal).getMark(vscodeMarkerId);
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
			case FinalTermOscPt.PromptStart:
				this._createOrGetCommandDetection(this._terminal).handlePromptStart();
				return true;
			case FinalTermOscPt.CommandStart:
				// Ignore the command line for these sequences as it's unreliable for example in powerlevel10k
				this._createOrGetCommandDetection(this._terminal).handleCommandStart({ ignoreCommandLine: true });
				return true;
			case FinalTermOscPt.CommandExecuted:
				this._createOrGetCommandDetection(this._terminal).handleCommandExecuted();
				return true;
			case FinalTermOscPt.CommandFinished: {
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
				this._telemetryService?.publicLog2<{}, { owner: 'meganrogge'; comment: 'Indicates shell integration activation timeout' }>('terminal/shellIntegrationActivationTimeout');
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
		const argsIndex = data.indexOf(';');
		const sequenceCommand = argsIndex === -1 ? data : data.substring(0, argsIndex);
		// Cast to strict checked index access
		const args: (string | undefined)[] = argsIndex === -1 ? [] : data.substring(argsIndex + 1).split(';');
		switch (sequenceCommand) {
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
				const arg0 = args[0];
				const exitCode = arg0 !== undefined ? parseInt(arg0) : undefined;
				this._createOrGetCommandDetection(this._terminal).handleCommandFinished(exitCode);
				return true;
			}
			case VSCodeOscPt.CommandLine: {
				const arg0 = args[0];
				const arg1 = args[1];
				let commandLine: string;
				if (arg0 !== undefined) {
					commandLine = deserializeMessage(arg0);
				} else {
					commandLine = '';
				}
				this._createOrGetCommandDetection(this._terminal).setCommandLine(commandLine, arg1 === this._nonce);
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
			case VSCodeOscPt.EnvJson: {
				const arg0 = args[0];
				const arg1 = args[1];
				if (arg0 !== undefined) {
					try {
						const env = JSON.parse(deserializeMessage(arg0));
						this._createOrGetShellEnvDetection().setEnvironment(env, arg1 === this._nonce);
					} catch (e) {
						this._logService.warn('Failed to parse environment from shell integration sequence', arg0);
					}
				}
				return true;
			}
			case VSCodeOscPt.EnvSingleStart: {
				this._createOrGetShellEnvDetection().startEnvironmentSingleVar(args[0] === '1', args[1] === this._nonce);
				return true;
			}
			case VSCodeOscPt.EnvSingleDelete: {
				const arg0 = args[0];

				const arg1 = args[1];
				const arg2 = args[2];
				if (arg0 !== undefined && arg1 !== undefined) {
					const env = deserializeMessage(arg1);
					this._createOrGetShellEnvDetection().deleteEnvironmentSingleVar(arg0, env, arg2 === this._nonce);
				}
				return true;
			}
			case VSCodeOscPt.EnvSingleEntry: {
				const arg0 = args[0];
				const arg1 = args[1];
				const arg2 = args[2];
				if (arg0 !== undefined && arg1 !== undefined) {
					const env = deserializeMessage(arg1);
					this._createOrGetShellEnvDetection().setEnvironmentSingleVar(arg0, env, arg2 === this._nonce);
				}
				return true;
			}
			case VSCodeOscPt.EnvSingleEnd: {
				this._createOrGetShellEnvDetection().endEnvironmentSingleVar(args[0] === this._nonce);
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
				const arg0 = args[0];
				const deserialized = arg0 !== undefined ? deserializeMessage(arg0) : '';
				const { key, value } = parseKeyValueAssignment(deserialized);
				if (value === undefined) {
					return true;
				}
				switch (key) {
					case 'ContinuationPrompt': {
						this._updateContinuationPrompt(removeAnsiEscapeCodesFromPrompt(value));
						return true;
					}
					case 'Cwd': {
						this._updateCwd(value);
						return true;
					}
					case 'IsWindows': {
						this._createOrGetCommandDetection(this._terminal).setIsWindowsPty(value === 'True' ? true : false);
						return true;
					}
					case 'Prompt': {
						// Remove escape sequences from the user's prompt
						const sanitizedValue = value.replace(/\x1b\[[0-9;]*m/g, '');
						this._updatePromptTerminator(sanitizedValue);
						return true;
					}
					case 'Task': {
						this._createOrGetBufferMarkDetection(this._terminal);
						this.capabilities.get(TerminalCapability.CommandDetection)?.setIsCommandStorageDisabled();
						return true;
					}
				}
			}
			case VSCodeOscPt.SetMark: {
				this._createOrGetBufferMarkDetection(this._terminal).addMark(parseMarkSequence(args));
				return true;
			}
		}

		// Unrecognized sequence
		return false;
	}

	private _updateContinuationPrompt(value: string) {
		if (!this._terminal) {
			return;
		}
		this._createOrGetCommandDetection(this._terminal).setContinuationPrompt(value);
	}

	private _updatePromptTerminator(prompt: string) {
		if (!this._terminal) {
			return;
		}
		const lastPromptLine = prompt.substring(prompt.lastIndexOf('\n') + 1);
		const promptTerminator = lastPromptLine.substring(lastPromptLine.lastIndexOf(' '));
		if (promptTerminator) {
			this._createOrGetCommandDetection(this._terminal).setPromptTerminator(promptTerminator, lastPromptLine);
		}
	}

	private _updateCwd(value: string) {
		value = sanitizeCwd(value);
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
				this._createOrGetBufferMarkDetection(this._terminal).addMark();
			}
			default: {
				// Checking for known `<key>=<value>` pairs.
				// Note that unlike `VSCodeOscPt.Property`, iTerm2 does not interpret backslash or hex-escape sequences.
				// See: https://github.com/gnachman/iTerm2/blob/bb0882332cec5196e4de4a4225978d746e935279/sources/VT100Terminal.m#L2089-L2105
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
				commands: [],
				promptInputModel: undefined,
			};
		}
		const result = this._createOrGetCommandDetection(this._terminal).serialize();
		return result;
	}

	deserialize(serialized: ISerializedCommandDetectionCapability): void {
		if (!this._terminal) {
			throw new Error('Cannot restore commands before addon is activated');
		}
		const commandDetection = this._createOrGetCommandDetection(this._terminal);
		commandDetection.deserialize(serialized);
		if (commandDetection.cwd) {
			// Cwd gets set when the command is deserialized, so we need to update it here
			this._updateCwd(commandDetection.cwd);
		}
	}

	protected _createOrGetCwdDetection(): ICwdDetectionCapability {
		let cwdDetection = this.capabilities.get(TerminalCapability.CwdDetection);
		if (!cwdDetection) {
			cwdDetection = this._register(new CwdDetectionCapability());
			this.capabilities.add(TerminalCapability.CwdDetection, cwdDetection);
		}
		return cwdDetection;
	}

	protected _createOrGetCommandDetection(terminal: Terminal): ICommandDetectionCapability {
		let commandDetection = this.capabilities.get(TerminalCapability.CommandDetection);
		if (!commandDetection) {
			commandDetection = this._register(new CommandDetectionCapability(terminal, this._logService));
			this.capabilities.add(TerminalCapability.CommandDetection, commandDetection);
		}
		return commandDetection;
	}

	protected _createOrGetBufferMarkDetection(terminal: Terminal): IBufferMarkCapability {
		let bufferMarkDetection = this.capabilities.get(TerminalCapability.BufferMarkDetection);
		if (!bufferMarkDetection) {
			bufferMarkDetection = this._register(new BufferMarkCapability(terminal));
			this.capabilities.add(TerminalCapability.BufferMarkDetection, bufferMarkDetection);
		}
		return bufferMarkDetection;
	}

	protected _createOrGetShellEnvDetection(): IShellEnvDetectionCapability {
		let shellEnvDetection = this.capabilities.get(TerminalCapability.ShellEnvDetection);
		if (!shellEnvDetection) {
			shellEnvDetection = this._register(new ShellEnvDetectionCapability());
			this.capabilities.add(TerminalCapability.ShellEnvDetection, shellEnvDetection);
		}
		return shellEnvDetection;
	}
}

export function deserializeMessage(message: string): string {
	return message.replaceAll(
		// Backslash ('\') followed by an escape operator: either another '\', or 'x' and two hex chars.
		/\\(\\|x([0-9a-f]{2}))/gi,
		// If it's a hex value, parse it to a character.
		// Otherwise the operator is '\', which we return literally, now unescaped.
		(_match: string, op: string, hex?: string) => hex ? String.fromCharCode(parseInt(hex, 16)) : op);
}

export function parseKeyValueAssignment(message: string): { key: string; value: string | undefined } {
	const separatorIndex = message.indexOf('=');
	if (separatorIndex === -1) {
		return { key: message, value: undefined }; // No '=' was found.
	}
	return {
		key: message.substring(0, separatorIndex),
		value: message.substring(1 + separatorIndex)
	};
}


export function parseMarkSequence(sequence: (string | undefined)[]): { id?: string; hidden?: boolean } {
	let id = undefined;
	let hidden = false;
	for (const property of sequence) {
		// Sanity check, this shouldn't happen in practice
		if (property === undefined) {
			continue;
		}
		if (property === 'Hidden') {
			hidden = true;
		}
		if (property.startsWith('Id=')) {
			id = property.substring(3);
		}
	}
	return { id, hidden };
}
