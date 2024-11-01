/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICompletionProviderResult, ITerminalCompletionProvider } from './terminalSuggestionService.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { ITerminalAddon, Terminal } from '@xterm/xterm';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { ShellIntegrationOscPs } from '../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js';
import { ISimpleCompletion, SimpleCompletionItem } from '../../../../services/suggest/browser/simpleCompletionItem.js';
import * as dom from '../../../../../base/browser/dom.js';
import { IPromptInputModel, IPromptInputModelState } from '../../../../../platform/terminal/common/capabilities/commandDetection/promptInputModel.js';
import { sep } from '../../../../../base/common/path.js';
import { normalizePathSeparator, SuggestAddon } from './terminalSuggestAddon.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ITerminalSuggestConfiguration, terminalSuggestConfigSection } from '../common/terminalSuggestConfiguration.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalSuggestContribution } from './terminal.suggest.contribution.js';
import { GeneralShellType } from '../../../../../platform/terminal/common/terminal.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';

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

export class TerminalPwshCompletionProvider extends Disposable implements ITerminalAddon, ITerminalCompletionProvider {
	public shellTypes = [GeneralShellType.PowerShell];
	static readonly ID = 'terminal.pwshCompletionProvider';
	private _codeCompletionsRequested: boolean = false;
	private _gitCompletionsRequested: boolean = false;
	private _lastUserDataTimestamp: number = 0;
	private _terminal?: Terminal;
	private _isFilteringDirectories: boolean = false;
	private _mostRecentCompletion?: ISimpleCompletion;
	private readonly _onDidReceiveCompletions = this._register(new Emitter<void>());
	readonly onDidReceiveCompletions = this._onDidReceiveCompletions.event;
	private readonly _onDidRequestCompletions = this._register(new Emitter<void>());
	readonly onDidRequestCompletions = this._onDidRequestCompletions.event;

	private _promptInputModel?: IPromptInputModel;

	private _currentPromptInputState?: IPromptInputModelState;

	private _enableWidget: boolean = true;
	private _pathSeparator: string = sep;

	// TODO: Remove these in favor of prompt input state
	private _leadingLineContent?: string;
	private _cursorIndexDelta: number = 0;

	isPasting: boolean = false;

	private _completionsResolver: ((result: ICompletionProviderResult | undefined) => void) | null = null;

	static requestCompletionsSequence = '\x1b[24~e'; // F12,e
	static requestGlobalCompletionsSequence = '\x1b[24~f'; // F12,f
	static requestEnableGitCompletionsSequence = '\x1b[24~g'; // F12,g
	static requestEnableCodeCompletionsSequence = '\x1b[24~h'; // F12,h

	private readonly _onBell = this._register(new Emitter<void>());
	readonly onBell = this._onBell.event;
	private readonly _onAcceptedCompletion = this._register(new Emitter<string>());
	readonly onAcceptedCompletion = this._onAcceptedCompletion.event;

	constructor(private readonly _ctx: ITerminalContributionContext, @IConfigurationService private readonly _configurationService: IConfigurationService) {
		super();

		this._register(Event.runAndSubscribe(Event.any(
			_ctx.instance.capabilities.onDidAddCapabilityType,
			_ctx.instance.capabilities.onDidRemoveCapabilityType
		), () => {
			const commandDetection = _ctx.instance.capabilities.get(TerminalCapability.CommandDetection);
			if (commandDetection) {
				if (this._promptInputModel !== commandDetection.promptInputModel) {
					this._promptInputModel = commandDetection.promptInputModel;
				}
			} else {
				this._promptInputModel = undefined;
			}
		}));
	}

	activate(xterm: Terminal): void {
		this._terminal = xterm;
		console.log(this._terminal !== undefined);
		console.log('activate');
		this._register(xterm.onData(() => {
			this._lastUserDataTimestamp = Date.now();
		}));
		this.onAcceptedCompletion(async text => {
			this._ctx.instance.focus();
			this._ctx.instance.sendText(text, false);
		});
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
		console.log(this._terminal !== undefined, ' handle sequence');
		if (!this._terminal) {
			return false;
		}

		// Pass the sequence along to the capability
		const [command, ...args] = data.split(';');
		console.log(data);
		switch (command) {
			case VSCodeSuggestOscPt.Completions:

				this._handleCompletionsSequence(this._terminal, data, command, args);
				return true;
		}

		// Unrecognized sequence
		return false;
	}

