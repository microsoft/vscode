/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITerminalAddon, Terminal } from '@xterm/xterm';
import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { combinedDisposable, Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { sep } from '../../../../../base/common/path.js';
import { commonPrefixLength } from '../../../../../base/common/strings.js';
import { editorSuggestWidgetSelectedBackground } from '../../../../../editor/contrib/suggest/browser/suggestWidget.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TerminalCapability, type ITerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import type { IPromptInputModel, IPromptInputModelState } from '../../../../../platform/terminal/common/capabilities/commandDetection/promptInputModel.js';
import { getListStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { activeContrastBorder } from '../../../../../platform/theme/common/colorRegistry.js';
import { ITerminalConfigurationService } from '../../../terminal/browser/terminal.js';
import type { IXtermCore } from '../../../terminal/browser/xterm-private.js';
import { TerminalStorageKeys } from '../../../terminal/common/terminalStorageKeys.js';
import { terminalSuggestConfigSection, type ITerminalSuggestConfiguration } from '../common/terminalSuggestConfiguration.js';
import { SimpleCompletionItem } from '../../../../services/suggest/browser/simpleCompletionItem.js';
import { LineContext, SimpleCompletionModel } from '../../../../services/suggest/browser/simpleCompletionModel.js';
import { ISimpleSelectedSuggestion, SimpleSuggestWidget } from '../../../../services/suggest/browser/simpleSuggestWidget.js';
import type { ISimpleSuggestWidgetFontInfo } from '../../../../services/suggest/browser/simpleSuggestWidgetRenderer.js';
import { ITerminalCompletion, ITerminalCompletionService, TerminalCompletionItemKind } from './terminalCompletionService.js';
import { TerminalShellType } from '../../../../../platform/terminal/common/terminal.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';

export interface ISuggestController {
	isPasting: boolean;
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
	private _currentPromptInputState?: IPromptInputModelState;
	private _model?: SimpleCompletionModel;

	private _container?: HTMLElement;
	private _screen?: HTMLElement;
	private _suggestWidget?: SimpleSuggestWidget;
	private _enableWidget: boolean = true;
	private _pathSeparator: string = sep;
	private _isFilteringDirectories: boolean = false;
	private _mostRecentCompletion?: ITerminalCompletion;

	// TODO: Remove these in favor of prompt input state
	private _leadingLineContent?: string;
	private _cursorIndexDelta: number = 0;
	private _requestedCompletionsIndex: number = 0;
	private _providerReplacementIndex: number = 0;

	private _lastUserData?: string;
	static lastAcceptedCompletionTimestamp: number = 0;
	private _lastUserDataTimestamp: number = 0;

	private _cancellationTokenSource: CancellationTokenSource | undefined;

	isPasting: boolean = false;

	private readonly _onBell = this._register(new Emitter<void>());
	readonly onBell = this._onBell.event;
	private readonly _onAcceptedCompletion = this._register(new Emitter<string>());
	readonly onAcceptedCompletion = this._onAcceptedCompletion.event;
	private readonly _onDidReceiveCompletions = this._register(new Emitter<void>());
	readonly onDidReceiveCompletions = this._onDidReceiveCompletions.event;

	private _kindToIconMap = new Map<number, ThemeIcon>([
		[TerminalCompletionItemKind.File, Codicon.file],
		[TerminalCompletionItemKind.Folder, Codicon.folder],
		[TerminalCompletionItemKind.Flag, Codicon.symbolProperty],
		[TerminalCompletionItemKind.Method, Codicon.symbolMethod],
		[TerminalCompletionItemKind.Argument, Codicon.symbolVariable]
	]);

	constructor(
		private readonly _shellType: TerminalShellType | undefined,
		private readonly _capabilities: ITerminalCapabilityStore,
		private readonly _terminalSuggestWidgetVisibleContextKey: IContextKey<boolean>,
		@ITerminalCompletionService private readonly _terminalCompletionService: ITerminalCompletionService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService,
		@IExtensionService private readonly _extensionService: IExtensionService
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
		this._register(xterm.onData(async e => {
			this._lastUserData = e;
			this._lastUserDataTimestamp = Date.now();
		}));
	}

	private async _handleCompletionProviders(terminal: Terminal | undefined, token: CancellationToken, triggerCharacter?: boolean): Promise<void> {
		// Nothing to handle if the terminal is not attached
		if (!terminal?.element || !this._enableWidget || !this._promptInputModel) {
			return;
		}

		// Only show the suggest widget if the terminal is focused
		if (!dom.isAncestorOfActiveElement(terminal.element)) {
			return;
		}

		if (!this._shellType) {
			return;
		}

		let doNotRequestExtensionCompletions = false;
		// Ensure that a key has been pressed since the last accepted completion in order to prevent
		// completions being requested again right after accepting a completion
		if (this._lastUserDataTimestamp < SuggestAddon.lastAcceptedCompletionTimestamp) {
			doNotRequestExtensionCompletions = true;
		}

		const enableExtensionCompletions = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection).enableExtensionCompletions;
		if (enableExtensionCompletions && !doNotRequestExtensionCompletions) {
			await this._extensionService.activateByEvent('onTerminalCompletionsRequested');
		}

		const providedCompletions = await this._terminalCompletionService.provideCompletions(this._promptInputModel.value, this._promptInputModel.cursorIndex, this._shellType, token, triggerCharacter, doNotRequestExtensionCompletions);
		if (!providedCompletions?.length || token.isCancellationRequested) {
			return;
		}
		this._onDidReceiveCompletions.fire();

		// ATM, the two providers calculate the same replacement index / prefix, so we can just take the first one
		// TODO: figure out if we can add support for multiple replacement indices
		const replacementIndices = [...new Set(providedCompletions.map(c => c.replacementIndex))];
		const replacementIndex = replacementIndices.length === 1 ? replacementIndices[0] : 0;
		this._providerReplacementIndex = replacementIndex;
		this._requestedCompletionsIndex = this._promptInputModel.cursorIndex;

		this._currentPromptInputState = {
			value: this._promptInputModel.value,
			prefix: this._promptInputModel.prefix,
			suffix: this._promptInputModel.suffix,
			cursorIndex: this._promptInputModel.cursorIndex,
			ghostTextIndex: this._promptInputModel.ghostTextIndex
		};

		this._leadingLineContent = this._currentPromptInputState.prefix.substring(replacementIndex, replacementIndex + this._promptInputModel.cursorIndex + this._cursorIndexDelta);

		const completions = providedCompletions.flat();
		if (!completions?.length) {
			return;
		}

		const firstChar = this._leadingLineContent.length === 0 ? '' : this._leadingLineContent[0];
		// This is a TabExpansion2 result
		if (this._leadingLineContent.includes(' ') || firstChar === '[') {
			this._leadingLineContent = this._promptInputModel.prefix;
		}

		if (this._mostRecentCompletion?.isDirectory && completions.every(e => e.isDirectory)) {
			completions.push(this._mostRecentCompletion);
		}
		this._mostRecentCompletion = undefined;

		this._cursorIndexDelta = this._currentPromptInputState.cursorIndex - this._requestedCompletionsIndex;

		let normalizedLeadingLineContent = this._leadingLineContent;

		// If there is a single directory in the completions:
		// - `\` and `/` are normalized such that either can be used
		// - Using `\` or `/` will request new completions. It's important that this only occurs
		//   when a directory is present, if not completions like git branches could be requested
		//   which leads to flickering
		this._isFilteringDirectories = completions.some(e => e.isDirectory);
		if (this._isFilteringDirectories) {
			const firstDir = completions.find(e => e.isDirectory);
			this._pathSeparator = firstDir?.label.match(/(?<sep>[\\\/])/)?.groups?.sep ?? sep;
			normalizedLeadingLineContent = normalizePathSeparator(normalizedLeadingLineContent, this._pathSeparator);
		}
		for (const completion of completions) {
			if (!completion.icon && completion.kind !== undefined) {
				completion.icon = this._kindToIconMap.get(completion.kind);
			}
		}
		const lineContext = new LineContext(normalizedLeadingLineContent, this._cursorIndexDelta);
		const model = new SimpleCompletionModel(completions.filter(c => !!c.label).map(c => new SimpleCompletionItem(c)), lineContext);
		if (token.isCancellationRequested) {
			return;
		}
		this._showCompletions(model);
	}

	setContainerWithOverflow(container: HTMLElement): void {
		this._container = container;
	}

	setScreen(screen: HTMLElement): void {
		this._screen = screen;
	}

	async requestCompletions(triggerCharacter?: boolean): Promise<void> {
		if (!this._promptInputModel) {
			return;
		}

		if (this.isPasting) {
			return;
		}
		if (this._cancellationTokenSource) {
			this._cancellationTokenSource.cancel();
			this._cancellationTokenSource.dispose();
		}
		this._cancellationTokenSource = new CancellationTokenSource();
		const token = this._cancellationTokenSource.token;
		await this._handleCompletionProviders(this._terminal, token, triggerCharacter);
	}

	private _sync(promptInputState: IPromptInputModelState): void {
		const config = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection);
		if (!this._mostRecentPromptInputState || promptInputState.cursorIndex > this._mostRecentPromptInputState.cursorIndex) {
			// If input has been added
			let sent = false;

			// Quick suggestions
			if (!this._terminalSuggestWidgetVisibleContextKey.get()) {
				if (config.quickSuggestions) {
					// TODO: Make the regex code generic
					// TODO: Don't use `\[` in bash/zsh
					// If first character or first character after a space (or `[` in pwsh), request completions
					if (promptInputState.cursorIndex === 1 || promptInputState.prefix.match(/([\s\[])[^\s]$/)) {
						// Never request completions if the last key sequence was up or down as the user was likely
						// navigating history
						if (!this._lastUserData?.match(/^\x1b[\[O]?[A-D]$/)) {
							this.requestCompletions();
							sent = true;
						}
					}
				}
			}

			// Trigger characters - this happens even if the widget is showing
			if (config.suggestOnTriggerCharacters && !sent) {
				const prefix = promptInputState.prefix;
				if (
					// Only trigger on `-` if it's after a space. This is required to not clear
					// completions when typing the `-` in `git cherry-pick`
					prefix?.match(/\s[\-]$/) ||
					// Only trigger on `\` and `/` if it's a directory. Not doing so causes problems
					// with git branches in particular
					this._isFilteringDirectories && prefix?.match(/[\\\/]$/)
				) {
					this.requestCompletions();
					sent = true;
				}
				if (!sent) {
					for (const provider of this._terminalCompletionService.providers) {
						if (!provider.triggerCharacters) {
							continue;
						}
						for (const char of provider.triggerCharacters) {
							if (prefix?.endsWith(char)) {
								this.requestCompletions(true);
								sent = true;
								break;
							}
						}
					}
				}
			}
		}

		this._mostRecentPromptInputState = promptInputState;
		if (!this._promptInputModel || !this._terminal || !this._suggestWidget || this._leadingLineContent === undefined) {
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
		// to do: get replacement length to be correct, readd this?
		if (this._currentPromptInputState && this._currentPromptInputState.cursorIndex <= this._leadingLineContent.length) {
			this.hideSuggestWidget();
			return;
		}

		if (this._terminalSuggestWidgetVisibleContextKey.get()) {
			this._cursorIndexDelta = this._currentPromptInputState.cursorIndex - (this._requestedCompletionsIndex);
			let normalizedLeadingLineContent = this._currentPromptInputState.value.substring(this._providerReplacementIndex, this._requestedCompletionsIndex + this._cursorIndexDelta);
			if (this._isFilteringDirectories) {
				normalizedLeadingLineContent = normalizePathSeparator(normalizedLeadingLineContent, this._pathSeparator);
			}
			const lineContext = new LineContext(normalizedLeadingLineContent, this._cursorIndexDelta);
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
		const xtermBox = this._screen!.getBoundingClientRect();
		this._suggestWidget.showSuggestions(0, false, false, {
			left: xtermBox.left + this._terminal.buffer.active.cursorX * dimensions.width,
			top: xtermBox.top + this._terminal.buffer.active.cursorY * dimensions.height,
			height: dimensions.height
		});
	}

	private _getTerminalDimensions(): { width: number; height: number } {
		const cssCellDims = (this._terminal as any as { _core: IXtermCore })._core._renderService.dimensions.css.cell;
		return {
			width: cssCellDims.width,
			height: cssCellDims.height,
		};
	}

	private _showCompletions(model: SimpleCompletionModel): void {
		if (!this._terminal?.element) {
			return;
		}
		const suggestWidget = this._ensureSuggestWidget(this._terminal);
		suggestWidget.setCompletionModel(model);
		if (model.items.length === 0 || !this._promptInputModel) {
			return;
		}
		this._model = model;
		const dimensions = this._getTerminalDimensions();
		if (!dimensions.width || !dimensions.height) {
			return;
		}
		const xtermBox = this._screen!.getBoundingClientRect();

		suggestWidget.showSuggestions(0, false, false, {
			left: xtermBox.left + this._terminal.buffer.active.cursorX * dimensions.width,
			top: xtermBox.top + this._terminal.buffer.active.cursorY * dimensions.height,
			height: dimensions.height
		});
	}

	private _ensureSuggestWidget(terminal: Terminal): SimpleSuggestWidget {
		if (!this._suggestWidget) {
			const c = this._terminalConfigurationService.config;
			const font = this._terminalConfigurationService.getFont(dom.getActiveWindow());
			const fontInfo: ISimpleSuggestWidgetFontInfo = {
				fontFamily: font.fontFamily,
				fontSize: font.fontSize,
				lineHeight: Math.ceil(1.5 * font.fontSize),
				fontWeight: c.fontWeight.toString(),
				letterSpacing: font.letterSpacing
			};
			this._suggestWidget = this._register(this._instantiationService.createInstance(
				SimpleSuggestWidget,
				this._container!,
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
			this._terminalSuggestWidgetVisibleContextKey.set(false);
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
		const initialPromptInputState = this._mostRecentPromptInputState;
		if (!suggestion || !initialPromptInputState || this._leadingLineContent === undefined || !this._model) {
			return;
		}
		SuggestAddon.lastAcceptedCompletionTimestamp = Date.now();
		this._suggestWidget?.hide();

		const currentPromptInputState = this._currentPromptInputState ?? initialPromptInputState;

		// The replacement text is any text after the replacement index for the completions, this
		// includes any text that was there before the completions were requested and any text added
		// since to refine the completion.
		const replacementText = currentPromptInputState.value.substring(suggestion.item.completion.replacementIndex ?? this._providerReplacementIndex, currentPromptInputState.cursorIndex);

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
		let completionText = completion.label;
		if ((completion.isDirectory || completion.isFile) && completionText.includes(' ')) {
			// Escape spaces in files or folders so they're valid paths
			completionText = completionText.replaceAll(' ', '\\ ');
		}
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
					if (completion.isFile) {
						runOnEnter ||= replacementText.toLowerCase() === completionText.toLowerCase().replace(/\.[^\.]+$/, '');
					}
					break;
				}
			}
		}

		// For folders, allow the next completion request to get completions for that folder
		if (completion.icon === Codicon.folder) {
			SuggestAddon.lastAcceptedCompletionTimestamp = 0;
		}

		this._mostRecentCompletion = completion;

		const commonPrefixLen = commonPrefixLength(replacementText, completionText);
		const commonPrefix = replacementText.substring(replacementText.length - 1 - commonPrefixLen, replacementText.length - 1);
		const completionSuffix = completionText.substring(commonPrefixLen);
		let resultSequence: string;
		if (currentPromptInputState.suffix.length > 0 && currentPromptInputState.prefix.endsWith(commonPrefix) && currentPromptInputState.suffix.startsWith(completionSuffix)) {
			// Move right to the end of the completion
			resultSequence = '\x1bOC'.repeat(completion.label.length - commonPrefixLen);
		} else {
			resultSequence = [
				// Backspace (left) to remove all additional input
				'\x7F'.repeat(replacementText.length - commonPrefixLen),
				// Delete (right) to remove any additional text in the same word
				'\x1b[3~'.repeat(rightSideReplacementText.length),
				// Write the completion
				completionSuffix,
				// Run on enter if needed
				runOnEnter ? '\r' : ''
			].join('');
		}

		// Send the completion
		this._onAcceptedCompletion.fire(resultSequence);
		this.hideSuggestWidget();
	}

	hideSuggestWidget(): void {
		this._cancellationTokenSource?.cancel();
		this._cancellationTokenSource = undefined;
		this._currentPromptInputState = undefined;
		this._leadingLineContent = undefined;
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
export function normalizePathSeparator(path: string, sep: string): string {
	if (sep === '/') {
		return path.replaceAll('\\', '/');
	}
	return path.replaceAll('/', '\\');
}
