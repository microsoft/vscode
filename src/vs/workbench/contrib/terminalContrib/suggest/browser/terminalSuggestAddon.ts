/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { SimpleCompletionItem } from 'vs/workbench/services/suggest/browser/simpleCompletionItem';
import { LineContext, SimpleCompletionModel } from 'vs/workbench/services/suggest/browser/simpleCompletionModel';
import { ISimpleSelectedSuggestion, SimpleSuggestWidget } from 'vs/workbench/services/suggest/browser/simpleSuggestWidget';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { combinedDisposable, Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { editorSuggestWidgetSelectedBackground } from 'vs/editor/contrib/suggest/browser/suggestWidget';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { activeContrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { ITerminalConfigurationService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalStorageKeys } from 'vs/workbench/contrib/terminal/common/terminalStorageKeys';
import type { ITerminalAddon, Terminal } from '@xterm/xterm';

import { getListStyles } from 'vs/platform/theme/browser/defaultStyles';
import { TerminalCapability, type ITerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/capabilities';
import type { IPromptInputModel, IPromptInputModelState } from 'vs/platform/terminal/common/capabilities/commandDetection/promptInputModel';
import { ShellIntegrationOscPs } from 'vs/platform/terminal/common/xterm/shellIntegrationAddon';
import type { IXtermCore } from 'vs/workbench/contrib/terminal/browser/xterm-private';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { terminalSuggestConfigSection, type ITerminalSuggestConfiguration } from 'vs/workbench/contrib/terminalContrib/suggest/common/terminalSuggestConfiguration';

const enum VSCodeOscPt {
	Completions = 'Completions',
	CompletionsPwshCommands = 'CompletionsPwshCommands',
	CompletionsBash = 'CompletionsBash',
	CompletionsBashFirstWord = 'CompletionsBashFirstWord'
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

	private _panel?: HTMLElement;
	private _screen?: HTMLElement;
	private _suggestWidget?: SimpleSuggestWidget;
	private _enableWidget: boolean = true;

	// TODO: Remove these in favor of prompt input state
	private _leadingLineContent?: string;
	private _cursorIndexDelta: number = 0;

	static requestCompletionsSequence = '\x1b[24~e'; // F12,e

	private readonly _onBell = this._register(new Emitter<void>());
	readonly onBell = this._onBell.event;
	private readonly _onAcceptedCompletion = this._register(new Emitter<string>());
	readonly onAcceptedCompletion = this._onAcceptedCompletion.event;

	constructor(
		private readonly _capabilities: ITerminalCapabilityStore,
		private readonly _terminalSuggestWidgetVisibleContextKey: IContextKey<boolean>,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService
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
	}

	setPanel(panel: HTMLElement): void {
		this._panel = panel;
	}

	setScreen(screen: HTMLElement): void {
		this._screen = screen;
	}

	private _requestCompletions(): void {
		// TODO: Debounce? Prevent this flooding the channel
		this._onAcceptedCompletion.fire(SuggestAddon.requestCompletionsSequence);
	}

	private _sync(promptInputState: IPromptInputModelState): void {
		const config = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection);
		const enabled = config.enabled || this._terminalConfigurationService.config.shellIntegration?.suggestEnabled;
		if (!enabled) {
			return;
		}

		if (!this._terminalSuggestWidgetVisibleContextKey.get()) {
			// If input has been added
			if (!this._mostRecentPromptInputState || promptInputState.cursorIndex > this._mostRecentPromptInputState.cursorIndex) {
				let sent = false;

				// Quick suggestions
				if (config.quickSuggestions) {
					const completionPrefix = promptInputState.value.substring(0, promptInputState.cursorIndex);
					if (promptInputState.cursorIndex === 1 || completionPrefix.match(/([\s\[])[^\s]$/)) {
						this._requestCompletions();
						sent = true;
					}
				}

				// Trigger characters
				if (config.suggestOnTriggerCharacters && !sent) {
					const lastChar = promptInputState.value.at(promptInputState.cursorIndex - 1);
					if (lastChar?.match(/[\\\/\-]/)) {
						this._requestCompletions();
						sent = true;
					}
				}
			}
		}

		this._mostRecentPromptInputState = promptInputState;
		if (!this._promptInputModel || !this._terminal || !this._suggestWidget || !this._initialPromptInputState) {
			return;
		}

		this._currentPromptInputState = promptInputState;


		// Hide the widget if the cursor moves to the left of the initial position as the
		// completions are no longer valid
		if (this._currentPromptInputState.cursorIndex < this._initialPromptInputState.cursorIndex) {
			this.hideSuggestWidget();
			return;
		}

		if (this._terminalSuggestWidgetVisibleContextKey.get()) {
			const inputBeforeCursor = this._currentPromptInputState.value.substring(0, this._currentPromptInputState.cursorIndex);
			this._cursorIndexDelta = this._currentPromptInputState.cursorIndex - this._initialPromptInputState.cursorIndex;
			this._suggestWidget.setLineContext(new LineContext(inputBeforeCursor, this._cursorIndexDelta));
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
		const panelBox = this._panel!.offsetParent!.getBoundingClientRect();

		this._suggestWidget.showSuggestions(0, false, false, {
			left: (xtermBox.left - panelBox.left) + this._terminal.buffer.active.cursorX * dimensions.width,
			top: (xtermBox.top - panelBox.top) + this._terminal.buffer.active.cursorY * dimensions.height,
			height: dimensions.height
		});
	}

	private _handleVSCodeSequence(data: string): boolean {
		if (!this._terminal) {
			return false;
		}

		// Pass the sequence along to the capability
		const [command, ...args] = data.split(';');
		switch (command) {
			case VSCodeOscPt.Completions:
				this._handleCompletionsSequence(this._terminal, data, command, args);
				return true;
			case VSCodeOscPt.CompletionsPwshCommands:
				this._handleCompletionsPwshCommandsSequence(this._terminal, data, command, args);
			case VSCodeOscPt.CompletionsBash:
				this._handleCompletionsBashSequence(this._terminal, data, command, args);
				return true;
			case VSCodeOscPt.CompletionsBashFirstWord:
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

		const payload = data.slice(command.length + args[0].length + args[1].length + args[2].length + 4/*semi-colons*/);
		let completionList: IPwshCompletion[] | IPwshCompletion = args.length === 0 || payload.length === 0 ? [] : JSON.parse(payload);
		if (!Array.isArray(completionList)) {
			completionList = [completionList];
		}
		const completions = completionList.map((e: any) => {
			return new SimpleCompletionItem({
				label: e.ListItemText,
				completionText: e.CompletionText,
				icon: pwshTypeToIconMap[e.ResultType],
				detail: e.ToolTip
			});
		});

		this._leadingLineContent = this._promptInputModel.value.substring(0, this._promptInputModel.cursorIndex);

		// If there's no space it means this is a command, add cached commands list to completions
		const firstChar = this._leadingLineContent.length === 0 ? '' : this._leadingLineContent[0];
		if (this._leadingLineContent.trim().includes(' ') || firstChar === '[') {
			replacementIndex = parseInt(args[0]);
			replacementLength = parseInt(args[1]);
			this._leadingLineContent = completions[0]?.completion.label.slice(0, replacementLength) ?? '';
		} else {
			completions.push(...this._cachedPwshCommands);
		}
		this._cursorIndexDelta = replacementIndex;

		const model = new SimpleCompletionModel(completions, new LineContext(this._leadingLineContent, replacementIndex), replacementIndex, replacementLength);
		this._handleCompletionModel(model);
	}

	// TODO: These aren't persisted across reloads
	private _cachedPwshCommands: Set<SimpleCompletionItem> = new Set();
	private _handleCompletionsPwshCommandsSequence(terminal: Terminal, data: string, command: string, args: string[]): void {
		const type = args[0];
		let completionList: IPwshCompletion[] | IPwshCompletion = JSON.parse(data.slice(command.length + type.length + 2/*semi-colons*/));
		if (!Array.isArray(completionList)) {
			completionList = [completionList];
		}
		const set = this._cachedPwshCommands;
		set.clear();

		const completions = completionList.map((e: any) => {
			return new SimpleCompletionItem({
				label: e.ListItemText,
				completionText: e.CompletionText,
				icon: pwshTypeToIconMap[e.ResultType],
				detail: e.ToolTip
			});
		});
		for (const c of completions) {
			set.add(c);
		}
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
		const suggestWidget = this._ensureSuggestWidget(this._terminal);
		const dimensions = this._getTerminalDimensions();
		if (!dimensions.width || !dimensions.height) {
			return;
		}
		// TODO: What do frozen and auto do?
		const xtermBox = this._screen!.getBoundingClientRect();
		const panelBox = this._panel!.offsetParent!.getBoundingClientRect();
		this._initialPromptInputState = {
			value: this._promptInputModel.value,
			cursorIndex: this._promptInputModel.cursorIndex,
			ghostTextIndex: this._promptInputModel.ghostTextIndex
		};
		suggestWidget.setCompletionModel(model);
		suggestWidget.showSuggestions(0, false, false, {
			left: (xtermBox.left - panelBox.left) + this._terminal.buffer.active.cursorX * dimensions.width,
			top: (xtermBox.top - panelBox.top) + this._terminal.buffer.active.cursorY * dimensions.height,
			height: dimensions.height
		});
	}

	private _ensureSuggestWidget(terminal: Terminal): SimpleSuggestWidget {
		this._terminalSuggestWidgetVisibleContextKey.set(true);
		if (!this._suggestWidget) {
			this._suggestWidget = this._register(this._instantiationService.createInstance(
				SimpleSuggestWidget,
				this._panel!,
				this._instantiationService.createInstance(PersistedWidgetSize),
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

	acceptSelectedSuggestion(suggestion?: Pick<ISimpleSelectedSuggestion, 'item' | 'model'>): void {
		if (!suggestion) {
			suggestion = this._suggestWidget?.getFocusedItem();
		}
		const initialPromptInputState = this._initialPromptInputState ?? this._mostRecentPromptInputState;
		if (!suggestion || !initialPromptInputState) {
			return;
		}
		this._suggestWidget?.hide();

		const currentPromptInputState = this._currentPromptInputState ?? initialPromptInputState;
		const additionalInput = currentPromptInputState.value.substring(initialPromptInputState.cursorIndex, currentPromptInputState.cursorIndex);

		// Get the final completion on the right side of the cursor
		const initialInput = initialPromptInputState.value.substring(0, (this._leadingLineContent?.length ?? 0));
		const lastSpaceIndex = initialInput.lastIndexOf(' ');
		const completion = suggestion.item.completion;
		const completionText = completion.completionText ?? completion.label;
		const finalCompletionRightSide = completionText.substring((this._leadingLineContent?.length ?? 0) - (lastSpaceIndex === -1 ? 0 : lastSpaceIndex + 1));

		// Get the final completion on the right side of the cursor if it differs from the initial
		// propmt input state
		let finalCompletionLeftSide = completionText.substring(0, (this._leadingLineContent?.length ?? 0) - (lastSpaceIndex === -1 ? 0 : lastSpaceIndex + 1));
		if (initialInput.endsWith(finalCompletionLeftSide)) {
			finalCompletionLeftSide = '';
		}

		// Send the completion
		this._onAcceptedCompletion.fire([
			// Backspace to remove all additional input
			'\x7F'.repeat(additionalInput.length),
			// Backspace to remove left side of completion
			'\x7F'.repeat(finalCompletionLeftSide.length),
			// Write the left side of the completion if it differed
			finalCompletionLeftSide,
			// Write the completion
			finalCompletionRightSide,
		].join(''));

		this.hideSuggestWidget();
	}

	hideSuggestWidget(): void {
		this._initialPromptInputState = undefined;
		this._currentPromptInputState = undefined;
		this._suggestWidget?.hide();
	}
}

interface IPwshCompletion {
	CompletionText: string;
	ListItemText: string;
	ResultType: number;
	ToolTip: string;
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
