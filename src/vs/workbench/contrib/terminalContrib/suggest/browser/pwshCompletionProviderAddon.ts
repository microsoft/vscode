/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalCompletionProvider } from './terminalCompletionService.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { ITerminalAddon, Terminal } from '@xterm/xterm';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { ShellIntegrationOscPs } from '../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js';
import * as dom from '../../../../../base/browser/dom.js';
import { IPromptInputModel, IPromptInputModelState } from '../../../../../platform/terminal/common/capabilities/commandDetection/promptInputModel.js';
import { sep } from '../../../../../base/common/path.js';
import { SuggestAddon } from './terminalSuggestAddon.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ITerminalSuggestConfiguration, terminalSuggestConfigSection, TerminalSuggestSettingId } from '../common/terminalSuggestConfiguration.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { GeneralShellType } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalCapabilityStore, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ITerminalCompletion, TerminalCompletionItemKind } from './terminalCompletionItem.js';

export const enum VSCodeSuggestOscPt {
	Completions = 'Completions',
	CompletionsPwshCommands = 'CompletionsPwshCommands',
}

export type CompressedPwshCompletion = [
	completionText: string,
	resultType: number,
	toolTip?: string,
	customIcon?: string
];

export type PwshCompletion = {
	CompletionText: string;
	ResultType: number;
	ToolTip?: string;
	CustomIcon?: string;
};

const enum Constants {
	CachedPwshCommandsStorageKey = 'terminal.suggest.pwshCommands'
}

const enum RequestCompletionsSequence {
	Contextual = '\x1b[24~e', // F12,e
	Global = '\x1b[24~f', // F12,f
}

export class PwshCompletionProviderAddon extends Disposable implements ITerminalAddon, ITerminalCompletionProvider {
	id: string = PwshCompletionProviderAddon.ID;
	triggerCharacters?: string[] | undefined;
	isBuiltin?: boolean = true;
	static readonly ID = 'pwsh-shell-integration';
	static cachedPwshCommands: Set<ITerminalCompletion>;
	readonly shellTypes = [GeneralShellType.PowerShell];
	private _lastUserDataTimestamp: number = 0;
	private _terminal?: Terminal;
	private _mostRecentCompletion?: ITerminalCompletion;
	private _promptInputModel?: IPromptInputModel;
	private _currentPromptInputState?: IPromptInputModelState;
	private _enableWidget: boolean = true;
	isPasting: boolean = false;
	private _completionsDeferred: DeferredPromise<ITerminalCompletion[] | undefined> | null = null;

	private readonly _onDidReceiveCompletions = this._register(new Emitter<void>());
	readonly onDidReceiveCompletions = this._onDidReceiveCompletions.event;
	private readonly _onDidRequestSendText = this._register(new Emitter<RequestCompletionsSequence>());
	readonly onDidRequestSendText = this._onDidRequestSendText.event;

