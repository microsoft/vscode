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
import type { IXtermCore } from '../../../terminal/browser/xterm-private.js';
import { TerminalStorageKeys } from '../../../terminal/common/terminalStorageKeys.js';
import { terminalSuggestConfigSection, TerminalSuggestSettingId, type ITerminalSuggestConfiguration } from '../common/terminalSuggestConfiguration.js';
import { LineContext } from '../../../../services/suggest/browser/simpleCompletionModel.js';
import { ISimpleSelectedSuggestion, SimpleSuggestWidget } from '../../../../services/suggest/browser/simpleSuggestWidget.js';
import { ITerminalCompletionService } from './terminalCompletionService.js';
import { TerminalSettingId, TerminalShellType } from '../../../../../platform/terminal/common/terminal.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { ISimpleSuggestWidgetFontInfo } from '../../../../services/suggest/browser/simpleSuggestWidgetRenderer.js';
import { ITerminalConfigurationService } from '../../../terminal/browser/terminal.js';
import { GOLDEN_LINE_HEIGHT_RATIO, MINIMUM_LINE_HEIGHT } from '../../../../../editor/common/config/fontInfo.js';
import { TerminalCompletionModel } from './terminalCompletionModel.js';
import { TerminalCompletionItem, TerminalCompletionItemKind, type ITerminalCompletion } from './terminalCompletionItem.js';
import { IntervalTimer, TimeoutTimer } from '../../../../../base/common/async.js';

export interface ISuggestController {
	isPasting: boolean;
	selectPreviousSuggestion(): void;
	selectPreviousPageSuggestion(): void;
	selectNextSuggestion(): void;
	selectNextPageSuggestion(): void;
	acceptSelectedSuggestion(suggestion?: Pick<ISimpleSelectedSuggestion<TerminalCompletionItem>, 'item' | 'model'>): void;
	hideSuggestWidget(cancelAnyRequests: boolean): void;
}
export class SuggestAddon extends Disposable implements ITerminalAddon, ISuggestController {
	private _terminal?: Terminal;

	private _promptInputModel?: IPromptInputModel;
	private readonly _promptInputModelSubscriptions = this._register(new MutableDisposable());

	private _mostRecentPromptInputState?: IPromptInputModelState;
	private _currentPromptInputState?: IPromptInputModelState;
	private _model?: TerminalCompletionModel;

	private _container?: HTMLElement;
	private _screen?: HTMLElement;
	private _suggestWidget?: SimpleSuggestWidget<TerminalCompletionModel, TerminalCompletionItem>;
	private _cachedFontInfo: ISimpleSuggestWidgetFontInfo | undefined;
	private _enableWidget: boolean = true;
	private _pathSeparator: string = sep;
	private _isFilteringDirectories: boolean = false;

	// TODO: Remove these in favor of prompt input state
	private _leadingLineContent?: string;
	private _cursorIndexDelta: number = 0;
	private _requestedCompletionsIndex: number = 0;

	private _lastUserData?: string;
	static lastAcceptedCompletionTimestamp: number = 0;
	private _lastUserDataTimestamp: number = 0;

	private _cancellationTokenSource: CancellationTokenSource | undefined;

	isPasting: boolean = false;
	shellType: TerminalShellType | undefined;
	private readonly _shellTypeInit: Promise<void>;

	private readonly _onBell = this._register(new Emitter<void>());
	readonly onBell = this._onBell.event;
	private readonly _onAcceptedCompletion = this._register(new Emitter<string>());
	readonly onAcceptedCompletion = this._onAcceptedCompletion.event;
	private readonly _onDidReceiveCompletions = this._register(new Emitter<void>());
	readonly onDidReceiveCompletions = this._onDidReceiveCompletions.event;
	private readonly _onDidFontConfigurationChange = this._register(new Emitter<void>());
	readonly onDidFontConfigurationChange = this._onDidFontConfigurationChange.event;

