/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { SimpleCompletionItem } from 'vs/base/browser/ui/suggest/simpleCompletionItem';
import { LineContext, SimpleCompletionModel } from 'vs/base/browser/ui/suggest/simpleCompletionModel';
import { ISimpleSelectedSuggestion, SimpleSuggestWidget } from 'vs/base/browser/ui/suggest/simpleSuggestWidget';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { editorSuggestWidgetSelectedBackground } from 'vs/editor/contrib/suggest/browser/suggestWidget';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { activeContrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { attachListStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ISuggestController } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalStorageKeys } from 'vs/workbench/contrib/terminal/common/terminalStorageKeys';
import { ITerminalAddon, Terminal } from 'xterm';

const enum ShellIntegrationOscPs {
	// TODO: Pull from elsewhere
	VSCode = 633
}

const enum VSCodeOscPt {
	Completions = 'Completions',
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
const pwshTypeToIconMap: { [type: string]: Codicon | undefined } = {
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

export class SuggestAddon extends Disposable implements ITerminalAddon, ISuggestController {
	private _terminal?: Terminal;
	private _container?: HTMLElement;
	private _suggestWidget?: SimpleSuggestWidget;
	private _leadingLineContent?: string;
	private _additionalInput?: string;

	private readonly _onBell = new Emitter<void>();
	readonly onBell = this._onBell.event;
	private readonly _onAcceptedCompletion = new Emitter<string>();
	readonly onAcceptedCompletion = this._onAcceptedCompletion.event;

	constructor(
		private readonly _terminalSuggestWidgetVisibleContextKey: IContextKey<boolean>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();
	}

	activate(xterm: Terminal): void {
		this._terminal = xterm;
		this._register(xterm.parser.registerOscHandler(ShellIntegrationOscPs.VSCode, data => this._handleVSCodeSequence(data)));
	}

	setContainer(container: HTMLElement): void {
		this._container = container;
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
		if (!terminal.element) {
			return;
		}

		const replacementIndex = parseInt(args[0]);
		const replacementLength = parseInt(args[1]);
		if (!args[2]) {
			this._onBell.fire();
			return;
		}

		let completionList: IPwshCompletion[] | IPwshCompletion = JSON.parse(data.slice(command.length + args[0].length + args[1].length + 3/*semi-colons*/));
		if (!Array.isArray(completionList)) {
			completionList = [completionList];
		}
		const completions = completionList.map((e: any) => {
			return new SimpleCompletionItem({
				label: e.CompletionText,
				icon: pwshTypeToIconMap[e.ResultType],
				detail: e.ToolTip
			});
		});

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

		const completionList: string[] = data.slice(command.length + args[0].length + args[1].length + 3/*semi-colons*/).split(';');
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

	private _handleCompletionModel(model: SimpleCompletionModel): void {
		if (model.items.length === 0 || !this._terminal?.element) {
			return;
		}
		if (model.items.length === 1) {
			this.acceptSelectedSuggestion({
				item: model.items[0],
				model: model
			});
			return;
		}
		const suggestWidget = this._ensureSuggestWidget(this._terminal);
		this._additionalInput = undefined;
		const dimensions = {
			width: (this._terminal as any)._core._renderService.dimensions.device.cell.width,
			height: (this._terminal as any)._core._renderService.dimensions.device.cell.height,
		};
		if (!dimensions.width || !dimensions.height) {
			return;
		}
		// TODO: What do frozen and auto do?
		const xtermBox = this._terminal.element.getBoundingClientRect();
		// TODO: Layer breaker, unsafe and won't work for terminal editors
		const panelElement = dom.findParentWithClass(this._container!, 'panel')!.offsetParent as HTMLElement;
		const panelBox = panelElement.getBoundingClientRect();
		suggestWidget.showSuggestions(model, 0, false, false, {
			left: (xtermBox.left - panelBox.left) + this._terminal.buffer.active.cursorX * dimensions.width,
			top: (xtermBox.top - panelBox.top) + this._terminal.buffer.active.cursorY * dimensions.height,
			height: dimensions.height
		});
	}

	private _ensureSuggestWidget(terminal: Terminal): SimpleSuggestWidget {
		if (!this._suggestWidget) {
			// TODO: Layer breaker
			this._suggestWidget = this._register(new SimpleSuggestWidget(
				dom.findParentWithClass(this._container!, 'panel')!,
				this._instantiationService.createInstance(PersistedWidgetSize)
			));
			this._register(attachListStyler(this._suggestWidget.list, this._themeService, {
				listInactiveFocusBackground: editorSuggestWidgetSelectedBackground,
				listInactiveFocusOutline: activeContrastBorder
			}));
			this._suggestWidget.onDidSelect(async e => this.acceptSelectedSuggestion(e));
			this._suggestWidget.onDidHide(() => this._terminalSuggestWidgetVisibleContextKey.set(false));
			this._suggestWidget.onDidShow(() => this._terminalSuggestWidgetVisibleContextKey.set(true));
			this._register(terminal.onData(e => this._handleTerminalInput(e)));
		}
		return this._suggestWidget;
	}

	selectPreviousSuggestion(): void {
		this._suggestWidget?.selectPrevious();
	}

	selectNextSuggestion(): void {
		this._suggestWidget?.selectNext();
	}

	acceptSelectedSuggestion(suggestion?: Pick<ISimpleSelectedSuggestion, 'item' | 'model'>): void {
		if (!suggestion) {
			suggestion = this._suggestWidget?.getFocusedItem();
		}
		if (suggestion) {
			this._suggestWidget?.hide();
			const initialCompletion = suggestion.item.completion.label.substring(suggestion.model.replacementLength);
			// Find first character index that differs in order to gather the number of times to hit
			// backspace
			let i = 0;
			if (this._additionalInput) {
				for (; i < this._additionalInput?.length; i++) {
					if (initialCompletion[i] !== this._additionalInput[i]) {
						break;
					}
				}
			}
			let result = '\x7F'.repeat((this._additionalInput?.length || 0) - i);
			result += initialCompletion.slice(i);
			this._onAcceptedCompletion.fire(result);
		}
	}

	hideSuggestWidget(): void {
		this._suggestWidget?.hide();
	}

	handleNonXtermData(data: string): void {
		this._handleTerminalInput(data);
	}

	private _handleTerminalInput(data: string): void {
		if (!this._terminal || !this._terminalSuggestWidgetVisibleContextKey.get()) {
			return;
		}
		let handled = false;
		// Backspace
		if (data === '\x7f') {
			if (this._additionalInput && this._additionalInput.length > 0) {
				handled = true;
				this._additionalInput = this._additionalInput.substring(0, this._additionalInput.length - 1);
			}
		}
		if (data.match(/[a-z]/i)) {
			handled = true;
			if (this._additionalInput === undefined) {
				this._additionalInput = '';
			}
			this._additionalInput += data;
		}
		if (handled) {
			// typed -> moved cursor RIGHT -> update UI
			// TODO: Leading line content is not correct
			this._suggestWidget?.setLineContext(new LineContext(this._leadingLineContent! + this._additionalInput, this._additionalInput!.length));

			// Hide and clear model if there are no more items
			if ((this._suggestWidget as any)._completionModel?.items.length === 0) {
				this._additionalInput = undefined;
				this.hideSuggestWidget();
				return;
			}

			const dimensions = {
				width: (this._terminal as any)._core._renderService.dimensions.actualCellWidth,
				height: (this._terminal as any)._core._renderService.dimensions.actualCellHeight,
			};
			if (!dimensions) {
				return;
			}
			// TODO: What do frozen and auto do?
			const xtermBox = this._terminal.element!.getBoundingClientRect();
			// TODO: Layer breaker, unsafe and won't work for terminal editors
			const panelElement = dom.findParentWithClass(this._container!, 'panel')!.offsetParent as HTMLElement;
			const panelBox = panelElement.getBoundingClientRect();
			this._suggestWidget?.showSuggestions((this._suggestWidget as any)._completionModel, 0, false, false, {
				left: (xtermBox.left - panelBox.left) + this._terminal.buffer.active.cursorX * dimensions.width,
				top: (xtermBox.top - panelBox.top) + this._terminal.buffer.active.cursorY * dimensions.height,
				height: dimensions.height
			});
		} else {
			this._additionalInput = undefined;
			this.hideSuggestWidget();
		}
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
