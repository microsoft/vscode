/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { isMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IPreferencesService, type IOpenSettingsOptions } from '../../../../../services/preferences/common/preferences.js';
import { migrateLegacyTerminalToolSpecificData } from '../../../common/chat.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, type IChatMarkdownContent, type IChatTerminalToolInvocationData, type ILegacyChatTerminalToolInvocationData } from '../../../common/chatService.js';
import { CodeBlockModelCollection } from '../../../common/codeBlockModelCollection.js';
import { IChatCodeBlockInfo, IChatWidgetService } from '../../chat.js';
import { ChatQueryTitlePart } from '../chatConfirmationWidget.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatMarkdownContentPart, type IChatMarkdownContentPartOptions } from '../chatMarkdownContentPart.js';
import { ChatProgressSubPart } from '../chatProgressContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import '../media/chatTerminalToolProgressPart.css';
import { TerminalContribSettingId } from '../../../../terminal/terminalContribExports.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import type { ICodeBlockRenderOptions } from '../../codeBlockPart.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { IChatTerminalToolProgressPart, ITerminalChatService, ITerminalConfigurationService, ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalService, type IDetachedTerminalInstance } from '../../../../terminal/browser/terminal.js';
import { DetachedProcessInfo } from '../../../../terminal/browser/detachedTerminal.js';
import { TerminalInstanceColorProvider } from '../../../../terminal/browser/terminalInstance.js';
import { Action, IAction } from '../../../../../../base/common/actions.js';
import { Disposable, DisposableStore, ImmortalReference, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { DecorationSelector, getTerminalCommandDecorationState, getTerminalCommandDecorationTooltip } from '../../../../terminal/browser/xterm/decorationStyles.js';
import * as dom from '../../../../../../base/browser/dom.js';
import { localize } from '../../../../../../nls.js';
import { TerminalLocation } from '../../../../../../platform/terminal/common/terminal.js';
import { ITerminalCommand, TerminalCapability, type ICommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { URI } from '../../../../../../base/common/uri.js';
import { stripIcons } from '../../../../../../base/common/iconLabels.js';
import { IAccessibleViewService } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { EditorPool } from '../chatContentCodePools.js';
import { KeybindingWeight, KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { removeAnsiEscapeCodes } from '../../../../../../base/common/strings.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import type { XtermTerminal } from '../../../../terminal/browser/xterm/xtermTerminal.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';
import { ILogService } from '../../../../../../platform/log/common/log.js';

const MAX_TERMINAL_OUTPUT_PREVIEW_HEIGHT = 200;

/**
 * Remembers whether a tool invocation was last expanded so state survives virtualization re-renders.
 */
const expandedStateByInvocation = new WeakMap<IChatToolInvocation | IChatToolInvocationSerialized, boolean>();

const MIN_OUTPUT_HEIGHT = 20;

/**
 * Options for configuring a terminal command decoration.
 */
interface ITerminalCommandDecorationOptions {
	/**
	 * The terminal data associated with the tool invocation.
	 */
	readonly terminalData: IChatTerminalToolInvocationData;

	/**
	 * Returns the HTML element representing the command block in the terminal output.
	 * May return `undefined` if the command block is not currently rendered.
	 * Called when attaching the decoration to the command block container.
	 */
	getCommandBlock(): HTMLElement | undefined;

	/**
	 * Returns the HTML element representing the icon for the command, if any.
	 * May return `undefined` if no icon is present.
	 * Used to determine where to insert the decoration relative to the icon.
	 */
	getIconElement(): HTMLElement | undefined;

	/**
	 * Returns the resolved terminal command associated with this decoration, if available.
	 * May return `undefined` if the command has not been resolved yet.
	 * Used to access command metadata for the decoration.
	 */
	getResolvedCommand(): ITerminalCommand | undefined;
}

class TerminalCommandDecoration extends Disposable {
	private readonly _element: HTMLElement;
	private readonly _hoverListener: MutableDisposable<IDisposable>;
	private readonly _focusListener: MutableDisposable<IDisposable>;
	private _interactionElement: HTMLElement | undefined;

	constructor(private readonly _options: ITerminalCommandDecorationOptions) {
		super();
		const decorationElements = h('span.chat-terminal-command-decoration@decoration', { role: 'img', tabIndex: 0 });
		this._element = decorationElements.decoration;
		this._hoverListener = this._register(new MutableDisposable<IDisposable>());
		this._focusListener = this._register(new MutableDisposable<IDisposable>());
		this._attachElementToContainer();
	}

	private _attachElementToContainer(): void {
		const container = this._options.getCommandBlock();
		if (!container) {
			return;
		}

		const decoration = this._element;
		if (!decoration.isConnected || decoration.parentElement !== container) {
			const icon = this._options.getIconElement();
			if (icon && icon.parentElement === container) {
				icon.insertAdjacentElement('afterend', decoration);
			} else {
				container.insertBefore(decoration, container.firstElementChild ?? null);
			}
		}

		this._attachInteractionHandlers(decoration);
	}

	public update(command?: ITerminalCommand): void {
		this._attachElementToContainer();
		const decoration = this._element;
		const resolvedCommand = command ?? this._options.getResolvedCommand();
		this._apply(decoration, resolvedCommand);
	}

	private _apply(decoration: HTMLElement, command: ITerminalCommand | undefined): void {
		const terminalData = this._options.terminalData;
		let storedState = terminalData.terminalCommandState;

		if (command) {
			const existingState = terminalData.terminalCommandState ?? {};
			terminalData.terminalCommandState = {
				...existingState,
				exitCode: command.exitCode,
				timestamp: command.timestamp ?? existingState.timestamp,
				duration: command.duration ?? existingState.duration
			};
			storedState = terminalData.terminalCommandState;
		} else if (!storedState) {
			terminalData.terminalCommandState = { exitCode: undefined, timestamp: Date.now() };
			storedState = terminalData.terminalCommandState;
		}

		const decorationState = getTerminalCommandDecorationState(command, storedState);
		const tooltip = getTerminalCommandDecorationTooltip(command, storedState);

		decoration.className = `chat-terminal-command-decoration ${DecorationSelector.CommandDecoration}`;
		decoration.classList.add(DecorationSelector.Codicon);
		for (const className of decorationState.classNames) {
			decoration.classList.add(className);
		}
		decoration.classList.add(...ThemeIcon.asClassNameArray(decorationState.icon));
		const isInteractive = !decoration.classList.contains(DecorationSelector.Default);
		decoration.tabIndex = isInteractive ? 0 : -1;
		if (isInteractive) {
			decoration.removeAttribute('aria-disabled');
		} else {
			decoration.setAttribute('aria-disabled', 'true');
		}
		const hoverText = tooltip || decorationState.hoverMessage;
		if (hoverText) {
			decoration.setAttribute('title', hoverText);
			decoration.setAttribute('aria-label', hoverText);
		} else {
			decoration.removeAttribute('title');
			decoration.removeAttribute('aria-label');
		}
	}

	private _attachInteractionHandlers(decoration: HTMLElement): void {
		if (this._interactionElement === decoration) {
			return;
		}
		this._interactionElement = decoration;
		this._hoverListener.value = dom.addDisposableListener(decoration, dom.EventType.MOUSE_ENTER, () => {
			if (!decoration.isConnected) {
				return;
			}
			this._apply(decoration, this._options.getResolvedCommand());
		});
		this._focusListener.value = dom.addDisposableListener(decoration, dom.EventType.FOCUS_IN, () => {
			if (!decoration.isConnected) {
				return;
			}
			this._apply(decoration, this._options.getResolvedCommand());
		});
	}
}

interface IStreamingSnapshotRequest {
	readonly instance: ITerminalInstance;
	readonly command: ITerminalCommand;
	readonly force: boolean;
	readonly resolve: () => void;
	readonly reject: (error: unknown) => void;
}

type StreamingSnapshotMutation =
	| { readonly kind: 'noop' }
	| { readonly kind: 'append'; readonly appended: string }
	| { readonly kind: 'replace'; readonly snapshot: string }
	| { readonly kind: 'truncate'; readonly truncated: number; readonly appended: string };

// Encapsulates the rolling buffer of serialized terminal output so the UI only needs to worry
// about mirroring data into the preview. The heavy lifting happens here, including diffing the
// newest VT snapshot to decide when we can append, truncate, or fully replace content.
class ChatTerminalStreamingModel {
	// Tuning notes:
	//  - Prefix sample (256 chars) is big enough to catch prompt churn while staying cheaper than diffing full snapshots.
	//  - Overlap window (32 KiB) keeps the KMP scan bounded to a few dozen lines of VT output so we avoid quadratic scans.
	//  - When trimming, we require both 60% overlap and at least 2 KiB of shared content so we only treat large shifts as truncations.
	private readonly _snapshotPrefixSampleSize = 256;
	private readonly _snapshotOverlapSampleSize = 32 * 1024;
	private readonly _trimOverlapMinChars = 2048;
	private readonly _trimOverlapRatio = 0.6;

	private _isStreaming = false;
	private _streamBuffer: string[] = [];
	private _lastRawSnapshot: string | undefined;
	private _lastSnapshotPrefixLength = 0;
	private _snapshotPrefixSample: string | undefined;
	private _needsReplay = false;
	private _hasRenderableOutput = false;

	constructor(
		private readonly _terminalData: IChatTerminalToolInvocationData,
		private readonly _logService: ILogService
	) { }

	public hydrateFromStoredOutput(text: string | undefined): void {
		if (!text) {
			return;
		}
		const storedOutput = this._terminalData.terminalCommandOutput ?? (this._terminalData.terminalCommandOutput = { text: '' });
		storedOutput.text = text;
		this._streamBuffer = [text];
		this._needsReplay = true;
		this._hasRenderableOutput = text.length > 0;
		this._logService.trace('chatTerminalStreaming.hydrate', { length: text.length });
	}

	public beginStreaming(): void {
		this._isStreaming = true;
		this._streamBuffer = [];
		this._lastRawSnapshot = undefined;
		this._lastSnapshotPrefixLength = 0;
		this._snapshotPrefixSample = undefined;
		this._needsReplay = true;
		this._hasRenderableOutput = false;
		this._terminalData.terminalCommandOutput = { text: '' };
		this._logService.trace('chatTerminalStreaming.begin');
	}

	public endStreaming(): void {
		this._isStreaming = false;
		this._logService.trace('chatTerminalStreaming.end');
	}

	public appendData(data: string): boolean {
		if (!data) {
			return false;
		}
		this._isStreaming = true;
		const storedOutput = this._terminalData.terminalCommandOutput ?? (this._terminalData.terminalCommandOutput = { text: '' });
		this._streamBuffer.push(data);
		storedOutput.text += data;
		this._logService.trace('chatTerminalStreaming.append', { length: data.length, bufferChunks: this._streamBuffer.length });
		return true;
	}

	public applySnapshot(snapshot: string): StreamingSnapshotMutation {
		const previous = this._lastRawSnapshot;
		if (previous === snapshot) {
			this._logService.trace('chatTerminalStreaming.applySnapshot', { mutation: 'noop', previousLength: previous?.length ?? 0, newLength: snapshot.length });
			return { kind: 'noop' };
		}
		if (!previous) {
			this._replaceWithSnapshot(snapshot);
			this._lastRawSnapshot = snapshot;
			this._updateSnapshotCache(snapshot);
			const mutation = { kind: 'replace', snapshot } as const;
			this._logService.trace('chatTerminalStreaming.applySnapshot', { mutation: mutation.kind, previousLength: 0, newLength: snapshot.length });
			return mutation;
		}

		const sampleLength = Math.min(this._snapshotPrefixSampleSize, previous.length, snapshot.length);
		if (sampleLength > 0) {
			const existingSample = this._snapshotPrefixSample && this._snapshotPrefixSample.length >= sampleLength
				? this._snapshotPrefixSample.slice(0, sampleLength)
				: previous.slice(0, sampleLength);
			const nextSample = snapshot.slice(0, sampleLength);
			if (existingSample !== nextSample) {
				this._lastSnapshotPrefixLength = 0;
			}
		}

		this._lastSnapshotPrefixLength = Math.min(this._lastSnapshotPrefixLength, previous.length, snapshot.length);

		let prefixLength = this._lastSnapshotPrefixLength;
		while (prefixLength < previous.length && prefixLength < snapshot.length && previous.charCodeAt(prefixLength) === snapshot.charCodeAt(prefixLength)) {
			prefixLength++;
		}

		if (prefixLength === previous.length && snapshot.length >= previous.length) {
			const appended = snapshot.slice(previous.length);
			this._lastRawSnapshot = snapshot;
			this._updateSnapshotCache(snapshot);
			const mutation: StreamingSnapshotMutation = appended.length ? { kind: 'append', appended } : { kind: 'noop' };
			if (appended.length) {
				this.appendData(appended);
			}
			this._logService.trace('chatTerminalStreaming.applySnapshot', {
				mutation: mutation.kind,
				appendedLength: appended.length,
				previousLength: previous.length,
				newLength: snapshot.length
			});
			return mutation;
		}

		const overlap = this._computeSnapshotOverlap(previous, snapshot);
		const minLength = Math.min(previous.length, snapshot.length);
		const maxOverlapWindow = Math.min(minLength, this._snapshotOverlapSampleSize);
		let requiredOverlap = 0;
		if (maxOverlapWindow > 1) {
			const ratioThreshold = Math.floor(maxOverlapWindow * this._trimOverlapRatio);
			const absoluteThreshold = Math.min(this._trimOverlapMinChars, maxOverlapWindow - 1);
			requiredOverlap = Math.max(ratioThreshold, absoluteThreshold);
		}
		const trimmed = previous.length - overlap;

		if (overlap > 0 && trimmed > 0 && overlap >= requiredOverlap) {
			this._truncatePrefix(trimmed);
			const inserted = snapshot.slice(overlap);
			this._lastRawSnapshot = snapshot;
			this._updateSnapshotCache(snapshot);
			if (inserted.length) {
				this.appendData(inserted);
			}
			const mutation = { kind: 'truncate', truncated: trimmed, appended: inserted } as const;
			this._logService.trace('chatTerminalStreaming.applySnapshot', {
				mutation: mutation.kind,
				trimmed,
				appendedLength: inserted.length,
				previousLength: previous.length,
				newLength: snapshot.length
			});
			return mutation;
		}

		this._replaceWithSnapshot(snapshot);
		this._lastRawSnapshot = snapshot;
		this._updateSnapshotCache(snapshot);
		const mutation = { kind: 'replace', snapshot } as const;
		this._logService.trace('chatTerminalStreaming.applySnapshot', { mutation: mutation.kind, previousLength: previous.length, newLength: snapshot.length });
		return mutation;
	}

	public applyEmptyOutput(): void {
		this._isStreaming = false;
		this._streamBuffer = [];
		this._lastRawSnapshot = undefined;
		this._lastSnapshotPrefixLength = 0;
		this._snapshotPrefixSample = undefined;
		this._needsReplay = false;
		const storedOutput = this._terminalData.terminalCommandOutput ?? (this._terminalData.terminalCommandOutput = { text: '' });
		storedOutput.text = '';
		this._hasRenderableOutput = false;
		this._logService.trace('chatTerminalStreaming.applyEmptyOutput');
	}

	public hasRenderableOutput(): boolean {
		return this._hasRenderableOutput;
	}

	public countRenderableLines(): number {
		if (!this._streamBuffer.length) {
			return 0;
		}
		const concatenated = this._streamBuffer.join('');
		const withoutAnsi = removeAnsiEscapeCodes(concatenated);
		const sanitized = withoutAnsi.replace(/\r/g, '');
		if (!sanitized.length) {
			return 0;
		}
		return sanitized.split('\n').length;
	}

	public get isStreaming(): boolean {
		return this._isStreaming;
	}

	public shouldRender(): boolean {
		return this._isStreaming || this.hasRenderableOutput();
	}

	public get needsReplay(): boolean {
		return this._needsReplay;
	}

	public markNeedsReplay(): void {
		this._needsReplay = true;
	}

	public clearNeedsReplay(): void {
		this._needsReplay = false;
	}

	public getBufferedText(): string {
		return this._streamBuffer.join('');
	}

	public getBuffer(): readonly string[] {
		return this._streamBuffer;
	}

	private _replaceWithSnapshot(snapshot: string): void {
		const storedOutput = this._terminalData.terminalCommandOutput ?? (this._terminalData.terminalCommandOutput = { text: '' });
		this._streamBuffer = [];
		storedOutput.text = '';
		if (snapshot) {
			this._streamBuffer.push(snapshot);
			storedOutput.text = snapshot;
		}
		this._hasRenderableOutput = storedOutput.text.length > 0;
		this._needsReplay = true;
		this._logService.trace('chatTerminalStreaming.replace', { snapshotLength: snapshot.length });
	}

	private _truncatePrefix(chars: number): void {
		if (chars <= 0) {
			return;
		}
		const storedOutput = this._terminalData.terminalCommandOutput ?? (this._terminalData.terminalCommandOutput = { text: '' });
		if (!storedOutput.text) {
			this._hasRenderableOutput = false;
			return;
		}
		if (chars >= storedOutput.text.length) {
			this._streamBuffer = [];
			storedOutput.text = '';
		} else {
			storedOutput.text = storedOutput.text.slice(chars);
			let remaining = chars;
			while (remaining > 0 && this._streamBuffer.length) {
				const chunk = this._streamBuffer[0];
				if (remaining >= chunk.length) {
					this._streamBuffer.shift();
					remaining -= chunk.length;
				} else {
					this._streamBuffer[0] = chunk.slice(remaining);
					remaining = 0;
				}
			}
		}
		this._hasRenderableOutput = storedOutput.text.length > 0;
		this._needsReplay = true;
		this._logService.trace('chatTerminalStreaming.truncate', { chars, bufferChunks: this._streamBuffer.length });
	}

	public markRenderableOutput(): void {
		this._hasRenderableOutput = true;
	}

	private _computeSnapshotOverlap(previous: string, snapshot: string): number {
		// Classic KMP prefix-table driven overlap search so we can quickly detect how much of the
		// existing buffer still matches the new snapshot without rescanning from scratch each time.
		const maxWindow = Math.min(previous.length, snapshot.length, this._snapshotOverlapSampleSize);
		if (maxWindow <= 0) {
			return 0;
		}
		const pattern = snapshot.slice(0, maxWindow);
		const text = previous.slice(previous.length - maxWindow);
		if (!pattern.length || !text.length) {
			return 0;
		}
		const prefixTable = this._buildPrefixTable(pattern);
		let matchLength = 0;
		for (let i = 0; i < text.length; i++) {
			const code = text.charCodeAt(i);
			while (matchLength > 0 && code !== pattern.charCodeAt(matchLength)) {
				matchLength = prefixTable[matchLength - 1];
			}
			if (code === pattern.charCodeAt(matchLength)) {
				matchLength++;
				if (matchLength === pattern.length) {
					return matchLength;
				}
			}
		}
		return matchLength;
	}

	private _buildPrefixTable(pattern: string): number[] {
		// Standard prefix computation used by KMP; stores the length of the longest prefix that is
		// also a suffix for every character boundary in the snapshot prefix window.
		const lps: number[] = new Array(pattern.length).fill(0);
		let length = 0;
		for (let i = 1; i < pattern.length; i++) {
			const code = pattern.charCodeAt(i);
			while (length > 0 && code !== pattern.charCodeAt(length)) {
				length = lps[length - 1];
			}
			if (code === pattern.charCodeAt(length)) {
				length++;
			}
			lps[i] = length;
		}
		return lps;
	}

	private _updateSnapshotCache(snapshot: string): void {
		this._lastSnapshotPrefixLength = snapshot.length;
		if (!snapshot) {
			this._snapshotPrefixSample = undefined;
			return;
		}
		this._snapshotPrefixSample = snapshot.slice(0, Math.min(this._snapshotPrefixSampleSize, snapshot.length));
	}
}

export class ChatTerminalToolProgressPart extends BaseChatToolInvocationSubPart implements IChatTerminalToolProgressPart {
	public readonly domNode: HTMLElement;

	private readonly _actionBar: ActionBar;

	private readonly _outputView: ChatTerminalToolOutputSection;
	private readonly _terminalOutputContextKey: IContextKey<boolean>;
	private _terminalSessionRegistration: IDisposable | undefined;
	private readonly _elementIndex: number;
	private readonly _contentIndex: number;
	private readonly _sessionResource: URI;

	private readonly _showOutputAction = this._register(new MutableDisposable<ToggleChatTerminalOutputAction>());
	private _showOutputActionAdded = false;
	private readonly _focusAction = this._register(new MutableDisposable<FocusChatInstanceAction>());

	private readonly _terminalData: IChatTerminalToolInvocationData;
	private _terminalCommandUri: URI | undefined;
	private _storedCommandId: string | undefined;
	private readonly _isSerializedInvocation: boolean;
	private _terminalInstance: ITerminalInstance | undefined;
	private readonly _decoration: TerminalCommandDecoration;

	private readonly _commandStreamingListener: MutableDisposable<IDisposable>;
	private _streamingCommand: ITerminalCommand | undefined;
	private _trackedCommandId: string | undefined;
	private _streamingQueue: IStreamingSnapshotRequest[];
	private readonly _streamingSnapshotRetryCounts = new WeakMap<ITerminalCommand, number>();
	private _isDrainingStreamingQueue = false;
	private _streamingDrainScheduled = false;

	private markdownPart: ChatMarkdownContentPart | undefined;
	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.markdownPart?.codeblocks ?? [];
	}

	public get elementIndex(): number {
		return this._elementIndex;
	}

	public get contentIndex(): number {
		return this._contentIndex;
	}

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		terminalData: IChatTerminalToolInvocationData | ILegacyChatTerminalToolInvocationData,
		context: IChatContentPartRenderContext,
		renderer: IMarkdownRenderer,
		editorPool: EditorPool,
		currentWidthDelegate: () => number,
		codeBlockStartIndex: number,
		codeBlockModelCollection: CodeBlockModelCollection,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalChatService private readonly _terminalChatService: ITerminalChatService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super(toolInvocation);

		this._elementIndex = context.elementIndex;
		this._contentIndex = context.contentIndex;
		this._sessionResource = context.element.sessionResource;

		terminalData = migrateLegacyTerminalToolSpecificData(terminalData);
		this._terminalData = terminalData;
		this._terminalCommandUri = terminalData.terminalCommandUri ? URI.revive(terminalData.terminalCommandUri) : undefined;
		this._storedCommandId = this._terminalCommandUri ? new URLSearchParams(this._terminalCommandUri.query ?? '').get('command') ?? undefined : undefined;
		this._isSerializedInvocation = (toolInvocation.kind === 'toolInvocationSerialized');

		const elements = h('.chat-terminal-content-part@container', [
			h('.chat-terminal-content-title@title', [
				h('.chat-terminal-command-block@commandBlock')
			]),
			h('.chat-terminal-content-message@message'),
			h('.chat-terminal-output-container@output')
		]);

		this._decoration = this._register(new TerminalCommandDecoration({
			terminalData: this._terminalData,
			getCommandBlock: () => elements.commandBlock,
			getIconElement: () => undefined,
			getResolvedCommand: () => this._getResolvedCommand()
		}));
		this._commandStreamingListener = this._register(new MutableDisposable<IDisposable>());
		this._streamingCommand = undefined;
		this._trackedCommandId = this._terminalData.terminalCommandId ?? this._storedCommandId;
		this._streamingQueue = [];

		const command = terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
		const displayCommand = stripIcons(command);
		this._terminalOutputContextKey = ChatContextKeys.inChatTerminalToolOutput.bindTo(this._contextKeyService);

		const titlePart = this._register(_instantiationService.createInstance(
			ChatQueryTitlePart,
			elements.commandBlock,
			new MarkdownString([
				`\`\`\`${terminalData.language}`,
				`${command.replaceAll('```', '\\`\\`\\`')}`,
				`\`\`\``
			].join('\n'), { supportThemeIcons: true }),
			undefined,
		));
		this._register(titlePart.onDidChangeHeight(() => {
			this._decoration.update();
			this._onDidChangeHeight.fire();
		}));

		const initialRowHeight = this._computeRowHeightPx();
		this._outputView = this._register(this._instantiationService.createInstance(ChatTerminalToolOutputSection, elements.output, initialRowHeight, elements.title, displayCommand, this._terminalData, () => this._onDidChangeHeight.fire(), () => this._createDetachedTerminal()));
		this._register(this._outputView.onDidFocus(() => this._handleOutputFocus()));
		this._register(this._outputView.onDidBlur(e => this._handleOutputBlur(e)));
		this._register(toDisposable(() => this._handleDispose()));
		this._register(this._keybindingService.onDidUpdateKeybindings(() => {
			this._focusAction.value?.refreshKeybindingTooltip();
			this._showOutputAction.value?.refreshKeybindingTooltip();
		}));
		this._register(this._terminalConfigurationService.onConfigChanged(() => {
			this._outputView.updateRowHeight(this._computeRowHeightPx());
		}));

		const actionBarEl = h('.chat-terminal-action-bar@actionBar');
		elements.title.append(actionBarEl.root);
		this._actionBar = this._register(new ActionBar(actionBarEl.actionBar, {}));
		this._initializeTerminalActions();
		this._terminalService.whenConnected.then(() => this._initializeTerminalActions());
		let pastTenseMessage: string | undefined;
		if (toolInvocation.pastTenseMessage) {
			pastTenseMessage = `${typeof toolInvocation.pastTenseMessage === 'string' ? toolInvocation.pastTenseMessage : toolInvocation.pastTenseMessage.value}`;
		}
		const markdownContent = new MarkdownString(pastTenseMessage, {
			supportThemeIcons: true,
			isTrusted: isMarkdownString(toolInvocation.pastTenseMessage) ? toolInvocation.pastTenseMessage.isTrusted : false,
		});
		const chatMarkdownContent: IChatMarkdownContent = {
			kind: 'markdownContent',
			content: markdownContent,
		};

		const codeBlockRenderOptions: ICodeBlockRenderOptions = {
			hideToolbar: true,
			reserveWidth: 19,
			verticalPadding: 5,
			editorOptions: {
				wordWrap: 'on'
			}
		};

		const markdownOptions: IChatMarkdownContentPartOptions = {
			codeBlockRenderOptions,
			accessibilityOptions: pastTenseMessage ? {
				statusMessage: localize('terminalToolCommand', '{0}', stripIcons(pastTenseMessage))
			} : undefined
		};

		this.markdownPart = this._register(_instantiationService.createInstance(ChatMarkdownContentPart, chatMarkdownContent, context, editorPool, false, codeBlockStartIndex, renderer, {}, currentWidthDelegate(), codeBlockModelCollection, markdownOptions));
		this._register(this.markdownPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		elements.message.append(this.markdownPart.domNode);
		const progressPart = this._register(_instantiationService.createInstance(ChatProgressSubPart, elements.container, this.getIcon(), terminalData.autoApproveInfo));
		this.domNode = progressPart.domNode;
		this._decoration.update();

		if (expandedStateByInvocation.get(toolInvocation)) {
			void this._toggleOutput(true);
		}
		this._register(this._terminalChatService.registerProgressPart(this));
	}

	private async _initializeTerminalActions(): Promise<void> {
		if (this._store.isDisposed) {
			return;
		}
		const terminalToolSessionId = this._terminalData.terminalToolSessionId;
		if (!terminalToolSessionId) {
			this._addActions();
			return;
		}

		const attachInstance = async (instance: ITerminalInstance | undefined) => {
			if (this._store.isDisposed) {
				return;
			}
			if (!instance) {
				if (this._isSerializedInvocation) {
					this._clearCommandAssociation();
				}
				this._addActions(undefined, terminalToolSessionId);
				return;
			}
			const isNewInstance = this._terminalInstance !== instance;
			if (isNewInstance) {
				this._terminalInstance = instance;
				this._registerInstanceListener(instance);
			}
			// Always call _addActions to ensure actions are added, even if instance was set earlier
			// (e.g., by the output view during expanded state restoration)
			this._addActions(instance, terminalToolSessionId);
		};

		const initialInstance = await this._terminalChatService.getTerminalInstanceByToolSessionId(terminalToolSessionId);
		await attachInstance(initialInstance);

		if (!initialInstance) {
			this._addActions(undefined, terminalToolSessionId);
		}

		if (this._store.isDisposed) {
			return;
		}

		if (!this._terminalSessionRegistration) {
			const listener = this._terminalChatService.onDidRegisterTerminalInstanceWithToolSession(async instance => {
				const registeredInstance = await this._terminalChatService.getTerminalInstanceByToolSessionId(terminalToolSessionId);
				if (instance !== registeredInstance) {
					return;
				}
				this._terminalSessionRegistration?.dispose();
				this._terminalSessionRegistration = undefined;
				await attachInstance(instance);
			});
			this._terminalSessionRegistration = this._store.add(listener);
		}
	}

	private _addActions(terminalInstance?: ITerminalInstance, terminalToolSessionId?: string): void {
		if (this._store.isDisposed) {
			return;
		}
		const actionBar = this._actionBar;
		this._removeFocusAction();
		const resolvedCommand = this._getResolvedCommand(terminalInstance);

		if (terminalInstance) {
			const isTerminalHidden = terminalInstance && terminalToolSessionId ? this._terminalChatService.isBackgroundTerminal(terminalToolSessionId) : false;
			const focusAction = this._instantiationService.createInstance(FocusChatInstanceAction, terminalInstance, resolvedCommand, this._terminalCommandUri, this._storedCommandId, isTerminalHidden);
			this._focusAction.value = focusAction;
			actionBar.push(focusAction, { icon: true, label: false, index: 0 });
		}

		this._ensureShowOutputAction(resolvedCommand);
		this._decoration.update(resolvedCommand);
	}

	private _getResolvedCommand(instance?: ITerminalInstance): ITerminalCommand | undefined {
		const target = instance ?? this._terminalInstance;
		if (!target) {
			return undefined;
		}
		return this._resolveCommand(target);
	}

	private _ensureShowOutputAction(command?: ITerminalCommand): void {
		if (this._store.isDisposed) {
			return;
		}
		let resolvedCommand = command;
		if (!resolvedCommand) {
			resolvedCommand = this._getResolvedCommand();
		}
		const hasRenderableOutput = this._outputView.hasRenderableOutput();
		if (!resolvedCommand && !hasRenderableOutput && !this._streamingCommand) {
			return;
		}
		let showOutputAction = this._showOutputAction.value;
		if (!showOutputAction) {
			showOutputAction = this._instantiationService.createInstance(ToggleChatTerminalOutputAction, () => this._toggleOutputFromAction());
			this._showOutputAction.value = showOutputAction;
			if (resolvedCommand?.exitCode) {
				this._toggleOutput(true);
			}
		}
		showOutputAction.syncPresentation(this._outputView.isExpanded);

		const actionBar = this._actionBar;
		if (this._showOutputActionAdded) {
			const existingIndex = actionBar.viewItems.findIndex(item => item.action === showOutputAction);
			if (existingIndex >= 0 && existingIndex !== actionBar.length() - 1) {
				actionBar.pull(existingIndex);
				this._showOutputActionAdded = false;
			} else if (existingIndex >= 0) {
				return;
			}
		}

		if (this._showOutputActionAdded) {
			return;
		}
		actionBar.push([showOutputAction], { icon: true, label: false });
		this._showOutputActionAdded = true;
	}

	private _clearCommandAssociation(): void {
		this._terminalCommandUri = undefined;
		this._storedCommandId = undefined;
		if (this._terminalData.terminalCommandUri) {
			delete this._terminalData.terminalCommandUri;
		}
		if (this._terminalData.terminalToolSessionId) {
			delete this._terminalData.terminalToolSessionId;
		}
		this._decoration.update();
		this._commandStreamingListener.clear();
		this._clearStreamingQueue();
		this._streamingCommand = undefined;
		this._trackedCommandId = undefined;
	}

	private _registerInstanceListener(terminalInstance: ITerminalInstance): void {
		const commandDetectionListener = this._register(new MutableDisposable<DisposableStore>());
		const tryResolveCommand = async (): Promise<ITerminalCommand | undefined> => {
			const resolvedCommand = this._resolveCommand(terminalInstance);
			this._addActions(terminalInstance, this._terminalData.terminalToolSessionId);
			return resolvedCommand;
		};

		const attachCommandDetection = async (commandDetection: ICommandDetectionCapability | undefined) => {
			commandDetectionListener.clear();
			this._commandStreamingListener.clear();
			this._streamingCommand = undefined;
			this._trackedCommandId = this._terminalData.terminalCommandId ?? this._storedCommandId;
			if (!commandDetection) {
				await tryResolveCommand();
				return;
			}
			const store = new DisposableStore();
			commandDetectionListener.value = store;

			store.add(commandDetection.onCommandExecuted(command => this._startStreaming(terminalInstance, command)));
			store.add(commandDetection.onCommandFinished(async command => await this._handleCommandFinished(terminalInstance, command, commandDetectionListener)));

			await tryResolveCommand();
		};

		attachCommandDetection(terminalInstance.capabilities.get(TerminalCapability.CommandDetection));
		this._register(terminalInstance.capabilities.onDidAddCommandDetectionCapability(cd => attachCommandDetection(cd)));

		const instanceListener = this._register(terminalInstance.onDisposed(() => {
			if (this._terminalInstance === terminalInstance) {
				this._terminalInstance = undefined;
			}
			this._clearCommandAssociation();
			commandDetectionListener.clear();
			if (!this._store.isDisposed) {
				this._actionBar.clear();
			}
			this._removeFocusAction();
			this._showOutputActionAdded = false;
			this._showOutputAction.clear();
			this._addActions(undefined, this._terminalData.terminalToolSessionId);
			instanceListener.dispose();
		}));
	}

	private async _handleCommandFinished(terminalInstance: ITerminalInstance | undefined, command: ITerminalCommand, commandDetectionListener: MutableDisposable<DisposableStore>): Promise<void> {
		if (!terminalInstance || this._store.isDisposed) {
			return;
		}
		const finishedId = command.id;
		const handledById = this._trackedCommandId !== undefined && finishedId !== undefined && finishedId === this._trackedCommandId;
		if (!handledById) {
			return;
		}
		if (finishedId && this._terminalData.terminalCommandId !== finishedId) {
			this._terminalData.terminalCommandId = finishedId;
		}
		this._addActions(terminalInstance, this._terminalData.terminalToolSessionId);
		const appliedEmptyOutput = this._tryApplyEmptyOutput(command);
		if (!appliedEmptyOutput) {
			await this._queueStreaming(terminalInstance, command, true);
		}
		this._outputView.endStreaming();
		this._commandStreamingListener.clear();
		this._streamingCommand = undefined;
		this._trackedCommandId = undefined;
		commandDetectionListener.clear();
	}

	private _startStreaming(terminalInstance: ITerminalInstance, command: ITerminalCommand): void {
		if (this._streamingCommand) {
			return;
		}
		const commandId = command.id;
		const expectedId = this._trackedCommandId ?? this._terminalData.terminalCommandId ?? this._storedCommandId;
		const commandMatchesExpected = expectedId !== undefined && commandId !== undefined && commandId === expectedId;
		if (!commandMatchesExpected) {
			return;
		}
		this._streamingCommand = command;
		this._trackedCommandId = commandId ?? expectedId;
		if (commandId && this._terminalData.terminalCommandId !== commandId) {
			this._terminalData.terminalCommandId = commandId;
		}
		this._outputView.beginStreaming();
		this._addActions(terminalInstance, this._terminalData.terminalToolSessionId);
		const streamingStore = new DisposableStore();
		this._commandStreamingListener.value = streamingStore;
		let capturing = true;
		streamingStore.add(toDisposable(() => { capturing = false; }));

		const runIfStreaming = (callback: (currentCommand: ITerminalCommand) => void): void => {
			if (!capturing || streamingStore.isDisposed) {
				return;
			}
			const latestCommand = this._streamingCommand;
			if (!latestCommand || latestCommand !== command) {
				return;
			}
			callback(latestCommand);
		};

		this._queueStreaming(terminalInstance, command);
		streamingStore.add(terminalInstance.onData(() => {
			runIfStreaming(currentCommand => this._queueStreaming(terminalInstance, currentCommand));
		}));
		streamingStore.add(terminalInstance.onLineData(() => {
			runIfStreaming(currentCommand => this._outputView.handleCompletedTerminalLine(terminalInstance, currentCommand));
		}));
		const xterm = terminalInstance.xterm as unknown as XtermTerminal | undefined;
		if (xterm) {
			streamingStore.add(xterm.raw.onCursorMove(() => {
				runIfStreaming(currentCommand => this._outputView.handleCursorRenderableCheck(terminalInstance, currentCommand));
			}));
		}
	}

	private _removeFocusAction(): void {
		if (this._store.isDisposed) {
			return;
		}
		const actionBar = this._actionBar;
		const focusAction = this._focusAction.value;
		if (actionBar && focusAction) {
			const existingIndex = actionBar.viewItems.findIndex(item => item.action === focusAction);
			if (existingIndex >= 0) {
				actionBar.pull(existingIndex);
			}
		}
		this._focusAction.clear();
	}

	private async _toggleOutput(expanded: boolean): Promise<boolean> {
		const didChange = await this._outputView.toggle(expanded);
		this._showOutputAction.value?.syncPresentation(this._outputView.isExpanded);
		if (didChange) {
			expandedStateByInvocation.set(this.toolInvocation, this._outputView.isExpanded);
		}
		return didChange;
	}

	private _computeRowHeightPx(): number {
		const configLineHeight = this._terminalConfigurationService.config.lineHeight && this._terminalConfigurationService.config.lineHeight > 0
			? this._terminalConfigurationService.config.lineHeight
			: 1;
		try {
			const window = dom.getActiveWindow();
			const font = this._terminalConfigurationService.getFont(window);
			const charHeight = font.charHeight && font.charHeight > 0 ? font.charHeight : font.fontSize;
			const rowHeight = charHeight * font.lineHeight;
			return Math.max(Math.ceil(rowHeight), MIN_OUTPUT_HEIGHT);
		} catch {
			const fallback = this._terminalConfigurationService.config.fontSize * configLineHeight;
			return Math.max(Math.ceil(fallback), MIN_OUTPUT_HEIGHT);
		}
	}

	private async _createDetachedTerminal(): Promise<IDetachedTerminalInstance> {
		const targetRef = this._terminalInstance?.targetRef ?? new ImmortalReference<TerminalLocation | undefined>(undefined);
		const colorProvider = this._instantiationService.createInstance(TerminalInstanceColorProvider, targetRef);
		return this._terminalService.createDetachedTerminal({
			cols: this._terminalInstance?.cols ?? 80,
			rows: 10,
			readonly: true,
			processInfo: new DetachedProcessInfo({ initialCwd: '' }),
			colorProvider
		});
	}

	private _handleOutputFocus(): void {
		this._terminalOutputContextKey.set(true);
		this._terminalChatService.setFocusedProgressPart(this);
		this._outputView.updateAriaLabel();
	}

	private _handleOutputBlur(event: FocusEvent): void {
		const nextTarget = event.relatedTarget as HTMLElement | null;
		if (this._outputView.containsElement(nextTarget)) {
			return;
		}
		this._terminalOutputContextKey.reset();
		this._terminalChatService.clearFocusedProgressPart(this);
	}

	private _handleDispose(): void {
		this._terminalOutputContextKey.reset();
		this._terminalChatService.clearFocusedProgressPart(this);
		this._clearStreamingQueue();
	}

	public getCommandAndOutputAsText(): string | undefined {
		return this._outputView.getCommandAndOutputAsText();
	}

	public focusOutput(): void {
		this._outputView.focus();
	}

	private _focusChatInput(): void {
		const widget = this._chatWidgetService.getWidgetBySessionResource(this._sessionResource);
		widget?.focusInput();
	}

	public async focusTerminal(): Promise<void> {
		if (this._focusAction.value) {
			await this._focusAction.value.run();
			return;
		}
		if (this._terminalCommandUri) {
			this._terminalService.openResource(this._terminalCommandUri);
		}
	}

	public async toggleOutputFromKeyboard(): Promise<void> {
		if (!this._outputView.isExpanded) {
			await this._toggleOutput(true);
			this.focusOutput();
			return;
		}
		await this._collapseOutputAndFocusInput();
	}

	private async _toggleOutputFromAction(): Promise<void> {
		if (!this._outputView.isExpanded) {
			await this._toggleOutput(true);
			return;
		}
		await this._toggleOutput(false);
	}

	private async _collapseOutputAndFocusInput(): Promise<void> {
		if (this._outputView.isExpanded) {
			await this._toggleOutput(false);
		}
		this._focusChatInput();
	}

	private _resolveCommand(instance: ITerminalInstance): ITerminalCommand | undefined {
		const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
		const commands = commandDetection?.commands;
		if (!commands || commands.length === 0) {
			return undefined;
		}

		return commands.find(c => c.id === this._terminalData.terminalCommandId);
	}


	private _queueStreaming(instance: ITerminalInstance, command: ITerminalCommand, force = false): Promise<void> {
		if (this._store.isDisposed || (!force && this._streamingCommand !== command)) {
			return Promise.resolve();
		}

		const executedMarker = (command as unknown as { executedMarker?: IXtermMarker; commandExecutedMarker?: IXtermMarker }).executedMarker
			?? (command as unknown as { executedMarker?: IXtermMarker; commandExecutedMarker?: IXtermMarker }).commandExecutedMarker;
		if (!executedMarker) {
			const commandId = command.id ?? 'unknown';
			this._logService.trace('chatTerminalToolProgressPart.queueStreaming.waitForExecutedMarker', { commandId, force });
			this._queueStreaming(instance, command, force);
			return Promise.resolve();
		}

		// Enqueue snapshot work so we never build an ever-growing promise chain.
		const commandId = command.id ?? 'unknown';
		this._logService.trace('chatTerminalToolProgressPart.queueStreaming', { commandId, pending: this._streamingQueue.length + 1, force });

		return new Promise<void>((resolve, reject) => {
			this._streamingQueue.push({ instance, command, force, resolve, reject });
			if (!this._isDrainingStreamingQueue) {
				this._scheduleStreamingFlush();
			}
		});
	}

	private _scheduleStreamingFlush(): void {
		if (this._streamingDrainScheduled || this._isDrainingStreamingQueue || this._streamingQueue.length === 0) {
			return;
		}
		this._streamingDrainScheduled = true;
		this._logService.trace('chatTerminalToolProgressPart.scheduleStreamingFlush', { commandId: this._streamingCommand?.id, queued: this._streamingQueue.length });
		void this._drainStreamingQueue();
	}

	private async _drainStreamingQueue(): Promise<void> {
		this._streamingDrainScheduled = false;
		if (this._isDrainingStreamingQueue || this._streamingQueue.length === 0) {
			return;
		}

		this._isDrainingStreamingQueue = true;
		this._logService.trace('chatTerminalToolProgressPart.drainStreamingQueue-start', { queued: this._streamingQueue.length, commandId: this._streamingCommand?.id });
		try {
			while (this._streamingQueue.length) {
				const job = this._streamingQueue.shift()!;
				if (this._store.isDisposed || (!job.force && this._streamingCommand !== job.command)) {
					job.resolve();
					this._logService.trace('chatTerminalToolProgressPart.drainStreamingQueue-skip', { commandId: job.command.id, force: job.force });
					continue;
				}
				try {
					await this._syncStreamingSnapshot(job.instance, job.command, job.force);
					job.resolve();
					this._logService.trace('chatTerminalToolProgressPart.drainStreamingQueue-run', { commandId: job.command.id, force: job.force });
				} catch (error) {
					job.reject(error);
					this._logService.trace('chatTerminalToolProgressPart.drainStreamingQueue-error', { commandId: job.command.id, force: job.force, message: error instanceof Error ? error.message : String(error) });
				}
			}
		} finally {
			this._isDrainingStreamingQueue = false;
			this._logService.trace('chatTerminalToolProgressPart.drainStreamingQueue-end', { remaining: this._streamingQueue.length, commandId: this._streamingCommand?.id });
			if (this._streamingQueue.length) {
				this._scheduleStreamingFlush();
			}
		}
	}

	private _clearStreamingQueue(error?: unknown): void {
		this._streamingDrainScheduled = false;
		if (!this._streamingQueue.length) {
			return;
		}
		this._logService.trace('chatTerminalToolProgressPart.clearStreamingQueue', { pending: this._streamingQueue.length, hasError: error !== undefined });
		const pending = this._streamingQueue.splice(0, this._streamingQueue.length);
		for (const job of pending) {
			if (error !== undefined) {
				job.reject(error);
			} else {
				job.resolve();
			}
		}
	}

	private async _syncStreamingSnapshot(instance: ITerminalInstance, command: ITerminalCommand, force: boolean): Promise<void> {
		if (!instance || this._store.isDisposed || (!force && this._streamingCommand !== command)) {
			return;
		}
		const xterm = instance.xterm;
		if (!xterm) {
			return;
		}
		const markers = this._resolveCommandMarkers(command);
		const startMarker = markers.start;
		const endMarker = markers.end;
		if (!startMarker || startMarker.line === -1) {
			this._logService.trace('chatTerminalToolProgressPart.syncStreamingSnapshot.waitForStartMarker', { commandId: command.id, force });
			setTimeout(() => {
				if (this._store.isDisposed || (!force && this._streamingCommand !== command)) {
					return;
				}
				this._queueStreaming(instance, command, force);
			}, 0);
			return;
		}
		const endMarkerForRange = this._getStreamingRangeEndMarker(startMarker, endMarker, force);
		const data = await xterm.getRangeAsVT(startMarker, endMarkerForRange);
		if (this._store.isDisposed || (!force && this._streamingCommand !== command) || !data || data.length === 0) {
			if (!data || data.length === 0) {
				this._logService.trace('chatTerminalToolProgressPart.syncStreamingSnapshot.waitForData', { commandId: command.id, force });
				setTimeout(() => {
					if (this._store.isDisposed || (!force && this._streamingCommand !== command)) {
						return;
					}
					this._queueStreaming(instance, command, force);
				}, 0);
			}
			return;
		}
		const stored = this._terminalData.terminalCommandOutput?.text ?? '';
		if (data === stored) {
			if (force && stored.length === 0) {
				const retryAttempt = (this._streamingSnapshotRetryCounts.get(command) ?? 0) + 1;
				this._streamingSnapshotRetryCounts.set(command, retryAttempt);
				if (command.hasOutput() && retryAttempt <= 60) {
					this._logService.trace('chatTerminalToolProgressPart.syncStreamingSnapshot.retryPendingOutput', { commandId: command.id, attempt: retryAttempt });
					setTimeout(() => {
						if (this._store.isDisposed || (!force && this._streamingCommand !== command)) {
							return;
						}
						this._queueStreaming(instance, command, force);
					}, 0);
					return;
				}
				if (command.hasOutput() && retryAttempt > 60) {
					this._logService.trace('chatTerminalToolProgressPart.syncStreamingSnapshot.retryPendingOutput.maxAttempts', { commandId: command.id, attempt: retryAttempt });
				}
			}
			this._streamingSnapshotRetryCounts.delete(command);
			this._logService.trace('chatTerminalToolProgressPart.syncStreamingSnapshot.noChange', { commandId: command.id, length: data.length });
			return;
		}
		this._streamingSnapshotRetryCounts.delete(command);
		this._logService.trace('chatTerminalToolProgressPart.syncStreamingSnapshot.apply', {
			commandId: command.id,
			length: data.length,
			appended: Math.max(0, data.length - stored.length)
		});
		this._outputView.applyStreamingSnapshot(data);
	}

	private _resolveCommandMarkers(command: ITerminalCommand): { start: IXtermMarker | undefined; end: IXtermMarker | undefined } {
		type CommandMarkers = {
			endMarker?: IXtermMarker;
			commandFinishedMarker?: IXtermMarker;
			executedMarker?: IXtermMarker;
			commandExecutedMarker?: IXtermMarker;
		};

		const candidate = command as unknown as CommandMarkers;
		const start = candidate.executedMarker
			?? candidate.commandExecutedMarker
			?? (command.marker as unknown as IXtermMarker | undefined);
		const end = candidate.endMarker ?? candidate.commandFinishedMarker;
		return { start, end };
	}

	private _getStreamingRangeEndMarker(start: IXtermMarker | undefined, end: IXtermMarker | undefined, force: boolean): IXtermMarker | undefined {
		if (!end || end.line === -1) {
			return undefined;
		}
		if (!force || !start || start.line === -1) {
			return end;
		}
		const trimmedLine = end.line - 1;
		if (trimmedLine < start.line) {
			return end;
		}
		return this._createStaticMarker(trimmedLine);
	}

	private _createStaticMarker(line: number): IXtermMarker {
		return {
			id: -1,
			line,
			isDisposed: false,
			onDispose: Event.None,
			dispose: () => { /* no-op */ }
		};
	}

	private _tryApplyEmptyOutput(command: ITerminalCommand): boolean {
		// When a command produces no output, the serialize addon can still capture the prompt,
		// which visually leaks the prompt. Detect the narrow marker range and explicitly treat it
		// as empty so we render the "no output" message instead of the prompt itself.
		// We only call getOutput if the marker range is small to avoid performance issues.
		const markers = this._resolveCommandMarkers(command);
		const startLine = command.marker?.line ?? markers.start?.line;
		const endLine = markers.end?.line ?? command.endMarker?.line;
		if (
			startLine === undefined || endLine === undefined ||
			startLine === -1 || endLine === -1 ||
			endLine - startLine > 2
		) {
			return false;
		}

		const output = command.getOutput();
		if (output && output.trim().length > 0) {
			return false;
		}

		this._outputView.applyEmptyOutput();
		return true;
	}
}

class ChatTerminalToolOutputSection extends Disposable {
	public readonly onDidFocus: Event<void>;
	public readonly onDidBlur: Event<FocusEvent>;

	public get isExpanded(): boolean {
		return this._container.classList.contains('expanded');
	}

	private readonly _outputBody: HTMLElement;
	private readonly _scrollable: DomScrollableElement;
	private _terminalContainer: HTMLElement;
	private _infoElement: HTMLElement | undefined;
	private _rowHeightPx: number;
	private readonly _detachedTerminal: MutableDisposable<IDetachedTerminalInstance>;
	private _outputResizeObserver: ResizeObserver | undefined;
	private _renderedOutputHeight: number | undefined;
	private readonly _outputAriaLabelBase: string;
	private readonly _streaming: ChatTerminalStreamingModel;
	private _encounteredRenderableOutput = false;
	private _xtermElement: HTMLElement | undefined;

	private readonly _onDidFocusEmitter = new Emitter<void>();
	private readonly _onDidBlurEmitter = new Emitter<FocusEvent>();

	constructor(
		private readonly _container: HTMLElement,
		rowHeightPx: number,
		private readonly _title: HTMLElement,
		private readonly _displayCommand: string,
		private readonly _terminalData: IChatTerminalToolInvocationData,
		private readonly _onDidChangeHeight: () => void,
		private readonly _createDetachedTerminal: () => Promise<IDetachedTerminalInstance | undefined>,
		@IAccessibleViewService private readonly _accessibleViewService: IAccessibleViewService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._rowHeightPx = rowHeightPx;
		this._detachedTerminal = this._register(new MutableDisposable<IDetachedTerminalInstance>());

		this._outputAriaLabelBase = localize('chatTerminalOutputAriaLabel', 'Terminal output for {0}', this._displayCommand);

		this._container.classList.add('collapsed');
		this._container.tabIndex = -1;
		const elements = h('.chat-terminal-output-body@body', [
			h('.chat-terminal-output-terminal@terminal')
		]);
		this._outputBody = elements.body;
		this._terminalContainer = elements.terminal;
		this._scrollable = this._register(new DomScrollableElement(this._outputBody, {
			vertical: ScrollbarVisibility.Auto,
			horizontal: ScrollbarVisibility.Auto,
			handleMouseWheel: true
		}));
		const scrollableDomNode = this._scrollable.getDomNode();
		scrollableDomNode.tabIndex = 0;
		scrollableDomNode.classList.add('chat-terminal-output-scroll-host');
		this._container.appendChild(scrollableDomNode);
		this._ensureOutputResizeObserver();

		this.onDidFocus = this._onDidFocusEmitter.event;
		this.onDidBlur = this._onDidBlurEmitter.event;
		this._register(this._onDidFocusEmitter);
		this._register(this._onDidBlurEmitter);

		this._register(dom.addDisposableListener(this._container, dom.EventType.FOCUS_IN, () => this._onDidFocusEmitter.fire()));
		this._register(dom.addDisposableListener(this._container, dom.EventType.FOCUS_OUT, event => this._onDidBlurEmitter.fire(event as FocusEvent)));

		this._streaming = new ChatTerminalStreamingModel(this._terminalData, this._logService);
		this._streaming.hydrateFromStoredOutput(this._terminalData.terminalCommandOutput?.text);
		this._encounteredRenderableOutput = this._streaming.hasRenderableOutput();
		this._setStatusMessages();
		this._updateTerminalVisibility();
	}

	public updateRowHeight(rowHeight: number): void {
		if (!Number.isFinite(rowHeight) || rowHeight <= 0 || rowHeight === this._rowHeightPx) {
			return;
		}
		this._rowHeightPx = rowHeight;
		if (this.isExpanded) {
			this._layoutOutput();
			this._scrollOutputToBottom();
			this._scheduleOutputRelayout();
		}
	}

	public async toggle(expanded: boolean): Promise<boolean> {
		const currentlyExpanded = this.isExpanded;
		if (expanded === currentlyExpanded) {
			return false;
		}

		this._setExpanded(expanded);

		if (!expanded) {
			this._renderedOutputHeight = undefined;
			this._onDidChangeHeight();
			return true;
		}

		await this._ensureUiAndReplay();
		this._layoutOutput();
		this._scrollOutputToBottom();
		this._scheduleOutputRelayout();
		return true;
	}

	public async ensureRendered(): Promise<void> {
		if (!this.isExpanded) {
			return;
		}
		await this._ensureUiAndReplay();
		this._layoutOutput();
		this._scrollOutputToBottom();
	}

	public focus(): void {
		if (this._shouldRenderTerminal()) {
			this._container.focus();
			return;
		}
		this._scrollable.getDomNode().focus();
	}

	public containsElement(element: HTMLElement | null): boolean {
		return !!element && this._container.contains(element);
	}

	public updateAriaLabel(): void {
		const shouldRender = this._shouldRenderTerminal();
		const accessibleViewHint = this._accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.TerminalChatOutput);
		const label = accessibleViewHint ? `${this._outputAriaLabelBase}, ${accessibleViewHint}` : this._outputAriaLabelBase;
		const scrollableDomNode = this._scrollable.getDomNode();
		if (shouldRender) {
			this._container.setAttribute('role', 'region');
			this._container.setAttribute('aria-label', label);
			scrollableDomNode.removeAttribute('role');
			scrollableDomNode.removeAttribute('aria-label');
		} else {
			scrollableDomNode.setAttribute('role', 'region');
			scrollableDomNode.setAttribute('aria-label', label);
			this._container.removeAttribute('role');
			this._container.removeAttribute('aria-label');
		}
	}

	public getCommandAndOutputAsText(): string | undefined {
		const commandHeader = localize('chatTerminalOutputAccessibleViewHeader', 'Command: {0}', this._displayCommand);
		const bufferText = removeAnsiEscapeCodes(this._streaming.getBufferedText()).trimEnd();
		if (!bufferText) {
			return `${commandHeader}\n${localize('chat.terminalOutputEmpty', 'No output was produced by the command.')}`;
		}
		return `${commandHeader}\n${bufferText}`;
	}

	public appendStreamingData(data: string): boolean {
		// Streams raw chunks into the preview buffer and mirrors any appended data into the detached xterm when it's live.
		if (!this._streaming.appendData(data)) {
			return false;
		}
		this._mirrorAppendedData(data);
		this._ensureRenderableFlagFromStream();
		return true;
	}

	public applyStreamingSnapshot(snapshot: string): void {
		// Applies a serialized VT snapshot captured from the command markers. We try to diff the
		// new snapshot against the previously seen content to avoid costly full replays.
		const result = this._streaming.applySnapshot(snapshot);
		let contentMutated = false;
		switch (result.kind) {
			case 'noop':
				return;
			case 'append':
				this._mirrorAppendedData(result.appended);
				contentMutated = true;
				break;
			case 'truncate':
				this._handleTruncatedStreamingSnapshot();
				contentMutated = true;
				break;
			case 'replace':
				this._handleReplacedStreamingSnapshot();
				contentMutated = true;
				break;
		}
		if (contentMutated) {
			this._ensureRenderableFlagFromStream();
		}
	}

	public applyEmptyOutput(): void {
		// Resets the preview state when the command produced no output so that prompts are not
		// surfaced as command output.
		this._streaming.applyEmptyOutput();
		this._encounteredRenderableOutput = false;
		this._disposeDetachedTerminal();
		this._setStatusMessages();
		this._updateTerminalVisibility();
		this._scrollable.scanDomNode();
	}

	public handleCompletedTerminalLine(instance: ITerminalInstance, command: ITerminalCommand): void {
		if (this._encounteredRenderableOutput) {
			return;
		}
		if (!this._cursorLineHasRenderableContent(instance, command, -1)) {
			return;
		}
		this._markRenderableOutput();
	}

	public handleCursorRenderableCheck(instance: ITerminalInstance, command: ITerminalCommand): void {
		if (this._encounteredRenderableOutput) {
			return;
		}
		if (!this._cursorLineHasRenderableContent(instance, command)) {
			return;
		}
		this._markRenderableOutput();
	}

	private _mirrorAppendedData(data: string): void {
		if (!data) {
			return;
		}
		// Mirror the newest data into the detached terminal when it is visible, otherwise fall back
		// to replaying from the buffer the next time the output expands.
		if (this.isExpanded && this._detachedTerminal.value) {
			this._detachedTerminal.value.xterm.write(data);
			this._scrollOutputToBottom();
			this._streaming.clearNeedsReplay();
		} else {
			this._streaming.markNeedsReplay();
		}
		this._logService.trace('chatTerminalOutput.mirrorAppendedData', {
			appendedLength: data.length,
			immediate: this.isExpanded && !!this._detachedTerminal.value
		});
		if (this.isExpanded) {
			this._scheduleOutputRelayout();
		}
		this._setStatusMessages();
		this._updateTerminalVisibility();
	}

	private _handleTruncatedStreamingSnapshot(): void {
		this._streaming.markNeedsReplay();
		if (this._detachedTerminal.value && this.isExpanded) {
			this._clearDetachedTerminal();
		}
		this._logService.trace('chatTerminalOutput.handleTruncate', { isExpanded: this.isExpanded });
		this._setStatusMessages();
		this._updateTerminalVisibility();
		if (this.isExpanded) {
			this._scheduleOutputRelayout();
		}
	}

	private _handleReplacedStreamingSnapshot(): void {
		let replayHandled = false;
		if (this._detachedTerminal.value && this.isExpanded) {
			this._clearDetachedTerminal();
			const buffered = this._streaming.getBufferedText();
			if (buffered) {
				this._detachedTerminal.value.xterm.write(buffered);
				this._scrollOutputToBottom();
			}
			this._streaming.clearNeedsReplay();
			replayHandled = true;
		}
		if (!replayHandled) {
			this._streaming.markNeedsReplay();
		}
		this._logService.trace('chatTerminalOutput.handleReplace', { replayHandled, isExpanded: this.isExpanded });
		this._setStatusMessages();
		this._updateTerminalVisibility();
		if (this.isExpanded) {
			this._scheduleOutputRelayout();
		}
	}

	private _clearDetachedTerminal(): void {
		// Clears the detached xterm prior to replaying content so the terminal reflects the latest
		// snapshot exactly.
		const instance = this._detachedTerminal.value;
		if (!instance) {
			return;
		}
		const xterm = instance.xterm as unknown as XtermTerminal | undefined;
		if (!xterm) {
			return;
		}
		try {
			xterm.raw.clear();
			xterm.write('\x1b[3J\x1b[2J\x1b[H');
		} catch {
			// The detached terminal may be mid-dispose; ignore errors when clearing.
		}
	}

	public beginStreaming(): void {
		// Resets streaming state just before a command starts emitting fresh data.
		this._streaming.beginStreaming();
		this._encounteredRenderableOutput = false;
		if (this._detachedTerminal.value) {
			this._clearDetachedTerminal();
		}
		this._setSupplementalMessages([]);
		this._scrollable.scanDomNode();
		this._updateTerminalVisibility();
	}

	public endStreaming(): void {
		this._streaming.endStreaming();
		this._setStatusMessages();
		this._updateTerminalVisibility();
	}

	public hasRenderableOutput(): boolean {
		return this._encounteredRenderableOutput || this._streaming.hasRenderableOutput();
	}

	private _shouldRenderTerminal(): boolean {
		return this._encounteredRenderableOutput || this._streaming.shouldRender();
	}

	private _updateTerminalVisibility(): void {
		const shouldRender = this._shouldRenderTerminal();
		const scrollableDomNode = this._scrollable.getDomNode();
		this._terminalContainer.classList.toggle('chat-terminal-output-terminal-no-output', !shouldRender);
		this._container.tabIndex = shouldRender ? 0 : -1;
		scrollableDomNode.tabIndex = shouldRender ? -1 : 0;
		if (!shouldRender) {
			this._disposeDetachedTerminal();
		} else {
			this._ensureOutputResizeObserver();
		}
		this.updateAriaLabel();
	}

	private _disposeDetachedTerminal(): void {
		this._detachedTerminal.clear();
		this._outputResizeObserver?.disconnect();
		this._outputResizeObserver = undefined;
		this._xtermElement = undefined;
		dom.clearNode(this._terminalContainer);
	}

	private _setExpanded(expanded: boolean): void {
		this._container.classList.toggle('expanded', expanded);
		this._container.classList.toggle('collapsed', !expanded);
		this._title.classList.toggle('expanded', expanded);
		if (!expanded) {
			const domNode = this._scrollable.getDomNode();
			domNode.style.removeProperty('height');
			domNode.style.removeProperty('max-height');
		}
	}

	private async _ensureUiAndReplay(): Promise<void> {
		if (!this._shouldRenderTerminal()) {
			this._updateTerminalVisibility();
			this.updateAriaLabel();
			return;
		}

		await this._ensureDetachedTerminalInstance();
		if (this._streaming.needsReplay) {
			await this._replayBuffer();
		}
		this._updateTerminalVisibility();
		this.updateAriaLabel();
	}

	private async _replayBuffer(): Promise<void> {
		const instance = await this._ensureDetachedTerminalInstance();
		if (!instance) {
			return;
		}
		this._clearDetachedTerminal();
		const concatenated = this._streaming.getBufferedText();
		if (concatenated) {
			instance.xterm.write(concatenated);
		}
		this._streaming.clearNeedsReplay();
		this._logService.trace('chatTerminalOutput.replayBuffer', { length: concatenated.length });
		this._setStatusMessages();
		this._scrollOutputToBottom();
	}

	private _scheduleOutputRelayout(): void {
		dom.getActiveWindow().requestAnimationFrame(() => {
			this._layoutOutput();
			this._scrollOutputToBottom();
		});
	}

	private _layoutOutput(): void {
		if (!this._terminalContainer || !this.isExpanded) {
			return;
		}
		const contentHeight = Math.max(this._calculateVisibleContentHeight(), MIN_OUTPUT_HEIGHT);
		const clampedHeight = Math.min(contentHeight, MAX_TERMINAL_OUTPUT_PREVIEW_HEIGHT);
		const measuredBodyHeight = Math.max(this._outputBody.scrollHeight, MIN_OUTPUT_HEIGHT);
		const appliedHeight = Math.min(clampedHeight, measuredBodyHeight);
		const domNode = this._scrollable?.getDomNode();
		if (domNode) {
			domNode.style.maxHeight = `${MAX_TERMINAL_OUTPUT_PREVIEW_HEIGHT}px`;
			domNode.style.height = `${appliedHeight}px`;
			this._scrollable?.scanDomNode();
		}
		if (this._renderedOutputHeight !== appliedHeight) {
			this._renderedOutputHeight = appliedHeight;
			this._onDidChangeHeight();
		}
	}

	private _scrollOutputToBottom(): void {
		this._scrollable.scanDomNode();
		const dimensions = this._scrollable.getScrollDimensions();
		this._scrollable.setScrollPosition({ scrollTop: dimensions.scrollHeight });
	}

	private _ensureOutputResizeObserver(): void {
		if (this._outputResizeObserver || !this._terminalContainer) {
			return;
		}
		const observer = new ResizeObserver(() => this._layoutOutput());
		observer.observe(this._terminalContainer);
		this._outputResizeObserver = observer;
		this._register(toDisposable(() => {
			observer.disconnect();
			this._outputResizeObserver = undefined;
		}));
	}

	private _calculateVisibleContentHeight(): number {
		const lineCount = this._countStreamLines();
		const effectiveLines = Math.max(lineCount, 1);
		const infoHeight = this._infoElement?.offsetHeight ?? 0;
		const hasOutput = this._streaming.hasRenderableOutput();
		if (!hasOutput && !this._streaming.isStreaming) {
			return infoHeight;
		}
		return Math.max(effectiveLines * this._rowHeightPx + infoHeight, this._rowHeightPx);
	}


	private async _ensureDetachedTerminalInstance(): Promise<IDetachedTerminalInstance | undefined> {
		if (!this._shouldRenderTerminal()) {
			return undefined;
		}
		const existing = this._detachedTerminal.value;
		if (existing) {
			if (!this._xtermElement) {
				this._captureXtermElement(existing);
			}
			return existing;
		}
		try {
			const instance = await this._createDetachedTerminal();
			this._detachedTerminal.value = instance;
			if (!instance) {
				return undefined;
			}
			instance.attachToElement(this._terminalContainer);
			this._captureXtermElement(instance);
			this._scrollable.scanDomNode();
			return instance;
		} catch {
			return undefined;
		}
	}

	private _captureXtermElement(instance: IDetachedTerminalInstance): void {
		const rawElement = instance.xterm.getElement();
		if (!rawElement) {
			this._xtermElement = undefined;
			return;
		}

		this._xtermElement = rawElement;
		if (this._outputResizeObserver) {
			this._outputResizeObserver.disconnect();
			this._outputResizeObserver = undefined;
		}
		this._ensureOutputResizeObserver();
	}

	private _setStatusMessages(): void {
		const messages: string[] = [];
		const storedOutput = this._terminalData.terminalCommandOutput?.text ?? '';
		const storedHasContent = removeAnsiEscapeCodes(storedOutput).replace(/\r/g, '').trim().length > 0;
		const hasOutput = storedHasContent || this._encounteredRenderableOutput || this._streaming.hasRenderableOutput();
		const showEmptyMessage = !hasOutput && !this._streaming.isStreaming;
		if (showEmptyMessage) {
			this._logService.trace('chatTerminalOutput.statusMessage.emptyOutput');
			messages.push(localize('chat.terminalOutputEmpty', 'No output was produced by the command.'));
		}
		this._setSupplementalMessages(messages);
	}

	private _setSupplementalMessages(messages: string[]): void {
		const hasContent = messages.some(message => message.trim().length > 0);
		if (!hasContent) {
			if (this._infoElement) {
				this._infoElement.remove();
				this._infoElement = undefined;
			}
			this._scrollable.scanDomNode();
			return;
		}
		if (!this._infoElement) {
			this._infoElement = dom.$('div.chat-terminal-output-info');
			this._outputBody.appendChild(this._infoElement);
		}
		this._infoElement.textContent = messages.join('\n\n');
		this._scrollable.scanDomNode();
	}

	private _countStreamLines(): number {
		const fromStreaming = this._streaming.countRenderableLines();
		if (fromStreaming > 0) {
			return fromStreaming;
		}
		const storedOutput = this._terminalData.terminalCommandOutput?.text;
		if (!storedOutput) {
			return 0;
		}
		const sanitized = removeAnsiEscapeCodes(storedOutput).replace(/\r/g, '');
		if (!sanitized.length) {
			return 0;
		}
		return sanitized.split('\n').length;
	}

	private _markRenderableOutput(): void {
		if (this._encounteredRenderableOutput) {
			return;
		}
		this._streaming.markRenderableOutput();
		this._encounteredRenderableOutput = true;
		this._setStatusMessages();
		this._updateTerminalVisibility();
	}

	private _cursorLineHasRenderableContent(instance: ITerminalInstance, command: ITerminalCommand, relativeLineOffset = 0): boolean {
		const xterm = instance.xterm as unknown as XtermTerminal | undefined;
		if (!xterm) {
			return false;
		}
		const startMarker = this._resolveCommandStartMarker(command);
		if (!startMarker || startMarker.line === -1) {
			return false;
		}
		const buffer = xterm.raw.buffer.active;
		const cursorLine = buffer.baseY + buffer.cursorY;
		const targetLine = cursorLine + relativeLineOffset;
		if (targetLine < 0 || targetLine < startMarker.line) {
			return false;
		}
		const line = buffer.getLine(targetLine);
		if (!line) {
			return false;
		}
		let segment = line.translateToString(true);
		if (!segment) {
			return false;
		}
		if (targetLine === startMarker.line) {
			const executedColumn = command.executedX ?? 0;
			segment = executedColumn < segment.length ? segment.slice(executedColumn) : '';
		}
		if (!segment) {
			return false;
		}
		if (relativeLineOffset === 0) {
			const cursorX = buffer.cursorX;
			segment = cursorX < segment.length ? segment.slice(0, cursorX) : segment;
		}
		return segment.replace(/\r/g, '').trim().length > 0;
	}

	private _ensureRenderableFlagFromStream(): void {
		if (this._encounteredRenderableOutput) {
			return;
		}
		if (this._streaming.hasRenderableOutput()) {
			this._markRenderableOutput();
		}
	}

	private _resolveCommandStartMarker(command: ITerminalCommand): IXtermMarker | undefined {
		type CommandMarkers = {
			executedMarker?: IXtermMarker;
			commandExecutedMarker?: IXtermMarker;
			marker?: IXtermMarker;
		};
		const candidate = command as unknown as CommandMarkers;
		return candidate.executedMarker
			?? candidate.commandExecutedMarker
			?? (command.marker as unknown as IXtermMarker | undefined);
	}
}

export const focusMostRecentChatTerminalCommandId = 'workbench.action.chat.focusMostRecentChatTerminal';
export const focusMostRecentChatTerminalOutputCommandId = 'workbench.action.chat.focusMostRecentChatTerminalOutput';

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: focusMostRecentChatTerminalCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ChatContextKeys.inChatSession,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyT,
	handler: async (accessor: ServicesAccessor) => {
		const terminalChatService = accessor.get(ITerminalChatService);
		const part = terminalChatService.getMostRecentProgressPart();
		if (!part) {
			return;
		}
		await part.focusTerminal();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: focusMostRecentChatTerminalOutputCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ChatContextKeys.inChatSession,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyO,
	handler: async (accessor: ServicesAccessor) => {
		const terminalChatService = accessor.get(ITerminalChatService);
		const part = terminalChatService.getMostRecentProgressPart();
		if (!part) {
			return;
		}
		await part.toggleOutputFromKeyboard();
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: focusMostRecentChatTerminalCommandId,
		title: localize('chat.focusMostRecentTerminal', 'Chat: Focus Most Recent Terminal'),
	},
	when: ChatContextKeys.inChatSession
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: focusMostRecentChatTerminalOutputCommandId,
		title: localize('chat.focusMostRecentTerminalOutput', 'Chat: Focus Most Recent Terminal Output'),
	},
	when: ChatContextKeys.inChatSession
});