	constructor(
		providedPwshCommands: Set<ITerminalCompletion> | undefined,
		capabilities: ITerminalCapabilityStore,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService
	) {
		super();
		this._register(Event.runAndSubscribe(Event.any(
			capabilities.onDidAddCapabilityType,
			capabilities.onDidRemoveCapabilityType
		), () => {
			const commandDetection = capabilities.get(TerminalCapability.CommandDetection);
			if (commandDetection) {
				if (this._promptInputModel !== commandDetection.promptInputModel) {
					this._promptInputModel = commandDetection.promptInputModel;
				}
			} else {
				this._promptInputModel = undefined;
			}
		}));
		PwshCompletionProviderAddon.cachedPwshCommands = providedPwshCommands || new Set();

		// Attempt to load cached pwsh commands if not already loaded
		if (PwshCompletionProviderAddon.cachedPwshCommands.size === 0) {
			const config = this._storageService.get(Constants.CachedPwshCommandsStorageKey, StorageScope.APPLICATION, undefined);
			if (config !== undefined) {
				const completions = JSON.parse(config);
				for (const c of completions) {
					PwshCompletionProviderAddon.cachedPwshCommands.add(c);
				}
			}
		}

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSuggestSettingId.Enabled)) {
				this.clearSuggestCache();
			}
		}));
	}

	clearSuggestCache(): void {
		PwshCompletionProviderAddon.cachedPwshCommands.clear();
		this._storageService.remove(Constants.CachedPwshCommandsStorageKey, StorageScope.APPLICATION);
	}

	activate(xterm: Terminal): void {
		this._terminal = xterm;
		this._register(xterm.onData(() => {
			this._lastUserDataTimestamp = Date.now();
		}));
		const config = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection);
		const enabled = config.enabled;
		if (!enabled) {
			return;
		}
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.VSCode, data => {
			return this._handleVSCodeSequence(data);
		}));
	}

	private _handleVSCodeSequence(data: string): boolean | Promise<boolean> {
		if (!this._terminal) {
			return false;
		}

		// Pass the sequence along to the capability
		const [command, ...args] = data.split(';');
		switch (command) {
			case VSCodeSuggestOscPt.Completions:
				this._handleCompletionsSequence(this._terminal, data, command, args);
				return true;
			case VSCodeSuggestOscPt.CompletionsPwshCommands:
				return this._handleCompletionsPwshCommandsSequence(this._terminal, data, command, args);
		}

		// Unrecognized sequence
		return false;
	}

	private _handleCompletionsSequence(terminal: Terminal, data: string, command: string, args: string[]): void {
		this._onDidReceiveCompletions.fire();

		// Nothing to handle if the terminal is not attached
		if (!terminal.element || !this._enableWidget || !this._promptInputModel) {
			this._resolveCompletions(undefined);
			return;
		}

		// Only show the suggest widget if the terminal is focused
		if (!dom.isAncestorOfActiveElement(terminal.element)) {
			this._resolveCompletions(undefined);
			return;
		}

		// No completions
		if (args.length === 0) {
			this._resolveCompletions(undefined);
			return;
		}

		let replacementIndex = 0;
		let replacementLength = this._promptInputModel.cursorIndex;

		this._currentPromptInputState = {
			value: this._promptInputModel.value,
			prefix: this._promptInputModel.prefix,
			suffix: this._promptInputModel.suffix,
			cursorIndex: this._promptInputModel.cursorIndex,
			ghostTextIndex: this._promptInputModel.ghostTextIndex
		};

		let leadingLineContent = this._currentPromptInputState.prefix.substring(replacementIndex, replacementIndex + replacementLength);

		const firstChar = leadingLineContent.length === 0 ? '' : leadingLineContent[0];
		const isGlobalCommand = !leadingLineContent.includes(' ') && firstChar !== '[';

		// This is a TabExpansion2 result
		if (!isGlobalCommand) {
			replacementIndex = parseInt(args[0]);
			replacementLength = parseInt(args[1]);
			leadingLineContent = this._promptInputModel.prefix;
		}
		const payload = data.slice(command.length + args[0].length + args[1].length + args[2].length + 4/*semi-colons*/);
		const rawCompletions: PwshCompletion | PwshCompletion[] | CompressedPwshCompletion[] | CompressedPwshCompletion = args.length === 0 || payload.length === 0 ? undefined : JSON.parse(payload);
		const completions = parseCompletionsFromShell(rawCompletions, replacementIndex, replacementLength);

		// This is a global command, add cached commands list to completions
		if (isGlobalCommand) {
			for (const c of PwshCompletionProviderAddon.cachedPwshCommands) {
				c.replacementIndex = replacementIndex;
				c.replacementLength = replacementLength;
				completions.push(c);
			}
		}

		if (this._mostRecentCompletion?.kind === TerminalCompletionItemKind.Folder && completions.every(c => c.kind === TerminalCompletionItemKind.Folder)) {
			completions.push(this._mostRecentCompletion);
		}
		this._mostRecentCompletion = undefined;
		this._resolveCompletions(completions);
	}

	private async _handleCompletionsPwshCommandsSequence(terminal: Terminal, data: string, command: string, args: string[]): Promise<boolean> {
		const type = args[0];
		const rawCompletions: PwshCompletion | PwshCompletion[] | CompressedPwshCompletion[] | CompressedPwshCompletion = JSON.parse(data.slice(command.length + type.length + 2/*semi-colons*/));
		const completions = parseCompletionsFromShell(rawCompletions, 0, 0);

		const set = PwshCompletionProviderAddon.cachedPwshCommands;
		set.clear();
		for (const c of completions) {
			set.add(c);
		}

		this._storageService.store(Constants.CachedPwshCommandsStorageKey, JSON.stringify(Array.from(set.values())), StorageScope.APPLICATION, StorageTarget.MACHINE);

		return true;
	}

	private _resolveCompletions(result: ITerminalCompletion[] | undefined) {
		if (!this._completionsDeferred) {
			return;
		}
		this._completionsDeferred.complete(result);
		// Resolved, clear the deferred promise
		this._completionsDeferred = null;
	}

	private _getCompletionsPromise(): Promise<ITerminalCompletion[] | undefined> {
		this._completionsDeferred = new DeferredPromise<ITerminalCompletion[] | undefined>();
		return this._completionsDeferred.p;
	}

	provideCompletions(value: string, cursorPosition: number, allowFallbackCompletions: boolean, token: CancellationToken): Promise<ITerminalCompletion[] | undefined> {
		// Return immediately if completions are being requested for a command since this provider
		// only returns completions for arguments
		if (value.substring(0, cursorPosition).trim().indexOf(' ') === -1) {
			return Promise.resolve(undefined);
		}

		// Request global pwsh completions if there are none cached
		if (PwshCompletionProviderAddon.cachedPwshCommands.size === 0) {
			this._onDidRequestSendText.fire(RequestCompletionsSequence.Global);
		}

		// Ensure that a key has been pressed since the last accepted completion in order to prevent
		// completions being requested again right after accepting a completion
		if (this._lastUserDataTimestamp > SuggestAddon.lastAcceptedCompletionTimestamp) {
			this._onDidRequestSendText.fire(RequestCompletionsSequence.Contextual);
		}
		if (token.isCancellationRequested) {
			return Promise.resolve(undefined);
		}

		return new Promise((resolve) => {
			const completionPromise = this._getCompletionsPromise();
			this._register(token.onCancellationRequested(() => {
				this._resolveCompletions(undefined);
			}));
			completionPromise.then(result => {
				if (token.isCancellationRequested) {
					resolve(undefined);
				} else {
					resolve(result);
				}
			});
		});
	}
}