	private _handleCompletionsSequence(terminal: Terminal, data: string, command: string, args: string[]): void {
		this._onDidReceiveCompletions.fire();

		// Nothing to handle if the terminal is not attached
		if (!terminal.element || !this._enableWidget || !this._promptInputModel) {
			console.log('returning');
			this._notifyCompletions(undefined);
			return;
		}

		// Only show the suggest widget if the terminal is focused
		if (!dom.isAncestorOfActiveElement(terminal.element)) {
			console.log('returning');
			this._notifyCompletions(undefined);
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

		this._leadingLineContent = this._currentPromptInputState.prefix.substring(replacementIndex, replacementIndex + replacementLength + this._cursorIndexDelta);

		const payload = data.slice(command.length + args[0].length + args[1].length + args[2].length + 4/*semi-colons*/);
		const rawCompletions: PwshCompletion | PwshCompletion[] | CompressedPwshCompletion[] | CompressedPwshCompletion = args.length === 0 || payload.length === 0 ? undefined : JSON.parse(payload);
		const completions = parseCompletionsFromShell(rawCompletions);

		const firstChar = this._leadingLineContent.length === 0 ? '' : this._leadingLineContent[0];
		// This is a TabExpansion2 result
		if (this._leadingLineContent.includes(' ') || firstChar === '[') {
			replacementIndex = parseInt(args[0]);
			replacementLength = parseInt(args[1]);
			this._leadingLineContent = this._promptInputModel.prefix;
		}
		// This is a global command, add cached commands list to completions
		else {
			completions.push(...TerminalSuggestContribution.cachedPwshCommands);
		}

		if (this._mostRecentCompletion?.isDirectory && completions.every(e => e.completion.isDirectory)) {
			completions.push(new SimpleCompletionItem(this._mostRecentCompletion));
		}
		this._mostRecentCompletion = undefined;

		this._cursorIndexDelta = this._currentPromptInputState.cursorIndex - (replacementIndex + replacementLength);

		let normalizedLeadingLineContent = this._leadingLineContent;

		// If there is a single directory in the completions:
		// - `\` and `/` are normalized such that either can be used
		// - Using `\` or `/` will request new completions. It's important that this only occurs
		//   when a directory is present, if not completions like git branches could be requested
		//   which leads to flickering
		this._isFilteringDirectories = completions.some(e => e.completion.isDirectory);
		if (this._isFilteringDirectories) {
			const firstDir = completions.find(e => e.completion.isDirectory);
			this._pathSeparator = firstDir?.completion.label.match(/(?<sep>[\\\/])/)?.groups?.sep ?? sep;
			normalizedLeadingLineContent = normalizePathSeparator(normalizedLeadingLineContent, this._pathSeparator);
		}
		// const lineContext = new LineContext(normalizedLeadingLineContent, this._cursorIndexDelta);
		// const model = new SimpleCompletionModel(completions, lineContext, replacementIndex, replacementLength);
		// this._showCompletions(model);
		// TODO: fix this type, dont use kind instead use isFile, isDirectory, etc.
		console.log(completions.length, ' completions');
		this._notifyCompletions({
			items: completions.map(c => { return { ...c, label: c.completion.label }; }), replacementIndex, replacementLength
		});
	}

	private _notifyCompletions(result: ICompletionProviderResult | undefined) {
		if (this._completionsResolver) {
			this._completionsResolver(result);
			// Resolved, clear the resolver
			this._completionsResolver = null;
		}
	}

	private _waitForCompletions(): Promise<ICompletionProviderResult | undefined> {
		return new Promise<ICompletionProviderResult | undefined>((resolve) => {
			this._completionsResolver = resolve;
		});
	}

	async provideCompletions(value: string): Promise<ICompletionProviderResult | undefined> {
		const builtinCompletionsConfig = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection).builtinCompletions;
		if (!this._codeCompletionsRequested && builtinCompletionsConfig.pwshCode) {
			this._onAcceptedCompletion.fire(SuggestAddon.requestEnableCodeCompletionsSequence);
			this._codeCompletionsRequested = true;
		}
		if (!this._gitCompletionsRequested && builtinCompletionsConfig.pwshGit) {
			this._onAcceptedCompletion.fire(SuggestAddon.requestEnableGitCompletionsSequence);
			this._gitCompletionsRequested = true;
		}

		// Request global pwsh completions if there are none cached
		if (TerminalSuggestContribution.cachedPwshCommands.size === 0) {
			this._onAcceptedCompletion.fire(SuggestAddon.requestGlobalCompletionsSequence);
		}

		// Ensure that a key has been pressed since the last accepted completion in order to prevent
		// completions being requested again right after accepting a completion
		if (this._lastUserDataTimestamp > SuggestAddon.lastAcceptedCompletionTimestamp) {
			this._onAcceptedCompletion.fire(SuggestAddon.requestCompletionsSequence);
			this._onDidRequestCompletions.fire();
		}
		return await this._waitForCompletions();
	}
}

export function parseCompletionsFromShell(rawCompletions: PwshCompletion | PwshCompletion[] | CompressedPwshCompletion[] | CompressedPwshCompletion): SimpleCompletionItem[] {
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
	return typedRawCompletions.map(e => rawCompletionToSimpleCompletionItem(e));
}

function rawCompletionToSimpleCompletionItem(rawCompletion: PwshCompletion): SimpleCompletionItem {
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

	return new SimpleCompletionItem({
		label,
		icon,
		detail,
		isFile: rawCompletion.ResultType === 3,
		isDirectory: rawCompletion.ResultType === 4,
		isKeyword: rawCompletion.ResultType === 12,
	});
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