export const openTerminalSettingsLinkCommandId = '_chat.openTerminalSettingsLink';
export const disableSessionAutoApprovalCommandId = '_chat.disableSessionAutoApproval';

CommandsRegistry.registerCommand(openTerminalSettingsLinkCommandId, async (accessor, scopeRaw: string) => {
	const preferencesService = accessor.get(IPreferencesService);

	if (scopeRaw === 'global') {
		preferencesService.openSettings({
			query: `@id:${ChatConfiguration.GlobalAutoApprove}`
		});
	} else {
		const scope = parseInt(scopeRaw);
		const target = !isNaN(scope) ? scope as ConfigurationTarget : undefined;
		const options: IOpenSettingsOptions = {
			jsonEditor: true,
			revealSetting: {
				key: TerminalContribSettingId.AutoApprove
			}
		};
		switch (target) {
			case ConfigurationTarget.APPLICATION: preferencesService.openApplicationSettings(options); break;
			case ConfigurationTarget.USER:
			case ConfigurationTarget.USER_LOCAL: preferencesService.openUserSettings(options); break;
			case ConfigurationTarget.USER_REMOTE: preferencesService.openRemoteSettings(options); break;
			case ConfigurationTarget.WORKSPACE:
			case ConfigurationTarget.WORKSPACE_FOLDER: preferencesService.openWorkspaceSettings(options); break;
			default: {
				// Fallback if something goes wrong
				preferencesService.openSettings({
					target: ConfigurationTarget.USER,
					query: `@id:${TerminalContribSettingId.AutoApprove}`,
				});
				break;
			}
		}
	}
});