	private _kindToIconMap = new Map<number, ThemeIcon>([
		[TerminalCompletionItemKind.File, Codicon.file],
		[TerminalCompletionItemKind.Folder, Codicon.folder],
		[TerminalCompletionItemKind.Method, Codicon.symbolMethod],
		[TerminalCompletionItemKind.Alias, Codicon.symbolMethodArrow],
		[TerminalCompletionItemKind.Argument, Codicon.symbolVariable],
		[TerminalCompletionItemKind.Option, Codicon.symbolEnum],
		[TerminalCompletionItemKind.OptionValue, Codicon.symbolEnumMember],
		[TerminalCompletionItemKind.Flag, Codicon.flag],
		[TerminalCompletionItemKind.InlineSuggestion, Codicon.star],
		[TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop, Codicon.star],
	]);

	private readonly _inlineCompletion: ITerminalCompletion = {
		label: '',
		// Right arrow is used to accept the completion. This is a common keybinding in pwsh, zsh
		// and fish.
		inputData: '\x1b[C',
		replacementIndex: 0,
		replacementLength: 0,
		provider: 'core',
		detail: 'Inline suggestion',
		kind: TerminalCompletionItemKind.InlineSuggestion,
		icon: this._kindToIconMap.get(TerminalCompletionItemKind.InlineSuggestion),
	};
	private readonly _inlineCompletionItem = new TerminalCompletionItem(this._inlineCompletion);

	private _shouldSyncWhenReady: boolean = false;