export function parseCompletionsFromShell(rawCompletions: PwshCompletion | PwshCompletion[] | CompressedPwshCompletion[] | CompressedPwshCompletion, replacementIndex: number, replacementLength: number): ITerminalCompletion[] {
	if (!rawCompletions) {
		return [];
	}
	let typedRawCompletions: PwshCompletion[];
	if (!Array.isArray(rawCompletions)) {
		typedRawCompletions = [rawCompletions];
	} else {
		if (rawCompletions.length === 0) {
			return [];
		}
		if (typeof rawCompletions[0] === 'string') {
			typedRawCompletions = [rawCompletions as CompressedPwshCompletion].map(e => ({
				CompletionText: e[0],
				ResultType: e[1],
				ToolTip: e[2],
				CustomIcon: e[3],
			}));
		} else if (Array.isArray(rawCompletions[0])) {
			typedRawCompletions = (rawCompletions as CompressedPwshCompletion[]).map(e => ({
				CompletionText: e[0],
				ResultType: e[1],
				ToolTip: e[2],
				CustomIcon: e[3],
			}));
		} else {
			typedRawCompletions = rawCompletions as PwshCompletion[];
		}
	}
	return typedRawCompletions.map(e => rawCompletionToITerminalCompletion(e, replacementIndex, replacementLength));
}