CommandsRegistry.registerCommand(disableSessionAutoApprovalCommandId, async (accessor, chatSessionId: string) => {
	const terminalChatService = accessor.get(ITerminalChatService);
	terminalChatService.setChatSessionAutoApproval(chatSessionId, false);
});


class ToggleChatTerminalOutputAction extends Action implements IAction {
	private _expanded = false;

	constructor(
		private readonly _toggle: () => Promise<void>,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super(
			'chat.showTerminalOutput',
			localize('showTerminalOutput', 'Show Output'),
			ThemeIcon.asClassName(Codicon.chevronRight),
			true,
		);
		this._updateTooltip();
	}

	public override async run(): Promise<void> {
		await this._toggle();
	}

	public syncPresentation(expanded: boolean): void {
		this._expanded = expanded;
		this._updatePresentation();
		this._updateTooltip();
	}

	public refreshKeybindingTooltip(): void {
		this._updateTooltip();
	}

	private _updatePresentation(): void {
		if (this._expanded) {
			this.label = localize('hideTerminalOutput', 'Hide Output');
			this.class = ThemeIcon.asClassName(Codicon.chevronDown);
		} else {
			this.label = localize('showTerminalOutput', 'Show Output');
			this.class = ThemeIcon.asClassName(Codicon.chevronRight);
		}
	}

