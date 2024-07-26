/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITerminalAddon, Terminal } from '@xterm/xterm';
import * as dom from 'vs/base/browser/dom';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { combinedDisposable, Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { sep } from 'vs/base/common/path';
import { commonPrefixLength } from 'vs/base/common/strings';
import { ThemeIcon } from 'vs/base/common/themables';
import { editorSuggestWidgetSelectedBackground } from 'vs/editor/contrib/suggest/browser/suggestWidget';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { TerminalCapability, type ITerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/capabilities';
import type { IPromptInputModel, IPromptInputModelState } from 'vs/platform/terminal/common/capabilities/commandDetection/promptInputModel';
import { ShellIntegrationOscPs } from 'vs/platform/terminal/common/xterm/shellIntegrationAddon';
import { getListStyles } from 'vs/platform/theme/browser/defaultStyles';
import { activeContrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { ITerminalConfigurationService } from 'vs/workbench/contrib/terminal/browser/terminal';
import type { IXtermCore } from 'vs/workbench/contrib/terminal/browser/xterm-private';
import { TerminalStorageKeys } from 'vs/workbench/contrib/terminal/common/terminalStorageKeys';
import { terminalSuggestConfigSection, type ITerminalSuggestConfiguration } from 'vs/workbench/contrib/terminalContrib/suggest/common/terminalSuggestConfiguration';
import { SimpleCompletionItem } from 'vs/workbench/services/suggest/browser/simpleCompletionItem';
import { LineContext, SimpleCompletionModel } from 'vs/workbench/services/suggest/browser/simpleCompletionModel';
import { ISimpleSelectedSuggestion, SimpleSuggestWidget } from 'vs/workbench/services/suggest/browser/simpleSuggestWidget';

export const enum VSCodeSuggestOscPt {
	Completions = 'Completions',
	CompletionsPwshCommands = 'CompletionsPwshCommands',
	CompletionsBash = 'CompletionsBash',
	CompletionsBashFirstWord = 'CompletionsBashFirstWord'
}

export type CompressedPwshCompletion = [
	completionText: string,
	resultType: number,
	toolTip: string
];

export type PwshCompletion = {
	CompletionText: string;
	ResultType: number;
	ToolTip?: string;
};


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

export interface ISuggestController {
	selectPreviousSuggestion(): void;
	selectPreviousPageSuggestion(): void;
	selectNextSuggestion(): void;
	selectNextPageSuggestion(): void;
	acceptSelectedSuggestion(suggestion?: Pick<ISimpleSelectedSuggestion, 'item' | 'model'>): void;
	hideSuggestWidget(): void;
}

export class SuggestAddon extends Disposable implements ITerminalAddon, ISuggestController {
	private _terminal?: Terminal;

	private _promptInputModel?: IPromptInputModel;
	private readonly _promptInputModelSubscriptions = this._register(new MutableDisposable());

	private _mostRecentPromptInputState?: IPromptInputModelState;
	private _initialPromptInputState?: IPromptInputModelState;
	private _currentPromptInputState?: IPromptInputModelState;
	private _model?: SimpleCompletionModel;

	private _panel?: HTMLElement;
	private _screen?: HTMLElement;
	private _suggestWidget?: SimpleSuggestWidget;
	private _enableWidget: boolean = true;
	private _pathSeparator: string = sep;
	private _isFilteringDirectories: boolean = false;

	private _codeCompletionsRequested: boolean = false;
	private _gitCompletionsRequested: boolean = false;

	// TODO: Remove these in favor of prompt input state
	private _leadingLineContent?: string;
	private _cursorIndexDelta: number = 0;

	private _lastUserDataTimestamp: number = 0;
	private _lastAcceptedCompletionTimestamp: number = 0;
	private _lastUserData?: string;

	static requestCompletionsSequence = '\x1b[24~e'; // F12,e
	static requestGlobalCompletionsSequence = '\x1b[24~f'; // F12,f
	static requestEnableGitCompletionsSequence = '\x1b[24~g'; // F12,g
	static requestEnableCodeCompletionsSequence = '\x1b[24~h'; // F12,h

	private readonly _onBell = this._register(new Emitter<void>());
	readonly onBell = this._onBell.event;
	private readonly _onAcceptedCompletion = this._register(new Emitter<string>());
	readonly onAcceptedCompletion = this._onAcceptedCompletion.event;

	constructor(
		private readonly _cachedPwshCommands: Set<SimpleCompletionItem>,
		private readonly _capabilities: ITerminalCapabilityStore,
		private readonly _terminalSuggestWidgetVisibleContextKey: IContextKey<boolean>,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService,
	) {
		super();

		this._register(Event.runAndSubscribe(Event.any(
			this._capabilities.onDidAddCapabilityType,
			this._capabilities.onDidRemoveCapabilityType
		), () => {
			const commandDetection = this._capabilities.get(TerminalCapability.CommandDetection);
			if (commandDetection) {
				if (this._promptInputModel !== commandDetection.promptInputModel) {
					this._promptInputModel = commandDetection.promptInputModel;
					this._promptInputModelSubscriptions.value = combinedDisposable(
						this._promptInputModel.onDidChangeInput(e => this._sync(e)),
						this._promptInputModel.onDidFinishInput(() => this.hideSuggestWidget()),
					);
				}
			} else {
				this._promptInputModel = undefined;
			}
		}));
	}

	activate(xterm: Terminal): void {
		this._terminal = xterm;
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.VSCode, data => {
			return this._handleVSCodeSequence(data);
		}));
		this._register(xterm.onData(e => {
			if (!e.startsWith('\x1b[')) {
				this._lastUserData = e;
				this._lastUserDataTimestamp = Date.now();
			}
		}));
	}

	setPanel(panel: HTMLElement): void {
		this._panel = panel;
	}

	setScreen(screen: HTMLElement): void {
		this._screen = screen;
	}

	private _requestCompletions(): void {
		const builtinCompletionsConfig = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection).builtinCompletions;
		if (!this._codeCompletionsRequested && builtinCompletionsConfig.pwshCode) {
			this._onAcceptedCompletion.fire(SuggestAddon.requestEnableCodeCompletionsSequence);
			this._codeCompletionsRequested = true;
		}
		if (!this._gitCompletionsRequested && builtinCompletionsConfig.pwshGit) {
			this._onAcceptedCompletion.fire(SuggestAddon.requestEnableGitCompletionsSequence);
			this._gitCompletionsRequested = true;
		}

		// Request global completions if there are none cached
		if (this._cachedPwshCommands.size === 0) {
			this._requestGlobalCompletions();
		}

		// Ensure that a key has been pressed since the last accepted completion in order to prevent
		// completions being requested again right after accepting a completion
		if (this._lastUserDataTimestamp > this._lastAcceptedCompletionTimestamp) {
			this._onAcceptedCompletion.fire(SuggestAddon.requestCompletionsSequence);
		}
	}

	private _requestGlobalCompletions(): void {
		this._onAcceptedCompletion.fire(SuggestAddon.requestGlobalCompletionsSequence);
	}

	private _sync(promptInputState: IPromptInputModelState): void {
		const config = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection);

		if (!this._mostRecentPromptInputState || promptInputState.cursorIndex > this._mostRecentPromptInputState.cursorIndex) {
			// If input has been added
			let sent = false;

			// Quick suggestions
			if (!this._terminalSuggestWidgetVisibleContextKey.get()) {
				if (config.quickSuggestions) {
					const completionPrefix = promptInputState.value.substring(0, promptInputState.cursorIndex);
					if (promptInputState.cursorIndex === 1 || completionPrefix.match(/([\s\[])[^\s]$/)) {
						// Never request completions if the last key sequence was up or down as the user was likely
						// navigating history
						if (this._lastUserData !== /*up*/'\x1b[A' && this._lastUserData !== /*down*/'\x1b[B') {
							this._requestCompletions();
							sent = true;
						}
					}
				}
			}

			// Trigger characters - this happens even if the widget is showing
			if (config.suggestOnTriggerCharacters && !sent) {
				const lastChar = promptInputState.value.at(promptInputState.cursorIndex - 1);
				if (
					lastChar?.match(/[\-]/) ||
					// Only trigger on \ and / if it's a directory. Not doing so causes problems
					// with git branches in particular
					this._isFilteringDirectories && lastChar?.match(/[\\\/]/)
				) {
					this._requestCompletions();
					sent = true;
				}
			}
		}

		this._mostRecentPromptInputState = promptInputState;
		if (!this._promptInputModel || !this._terminal || !this._suggestWidget || !this._initialPromptInputState || this._leadingLineContent === undefined) {
			return;
		}

		this._currentPromptInputState = promptInputState;

		// Hide the widget if the latest character was a space
		if (this._currentPromptInputState.cursorIndex > 1 && this._currentPromptInputState.value.at(this._currentPromptInputState.cursorIndex - 1) === ' ') {
			this.hideSuggestWidget();
			return;
		}

		// Hide the widget if the cursor moves to the left of the initial position as the
		// completions are no longer valid
		if (this._currentPromptInputState.cursorIndex < this._initialPromptInputState.cursorIndex) {
			this.hideSuggestWidget();
			return;
		}

		if (this._terminalSuggestWidgetVisibleContextKey.get()) {
			this._cursorIndexDelta = this._currentPromptInputState.cursorIndex - this._initialPromptInputState.cursorIndex;
			let leadingLineContent = this._leadingLineContent + this._currentPromptInputState.value.substring(this._leadingLineContent.length, this._leadingLineContent.length + this._cursorIndexDelta);
			if (this._isFilteringDirectories) {
				leadingLineContent = normalizePathSeparator(leadingLineContent, this._pathSeparator);
			}
			const lineContext = new LineContext(leadingLineContent, this._cursorIndexDelta);
			this._suggestWidget.setLineContext(lineContext);
		}

		// Hide and clear model if there are no more items
		if (!this._suggestWidget.hasCompletions()) {
			this.hideSuggestWidget();
			return;
		}

		const dimensions = this._getTerminalDimensions();
		if (!dimensions.width || !dimensions.height) {
			return;
		}
		// TODO: What do frozen and auto do?
		const xtermBox = this._screen!.getBoundingClientRect();

		this._suggestWidget.showSuggestions(0, false, false, {
			left: xtermBox.left + this._terminal.buffer.active.cursorX * dimensions.width,
			top: xtermBox.top + this._terminal.buffer.active.cursorY * dimensions.height,
			height: dimensions.height
		});
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
			case VSCodeSuggestOscPt.CompletionsBash:
				this._handleCompletionsBashSequence(this._terminal, data, command, args);
				return true;
			case VSCodeSuggestOscPt.CompletionsBashFirstWord:
				return this._handleCompletionsBashFirstWordSequence(this._terminal, data, command, args);
		}

		// Unrecognized sequence
		return false;
	}

	private _handleCompletionsSequence(terminal: Terminal, data: string, command: string, args: string[]): void {
		// Nothing to handle if the terminal is not attached
		if (!terminal.element || !this._enableWidget || !this._promptInputModel) {
			return;
		}

		let replacementIndex = 0;
		let replacementLength = this._promptInputModel.cursorIndex;
		this._leadingLineContent = this._promptInputModel.value.substring(0, this._promptInputModel.cursorIndex);

		const payload = data.slice(command.length + args[0].length + args[1].length + args[2].length + 4/*semi-colons*/);
		const rawCompletions: PwshCompletion | PwshCompletion[] | CompressedPwshCompletion[] | CompressedPwshCompletion = args.length === 0 || payload.length === 0 ? undefined : JSON.parse(payload);
		const completions = parseCompletionsFromShell(rawCompletions);

		const firstChar = this._leadingLineContent.length === 0 ? '' : this._leadingLineContent[0];
		// This is a TabExpansion2 result
		if (this._leadingLineContent.includes(' ') || firstChar === '[') {
			replacementIndex = parseInt(args[0]);
			replacementLength = parseInt(args[1]);
			this._leadingLineContent = this._promptInputModel.value.substring(0, this._promptInputModel.cursorIndex);
		}
		// This is a global command, add cached commands list to completions
		else {
			completions.push(...this._cachedPwshCommands);
		}

		this._currentPromptInputState = {
			value: this._promptInputModel.value,
			cursorIndex: this._promptInputModel.cursorIndex,
			ghostTextIndex: this._promptInputModel.ghostTextIndex
		};
		this._cursorIndexDelta = 0;

		let leadingLineContent = this._leadingLineContent + this._currentPromptInputState.value.substring(this._leadingLineContent.length, this._leadingLineContent.length + this._cursorIndexDelta);
		// If there is a single directory in the completions:
		// - `\` and `/` are normalized such that either can be used
		// - Using `\` or `/` will request new completions. It's important that this only occurs
		//   when a directory is present, if not completions like git branches could be requested
		//   which leads to flickering
		this._isFilteringDirectories = completions.some(e => e.completion.isDirectory);
		if (this._isFilteringDirectories) {
			const firstDir = completions.find(e => e.completion.isDirectory);
			this._pathSeparator = firstDir?.completion.label.match(/(?<sep>[\\\/])/)?.groups?.sep ?? sep;
			leadingLineContent = normalizePathSeparator(leadingLineContent, this._pathSeparator);
		}
		const lineContext = new LineContext(leadingLineContent, this._cursorIndexDelta);
		const model = new SimpleCompletionModel(completions, lineContext, replacementIndex, replacementLength);
		this._handleCompletionModel(model);
	}

	// TODO: These aren't persisted across reloads
	// TODO: Allow triggering anywhere in the first word based on the cached completions
	private _cachedBashAliases: Set<SimpleCompletionItem> = new Set();
	private _cachedBashBuiltins: Set<SimpleCompletionItem> = new Set();
	private _cachedBashCommands: Set<SimpleCompletionItem> = new Set();
	private _cachedBashKeywords: Set<SimpleCompletionItem> = new Set();
	private _cachedFirstWord?: SimpleCompletionItem[];
	private _handleCompletionsBashFirstWordSequence(terminal: Terminal, data: string, command: string, args: string[]): boolean {
		const type = args[0];
		const completionList: string[] = data.slice(command.length + type.length + 2/*semi-colons*/).split(';');
		let set: Set<SimpleCompletionItem>;
		switch (type) {
			case 'alias': set = this._cachedBashAliases; break;
			case 'builtin': set = this._cachedBashBuiltins; break;
			case 'command': set = this._cachedBashCommands; break;
			case 'keyword': set = this._cachedBashKeywords; break;
			default: return false;
		}
		set.clear();
		const distinctLabels: Set<string> = new Set();
		for (const label of completionList) {
			distinctLabels.add(label);
		}
		for (const label of distinctLabels) {
			set.add(new SimpleCompletionItem({
				label,
				icon: Codicon.symbolString,
				detail: type
			}));
		}
		// Invalidate compound list cache
		this._cachedFirstWord = undefined;
		return true;
	}

	private _handleCompletionsBashSequence(terminal: Terminal, data: string, command: string, args: string[]): void {
		// Nothing to handle if the terminal is not attached
		if (!terminal.element) {
			return;
		}

		let replacementIndex = parseInt(args[0]);
		const replacementLength = parseInt(args[1]);
		if (!args[2]) {
			this._onBell.fire();
			return;
		}

		const completionList: string[] = data.slice(command.length + args[0].length + args[1].length + args[2].length + 4/*semi-colons*/).split(';');
		// TODO: Create a trigger suggest command which encapsulates sendSequence and uses cached if available
		let completions: SimpleCompletionItem[];
		// TODO: This 100 is a hack just for the prototype, this should get it based on some terminal input model
		if (replacementIndex !== 100 && completionList.length > 0) {
			completions = completionList.map(label => {
				return new SimpleCompletionItem({
					label: label,
					icon: Codicon.symbolProperty
				});
			});
		} else {
			replacementIndex = 0;
			if (!this._cachedFirstWord) {
				this._cachedFirstWord = [
					...this._cachedBashAliases,
					...this._cachedBashBuiltins,
					...this._cachedBashCommands,
					...this._cachedBashKeywords
				];
				this._cachedFirstWord.sort((a, b) => {
					const aCode = a.completion.label.charCodeAt(0);
					const bCode = b.completion.label.charCodeAt(0);
					const isANonAlpha = aCode < 65 || aCode > 90 && aCode < 97 || aCode > 122 ? 1 : 0;
					const isBNonAlpha = bCode < 65 || bCode > 90 && bCode < 97 || bCode > 122 ? 1 : 0;
					if (isANonAlpha !== isBNonAlpha) {
						return isANonAlpha - isBNonAlpha;
					}
					return a.completion.label.localeCompare(b.completion.label);
				});
			}
			completions = this._cachedFirstWord;
		}
		if (completions.length === 0) {
			return;
		}

		this._leadingLineContent = completions[0].completion.label.slice(0, replacementLength);
		const model = new SimpleCompletionModel(completions, new LineContext(this._leadingLineContent, replacementIndex), replacementIndex, replacementLength);
		if (completions.length === 1) {
			const insertText = completions[0].completion.label.substring(replacementLength);
			if (insertText.length === 0) {
				this._onBell.fire();
				return;
			}
		}
		this._handleCompletionModel(model);
	}

	private _getTerminalDimensions(): { width: number; height: number } {
		const cssCellDims = (this._terminal as any as { _core: IXtermCore })._core._renderService.dimensions.css.cell;
		return {
			width: cssCellDims.width,
			height: cssCellDims.height,
		};
	}

	private _handleCompletionModel(model: SimpleCompletionModel): void {
		if (model.items.length === 0 || !this._terminal?.element || !this._promptInputModel) {
			return;
		}
		this._model = model;
		const suggestWidget = this._ensureSuggestWidget(this._terminal);
		const dimensions = this._getTerminalDimensions();
		if (!dimensions.width || !dimensions.height) {
			return;
		}
		// TODO: What do frozen and auto do?
		const xtermBox = this._screen!.getBoundingClientRect();
		this._initialPromptInputState = {
			value: this._promptInputModel.value,
			cursorIndex: this._promptInputModel.cursorIndex,
			ghostTextIndex: this._promptInputModel.ghostTextIndex
		};
		suggestWidget.setCompletionModel(model);
		suggestWidget.showSuggestions(0, false, false, {
			left: xtermBox.left + this._terminal.buffer.active.cursorX * dimensions.width,
			top: xtermBox.top + this._terminal.buffer.active.cursorY * dimensions.height,
			height: dimensions.height
		});
	}

	private _ensureSuggestWidget(terminal: Terminal): SimpleSuggestWidget {
		this._terminalSuggestWidgetVisibleContextKey.set(true);
		if (!this._suggestWidget) {
			const c = this._terminalConfigurationService.config;
			const font = this._terminalConfigurationService.getFont(dom.getActiveWindow());
			const fontInfo = {
				fontFamily: font.fontFamily,
				fontSize: font.fontSize,
				lineHeight: Math.ceil(1.5 * font.fontSize),
				fontWeight: c.fontWeight.toString(),
				letterSpacing: font.letterSpacing
			};
			this._suggestWidget = this._register(this._instantiationService.createInstance(
				SimpleSuggestWidget,
				this._panel!,
				this._instantiationService.createInstance(PersistedWidgetSize),
				() => fontInfo,
				{}
			));
			this._suggestWidget.list.style(getListStyles({
				listInactiveFocusBackground: editorSuggestWidgetSelectedBackground,
				listInactiveFocusOutline: activeContrastBorder
			}));
			this._register(this._suggestWidget.onDidSelect(async e => this.acceptSelectedSuggestion(e)));
			this._register(this._suggestWidget.onDidHide(() => this._terminalSuggestWidgetVisibleContextKey.set(false)));
			this._register(this._suggestWidget.onDidShow(() => this._terminalSuggestWidgetVisibleContextKey.set(true)));
		}
		return this._suggestWidget;
	}

	selectPreviousSuggestion(): void {
		this._suggestWidget?.selectPrevious();
	}

	selectPreviousPageSuggestion(): void {
		this._suggestWidget?.selectPreviousPage();
	}

	selectNextSuggestion(): void {
		this._suggestWidget?.selectNext();
	}

	selectNextPageSuggestion(): void {
		this._suggestWidget?.selectNextPage();
	}

	acceptSelectedSuggestion(suggestion?: Pick<ISimpleSelectedSuggestion, 'item' | 'model'>, respectRunOnEnter?: boolean): void {
		if (!suggestion) {
			suggestion = this._suggestWidget?.getFocusedItem();
		}
		const initialPromptInputState = this._initialPromptInputState ?? this._mostRecentPromptInputState;
		if (!suggestion || !initialPromptInputState || !this._leadingLineContent || !this._model) {
			return;
		}
		this._lastAcceptedCompletionTimestamp = Date.now();
		this._suggestWidget?.hide();

		const currentPromptInputState = this._currentPromptInputState ?? initialPromptInputState;

		// The replacement text is any text after the replacement index for the completions, this
		// includes any text that was there before the completions were requested and any text added
		// since to refine the completion.
		const replacementText = currentPromptInputState.value.substring(this._model.replacementIndex, currentPromptInputState.cursorIndex);

		// Right side of replacement text in the same word
		let rightSideReplacementText = '';
		if (
			// The line didn't end with ghost text
			(currentPromptInputState.ghostTextIndex === -1 || currentPromptInputState.ghostTextIndex > currentPromptInputState.cursorIndex) &&
			// There is more than one charatcer
			currentPromptInputState.value.length > currentPromptInputState.cursorIndex + 1 &&
			// THe next character is not a space
			currentPromptInputState.value.at(currentPromptInputState.cursorIndex) !== ' '
		) {
			const spaceIndex = currentPromptInputState.value.substring(currentPromptInputState.cursorIndex, currentPromptInputState.ghostTextIndex === -1 ? undefined : currentPromptInputState.ghostTextIndex).indexOf(' ');
			rightSideReplacementText = currentPromptInputState.value.substring(currentPromptInputState.cursorIndex, spaceIndex === -1 ? undefined : currentPromptInputState.cursorIndex + spaceIndex);
		}

		const completion = suggestion.item.completion;
		const completionText = completion.label;

		let runOnEnter = false;
		if (respectRunOnEnter) {
			const runOnEnterConfig = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection).runOnEnter;
			switch (runOnEnterConfig) {
				case 'always': {
					runOnEnter = true;
					break;
				}
				case 'exactMatch': {
					runOnEnter = replacementText.toLowerCase() === completionText.toLowerCase();
					break;
				}
				case 'exactMatchIgnoreExtension': {
					runOnEnter = replacementText.toLowerCase() === completionText.toLowerCase();
					if (completion.icon === Codicon.symbolFile || completion.icon === Codicon.symbolMethod) {
						runOnEnter ||= replacementText.toLowerCase() === completionText.toLowerCase().replace(/\.[^\.]+$/, '');
					}
					break;
				}
			}
		}

		// For folders, allow the next completion request to get completions for that folder
		if (completion.icon === Codicon.folder) {
			this._lastAcceptedCompletionTimestamp = 0;
		}

		const commonPrefixLen = commonPrefixLength(replacementText, completion.label);

		// Send the completion
		this._onAcceptedCompletion.fire([
			// Backspace (left) to remove all additional input
			'\x7F'.repeat(replacementText.length - commonPrefixLen),
			// Delete (right) to remove any additional text in the same word
			'\x1b[3~'.repeat(rightSideReplacementText.length),
			// Write the completion
			completion.label.substring(commonPrefixLen),
			// Run on enter if needed
			runOnEnter ? '\r' : ''
		].join(''));

		this.hideSuggestWidget();
	}

	hideSuggestWidget(): void {
		this._initialPromptInputState = undefined;
		this._currentPromptInputState = undefined;
		this._suggestWidget?.hide();
	}
}