function rawCompletionToITerminalCompletion(rawCompletion: PwshCompletion, replacementIndex: number, replacementLength: number): ITerminalCompletion {
	// HACK: Somewhere along the way from the powershell script to here, the path separator at the
	// end of directories may go missing, likely because `\"` -> `"`. As a result, make sure there
	// is a trailing separator at the end of all directory completions. This should not be done for
	// `.` and `..` entries because they are optimized not for navigating to different directories
	// but for passing as args.
	let label = rawCompletion.CompletionText;
	if (
		rawCompletion.ResultType === 4 &&
		!label.match(/^[\-+]$/) && // Don't add a `/` to `-` or `+` (navigate location history)
		!label.match(/^\.\.?$/) &&
		!label.match(/[\\\/]$/)
	) {
		const separator = label.match(/(?<sep>[\\\/])/)?.groups?.sep ?? sep;
		label = label + separator;
	}

	// If tooltip is not present it means it's the same as label
	const detail = rawCompletion.ToolTip ?? label;

	// Pwsh gives executables a result type of 2, but we want to treat them as files wrt the sorting
	// and file extension score boost. An example of where this improves the experience is typing
	// `git`, `git.exe` should appear at the top and beat `git-lfs.exe`. Keep the same icon though.
	const icon = getIcon(rawCompletion.ResultType, rawCompletion.CustomIcon);
	const isExecutable = rawCompletion.ResultType === 2 && rawCompletion.CompletionText.match(/\.[a-z0-9]{2,4}$/i);
	if (isExecutable) {
		rawCompletion.ResultType = 3;
	}

	return {
		label,
		provider: PwshCompletionProviderAddon.ID,
		icon,
		detail,
		kind: pwshTypeToKindMap[rawCompletion.ResultType],
		isKeyword: rawCompletion.ResultType === 12,
		replacementIndex,
		replacementLength
	};
}

function getIcon(resultType: number, customIconId?: string): ThemeIcon {
	if (customIconId) {
		const icon: ThemeIcon | undefined = customIconId in Codicon ? (Codicon as { [id: string]: ThemeIcon | undefined })[customIconId] : Codicon.symbolText;
		if (icon) {
			return icon;
		}
	}
	return pwshTypeToIconMap[resultType] ?? Codicon.symbolText;
}



/**
 * A map of the pwsh result type enum's value to the corresponding icon to use in completions.
 *
 * | Value | Name              | Description
 * |-------|-------------------|------------
 * | 0     | Text              | An unknown result type, kept as text only
 * | 1     | History           | A history result type like the items out of get-history
 * | 2     | Command           | A command result type like the items out of get-command
 * | 3     | ProviderItem      | A provider item
 * | 4     | ProviderContainer | A provider container
 * | 5     | Property          | A property result type like the property items out of get-member
 * | 6     | Method            | A method result type like the method items out of get-member
 * | 7     | ParameterName     | A parameter name result type like the Parameters property out of get-command items
 * | 8     | ParameterValue    | A parameter value result type
 * | 9     | Variable          | A variable result type like the items out of get-childitem variable:
 * | 10    | Namespace         | A namespace
 * | 11    | Type              | A type name
 * | 12    | Keyword           | A keyword
 * | 13    | DynamicKeyword    | A dynamic keyword
 *
 * @see https://docs.microsoft.com/en-us/dotnet/api/system.management.automation.completionresulttype?view=powershellsdk-7.0.0
 */
const pwshTypeToIconMap: { [type: string]: ThemeIcon | undefined } = {
	0: Codicon.symbolText,
	1: Codicon.history,
	2: Codicon.symbolMethod,
	3: Codicon.symbolFile,
	4: Codicon.folder,
	5: Codicon.symbolProperty,
	6: Codicon.symbolMethod,
	7: Codicon.symbolVariable,
	8: Codicon.symbolValue,
	9: Codicon.symbolVariable,
	10: Codicon.symbolNamespace,
	11: Codicon.symbolInterface,
	12: Codicon.symbolKeyword,
	13: Codicon.symbolKeyword
};

const pwshTypeToKindMap: { [type: string]: TerminalCompletionItemKind | undefined } = {
	0: undefined,
	1: undefined,
	2: TerminalCompletionItemKind.Method,
	3: TerminalCompletionItemKind.File,
	4: TerminalCompletionItemKind.Folder,
	5: TerminalCompletionItemKind.Argument,
	6: TerminalCompletionItemKind.Method,
	7: TerminalCompletionItemKind.Argument,
	8: undefined,
	9: undefined,
	10: undefined,
	11: undefined,
	12: undefined,
	13: undefined,
};