	private _updateTooltip(): void {
		const keybinding = this._keybindingService.lookupKeybinding(focusMostRecentChatTerminalOutputCommandId);
		const label = keybinding?.getLabel();
		this.tooltip = label ? `${this.label} (${label})` : this.label;
	}
}

export class FocusChatInstanceAction extends Action implements IAction {
	constructor(
		private _instance: ITerminalInstance | undefined,
		private _command: ITerminalCommand | undefined,
		private readonly _commandUri: URI | undefined,
		private readonly _commandId: string | undefined,
		isTerminalHidden: boolean,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super(
			'chat.focusTerminalInstance',
			isTerminalHidden ? localize('showTerminal', 'Show and Focus Terminal') : localize('focusTerminal', 'Focus Terminal'),
			ThemeIcon.asClassName(Codicon.openInProduct),
			true,
		);
		this._updateTooltip();
	}

	public override async run() {
		this.label = localize('focusTerminal', 'Focus Terminal');
		this._updateTooltip();
		if (this._instance) {
			this._terminalService.setActiveInstance(this._instance);
			if (this._instance.target === TerminalLocation.Editor) {
				this._terminalEditorService.openEditor(this._instance);
			} else {
				await this._terminalGroupService.showPanel(true);
			}
			this._terminalService.setActiveInstance(this._instance);
			await this._instance.focusWhenReady(true);
			const command = this._resolveCommand();
			if (command) {
				this._instance.xterm?.markTracker.revealCommand(command);
			}
			return;
		}

		if (this._commandUri) {
			this._terminalService.openResource(this._commandUri);
		}
	}

	public refreshKeybindingTooltip(): void {
		this._updateTooltip();
	}

	private _resolveCommand(): ITerminalCommand | undefined {
		if (this._command && !this._command.endMarker?.isDisposed) {
			return this._command;
		}
		if (!this._instance || !this._commandId) {
			return this._command;
		}
		const commandDetection = this._instance.capabilities.get(TerminalCapability.CommandDetection);
		const resolved = commandDetection?.commands.find(c => c.id === this._commandId);
		if (resolved) {
			this._command = resolved;
		}
		return this._command;
	}

	private _updateTooltip(): void {
		const keybinding = this._keybindingService.lookupKeybinding(focusMostRecentChatTerminalCommandId);
		const label = keybinding?.getLabel();
		this.tooltip = label ? `${this.label} (${label})` : this.label;
	}
}