class PersistedWidgetSize {

	private readonly _key = TerminalStorageKeys.TerminalSuggestSize;

	constructor(
		@IStorageService private readonly _storageService: IStorageService
	) {
	}

	restore(): dom.Dimension | undefined {
		const raw = this._storageService.get(this._key, StorageScope.PROFILE) ?? '';
		try {
			const obj = JSON.parse(raw);
			if (dom.Dimension.is(obj)) {
				return dom.Dimension.lift(obj);
			}
		} catch {
			// ignore
		}
		return undefined;
	}

	store(size: dom.Dimension) {
		this._storageService.store(this._key, JSON.stringify(size), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	reset(): void {
		this._storageService.remove(this._key, StorageScope.PROFILE);
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
			}));
		} else if (Array.isArray(rawCompletions[0])) {
			typedRawCompletions = (rawCompletions as CompressedPwshCompletion[]).map(e => ({
				CompletionText: e[0],
				ResultType: e[1],
				ToolTip: e[2],
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
	if (rawCompletion.ResultType === 4 && !label.match(/^\.\.?$/) && !label.match(/[\\\/]$/)) {
		const separator = label.match(/(?<sep>[\\\/])/)?.groups?.sep ?? sep;
		label = label + separator;
	}

	// If tooltip is not present it means it's the same as label
	const detail = rawCompletion.ToolTip ?? label;

	// Pwsh gives executables a result type of 2, but we want to treat them as files wrt the sorting
	// and file extension score boost. An example of where this improves the experience is typing
	// `git`, `git.exe` should appear at the top and beat `git-lfs.exe`. Keep the same icon though.
	const icon = getIcon(rawCompletion.ResultType, detail);
	const isExecutable = rawCompletion.ResultType === 2 && rawCompletion.CompletionText.match(/\.[a-z]{2,4}$/i);
	if (isExecutable) {
		rawCompletion.ResultType = 3;
	}

	return new SimpleCompletionItem({
		label,
		icon,
		detail,
		isFile: rawCompletion.ResultType === 3,
		isDirectory: rawCompletion.ResultType === 4,
	});
}

function getIcon(resultType: number, tooltip: string): ThemeIcon {
	// Assume anything with type DynamicKeyword is a git branch
	if (resultType === 13) {
		if (tooltip.startsWith('branch ')) {
			return Codicon.gitBranch;
		}
		if (tooltip.startsWith('tag ')) {
			return Codicon.tag;
		}
		if (tooltip.startsWith('remote ')) {
			return Codicon.remote;
		}
		if (tooltip.startsWith('stash ')) {
			return Codicon.gitStash;
		}
	}
	return pwshTypeToIconMap[resultType] ?? Codicon.symbolText;
}

function normalizePathSeparator(path: string, sep: string): string {
	if (sep === '/') {
		return path.replaceAll('\\', '/');
	}
	return path.replaceAll('/', '\\');
}