	constructor(
		shellType: TerminalShellType | undefined,
		private readonly _capabilities: ITerminalCapabilityStore,
		private readonly _terminalSuggestWidgetVisibleContextKey: IContextKey<boolean>,
		@ITerminalCompletionService private readonly _terminalCompletionService: ITerminalCompletionService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService,
	) {
		super();

		// Initialize shell type, including a promise that completions can await for that resolves:
		// - immediately if shell type
		// - after a short delay if shell type gets set
		// - after a long delay if it doesn't get set
		this.shellType = shellType;
		if (this.shellType) {
			this._shellTypeInit = Promise.resolve();
		} else {
			const intervalTimer = this._register(new IntervalTimer());
			const timeoutTimer = this._register(new TimeoutTimer());
			this._shellTypeInit = new Promise<void>(r => {
				intervalTimer.cancelAndSet(() => {
					if (this.shellType) {
						r();
					}
				}, 50);
				timeoutTimer.cancelAndSet(r, 5000);
			}).then(() => {
				this._store.delete(intervalTimer);
				this._store.delete(timeoutTimer);
			});
		}

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
						this._promptInputModel.onDidFinishInput(() => {
							this._mostRecentPromptInputState = undefined;
							this.hideSuggestWidget(true);
						}),
					);
					if (this._shouldSyncWhenReady) {
						this._sync(this._promptInputModel);
						this._shouldSyncWhenReady = false;
					}
				}
			} else {
				this._promptInputModel = undefined;
			}
		}));
		this._register(this._terminalConfigurationService.onConfigChanged(() => this._cachedFontInfo = undefined));
		this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, e => {
			if (!e || e.affectsConfiguration(TerminalSuggestSettingId.InlineSuggestion)) {
				const value = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection).inlineSuggestion;
				this._inlineCompletionItem.isInvalid = value === 'off';
				switch (value) {
					case 'alwaysOnTopExceptExactMatch': {
						this._inlineCompletion.kind = TerminalCompletionItemKind.InlineSuggestion;
						break;
					}
					case 'alwaysOnTop':
					default: {
						this._inlineCompletion.kind = TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop;
						break;
					}
				}
				this._model?.forceRefilterAll();
			}
		}));
	}

	activate(xterm: Terminal): void {
		this._terminal = xterm;
		this._register(xterm.onKey(async e => {
			this._lastUserData = e.key;
			this._lastUserDataTimestamp = Date.now();
		}));
	}

	private async _handleCompletionProviders(terminal: Terminal | undefined, token: CancellationToken, explicitlyInvoked?: boolean): Promise<void> {
		// Nothing to handle if the terminal is not attached
		if (!terminal?.element || !this._enableWidget || !this._promptInputModel) {
			return;
		}

		// Only show the suggest widget if the terminal is focused
		if (!dom.isAncestorOfActiveElement(terminal.element)) {
			return;
		}

		// Require a shell type for completions. This will wait a short period after launching to
		// wait for the shell type to initialize. This prevents user requests sometimes getting lost
		// if requested shortly after the terminal is created.
		await this._shellTypeInit;
		if (!this.shellType) {
			return;
		}

		let doNotRequestExtensionCompletions = false;
		// Ensure that a key has been pressed since the last accepted completion in order to prevent
		// completions being requested again right after accepting a completion
		if (this._lastUserDataTimestamp < SuggestAddon.lastAcceptedCompletionTimestamp) {
			doNotRequestExtensionCompletions = true;
		}

		if (!doNotRequestExtensionCompletions) {
			await this._extensionService.activateByEvent('onTerminalCompletionsRequested');
		}
		this._currentPromptInputState = {
			value: this._promptInputModel.value,
			prefix: this._promptInputModel.prefix,
			suffix: this._promptInputModel.suffix,
			cursorIndex: this._promptInputModel.cursorIndex,
			ghostTextIndex: this._promptInputModel.ghostTextIndex
		};
		this._requestedCompletionsIndex = this._currentPromptInputState.cursorIndex;

		const quickSuggestionsConfig = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection).quickSuggestions;
		const allowFallbackCompletions = explicitlyInvoked || quickSuggestionsConfig === true || typeof quickSuggestionsConfig === 'object' && quickSuggestionsConfig.unknown === 'on';
		const providedCompletions = await this._terminalCompletionService.provideCompletions(this._currentPromptInputState.prefix, this._currentPromptInputState.cursorIndex, allowFallbackCompletions, this.shellType, this._capabilities, token, doNotRequestExtensionCompletions);

		if (token.isCancellationRequested) {
			return;
		}
		this._onDidReceiveCompletions.fire();

		this._cursorIndexDelta = this._promptInputModel.cursorIndex - this._requestedCompletionsIndex;
		this._leadingLineContent = this._promptInputModel.prefix.substring(0, this._requestedCompletionsIndex + this._cursorIndexDelta);

		const completions = providedCompletions?.flat() || [];
		if (!explicitlyInvoked && !completions.length) {
			return;
		}

		const firstChar = this._leadingLineContent.length === 0 ? '' : this._leadingLineContent[0];
		// This is a TabExpansion2 result
		if (this._leadingLineContent.includes(' ') || firstChar === '[') {
			this._leadingLineContent = this._promptInputModel.prefix;
		}

		let normalizedLeadingLineContent = this._leadingLineContent;

		// If there is a single directory in the completions:
		// - `\` and `/` are normalized such that either can be used
		// - Using `\` or `/` will request new completions. It's important that this only occurs
		//   when a directory is present, if not completions like git branches could be requested
		//   which leads to flickering
		this._isFilteringDirectories = completions.some(e => e.kind === TerminalCompletionItemKind.Folder);
		if (this._isFilteringDirectories) {
			const firstDir = completions.find(e => e.kind === TerminalCompletionItemKind.Folder);
			const textLabel = typeof firstDir?.label === 'string' ? firstDir.label : firstDir?.label.label;
			this._pathSeparator = textLabel?.match(/(?<sep>[\\\/])/)?.groups?.sep ?? sep;
			normalizedLeadingLineContent = normalizePathSeparator(normalizedLeadingLineContent, this._pathSeparator);
		}

		// Add any "ghost text" suggestion suggested by the shell. This aligns with behavior of the
		// editor and how it interacts with inline completions. This object is tracked and reused as
		// it may change on input.
		this._refreshInlineCompletion();

		// Add any missing icons based on the completion item kind
		for (const completion of completions) {
			if (!completion.icon && completion.kind !== undefined) {
				completion.icon = this._kindToIconMap.get(completion.kind);
			}
		}

		const lineContext = new LineContext(normalizedLeadingLineContent, this._cursorIndexDelta);
		const model = new TerminalCompletionModel(
			[
				...completions.filter(c => !!c.label).map(c => new TerminalCompletionItem(c)),
				this._inlineCompletionItem,
			],
			lineContext
		);
		if (token.isCancellationRequested) {
			return;
		}
		this._showCompletions(model, explicitlyInvoked);
	}

	setContainerWithOverflow(container: HTMLElement): void {
		this._container = container;
	}

	setScreen(screen: HTMLElement): void {
		this._screen = screen;
	}

	toggleExplainMode(): void {
		this._suggestWidget?.toggleExplainMode();
	}

	toggleSuggestionFocus(): void {
		this._suggestWidget?.toggleDetailsFocus();
	}

	toggleSuggestionDetails(): void {
		this._suggestWidget?.toggleDetails();
	}

	resetWidgetSize(): void {
		this._suggestWidget?.resetWidgetSize();
	}

	async requestCompletions(explicitlyInvoked?: boolean): Promise<void> {
		if (!this._promptInputModel) {
			this._shouldSyncWhenReady = true;
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
		await this._handleCompletionProviders(this._terminal, token, explicitlyInvoked);
	}

	private _requestTriggerCharQuickSuggestCompletions(): boolean {
		if (!this._wasLastInputVerticalArrowKey()) {
			// Only request on trigger character when it's a regular input, or on an arrow if the widget
			// is already visible
			if (!this._wasLastInputArrowKey() || this._terminalSuggestWidgetVisibleContextKey.get()) {
				this.requestCompletions();
				return true;
			}
		}
		return false;
	}

	private _wasLastInputRightArrowKey(): boolean {
		return !!this._lastUserData?.match(/^\x1b[\[O]?C$/);
	}

	private _wasLastInputVerticalArrowKey(): boolean {
		return !!this._lastUserData?.match(/^\x1b[\[O]?[A-B]$/);
	}

	private _wasLastInputArrowKey(): boolean {
		// Never request completions if the last key sequence was up or down as the user was likely
		// navigating history
		return !!this._lastUserData?.match(/^\x1b[\[O]?[A-D]$/);
	}

	private _sync(promptInputState: IPromptInputModelState): void {
		const config = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection);
		{
			let sent = false;

			// If the cursor moved to the right
			if (!this._mostRecentPromptInputState || promptInputState.cursorIndex > this._mostRecentPromptInputState.cursorIndex) {
				// Quick suggestions - Trigger whenever a new non-whitespace character is used
				if (!this._terminalSuggestWidgetVisibleContextKey.get()) {
					const commandLineHasSpace = promptInputState.prefix.trim().match(/\s/);
					if (
						(typeof config.quickSuggestions === 'boolean' && config.quickSuggestions) ||
						(typeof config.quickSuggestions === 'object' && !commandLineHasSpace && config.quickSuggestions.commands !== 'off') ||
						(typeof config.quickSuggestions === 'object' && commandLineHasSpace && config.quickSuggestions.arguments !== 'off')
					) {
						if (promptInputState.prefix.match(/[^\s]$/)) {
							sent = this._requestTriggerCharQuickSuggestCompletions();
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
						sent = this._requestTriggerCharQuickSuggestCompletions();
					}
					if (!sent) {
						for (const provider of this._terminalCompletionService.providers) {
							if (!provider.triggerCharacters) {
								continue;
							}
							for (const char of provider.triggerCharacters) {
								if (prefix?.endsWith(char)) {
									sent = this._requestTriggerCharQuickSuggestCompletions();
									break;
								}
							}
						}
					}
				}
			}

			// If the cursor moved to the left
			if (this._mostRecentPromptInputState && promptInputState.cursorIndex < this._mostRecentPromptInputState.cursorIndex) {
				// Backspace or left past a trigger character
				if (config.suggestOnTriggerCharacters && !sent && this._mostRecentPromptInputState.cursorIndex > 0) {
					const char = this._mostRecentPromptInputState.value[this._mostRecentPromptInputState.cursorIndex - 1];
					if (
						// Only trigger on `\` and `/` if it's a directory. Not doing so causes problems
						// with git branches in particular
						this._isFilteringDirectories && char.match(/[\\\/]$/)
					) {
						sent = this._requestTriggerCharQuickSuggestCompletions();
					}
				}
			}
		}

		// Hide the widget if ghost text was just completed via right arrow
		if (
			this._wasLastInputRightArrowKey() &&
			this._mostRecentPromptInputState?.ghostTextIndex !== -1 &&
			promptInputState.ghostTextIndex === -1 &&
			this._mostRecentPromptInputState?.value === promptInputState.value
		) {
			this.hideSuggestWidget(false);
		}

		this._mostRecentPromptInputState = promptInputState;
		if (!this._promptInputModel || !this._terminal || !this._suggestWidget || this._leadingLineContent === undefined) {
			return;
		}

		const previousPromptInputState = this._currentPromptInputState;
		this._currentPromptInputState = promptInputState;

		// Hide the widget if the latest character was a space
		if (this._currentPromptInputState.cursorIndex > 1 && this._currentPromptInputState.value.at(this._currentPromptInputState.cursorIndex - 1) === ' ') {
			if (!this._wasLastInputArrowKey()) {
				this.hideSuggestWidget(false);
				return;
			}
		}

		// Hide the widget if the cursor moves to the left and invalidates the completions.
		// Originally this was to the left of the initial position that the completions were
		// requested, but since extensions are expected to allow the client-side to filter, they are
		// only invalidated when whitespace is encountered.
		if (this._currentPromptInputState && this._currentPromptInputState.cursorIndex < this._leadingLineContent.length) {
			if (this._currentPromptInputState.cursorIndex <= 0 || previousPromptInputState?.value[this._currentPromptInputState.cursorIndex]?.match(/[\\\/\s]/)) {
				this.hideSuggestWidget(false);
				return;
			}
		}

		if (this._terminalSuggestWidgetVisibleContextKey.get()) {
			this._cursorIndexDelta = this._currentPromptInputState.cursorIndex - (this._requestedCompletionsIndex);
			let normalizedLeadingLineContent = this._currentPromptInputState.value.substring(0, this._requestedCompletionsIndex + this._cursorIndexDelta);
			if (this._isFilteringDirectories) {
				normalizedLeadingLineContent = normalizePathSeparator(normalizedLeadingLineContent, this._pathSeparator);
			}
			const lineContext = new LineContext(normalizedLeadingLineContent, this._cursorIndexDelta);
			this._suggestWidget.setLineContext(lineContext);
		}

		this._refreshInlineCompletion();

		// Hide and clear model if there are no more items
		if (!this._suggestWidget.hasCompletions()) {
			this.hideSuggestWidget(false);
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

	private _refreshInlineCompletion() {
		const oldIsInvalid = this._inlineCompletionItem.isInvalid;
		if (!this._currentPromptInputState || this._currentPromptInputState.ghostTextIndex === -1) {
			this._inlineCompletionItem.isInvalid = true;
		} else {
			this._inlineCompletionItem.isInvalid = false;
			// Update properties
			const spaceIndex = this._currentPromptInputState.value.lastIndexOf(' ', this._currentPromptInputState.ghostTextIndex - 1);
			const replacementIndex = spaceIndex === -1 ? 0 : spaceIndex + 1;
			const suggestion = this._currentPromptInputState.value.substring(replacementIndex);
			this._inlineCompletion.label = suggestion;
			this._inlineCompletion.replacementIndex = replacementIndex;
			// Note that the cursor index delta must be taken into account here, otherwise filtering
			// wont work correctly.
			this._inlineCompletion.replacementLength = this._currentPromptInputState.cursorIndex - replacementIndex - this._cursorIndexDelta;
			// Reset the completion item as the object reference must remain the same but its
			// contents will differ across syncs. This is done so we don't need to reassign the
			// model and the slowdown/flickering that could potentially cause.
			const x = new TerminalCompletionItem(this._inlineCompletion);
			this._inlineCompletionItem.idx = x.idx;
			this._inlineCompletionItem.score = x.score;
			this._inlineCompletionItem.labelLow = x.labelLow;
			this._inlineCompletionItem.textLabel = x.textLabel;
			this._inlineCompletionItem.fileExtLow = x.fileExtLow;
			this._inlineCompletionItem.labelLowExcludeFileExt = x.labelLowExcludeFileExt;
			this._inlineCompletionItem.labelLowNormalizedPath = x.labelLowNormalizedPath;
			this._inlineCompletionItem.underscorePenalty = x.underscorePenalty;
			this._inlineCompletionItem.word = x.word;
			this._model?.forceRefilterAll();
		}

		// Force a filter all in order to re-evaluate the inline completion
		if (this._inlineCompletionItem.isInvalid !== oldIsInvalid) {
			this._model?.forceRefilterAll();
		}
	}

	private _getTerminalDimensions(): { width: number; height: number } {
		const cssCellDims = (this._terminal as any as { _core: IXtermCore })._core._renderService.dimensions.css.cell;
		return {
			width: cssCellDims.width,
			height: cssCellDims.height,
		};
	}

	private _getFontInfo(): ISimpleSuggestWidgetFontInfo {
		if (this._cachedFontInfo) {
			return this._cachedFontInfo;
		}

		const core = (this._terminal as any)._core as IXtermCore;
		const font = this._terminalConfigurationService.getFont(dom.getActiveWindow(), core);
		let lineHeight: number = font.lineHeight;
		const fontSize: number = font.fontSize;
		const fontFamily: string = font.fontFamily;
		const letterSpacing: number = font.letterSpacing;
		const fontWeight: string = this._configurationService.getValue('editor.fontWeight');

		if (lineHeight <= 1) {
			lineHeight = GOLDEN_LINE_HEIGHT_RATIO * fontSize;
		} else if (lineHeight < MINIMUM_LINE_HEIGHT) {
			// Values too small to be line heights in pixels are in ems.
			lineHeight = lineHeight * fontSize;
		}

		// Enforce integer, minimum constraints
		lineHeight = Math.round(lineHeight);
		if (lineHeight < MINIMUM_LINE_HEIGHT) {
			lineHeight = MINIMUM_LINE_HEIGHT;
		}

		const fontInfo = {
			fontSize,
			lineHeight,
			fontWeight: fontWeight.toString(),
			letterSpacing,
			fontFamily
		};

		this._cachedFontInfo = fontInfo;

		return fontInfo;
	}

	private _showCompletions(model: TerminalCompletionModel, explicitlyInvoked?: boolean): void {
		if (!this._terminal?.element) {
			return;
		}
		const suggestWidget = this._ensureSuggestWidget(this._terminal);
		suggestWidget.setCompletionModel(model);
		this._register(suggestWidget.onDidFocus(() => this._terminal?.focus()));
		if (!this._promptInputModel || !explicitlyInvoked && model.items.length === 0) {
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


	private _ensureSuggestWidget(terminal: Terminal): SimpleSuggestWidget<TerminalCompletionModel, TerminalCompletionItem> {
		if (!this._suggestWidget) {
			this._suggestWidget = this._register(this._instantiationService.createInstance(
				SimpleSuggestWidget,
				this._container!,
				this._instantiationService.createInstance(PersistedWidgetSize),
				{
					statusBarMenuId: MenuId.MenubarTerminalSuggestStatusMenu,
					showStatusBarSettingId: TerminalSuggestSettingId.ShowStatusBar
				},
				this._getFontInfo.bind(this),
				this._onDidFontConfigurationChange.event.bind(this)
			)) as any as SimpleSuggestWidget<TerminalCompletionModel, TerminalCompletionItem>;
			this._suggestWidget.list.style(getListStyles({
				listInactiveFocusBackground: editorSuggestWidgetSelectedBackground,
				listInactiveFocusOutline: activeContrastBorder
			}));
			this._register(this._suggestWidget.onDidSelect(async e => this.acceptSelectedSuggestion(e)));
			this._register(this._suggestWidget.onDidHide(() => this._terminalSuggestWidgetVisibleContextKey.reset()));
			this._register(this._suggestWidget.onDidShow(() => this._terminalSuggestWidgetVisibleContextKey.set(true)));
			this._register(this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(TerminalSettingId.FontFamily) || e.affectsConfiguration(TerminalSettingId.FontSize) || e.affectsConfiguration(TerminalSettingId.LineHeight) || e.affectsConfiguration(TerminalSettingId.FontFamily) || e.affectsConfiguration('editor.fontSize') || e.affectsConfiguration('editor.fontFamily')) {
					this._onDidFontConfigurationChange.fire();
				}
			}
			));
			const element = this._terminal?.element?.querySelector('.xterm-helper-textarea');
			if (element) {
				this._register(dom.addDisposableListener(dom.getActiveDocument(), 'click', (event) => {
					const target = event.target as HTMLElement;
					if (this._terminal?.element?.contains(target)) {
						this._suggestWidget?.hide();
					}
				}));
			}

			this._register(this._suggestWidget.onDidBlurDetails((e) => {
				const elt = e.relatedTarget as HTMLElement;
				if (this._terminal?.element?.contains(elt)) {
					// Do nothing, just the terminal getting focused
					// If there was a mouse click, the suggest widget will be
					// hidden above
					return;
				}
				this._suggestWidget?.hide();
			}));
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

	acceptSelectedSuggestion(suggestion?: Pick<ISimpleSelectedSuggestion<TerminalCompletionItem>, 'item' | 'model'>, respectRunOnEnter?: boolean): void {
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
		const replacementText = currentPromptInputState.value.substring(suggestion.item.completion.replacementIndex, currentPromptInputState.cursorIndex);

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
		let resultSequence = completion.inputData;

		// Use for amend the label if inputData is not defined
		if (resultSequence === undefined) {
			let completionText = typeof completion.label === 'string' ? completion.label : completion.label.label;
			if ((completion.kind === TerminalCompletionItemKind.Folder || completion.isFileOverride) && completionText.includes(' ')) {
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
						if (completion.isFileOverride) {
							runOnEnter ||= replacementText.toLowerCase() === completionText.toLowerCase().replace(/\.[^\.]+$/, '');
						}
						break;
					}
				}
			}

			const commonPrefixLen = commonPrefixLength(replacementText, completionText);
			const commonPrefix = replacementText.substring(replacementText.length - 1 - commonPrefixLen, replacementText.length - 1);
			const completionSuffix = completionText.substring(commonPrefixLen);
			if (currentPromptInputState.suffix.length > 0 && currentPromptInputState.prefix.endsWith(commonPrefix) && currentPromptInputState.suffix.startsWith(completionSuffix)) {
				// Move right to the end of the completion
				resultSequence = '\x1bOC'.repeat(completionText.length - commonPrefixLen);
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
		}

		// For folders, allow the next completion request to get completions for that folder
		if (completion.kind === TerminalCompletionItemKind.Folder) {
			SuggestAddon.lastAcceptedCompletionTimestamp = 0;
		}

		// Send the completion
		this._onAcceptedCompletion.fire(resultSequence);
		this.hideSuggestWidget(true);
	}

	hideSuggestWidget(cancelAnyRequest: boolean): void {
		if (cancelAnyRequest) {
			this._cancellationTokenSource?.cancel();
			this._cancellationTokenSource = undefined;
		}
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
