/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { createStyleSheet } from '../../../../../../../base/browser/domStylesheets.js';
import { status } from '../../../../../../../base/browser/ui/aria/aria.js';
import { StandardKeyboardEvent } from '../../../../../../../base/browser/keyboardEvent.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { KeyCode, KeyMod } from '../../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition, MouseTargetType } from '../../../../../../../editor/browser/editorBrowser.js';
import { IClipboardCopyEvent } from '../../../../../../../editor/browser/controller/editContext/clipboardUtils.js';
import { ICodeEditorService } from '../../../../../../../editor/browser/services/codeEditorService.js';
import { EditorOption } from '../../../../../../../editor/common/config/editorOptions.js';
import { IPosition, Position } from '../../../../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../../../editor/common/core/ranges/offsetRange.js';
import { ISelection, Selection } from '../../../../../../../editor/common/core/selection.js';
import { PositionOffsetTransformer } from '../../../../../../../editor/common/core/text/positionToOffset.js';
import { CursorChangeReason } from '../../../../../../../editor/common/cursorEvents.js';
import { IEditorDecorationsCollection } from '../../../../../../../editor/common/editorCommon.js';
import { IIdentifiedSingleEditOperation, IModelDecorationOptions, ITextModel, TrackedRangeStickiness } from '../../../../../../../editor/common/model.js';
import { IModelContentChange } from '../../../../../../../editor/common/model/mirrorTextModel.js';
import { localize, localize2 } from '../../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../../platform/accessibility/common/accessibility.js';
import { Action2, registerAction2 } from '../../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { AccessibilityVerbositySettingId } from '../../../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { canOpenAttachment, canShowAttachmentInline, getAttachmentLabel, getAttachmentMention, getAttachmentPromptText, GITHUB_CONTEXT_ATTACHMENT_ID_PREFIX, IInlineAttachmentAnchor, IInlineAttachmentProjection, INLINE_ATTACHMENT_ANCHOR, isInlineAttachmentCandidate, projectInlineAttachments, toRelativeRange } from '../../../../common/attachments/chatInlineAttachments.js';
import { IChatRequestVariableEntry } from '../../../../common/attachments/chatVariableEntries.js';
import { IDynamicVariable, toAttachedContextDynamicVariable } from '../../../../common/attachments/chatVariables.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { ChatRequestDynamicVariablePart, ChatRequestToolPart, ChatRequestToolSetPart, IParsedChatRequest, IParsedChatRequestPart, chatAgentLeader, chatSubcommandLeader, chatVariableLeader } from '../../../../common/requestParser/chatParserTypes.js';
import { IChatWidget } from '../../../chat.js';
import { ChatAttachmentModel } from '../../../attachments/chatAttachmentModel.js';
import { IChatAttachmentWidgetInstance } from '../../../attachments/chatAttachmentWidgetRegistry.js';
import { ChatDynamicVariableModel } from '../../../attachments/chatDynamicVariables.js';
import { getGitHubIssueOrPullRequestAttachments } from './chatPasteProviders.js';
import './media/chatInlineAttachments.css';

/** What an inline attachment pill stands for. */
interface IInlineAttachmentPillData {
	/** The id of the attachment or reference that the pill shows. */
	readonly id: string;
	/** The text the pill stands for in the prompt, such as `#file:index.ts`. */
	readonly text: string;
	/** The reference to {@link text} in the prompt, if any. Its range is ignored. */
	readonly reference: IDynamicVariable | undefined;
	/** What the pill shows while its attachment is not in the attachment model, such as an attachment derived from a reference. */
	readonly entry: IChatRequestVariableEntry;
}

/** A pill that was removed by editing the input, kept so that undo and redo can restore it. */
interface IRemovedInlineAttachmentPill {
	readonly data: IInlineAttachmentPillData;
	/** The offset of the pill's anchor before it was removed. */
	readonly offset: number;
	/** The attachment that was removed along with the pill. */
	readonly attachment: IChatRequestVariableEntry | undefined;
	/**
	 * The alternative version of the input once the pill was removed. Undo goes
	 * back to the version before an edit, and redo forward to the version after
	 * it, which tells which removed pills they bring back.
	 */
	readonly version: number;
	/** Whether undo removed the pill, which redo brings back, rather than an edit, which undo brings back. */
	readonly removedByUndo: boolean;
}

/** A pill to create by replacing a range of the input with its anchor. */
interface IPendingInlineAttachmentPill {
	readonly data: IInlineAttachmentPillData;
	readonly range: Range;
}

/** How the input changed since the pills were last reconciled with it. */
interface IInputChange {
	/** The input was replaced as a whole, as when input state is restored. */
	readonly flush: boolean;
	readonly undoRedo: boolean;
	/** The change redid an edit, rather than undoing one. */
	readonly redo: boolean;
	/** The alternative version of the input before the change. */
	readonly versionBefore: number | undefined;
	/** How many anchors the change inserted, which are those of pills that it moved, copied, or that undo or redo brought back. */
	readonly insertedAnchors: number;
	/** Maps an offset in the input before the change to the offset after it. */
	readonly mapOffset: (offset: number) => number;
}

/** Hosts the inline attachment pills of a chat input. */
export interface IChatInlineAttachmentsHost {
	/** The widget whose input contains the pills, once it is rendered. */
	readonly widget: IChatWidget | undefined;
	/** Creates a pill with the widget that the attachments above the input use for the attachment. */
	createAttachmentWidget(attachment: IChatRequestVariableEntry, container: HTMLElement, options: { shouldFocusClearButton: boolean; supportsDeletion: boolean }): IChatAttachmentWidgetInstance;
	/**
	 * Removes the attachments of pills that were removed from the input, as
	 * removing them from above the input does.
	 *
	 * @param explicit Whether the user removed the pills, rather than undoing their addition.
	 */
	removeAttachments(attachments: readonly IChatRequestVariableEntry[], explicit: boolean): void;
}

/** The smallest width that keeps the spacer after an anchor, which must exist to place the cursor after a pill at the end of a line. */
const minWrapWidthInEm = 0.001;
const gitHubLinkPattern = /https?:\/\/github\.com\/[^\s/]+\/[^\s/]+\/(?:issues|pull)\/\d+[^\s]*/gi;

/**
 * Shows the attachments of a chat input as pills inline with the prompt text,
 * when {@link ChatConfiguration.InlineAttachmentsEnabled} is enabled.
 *
 * A pill occupies a single {@link INLINE_ATTACHMENT_ANCHOR} character of the
 * input, so the cursor moves across it, selects it, and deletes it like any
 * other character. The anchor is widened to the pill's width, and the pill
 * itself is a content widget laid out over it.
 *
 * Attachments, references such as `#file:index.ts`, and tool references in the
 * input all become pills. Removing a pill removes its attachment. The prompt
 * that is submitted and persisted is the input with every pill expanded back to
 * the text it stands for, see {@link project}.
 */
export class ChatInlineAttachments extends Disposable {

	private static readonly _byEditor = new WeakMap<ICodeEditor, ChatInlineAttachments>();

	/** The controller of the pills in a chat input editor. */
	static get(editor: ICodeEditor): ChatInlineAttachments | undefined {
		return ChatInlineAttachments._byEditor.get(editor);
	}

	private readonly _pills = new Set<InlineAttachmentPill>();
	/**
	 * Pills that edits removed, kept for as long as undoing the edit can bring
	 * them back, and pills that undo removed, kept for as long as redo can.
	 */
	private _removedPills: IRemovedInlineAttachmentPill[] = [];
	/**
	 * Attachments shown above the input rather than as pills: those that the
	 * input carried over when it was replaced as a whole, such as attachments
	 * that stay attached after a request was sent, while the new input does
	 * not mention them.
	 */
	private readonly _attachmentsShownAbove = new Set<string>();
	/**
	 * The ids of what pills stood for when undo or redo replaced them with their
	 * text, which stays text until the input is edited, rather than becoming a
	 * pill again in an edit that would stop undo from going any further back.
	 */
	private readonly _expandedByUndoRedo = new Set<string>();
	private readonly _widthStyles = this._register(new InlineAttachmentWidthStyles());

	private readonly _onDidChange = this._register(new Emitter<void>());
	/** Fires when pills are added or removed. */
	readonly onDidChange = this._onDidChange.event;

	private readonly _dynamicVariableModelListener = this._register(new MutableDisposable());
	private _dynamicVariableModel: ChatDynamicVariableModel | undefined;
	private readonly _parsedInputListener = this._register(new MutableDisposable());
	private _parsedInputWidget: IChatWidget | undefined;

	private _isEnabled: boolean;
	private _suspensions = 0;
	private _isReconcileScheduled = false;
	private _isApplyingEdits = false;
	/**
	 * The pills that an edit of this controller is adding. Listeners of the edit
	 * parse the input before the pills exist, so the projection includes them.
	 */
	private _pendingAnchors: readonly IInlineAttachmentAnchor[] = [];
	private _needsRender = false;
	private _change: IInputChange | undefined;
	/**
	 * The alternative version of the input when the pills were last reconciled
	 * with it, which is where the next change starts from. Editors report undo
	 * and redo before the input takes the version that they go back or forward to.
	 */
	private _version: number | undefined;
	private _lastInsertedTexts: readonly string[] = [];
	private _lastCursorOffset: number | undefined;
	/**
	 * The pill right before the cursor, which Enter opens and Backspace deletes,
	 * see {@link ChatContextKeys.inputInlineAttachmentActive}.
	 */
	private _activePill: InlineAttachmentPill | undefined;
	/**
	 * Whether the cursor was placed by an edit rather than by the user, as when a
	 * prompt is pasted or restored, in which case the pill before it is not
	 * active, so that Enter sends the prompt.
	 */
	private _isCursorPlacedByEdit = false;
	/** How the cursor last changed other than by an edit of this controller, which tells whether a completion placed it. */
	private _lastCursorChange: { readonly source: string; readonly reason: CursorChangeReason } | undefined;
	private readonly _activePillContextKey: IContextKey<boolean>;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _attachmentModel: ChatAttachmentModel,
		private readonly _host: IChatInlineAttachmentsHost,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@ILabelService private readonly _labelService: ILabelService,
	) {
		super();

		ChatInlineAttachments._byEditor.set(this._editor, this);
		this._register(toDisposable(() => {
			if (ChatInlineAttachments._byEditor.get(this._editor) === this) {
				ChatInlineAttachments._byEditor.delete(this._editor);
			}
		}));
		// The key is scoped to the editor, so it only applies while the editor has focus.
		this._activePillContextKey = this._editor.invokeWithinContext(accessor => ChatContextKeys.inputInlineAttachmentActive.bindTo(accessor.get(IContextKeyService)));
		this._register(toDisposable(() => this._activePillContextKey.reset()));

		this._isEnabled = this._configurationService.getValue<boolean>(ChatConfiguration.InlineAttachmentsEnabled) === true;
		this._version = this._editor.getModel()?.getAlternativeVersionId();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.InlineAttachmentsEnabled)) {
				this._isEnabled = this._configurationService.getValue<boolean>(ChatConfiguration.InlineAttachmentsEnabled) === true;
				this._attachmentsShownAbove.clear();
				this._scheduleReconcile();
			}
		}));

		this._register(this._editor.onDidChangeModel(() => {
			this._clearPills();
			this._removedPills.length = 0;
			this._attachmentsShownAbove.clear();
			this._expandedByUndoRedo.clear();
			this._version = this._editor.getModel()?.getAlternativeVersionId();
			this._isCursorPlacedByEdit = true;
			this._scheduleReconcile();
		}));

		this._register(this._editor.onDidChangeModelContent(e => {
			// Content widgets stay where they were laid out, so the pills follow their anchors explicitly.
			for (const pill of this._pills) {
				pill.followAnchor();
			}
			if (!e.isUndoing && !e.isRedoing && this._removedPills.some(removed => removed.removedByUndo)) {
				// Any other edit, including this controller's, leaves nothing to redo.
				this._removedPills = this._removedPills.filter(removed => !removed.removedByUndo);
			}
			if (this._isApplyingEdits) {
				return;
			}
			if (e.isFlush) {
				this._removedPills.length = 0;
			}
			if (!e.isUndoing && !e.isRedoing) {
				this._expandedByUndoRedo.clear();
			}
			let insertedAnchors = this._change?.insertedAnchors ?? 0;
			for (const change of e.changes) {
				insertedAnchors += countAnchors(change.text);
			}
			const mapEventOffset = createOffsetMapper(e.changes);
			const mapChangeOffset = this._change?.mapOffset;
			this._change = {
				flush: !!this._change?.flush || e.isFlush,
				undoRedo: !!this._change?.undoRedo || e.isUndoing || e.isRedoing,
				redo: !!this._change?.redo || e.isRedoing,
				versionBefore: this._change ? this._change.versionBefore : this._version,
				insertedAnchors,
				mapOffset: mapChangeOffset ? offset => mapEventOffset(mapChangeOffset(offset)) : mapEventOffset,
			};
			// Text inserted at once, as when pasted, is not being typed.
			this._lastInsertedTexts = e.changes.map(change => change.text).filter(text => text.length > 1);
			this._scheduleReconcile();
		}));

		this._register(this._editor.onDidChangeCursorSelection(e => {
			// An edit of this controller, as when what a completion inserted becomes a pill, moves the cursor
			// that the user or the edit before it placed, which tells whether the pill before it is active.
			if (!this._isApplyingEdits) {
				this._isCursorPlacedByEdit = e.source === 'api' || (e.reason !== CursorChangeReason.Explicit && e.reason !== CursorChangeReason.NotSet);
				this._lastCursorChange = { source: e.source, reason: e.reason };
			}
			this._updateSelectedPills();
			const previousActive = this._activePill;
			this._updateActivePill();
			// The cursor crosses a pill when it is moved, rather than when an edit, such as deleting the pill, moves it.
			this._announcePillAtCursor(e.reason === CursorChangeReason.Explicit, previousActive);
			// Typed text that stands for an attachment becomes a pill once the cursor leaves it.
			this._scheduleReconcile();
		}));

		this._register(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.lineHeight)) {
				this.refresh();
			}
		}));

		this._register(this._attachmentModel.onDidChange(() => this._scheduleReconcile()));
		this._register(toDisposable(() => this._clearPills()));

		// The pills are not tab stops, so the keys that open the context menu of a pill with focus open the menu of
		// the pill right before the cursor. This runs before the editor shows its own context menu for these keys.
		this._register(dom.addDisposableListener(this._editor.getContainerDomNode(), dom.EventType.KEY_DOWN, e => this._showActivePillContextMenu(e), true));

		// Copied text stands for the pills it contains, so it reads as the prompt wherever it is pasted.
		const copyPrompt = (e: IClipboardCopyEvent) => this._copyPrompt(e);
		this._register(this._editor.onWillCopy(copyPrompt));
		this._register(this._editor.onWillCut(copyPrompt));

		this._scheduleReconcile();
	}

	/** Whether attachments are shown inline in this input instead of above it. */
	get isEnabled(): boolean {
		return this._isEnabled;
	}

	/**
	 * Whether an attachment is shown as a pill in this input rather than above
	 * it: a pill stands for it, or its text does after undo or redo replaced
	 * the pill with it. An input whose host cannot show pills, or one that has
	 * not inserted the pill yet, shows the attachment above it.
	 */
	isShownInline(attachment: IChatRequestVariableEntry): boolean {
		return this._isEnabled && canShowAttachmentInline(attachment) && !this._attachmentsShownAbove.has(attachment.id)
			&& (this._hasPillFor(attachment.id) || this._expandedByUndoRedo.has(attachment.id));
	}

	/**
	 * The references that pills stand for, with ranges that cover their
	 * anchors in the input. While a pill stands for a reference, the input's
	 * {@link ChatDynamicVariableModel} does not have the reference.
	 */
	getPillReferences(): IDynamicVariable[] {
		const model = this._editor.getModel();
		if (!model) {
			return [];
		}
		const references: IDynamicVariable[] = [];
		for (const pill of this._pills) {
			const range = pill.range;
			if (pill.data.reference && range && isAnchorRange(model, range)) {
				references.push({ ...pill.data.reference, range });
			}
		}
		// Pills that this controller's edit adds exist only while it edits, which is when the input's references change.
		for (const anchor of this._pendingAnchors) {
			const range = Range.fromPositions(model.getPositionAt(anchor.offset), model.getPositionAt(anchor.offset + 1));
			if (anchor.reference && isAnchorRange(model, range)) {
				references.push({ ...anchor.reference, range });
			}
		}
		return references;
	}

	/** The text of the prompt that a range of the input stands for, in which each pill is expanded to the text it stands for. */
	getPromptText(range: IRange): string {
		const model = this._editor.getModel();
		if (!model) {
			return '';
		}
		const projection = this.project();
		if (!projection) {
			return model.getValueInRange(range);
		}
		return projection.text.slice(
			projection.toPromptOffset(model.getOffsetAt(Range.getStartPosition(range))),
			projection.toPromptOffset(model.getOffsetAt(Range.getEndPosition(range))));
	}

	/**
	 * Projects the input onto the prompt it represents, in which every pill is
	 * expanded to the text it stands for.
	 *
	 * @param references References in the input to project along with it.
	 * @param options.forModel Whether the prompt is parsed into the request that
	 * is sent to the model, which reads each pill's attachment by its name and
	 * location rather than the text that the pill stands for, see
	 * {@link getAttachmentPromptText}. The prompt that is persisted, copied, or
	 * restored keeps the text.
	 * @returns `undefined` when the input contains no anchor, so it already is the prompt.
	 */
	project(references: readonly IDynamicVariable[] = [], options?: { readonly forModel?: boolean }): IInlineAttachmentProjection | undefined {
		const model = this._editor.getModel();
		// Without pills, any anchor character in the input is the user's own text.
		if (!model || (!this._isEnabled && !this._pills.size && !this._pendingAnchors.length)) {
			return undefined;
		}
		const anchors: IInlineAttachmentAnchor[] = [];
		for (const pill of this._pills) {
			const range = pill.range;
			if (range && isAnchorRange(model, range)) {
				const promptText = options?.forModel && pill.data.reference ? getAttachmentPromptText(this._resolveEntry(pill.data)) : undefined;
				anchors.push({ offset: model.getOffsetAt(range.getStartPosition()), text: pill.data.text, reference: pill.data.reference, promptText });
			}
		}
		// Pills that this controller's edit adds exist only while it edits, when no request is sent.
		anchors.push(...this._pendingAnchors);
		// A reference that covers a pill is stale: it is the one whose text the pill replaced.
		const currentReferences = references.filter(reference => {
			const start = model.getOffsetAt(Range.getStartPosition(reference.range));
			const end = model.getOffsetAt(Range.getEndPosition(reference.range));
			return !anchors.some(anchor => anchor.offset >= start && anchor.offset < end);
		});
		return projectInlineAttachments(model.getValue(), anchors, currentReferences);
	}

	/**
	 * Rebases the editor ranges of a request that was parsed from the projected
	 * prompt onto the input, so that a part parsed from a pill's text covers the
	 * pill's anchor.
	 */
	rebaseParsedRequest(parsed: IParsedChatRequest): IParsedChatRequest {
		const projection = this.project();
		if (!projection) {
			return parsed;
		}
		return {
			text: parsed.text,
			parts: parsed.parts.map(part => withEditorRange(part, projection.toInputRange(part.editorRange))),
		};
	}

	/** Projects selections in the input onto the prompt. */
	static projectSelections(selections: readonly ISelection[], projection: IInlineAttachmentProjection): ISelection[] {
		return selections.map(selection => {
			const start = projection.toPromptRange(new Range(selection.selectionStartLineNumber, selection.selectionStartColumn, selection.selectionStartLineNumber, selection.selectionStartColumn));
			const end = projection.toPromptRange(new Range(selection.positionLineNumber, selection.positionColumn, selection.positionLineNumber, selection.positionColumn));
			return new Selection(start.startLineNumber, start.startColumn, end.startLineNumber, end.startColumn);
		});
	}

	/**
	 * The prompt that a copied range of the input stands for, with the
	 * references in it relative to the copied text, so that pasting both into
	 * a chat input restores its pills. Attachments shown inline go along with
	 * their pills only, rather than with any copy of the input.
	 *
	 * @returns `undefined` when inline attachments are off, or when several ranges are copied.
	 */
	getCopiedPrompt(ranges: readonly IRange[], references: readonly IDynamicVariable[]): { readonly text: string; readonly references: IDynamicVariable[]; readonly excludedAttachmentIds: ReadonlySet<string> } | undefined {
		const model = this._editor.getModel();
		if (!model || !this._isEnabled || ranges.length !== 1) {
			return undefined;
		}
		const projection = this.project(references);
		const promptText = projection?.text ?? model.getValue();
		const promptRange = projection?.toPromptRange(ranges[0]) ?? Range.lift(ranges[0]);
		const promptPositions = new PositionOffsetTransformer(promptText);
		const text = promptText.slice(promptPositions.getOffset(promptRange.getStartPosition()), promptPositions.getOffset(promptRange.getEndPosition()));
		const origin = promptRange.getStartPosition();
		const copiedReferences = (projection?.references ?? references).filter(reference => promptRange.containsRange(reference.range));
		const copiedIds = new Set(copiedReferences.map(reference => reference.id));
		return {
			text,
			references: copiedReferences.map(reference => ({ ...reference, range: toRelativeRange(reference.range, origin) })),
			excludedAttachmentIds: new Set(this._attachmentModel.attachments
				.filter(attachment => this.isShownInline(attachment) && !copiedIds.has(attachment.id))
				.map(attachment => attachment.id)),
		};
	}

	/** Defers reconciling the pills with the input until the returned disposable is disposed. */
	suspend(): IDisposable {
		this._suspensions++;
		let disposed = false;
		return toDisposable(() => {
			if (!disposed) {
				disposed = true;
				this._suspensions--;
				this._scheduleReconcile();
			}
		});
	}

	/** Renders the pills again, for example after the state of their attachments changed. */
	refresh(): void {
		this._needsRender = true;
		this._scheduleReconcile();
	}

	/**
	 * Opens the attachment of the pill right before the cursor, as clicking the pill does.
	 *
	 * @returns Whether there was such a pill that could be opened.
	 */
	openActivePill(): boolean {
		const pill = this._activePill;
		if (!pill?.canOpen) {
			return false;
		}
		pill.open();
		return true;
	}

	/** Shows the context menu of the pill right before the cursor for Shift+F10 and the Context Menu key, when the pill has one. */
	private _showActivePillContextMenu(e: KeyboardEvent): void {
		const event = new StandardKeyboardEvent(e);
		const isContextMenuKey = e.key === 'ContextMenu' || event.keyCode === KeyCode.ContextMenu || event.equals(KeyMod.Shift | KeyCode.F10);
		if (isContextMenuKey && this._activePill?.showContextMenu()) {
			dom.EventHelper.stop(e, true);
		}
	}

	/**
	 * The position in the input at a point in the window, such as where
	 * something is dropped. A point on a pill is on the side of the pill it is
	 * closer to, as for a character.
	 */
	getPositionAtClientPoint(clientX: number, clientY: number): IPosition | undefined {
		const target = this._editor.getTargetAtClientPoint(clientX, clientY);
		if (target?.type === MouseTargetType.CONTENT_WIDGET) {
			for (const pill of this._pills) {
				const range = pill.range;
				if (range && pill.getId() === target.detail) {
					const box = pill.getDomNode().getBoundingClientRect();
					return clientX < box.left + box.width / 2 ? range.getStartPosition() : range.getEndPosition();
				}
			}
		}
		return target?.position ?? undefined;
	}

	private _copyPrompt(e: IClipboardCopyEvent): void {
		const data = e.dataToCopy;
		if (!data.text.includes(INLINE_ATTACHMENT_ANCHOR)) {
			return;
		}
		const projection = this.project();
		if (!projection) {
			return;
		}
		const promptPositions = new PositionOffsetTransformer(projection.text);
		const texts = data.sourceRanges.map(range => {
			const promptRange = projection.toPromptRange(range);
			return projection.text.slice(promptPositions.getOffset(promptRange.getStartPosition()), promptPositions.getOffset(promptRange.getEndPosition()));
		});
		data.text = texts.join(this._editor.getModel()?.getEOL() ?? '\n');
		// The clipboard metadata shares the array of texts, so it is updated in place.
		data.multicursorText?.splice(0, data.multicursorText.length, ...texts);
		// The rich text copy renders the anchors themselves.
		data.html = undefined;
	}

	private _scheduleReconcile(): void {
		if (this._isReconcileScheduled || this._store.isDisposed) {
			return;
		}
		this._isReconcileScheduled = true;
		// Reconcile once the current task settled, since attachments, text, and
		// references of the input change in separate steps, but before rendering.
		queueMicrotask(() => {
			this._isReconcileScheduled = false;
			if (!this._store.isDisposed) {
				this._reconcile();
			}
		});
	}

	private _reconcile(): void {
		const model = this._editor.getModel();
		if (this._suspensions > 0 || !model) {
			return;
		}

		// The chat widget's references follow its active input, which is another
		// input while a request is edited inline.
		const widget = this._host.widget?.inputEditor === this._editor ? this._host.widget : undefined;
		const dynamicVariableModel = widget?.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
		this._subscribe(widget, dynamicVariableModel);

		const change = this._change;
		this._change = undefined;

		if (!this._isEnabled) {
			if (this._pills.size) {
				this._expandPills(model, dynamicVariableModel);
			}
			this._version = model.getAlternativeVersionId();
			return;
		}

		let changed = this._reconcileAnchors(model, dynamicVariableModel, change);
		if (widget) {
			changed = this._collapseInput(model, widget, dynamicVariableModel, change) || changed;
		}
		changed = this._removeDetachedPills(model) || changed;

		this._renderPills();
		this._updateUnavailablePills(widget);
		const previousActive = this._activePill;
		this._updateActivePill();
		this._announceActivatedPill(previousActive);
		this._recordPills(model);
		this._version = model.getAlternativeVersionId();
		if (changed) {
			// Pills that undo or redo restored, which their text would not, change the prompt without changing the input.
			widget?.refreshParsedInput();
			this._onDidChange.fire();
		}
	}

	/**
	 * Records where each pill is, which tells where the next edit took it, and
	 * its attachment, which undo restores along with the pill even when the
	 * attachment was removed before the pill was, as the chat widget does for
	 * the pasted text that a removed reference stood for.
	 */
	private _recordPills(model: ITextModel): void {
		if (!this._pills.size) {
			return;
		}
		const attachments = new Map(this._attachmentModel.attachments.map(attachment => [attachment.id, attachment]));
		for (const pill of this._pills) {
			const range = pill.range;
			if (range && isAnchorRange(model, range)) {
				pill.lastOffset = model.getOffsetAt(range.getStartPosition());
				pill.lastLine = model.getLineContent(range.startLineNumber);
			}
			pill.attachment = attachments.get(pill.data.id) ?? pill.attachment;
		}
	}

	private _subscribe(widget: IChatWidget | undefined, dynamicVariableModel: ChatDynamicVariableModel | undefined): void {
		if (dynamicVariableModel !== this._dynamicVariableModel) {
			this._dynamicVariableModel = dynamicVariableModel;
			this._dynamicVariableModelListener.value = dynamicVariableModel?.onDidChangeReferences(() => this._scheduleReconcile());
		}
		if (widget !== this._parsedInputWidget) {
			this._parsedInputWidget = widget;
			this._parsedInputListener.value = widget?.onDidChangeParsedInput(() => this._scheduleReconcile());
		}
	}

	/**
	 * Updates the pills after their anchors were edited:
	 *
	 * - Undo and redo bring back the pills of the anchors that they restore.
	 * - An edit that moves text, as moving a line does, removes the anchors in
	 *   it and inserts them elsewhere, and their pills move along with them.
	 * - Other pills whose anchor was edited away are dropped. A pill that the
	 *   user removed takes its attachment with it, unless the input was replaced
	 *   as a whole, which happens when input state is restored. A pill whose
	 *   anchor undo or redo replaced with the text it stood for leaves that text
	 *   standing for it.
	 */
	private _reconcileAnchors(model: ITextModel, dynamicVariableModel: ChatDynamicVariableModel | undefined, change: IInputChange | undefined): boolean {
		const version = model.getAlternativeVersionId();
		const stale: InlineAttachmentPill[] = [];
		for (const pill of this._pills) {
			const range = pill.range;
			if (!range || !isAnchorRange(model, range)) {
				stale.push(pill);
			} else {
				pill.lastOffset = model.getOffsetAt(range.getStartPosition());
				pill.lastLine = model.getLineContent(range.startLineNumber);
			}
		}
		for (const pill of stale) {
			this._pills.delete(pill);
		}

		let changed = false;
		if (change && !change.flush && change.insertedAnchors > 0) {
			let anchors = this._getAnchorOffsetsWithoutPill(model);
			let insertedAnchors = change.insertedAnchors;
			if (change.undoRedo) {
				const restored = this._restoreRemovedPills(model, anchors, change);
				anchors = anchors.filter(offset => !restored.has(offset));
				insertedAnchors -= restored.size;
				changed = restored.size > 0;
			}
			for (const [pill, offset] of matchMovedAnchors(model, stale, anchors, insertedAnchors)) {
				pill.moveTo(Range.fromPositions(model.getPositionAt(offset), model.getPositionAt(offset + 1)), offset, model.getLineContent(model.getPositionAt(offset).lineNumber));
				this._pills.add(pill);
				stale.splice(stale.indexOf(pill), 1);
				anchors = anchors.filter(anchor => anchor !== offset);
				insertedAnchors--;
				changed = true;
			}
			// Undo and redo restore copies of pills that they removed, which are already restored.
			if (!change.undoRedo) {
				for (const [offset, source] of matchCopiedAnchors(model, this._pills, anchors, insertedAnchors)) {
					this._addPill(model, { ...source.data }, offset);
					changed = true;
				}
			}
		}
		if (!stale.length) {
			return changed;
		}

		for (const pill of stale) {
			pill.dispose();
		}
		if (change && !change.flush) {
			this._recordRemovedPills(model, dynamicVariableModel, stale, change, version);
		}
		return true;
	}

	/**
	 * Restores the pills of anchors that undo or redo brought back, along with
	 * their attachments: undo brings back the pills that the undone edit
	 * removed, and redo those that undoing the edit removed.
	 *
	 * @returns The offsets of the anchors whose pills were restored.
	 */
	private _restoreRemovedPills(model: ITextModel, anchors: readonly number[], change: IInputChange): Set<number> {
		const version = model.getAlternativeVersionId();
		const versionBefore = change.versionBefore;
		const candidates = this._removedPills.filter(removed => versionBefore === undefined || (change.redo
			? removed.removedByUndo && removed.version === versionBefore
			: !removed.removedByUndo && removed.version > version && removed.version <= versionBefore));
		const matches = new Map<number, IRemovedInlineAttachmentPill>();
		// Anchors come back where they were, unless what was redone moved them.
		for (const offset of anchors) {
			const index = findLastIndex(candidates, removed => removed.offset === offset);
			if (index !== -1) {
				matches.set(offset, candidates.splice(index, 1)[0]);
			}
		}
		if (versionBefore !== undefined) {
			const unmatched = anchors.filter(offset => !matches.has(offset));
			candidates.sort((a, b) => a.offset - b.offset);
			for (let i = 0; i < Math.min(unmatched.length, candidates.length); i++) {
				matches.set(unmatched[i], candidates[i]);
			}
		}

		const restoredAttachments = new Map<string, IChatRequestVariableEntry>();
		for (const [offset, removed] of matches) {
			this._removedPills.splice(this._removedPills.indexOf(removed), 1);
			if (removed.attachment && !this._attachmentModel.attachments.some(attachment => attachment.id === removed.attachment?.id)) {
				restoredAttachments.set(removed.attachment.id, removed.attachment);
			}
			this._addPill(model, removed.data, offset);
		}
		if (restoredAttachments.size) {
			this._attachmentModel.addContext(...restoredAttachments.values());
		}
		return new Set(matches.keys());
	}

	/** Records pills that were removed, so that undo can bring them back, and removes the attachments that they took with them. */
	private _recordRemovedPills(model: ITextModel, dynamicVariableModel: ChatDynamicVariableModel | undefined, removed: readonly InlineAttachmentPill[], change: IInputChange, version: number): void {
		const attachmentsToDelete = new Map<string, IChatRequestVariableEntry>();
		for (const pill of removed) {
			const expandedRange = change.undoRedo ? getExpandedRange(model, pill, change.mapOffset) : undefined;
			if (expandedRange) {
				// The text stands for the attachment again, as it did before it became a pill.
				this._expandedByUndoRedo.add(pill.data.id);
				if (pill.data.reference) {
					dynamicVariableModel?.addReference({ ...pill.data.reference, range: expandedRange });
				}
			}
			const ownedAttachment = this._getAttachmentOwnedByPill(pill.data);
			if (ownedAttachment && !expandedRange && !this._hasPillFor(ownedAttachment.id)) {
				attachmentsToDelete.set(ownedAttachment.id, ownedAttachment);
			}
			// An attachment that went before its pill, as pasted text does, is restored along with the pill.
			const attachment = ownedAttachment ?? (pill.data.reference?.isAttachmentReference ? pill.attachment : undefined);
			this._removedPills.push({ data: pill.data, offset: pill.lastOffset, attachment, version, removedByUndo: change.undoRedo && !change.redo });
		}
		if (attachmentsToDelete.size) {
			this._host.removeAttachments([...attachmentsToDelete.values()], !change.undoRedo);
		}
		if (removed.length === 1 && this._accessibilityService.isScreenReaderOptimized()) {
			status(localize('chat.inlineAttachment.removed', "Removed {0}", getAttachmentLabel(removed[0].data.entry)));
		}
	}

	/**
	 * Turns everything in the input that stands for an attachment into a pill:
	 * references, tool references, attachments without a pill, and anchors that
	 * undo or redo brought back.
	 */
	private _collapseInput(model: ITextModel, widget: IChatWidget, dynamicVariableModel: ChatDynamicVariableModel | undefined, change: IInputChange | undefined): boolean {
		const pending: IPendingInlineAttachmentPill[] = [];
		const claimed: Range[] = [];
		for (const pill of this._pills) {
			const range = pill.range;
			if (range) {
				claimed.push(range);
			}
		}
		const claim = (range: Range): boolean => {
			if (claimed.some(other => Range.areIntersecting(other, range))) {
				return false;
			}
			claimed.push(range);
			return true;
		};

		// References, such as `#file:index.ts`
		let isCompletion = false;
		for (const reference of dynamicVariableModel?.variables ?? []) {
			const range = Range.lift(reference.range);
			const text = model.getValueInRange(range);
			if (range.startLineNumber !== range.endLineNumber || !isReferenceText(text, reference) || this._expandedByUndoRedo.has(reference.id)) {
				continue;
			}
			// Mentions of attachments that are shown above the input, such as agent host completions, stay text.
			const attachment = reference.isAttachmentReference ? this._attachmentModel.attachments.find(candidate => candidate.id === reference.id) : undefined;
			if (attachment && !canShowAttachmentInline(attachment)) {
				continue;
			}
			const entry = toVariableEntry(reference, text, model.getOffsetAt(range.getStartPosition()), range);
			const completedRange = this._getCompletedReferenceRange(model, range, text);
			const pillRange = completedRange ?? range;
			if (!canShowAttachmentInline(entry) || !claim(pillRange)) {
				continue;
			}
			// The user chose the completion, so the cursor that it leaves right after the pill highlights it.
			isCompletion ||= !!completedRange;
			// What the model reads in place of the pill is derived from its attachment when a request is sent.
			pending.push({ data: { id: reference.id, text, reference: { ...reference, promptText: undefined }, entry }, range: pillRange });
		}

		// Tool and tool set references, which are recognized from their text
		for (const part of widget.parsedInput.parts) {
			if (!(part instanceof ChatRequestToolPart || part instanceof ChatRequestToolSetPart)) {
				continue;
			}
			const range = Range.lift(part.editorRange);
			const entry = part.toVariableEntry();
			if (model.getValueInRange(range) !== part.text || this._expandedByUndoRedo.has(entry.id) || this._isBeingTyped(range) || !claim(range)) {
				continue;
			}
			pending.push({ data: { id: entry.id, text: part.text, reference: undefined, entry: { ...entry, range: undefined } }, range });
		}

		// Anchors without a pill, which undo and redo did not bring back the pills of, are removed along with the edit that left them behind.
		const orphans: Range[] = [];
		if (change && !change.flush && !change.undoRedo) {
			for (const offset of this._getAnchorOffsetsWithoutPill(model)) {
				const range = Range.fromPositions(model.getPositionAt(offset), model.getPositionAt(offset + 1));
				if (claim(range)) {
					orphans.push(range);
				}
			}
		}

		// Attachments without a pill: the text that stands for them becomes their
		// pill. Otherwise the pill of an attachment added to the input is inserted
		// at the cursor, while an attachment that the input carried over when it
		// was replaced as a whole stays above it.
		const insertions: IInlineAttachmentPillData[] = [];
		const pilledIds = new Set<string>([...this._pills].map(pill => pill.data.id));
		for (const item of pending) {
			pilledIds.add(item.data.id);
		}
		const attachmentIds = new Set<string>();
		let changedShownAbove = false;
		for (const attachment of this._attachmentModel.attachments) {
			attachmentIds.add(attachment.id);
			if (pilledIds.has(attachment.id)) {
				// An attachment shown above the input moves into the prompt once a pill there stands for it.
				changedShownAbove = this._attachmentsShownAbove.delete(attachment.id) || changedShownAbove;
				continue;
			}
			if (!isInlineAttachmentCandidate(attachment) || this._expandedByUndoRedo.has(attachment.id)) {
				continue;
			}
			pilledIds.add(attachment.id);
			const data = toAttachmentPillData(attachment);
			const existing = this._findAttachmentText(model, attachment, claimed);
			if (existing === 'typing') {
				continue;
			}
			if (existing && claim(existing.range)) {
				changedShownAbove = this._attachmentsShownAbove.delete(attachment.id) || changedShownAbove;
				pending.push({ data: { ...data, text: existing.text }, range: existing.range });
			} else if (change?.flush) {
				changedShownAbove = !this._attachmentsShownAbove.has(attachment.id) || changedShownAbove;
				this._attachmentsShownAbove.add(attachment.id);
			} else if (!this._attachmentsShownAbove.has(attachment.id)) {
				insertions.push(data);
			}
		}
		for (const id of this._attachmentsShownAbove) {
			if (!attachmentIds.has(id)) {
				this._attachmentsShownAbove.delete(id);
			}
		}

		if (!pending.length && !orphans.length && !insertions.length) {
			return changedShownAbove;
		}
		// Right after the input was replaced as a whole there is nothing to undo, and turning what it
		// says into pills is not an edit of the user's to undo either: undoing it would lose references.
		const undoable = !change?.flush || model.canUndo();
		this._replaceWithPills(model, pending, orphans, undoable);
		if (isCompletion) {
			// The completion's edit placed the cursor, but the user chose the completion.
			this._isCursorPlacedByEdit = false;
		}
		if (insertions.length) {
			this._insertPillsAtCursor(model, insertions);
		}
		return pending.length > 0 || insertions.length > 0 || changedShownAbove;
	}

	/**
	 * Removes the anchors of pills whose attachment was removed from the
	 * attachment model, in an edit of its own that undo reverts by bringing
	 * the pills back along with their attachments.
	 */
	private _removeDetachedPills(model: ITextModel): boolean {
		const attachmentIds = new Set(this._attachmentModel.attachments.map(attachment => attachment.id));
		const detached = [...this._pills].filter(pill => pill.data.reference?.isAttachmentReference && !attachmentIds.has(pill.data.id));
		if (!detached.length) {
			return false;
		}
		const edits: IIdentifiedSingleEditOperation[] = [];
		const removed: { pill: InlineAttachmentPill; offset: number }[] = [];
		for (const pill of detached) {
			const range = pill.range;
			if (range && isAnchorRange(model, range)) {
				edits.push({ range: getRemovalRange(model, range), text: '' });
				removed.push({ pill, offset: model.getOffsetAt(range.getStartPosition()) });
			}
			this._pills.delete(pill);
			pill.dispose();
		}
		if (edits.length) {
			this._editor.pushUndoStop();
			this._applyEdits(edits);
			this._editor.pushUndoStop();
			const version = model.getAlternativeVersionId();
			for (const { pill, offset } of removed) {
				this._removedPills.push({ data: pill.data, offset, attachment: pill.attachment, version, removedByUndo: false });
			}
		}
		return true;
	}

	/** Replaces the range of each pending pill with its anchor and removes orphaned anchors. */
	private _replaceWithPills(model: ITextModel, pending: readonly IPendingInlineAttachmentPill[], orphans: readonly Range[], undoable: boolean): void {
		const edits = [
			...pending.map(item => ({ item, range: item.range, text: INLINE_ATTACHMENT_ANCHOR })),
			...orphans.map(range => ({ item: undefined, range, text: '' })),
		].sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));

		// Edits are applied together, so each anchor moves by what the edits before it changed.
		const anchorOffsets = new Map<IPendingInlineAttachmentPill, number>();
		let delta = 0;
		for (const edit of edits) {
			const start = model.getOffsetAt(edit.range.getStartPosition());
			const end = model.getOffsetAt(edit.range.getEndPosition());
			if (edit.item) {
				anchorOffsets.set(edit.item, start + delta);
			}
			delta += edit.text.length - (end - start);
		}

		this._applyEdits(edits
			// An anchor restored by undo or redo needs no edit, which would clear the redo stack.
			.filter(edit => model.getValueInRange(edit.range) !== edit.text)
			.map(edit => ({ range: edit.range, text: edit.text })),
			undefined,
			pending.map(item => ({ offset: anchorOffsets.get(item)!, text: item.data.text, reference: item.data.reference })),
			undoable);
		for (const item of pending) {
			this._addPill(model, item.data, anchorOffsets.get(item)!);
		}
	}

	/** Inserts pills at the cursor, separated from each other and the surrounding text by spaces. */
	private _insertPillsAtCursor(model: ITextModel, pills: readonly IInlineAttachmentPillData[]): void {
		const position = (this._editor.getSelection() ?? new Selection(1, 1, 1, 1)).getEndPosition();
		const offset = model.getOffsetAt(position);
		const value = model.getValue();
		const before = value.charAt(offset - 1);
		const after = value.charAt(offset);

		let text = before && !isWhitespace(before) ? ' ' : '';
		const anchorOffsets: number[] = [];
		for (let i = 0; i < pills.length; i++) {
			if (i > 0) {
				text += ' ';
			}
			anchorOffsets.push(offset + text.length);
			text += INLINE_ATTACHMENT_ANCHOR;
		}
		if (!isWhitespace(after)) {
			text += ' ';
		}

		// Inserting pills is a step of its own, like any paste or drop, rather than part of what was typed before.
		this._editor.pushUndoStop();
		this._applyEdits(
			[{ range: Range.fromPositions(position), text }],
			() => [Selection.fromPositions(model.getPositionAt(offset + text.length))],
			pills.map((pill, i) => ({ offset: anchorOffsets[i], text: pill.text, reference: pill.reference })));
		this._editor.pushUndoStop();
		for (let i = 0; i < pills.length; i++) {
			this._addPill(model, pills[i], anchorOffsets[i]);
		}

		if (this._accessibilityService.isScreenReaderOptimized()) {
			status(pills.length === 1
				? localize('chat.inlineAttachment.added', "Added {0} to the prompt", getAttachmentLabel(pills[0].entry))
				: localize('chat.inlineAttachment.addedMultiple', "Added {0} attachments to the prompt", pills.length));
		}
	}

	private _addPill(model: ITextModel, data: IInlineAttachmentPillData, offset: number): void {
		const range = Range.fromPositions(model.getPositionAt(offset), model.getPositionAt(offset + 1));
		if (!isAnchorRange(model, range)) {
			return;
		}
		const pill = new InlineAttachmentPill(this._editor, data, range, offset, () => this._removePill(pill));
		pill.lastLine = model.getLineContent(range.startLineNumber);
		this._pills.add(pill);
		this._needsRender = true;
	}

	/** Removes a pill as if its anchor was deleted, along with a space that would otherwise be left over. */
	private _removePill(pill: InlineAttachmentPill): void {
		const model = this._editor.getModel();
		const range = pill.range;
		if (!model || !range || !isAnchorRange(model, range)) {
			return;
		}
		this._editor.pushUndoStop();
		this._editor.executeEdits('chatInlineAttachments.remove', [{ range: getRemovalRange(model, range), text: '' }]);
		this._editor.pushUndoStop();
		this._editor.focus();
	}

	/** Replaces every pill with the text it stands for, as when inline attachments are turned off. */
	private _expandPills(model: ITextModel, dynamicVariableModel: ChatDynamicVariableModel | undefined): void {
		const projection = this.project(dynamicVariableModel?.variables ?? []);
		const attachments = this._attachmentModel.attachments;
		const selections = this._editor.getSelections();
		this._clearPills();
		this._onDidChange.fire();
		if (!projection) {
			return;
		}

		// Replacing the input as a whole also clears its undo history, which would bring back anchors without pills.
		this._replaceInput(model, projection.text);
		if (selections) {
			this._editor.setSelections(ChatInlineAttachments.projectSelections(selections, projection));
		}
		// The input now is the prompt, so the projected ranges apply to it.
		for (const reference of projection.references) {
			dynamicVariableModel?.addReference(reference);
		}
		// Attachments that their references stand for, such as pasted text, go while the input has no references.
		const remaining = new Set(this._attachmentModel.attachments.map(attachment => attachment.id));
		const removed = attachments.filter(attachment => !remaining.has(attachment.id));
		if (removed.length) {
			this._attachmentModel.addContext(...removed);
		}
	}

	private _renderPills(): void {
		if (!this._needsRender && ![...this._pills].some(pill => pill.needsRender(this._resolveEntry(pill.data)))) {
			return;
		}
		this._needsRender = false;

		const fontInfo = this._editor.getOption(EditorOption.fontInfo);
		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const anchorWidth = measureAnchorWidth(`${fontInfo.fontWeight} ${fontInfo.fontSize}px ${fontInfo.fontFamily}`);
		for (const pill of this._pills) {
			const entry = this._resolveEntry(pill.data);
			pill.render(entry, lineHeight, container => this._host.createAttachmentWidget(entry, container, { shouldFocusClearButton: false, supportsDeletion: true }), {
				getClassName: width => this._widthStyles.getClassName(width),
				// Line wrapping measures the anchor in the editor font rather than at its widened width.
				getWrapWidthInEm: width => Math.max(0, width - anchorWidth) / fontInfo.fontSize,
				hoverMessage: this._getHoverMessage(entry),
			});
		}
		this._updateSelectedPills();
	}

	/** The attachment that a pill shows: the one in the attachment model when there is one, since it has the latest state. */
	private _resolveEntry(data: IInlineAttachmentPillData): IChatRequestVariableEntry {
		const entry = this._attachmentModel.attachments.find(attachment => attachment.id === data.id) ?? data.entry;
		// Every pill can be removed, while the widgets only offer removal for attachments without a range.
		return entry.range ? { ...entry, range: undefined } : entry;
	}

	/** The attachment that the input holds because of the pill, which goes when the pill goes. */
	private _getAttachmentOwnedByPill(data: IInlineAttachmentPillData): IChatRequestVariableEntry | undefined {
		if (!data.reference?.isAttachmentReference) {
			// The attachments of other pills are derived from their text and go along with it.
			return undefined;
		}
		return this._attachmentModel.attachments.find(attachment => attachment.id === data.id);
	}

	private _hasPillFor(id: string): boolean {
		for (const pill of this._pills) {
			if (pill.data.id === id) {
				return true;
			}
		}
		return false;
	}

	private _getAnchorOffsetsWithoutPill(model: ITextModel): number[] {
		const value = model.getValue();
		const pillOffsets = new Set<number>();
		for (const pill of this._pills) {
			const range = pill.range;
			if (range) {
				pillOffsets.add(model.getOffsetAt(range.getStartPosition()));
			}
		}
		const offsets: number[] = [];
		for (let offset = value.indexOf(INLINE_ATTACHMENT_ANCHOR); offset !== -1; offset = value.indexOf(INLINE_ATTACHMENT_ANCHOR, offset + 1)) {
			if (!pillOffsets.has(offset)) {
				offsets.push(offset);
			}
		}
		return offsets;
	}

	/**
	 * Finds the text in the input that stands for an attachment without a pill:
	 * its `#attachment:` mention, or the link of a GitHub issue or pull request.
	 *
	 * @returns `'typing'` when the text is still being typed.
	 */
	private _findAttachmentText(model: ITextModel, attachment: IChatRequestVariableEntry, claimed: readonly Range[]): { range: Range; text: string } | 'typing' | undefined {
		const value = model.getValue();
		const toFreeRange = (start: number, end: number) => {
			const range = Range.fromPositions(model.getPositionAt(start), model.getPositionAt(end));
			return claimed.some(other => Range.areIntersecting(other, range)) ? undefined : range;
		};

		if (attachment.name) {
			for (const leader of [chatVariableLeader, chatAgentLeader]) {
				const mention = getAttachmentMention(attachment.name, leader);
				for (let start = value.indexOf(mention); start !== -1; start = value.indexOf(mention, start + 1)) {
					const end = start + mention.length;
					const range = isTokenBoundary(value, start, end) ? toFreeRange(start, end) : undefined;
					if (range) {
						return { range, text: mention };
					}
				}
			}
		}

		if (attachment.id.startsWith(GITHUB_CONTEXT_ATTACHMENT_ID_PREFIX)) {
			for (const match of value.matchAll(gitHubLinkPattern)) {
				const link = match[0];
				const range = toFreeRange(match.index, match.index + link.length);
				if (range && getGitHubIssueOrPullRequestAttachments(link).some(candidate => candidate.id === attachment.id)) {
					return this._isBeingTyped(range) ? 'typing' : { range, text: link };
				}
			}
		}
		return undefined;
	}

	/** Whether the cursor is at the end of `range` after typing its text, which may not be complete yet. */
	private _isBeingTyped(range: Range): boolean {
		const model = this._editor.getModel();
		if (!model || !this._editor.hasTextFocus()) {
			return false;
		}
		const text = model.getValueInRange(range);
		return !this._lastInsertedTexts.some(inserted => inserted.includes(text))
			&& (this._editor.getSelections() ?? []).some(selection => selection.isEmpty() && selection.getPosition().equals(range.getEndPosition()));
	}

	/**
	 * The range that the pill of a reference replaces when a completion just inserted the reference, with the cursor
	 * right after it: the reference, and the space after it when the completion inserted one, so that the cursor is
	 * right after the pill.
	 *
	 * @returns `undefined` when no completion just inserted the reference.
	 */
	private _getCompletedReferenceRange(model: ITextModel, range: Range, text: string): Range | undefined {
		const change = this._lastCursorChange;
		const selections = this._editor.getSelections() ?? [];
		// Pasted, restored, and undone text is not completed, nor is text that the API inserted.
		if (!change || change.source === 'api' || (change.reason !== CursorChangeReason.NotSet && change.reason !== CursorChangeReason.RecoverFromMarkers)
			|| selections.length !== 1 || !selections[0].isEmpty() || !this._lastInsertedTexts.some(inserted => inserted.includes(text))) {
			return undefined;
		}
		const position = selections[0].getPosition();
		if (position.equals(range.getEndPosition())) {
			return range;
		}
		const withSpace = range.setEndPosition(range.endLineNumber, range.endColumn + 1);
		return position.equals(withSpace.getEndPosition()) && model.getValueInRange(withSpace) === `${text} ` && this._lastInsertedTexts.some(inserted => inserted.endsWith(`${text} `))
			? withSpace
			: undefined;
	}

	private _updateSelectedPills(): void {
		const selections = (this._editor.getSelections() ?? []).filter(selection => !selection.isEmpty());
		for (const pill of this._pills) {
			const range = pill.range;
			pill.setSelected(!!range && selections.some(selection => selection.containsRange(range)));
		}
	}

	/**
	 * Marks the pills of tools that the request would not use, as when the tool
	 * is turned off or the model does not offer it: their text no longer parses
	 * as the tool. The pill stays for when it does again.
	 */
	private _updateUnavailablePills(widget: IChatWidget | undefined): void {
		const toolRanges = widget?.parsedInput.parts
			.filter(part => part instanceof ChatRequestToolPart || part instanceof ChatRequestToolSetPart)
			.map(part => Range.lift(part.editorRange));
		for (const pill of this._pills) {
			const range = pill.range;
			const isTool = !pill.data.reference && (pill.data.entry.kind === 'tool' || pill.data.entry.kind === 'toolset');
			pill.setUnavailable(isTool && !!toolRanges && !!range && !toolRanges.some(toolRange => toolRange.containsRange(range)));
		}
	}

	/** Activates the pill right before the cursor, unless an edit rather than the user placed the cursor there. */
	private _updateActivePill(): void {
		const model = this._editor.getModel();
		const selections = this._editor.getSelections() ?? [];
		let active: InlineAttachmentPill | undefined;
		if (model && !this._isCursorPlacedByEdit && selections.length === 1 && selections[0].isEmpty()) {
			const position = selections[0].getPosition();
			for (const pill of this._pills) {
				const range = pill.range;
				if (range && isAnchorRange(model, range) && range.getEndPosition().equals(position)) {
					active = pill;
					break;
				}
			}
		}
		if (active !== this._activePill) {
			this._activePill?.setActive(false);
			this._activePill = active;
			active?.setActive(true);
		}
		// Enter opens the pill only when that does something, and otherwise sends the request.
		this._activePillContextKey.set(!!active?.canOpen);
	}

	/**
	 * Announces the pill that the cursor moved across, since its anchor
	 * character has no meaningful name, and that Enter opens the pill right
	 * before the cursor instead of sending the request.
	 *
	 * @param isMove Whether the user moved the cursor, rather than an edit moving it.
	 * @param previousActive The pill that was active before the cursor changed.
	 */
	private _announcePillAtCursor(isMove: boolean, previousActive: InlineAttachmentPill | undefined): void {
		const model = this._editor.getModel();
		const selection = this._editor.getSelection();
		const previous = this._lastCursorOffset;
		this._lastCursorOffset = model && selection ? model.getOffsetAt(selection.getPosition()) : undefined;
		const offset = this._lastCursorOffset;
		if (!model || !selection || offset === undefined || !this._accessibilityService.isScreenReaderOptimized()) {
			return;
		}
		let crossed: InlineAttachmentPill | undefined;
		if (isMove && previous !== undefined && Math.abs(offset - previous) === 1) {
			const crossedOffset = Math.min(offset, previous);
			crossed = [...this._pills].find(pill => {
				const range = pill.range;
				return !!range && model.getOffsetAt(range.getStartPosition()) === crossedOffset;
			});
		}
		// The pill becomes active however the cursor reaches it, as when Backspace removes the space after it.
		const active = this._activePill !== previousActive && this._shouldAnnounceActivePill() ? this._activePill : undefined;
		const pill = crossed ?? active;
		if (!pill) {
			return;
		}
		const label = getAttachmentLabel(this._resolveEntry(pill.data));
		if (!selection.isEmpty()) {
			status(localize('chat.inlineAttachment.selected', "{0}, attachment, selected", label));
		} else if (pill === active) {
			status(localize('chat.inlineAttachment.open', "{0}, attachment, press Enter to open", label));
		} else if (pill.isUnavailable) {
			status(localize('chat.inlineAttachment.unavailable', "{0}, attachment, unavailable", label));
		} else {
			status(localize('chat.inlineAttachment.cursor', "{0}, attachment", label));
		}
	}

	/** Whether to announce that Enter opens the active pill, which is when it can be opened. */
	private _shouldAnnounceActivePill(): boolean {
		return !!this._activePill?.canOpen && this._accessibilityService.isScreenReaderOptimized() && !!this._configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Chat);
	}

	/** Announces the pill that became active without the cursor moving, as when a completion became a pill. */
	private _announceActivatedPill(previousActive: InlineAttachmentPill | undefined): void {
		const pill = this._activePill;
		if (pill && pill !== previousActive && this._shouldAnnounceActivePill()) {
			status(localize('chat.inlineAttachment.open', "{0}, attachment, press Enter to open", getAttachmentLabel(this._resolveEntry(pill.data))));
		}
	}

	private _getHoverMessage(entry: IChatRequestVariableEntry): IMarkdownString {
		const resource = IChatRequestVariableEntry.toUri(entry);
		// The full name of a dropped image is its path, as the path of a file is.
		const label = resource ? this._labelService.getUriLabel(resource, { relative: true }) : entry.fullName ?? entry.name;
		return new MarkdownString().appendText(label);
	}

	/**
	 * Applies edits to the input that are not the user's, so they do not remove attachments.
	 * @param pendingAnchors The pills that the edits add, at their offsets after
	 * the edits, which the projection includes until the pills exist.
	 * @param undoable Whether undo reverts the edits. Edits that are not undoable
	 * must only be applied when there is nothing to undo, since undoing earlier
	 * edits afterwards would apply them to text they were not made to.
	 */
	private _applyEdits(edits: IIdentifiedSingleEditOperation[], endCursorState?: () => Selection[], pendingAnchors: readonly IInlineAttachmentAnchor[] = [], undoable = true): void {
		if (!edits.length) {
			return;
		}
		this._isApplyingEdits = true;
		this._pendingAnchors = pendingAnchors;
		try {
			if (undoable) {
				this._editor.executeEdits('chatInlineAttachments', edits, endCursorState);
			} else {
				this._editor.getModel()?.applyEdits(edits);
			}
		} finally {
			this._isApplyingEdits = false;
			this._pendingAnchors = [];
		}
	}

	/** Replaces the whole input, which also clears its undo history. */
	private _replaceInput(model: ITextModel, text: string): void {
		this._isApplyingEdits = true;
		try {
			model.setValue(text);
		} finally {
			this._isApplyingEdits = false;
		}
	}

	private _clearPills(): void {
		for (const pill of this._pills) {
			pill.dispose();
		}
		this._pills.clear();
		this._activePill = undefined;
		this._activePillContextKey.set(false);
	}
}

interface IInlineAttachmentPillDecorationOptions {
	getClassName(width: number): string;
	getWrapWidthInEm(width: number): number;
	readonly hoverMessage: IMarkdownString | undefined;
}

/** A pill, laid out over its anchor, whose decoration widens the anchor to the pill's width and tracks its position. */
class InlineAttachmentPill extends Disposable implements IContentWidget {

	private static _idPool = 0;

	readonly allowEditorOverflow = false;
	readonly suppressMouseDown = true;

	private readonly _id = `chat.inlineAttachment.${InlineAttachmentPill._idPool++}`;
	private readonly _domNode: HTMLElement;
	private readonly _container: HTMLElement;
	private readonly _decorations: IEditorDecorationsCollection;
	private readonly _renderDisposables = this._register(new MutableDisposable<DisposableStore>());
	private _renderedEntry: IChatRequestVariableEntry | undefined;
	private _decorationOptions: IInlineAttachmentPillDecorationOptions | undefined;
	private _decorationKey: string | undefined;
	private _width = 0;
	private _widget: IChatAttachmentWidgetInstance | undefined;
	/** The position that the pill was last laid out at. */
	private _layoutPosition: Position | undefined;

	/** The offset of the anchor when the pills were last reconciled with the input. */
	lastOffset: number;
	/** The line of the anchor when the pills were last reconciled with the input, which tells where an edit that moved the anchor took it. */
	lastLine = '';
	/** The attachment of the pill when the pills were last reconciled with the input. */
	attachment: IChatRequestVariableEntry | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		readonly data: IInlineAttachmentPillData,
		range: Range,
		offset: number,
		private readonly _onRemove: () => void,
	) {
		super();
		this.lastOffset = offset;
		this._domNode = dom.$('.chat-inline-attachment');
		// The attachment widgets are styled for attachments in this container.
		this._container = dom.append(this._domNode, dom.$('.chat-attached-context'));
		this._decorations = this._editor.createDecorationsCollection([{ range, options: getAnchorDecorationOptions(undefined, 0, undefined) }]);
		this._editor.addContentWidget(this);
		this._register(toDisposable(() => {
			this._editor.removeContentWidget(this);
			this._decorations.clear();
		}));
	}

	get range(): Range | undefined {
		return this._decorations.getRange(0) ?? undefined;
	}

	getId(): string {
		return this._id;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		const position = this.range?.getStartPosition();
		this._layoutPosition = position;
		return position ? { position, preference: [ContentWidgetPositionPreference.EXACT] } : null;
	}

	/** Lays the pill out at its anchor again when an edit moved the anchor. */
	followAnchor(): void {
		const position = this.range?.getStartPosition();
		if (position && !Position.equals(position, this._layoutPosition ?? null)) {
			this._editor.layoutContentWidget(this);
		}
	}

	/** Moves the pill to another anchor, as when an edit moved the text that the pill is in. */
	moveTo(range: Range, offset: number, line: string): void {
		this.lastOffset = offset;
		this.lastLine = line;
		this._decorationKey = undefined;
		this._decorations.set([{ range, options: getAnchorDecorationOptions(undefined, 0, undefined) }]);
		this._updateDecoration();
		this._editor.layoutContentWidget(this);
	}

	needsRender(entry: IChatRequestVariableEntry): boolean {
		return !this._renderedEntry || !isSameEntry(entry, this._renderedEntry);
	}

	render(entry: IChatRequestVariableEntry, lineHeight: number, createWidget: (container: HTMLElement) => IChatAttachmentWidgetInstance, decorationOptions: IInlineAttachmentPillDecorationOptions): void {
		const store = new DisposableStore();
		this._renderDisposables.value = store;
		this._renderedEntry = entry;
		this._decorationOptions = decorationOptions;
		dom.clearNode(this._container);
		this._domNode.style.height = `${lineHeight}px`;

		const widget = store.add(createWidget(this._container));
		this._widget = widget;
		store.add(toDisposable(() => this._widget = undefined));
		// The cursor reaches the pill as a character, so the pill itself is not a tab stop.
		widget.element.tabIndex = -1;
		// Opening an attachment focuses its pill, which leaves the cursor in the input instead.
		store.add(dom.addDisposableListener(widget.element, dom.EventType.FOCUS, () => this._editor.focus()));
		store.add(widget.onDidDelete(() => this._onRemove()));

		this._width = this._measure();
		this._updateDecoration();

		const resizeObserver = store.add(new dom.DisposableResizeObserver('ChatInlineAttachmentPill', () => {
			const width = this._measure();
			if (width > 0 && width !== this._width) {
				this._width = width;
				this._updateDecoration();
			}
		}, dom.getWindow(this._domNode)));
		store.add(resizeObserver.observe(this._domNode));
	}

	setSelected(selected: boolean): void {
		this._domNode.classList.toggle('selected', selected);
	}

	setActive(active: boolean): void {
		this._domNode.classList.toggle('active', active);
	}

	/** Whether the request would not use what the pill stands for, as for a tool that is turned off. */
	get isUnavailable(): boolean {
		return this._domNode.classList.contains('unavailable');
	}

	setUnavailable(unavailable: boolean): void {
		this._domNode.classList.toggle('unavailable', unavailable);
	}

	/** Opens the pill's attachment, as clicking the pill does. */
	open(): void {
		this._widget?.element.click();
	}

	/** Whether opening the pill's attachment does something, see {@link canOpenAttachment}. */
	get canOpen(): boolean {
		return !!this._widget && !!this._renderedEntry && canOpenAttachment(this._renderedEntry);
	}

	/**
	 * Shows the pill's context menu below it, as right-clicking it does.
	 *
	 * @returns Whether the pill has a context menu.
	 */
	showContextMenu(): boolean {
		const element = this._widget?.element;
		if (!element) {
			return false;
		}
		const rect = element.getBoundingClientRect();
		// The event does not bubble, so the editor does not show its own context menu for it.
		const event = new MouseEvent(dom.EventType.CONTEXT_MENU, { cancelable: true, button: 2, clientX: rect.left, clientY: rect.bottom });
		element.dispatchEvent(event);
		return event.defaultPrevented;
	}

	private _measure(): number {
		return Math.ceil(this._domNode.getBoundingClientRect().width);
	}

	private _updateDecoration(): void {
		const range = this.range;
		const options = this._decorationOptions;
		if (!range || !options) {
			return;
		}
		const className = options.getClassName(this._width);
		const wrapWidthInEm = options.getWrapWidthInEm(this._width);
		const key = `${className}|${wrapWidthInEm}|${options.hoverMessage?.value ?? ''}`;
		if (key !== this._decorationKey) {
			this._decorationKey = key;
			this._decorations.set([{ range, options: getAnchorDecorationOptions(className, wrapWidthInEm, options.hoverMessage) }]);
		}
		this._editor.layoutContentWidget(this);
	}
}

function getAnchorDecorationOptions(className: string | undefined, wrapWidthInEm: number, hoverMessage: IMarkdownString | undefined): IModelDecorationOptions {
	return {
		description: 'chat-inline-attachment',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		inlineClassName: className ? `chat-inline-attachment-anchor ${className}` : 'chat-inline-attachment-anchor',
		inlineClassNameAffectsLetterSpacing: true,
		hoverMessage,
		// Line wrapping measures the anchor without its class, so this reserves the rest of the pill's width.
		// It comes before the anchor: a line can break on either side of a reservation, and a break between
		// the anchor and a reservation after it would leave the widened anchor at the end of the line.
		before: { content: '', inlineClassName: 'chat-inline-attachment-wrap-width', widthInEm: Math.max(wrapWidthInEm, minWrapWidthInEm) },
		// Being the last part of a line that ends with a pill, this places the cursor after the pill.
		after: { content: '', inlineClassName: 'chat-inline-attachment-wrap-width', widthInEm: minWrapWidthInEm },
	};
}


/** The classes that widen anchors to the width of their pill. */
class InlineAttachmentWidthStyles extends Disposable {

	private readonly _widths = new Set<number>();
	private _styleSheet: HTMLStyleElement | undefined;

	getClassName(width: number): string {
		const value = Math.max(0, Math.round(width));
		if (!this._widths.has(value)) {
			this._widths.add(value);
			this._styleSheet ??= createStyleSheet(undefined, undefined, this._store);
			this._styleSheet.textContent = [...this._widths].map(w => `.monaco-editor .chat-inline-attachment-anchor.chat-inline-attachment-width-${w} { width: ${w}px; }`).join('\n');
		}
		return `chat-inline-attachment-width-${value}`;
	}
}

/**
 * The range of the text that a removed pill stood for, when it took the place
 * of the pill's anchor.
 *
 * @param mapOffset Maps where the anchor was to where the change put what
 * replaced it, which is after the text that took the place of other anchors.
 */
function getExpandedRange(model: ITextModel, pill: InlineAttachmentPill, mapOffset: (offset: number) => number): Range | undefined {
	const start = mapOffset(pill.lastOffset);
	const end = start + pill.data.text.length;
	if (end > model.getValueLength()) {
		return undefined;
	}
	const range = Range.fromPositions(model.getPositionAt(start), model.getPositionAt(end));
	return model.getValueInRange(range) === pill.data.text ? range : undefined;
}

/**
 * Maps an offset in a text before changes to the offset after them. The
 * changes are those of a single edit, whose offsets are in the text before it.
 * An offset in text that a change replaced maps to where its replacement
 * starts.
 */
function createOffsetMapper(changes: readonly IModelContentChange[]): (offset: number) => number {
	const sorted = [...changes].sort((a, b) => a.rangeOffset - b.rangeOffset);
	return offset => {
		let delta = 0;
		for (const change of sorted) {
			if (offset < change.rangeOffset) {
				break;
			}
			if (offset < change.rangeOffset + change.rangeLength) {
				return change.rangeOffset + delta;
			}
			delta += change.text.length - change.rangeLength;
		}
		return offset + delta;
	};
}

function isAnchorRange(model: ITextModel, range: IRange): boolean {
	return range.startLineNumber === range.endLineNumber
		&& range.endColumn === range.startColumn + 1
		&& model.getValueInRange(range) === INLINE_ATTACHMENT_ANCHOR;
}

function countAnchors(text: string): number {
	let count = 0;
	for (let offset = text.indexOf(INLINE_ATTACHMENT_ANCHOR); offset !== -1; offset = text.indexOf(INLINE_ATTACHMENT_ANCHOR, offset + 1)) {
		count++;
	}
	return count;
}

/**
 * Matches pills whose anchor an edit removed with the anchors that the edit
 * inserted, as when it moved the text that they are in: first the pills on
 * lines that read the same, which moving or sorting lines keeps, then the
 * others in order.
 *
 * @param limit How many anchors the edit inserted, which keeps a pill that the
 * edit removed from taking over an anchor that it did not insert.
 */
function matchMovedAnchors(model: ITextModel, pills: readonly InlineAttachmentPill[], anchors: readonly number[], limit: number): Map<InlineAttachmentPill, number> {
	const matches = new Map<InlineAttachmentPill, number>();
	if (!pills.length || !anchors.length || limit <= 0) {
		return matches;
	}
	const sortedPills = [...pills].sort((a, b) => a.lastOffset - b.lastOffset);
	const remaining = [...anchors];
	const lineOf = (offset: number) => model.getLineContent(model.getPositionAt(offset).lineNumber);
	for (const pill of sortedPills) {
		const index = remaining.findIndex(offset => lineOf(offset) === pill.lastLine);
		if (index !== -1 && matches.size < limit) {
			matches.set(pill, remaining[index]);
			remaining.splice(index, 1);
		}
	}
	const unmatched = sortedPills.filter(pill => !matches.has(pill));
	for (let i = 0; i < unmatched.length && i < remaining.length && matches.size < limit; i++) {
		matches.set(unmatched[i], remaining[i]);
	}
	return matches;
}

/**
 * Matches anchors that an edit inserted with the pills they were copied from,
 * as when Copy Line Down copied the line that they are in: the pill at the
 * same column of another line that reads the same.
 *
 * @param limit How many anchors the edit inserted.
 */
function matchCopiedAnchors(model: ITextModel, pills: Iterable<InlineAttachmentPill>, anchors: readonly number[], limit: number): Map<number, InlineAttachmentPill> {
	const matches = new Map<number, InlineAttachmentPill>();
	if (!anchors.length || limit <= 0) {
		return matches;
	}
	const sources = [...pills];
	for (const offset of anchors) {
		if (matches.size >= limit) {
			break;
		}
		const position = model.getPositionAt(offset);
		const line = model.getLineContent(position.lineNumber);
		const source = sources.find(pill => {
			const range = pill.range;
			return !!range && range.startLineNumber !== position.lineNumber && range.startColumn === position.column && pill.lastLine === line;
		});
		if (source) {
			matches.set(offset, source);
		}
	}
	return matches;
}

/**
 * Whether text is what a reference covers in the input, which guards against references whose range went stale.
 * A reference to an attachment may also cover what the model read in place of a pill, see {@link getAttachmentPromptText},
 * as when a request that an agent host's history restored is edited.
 */
function isReferenceText(text: string, reference: IDynamicVariable): boolean {
	return !!text && !text.includes(INLINE_ATTACHMENT_ANCHOR) && ([chatVariableLeader, chatAgentLeader, chatSubcommandLeader].includes(text.charAt(0)) || !!reference.isAttachmentReference);
}

/** The range to delete along with a pill: its anchor, and a following space that would otherwise double up. */
function getRemovalRange(model: ITextModel, range: Range): Range {
	const lineContent = model.getLineContent(range.startLineNumber);
	const before = lineContent.charAt(range.startColumn - 2);
	const after = lineContent.charAt(range.endColumn - 1);
	if (after === ' ' && (!before || isWhitespace(before))) {
		return new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn + 1);
	}
	return range;
}

function isWhitespace(character: string): boolean {
	return !!character && /\s/.test(character);
}

function isTokenBoundary(value: string, start: number, end: number): boolean {
	const before = value.charAt(start - 1);
	const after = value.charAt(end);
	return (!before || isWhitespace(before) || before === INLINE_ATTACHMENT_ANCHOR) && (!after || isWhitespace(after) || after === INLINE_ATTACHMENT_ANCHOR);
}

function toAttachmentPillData(attachment: IChatRequestVariableEntry): IInlineAttachmentPillData {
	const text = getAttachmentMention(attachment.name);
	return { id: attachment.id, text, reference: toAttachedContextDynamicVariable(attachment, new Range(1, 1, 1, 1 + text.length)), entry: attachment };
}

/** The attachment that the chat widget derives from a reference, which its pill shows. */
function toVariableEntry(reference: IDynamicVariable, text: string, offset: number, range: Range): IChatRequestVariableEntry {
	const part = new ChatRequestDynamicVariablePart(new OffsetRange(offset, offset + text.length), range, text, reference.id, reference.modelDescription, reference.data, reference.fullName, reference.icon, reference.isFile, reference.isDirectory, reference._meta, reference.isAttachmentReference, reference.promptText);
	const entry = part.toVariableEntry();
	return { ...entry, range: undefined };
}

function isSameEntry(a: IChatRequestVariableEntry, b: IChatRequestVariableEntry): boolean {
	return a === b || (a.id === b.id && a.kind === b.kind && a.name === b.name && a.value === b.value && a.omittedState === b.omittedState);
}

/** A copy of a parsed part with another editor range. Parts are immutable, and some compute their text from their class. */
function withEditorRange<T extends IParsedChatRequestPart>(part: T, editorRange: IRange): T {
	if (Range.equalsRange(part.editorRange, editorRange)) {
		return part;
	}
	return Object.assign(Object.create(Object.getPrototypeOf(part)), part, { editorRange });
}

function findLastIndex<T>(array: readonly T[], predicate: (item: T) => boolean): number {
	for (let i = array.length - 1; i >= 0; i--) {
		if (predicate(array[i])) {
			return i;
		}
	}
	return -1;
}

let anchorWidthCache: { font: string; width: number } | undefined;

/** The width of an anchor in a font, which is what line wrapping measures it at. */
function measureAnchorWidth(font: string): number {
	if (anchorWidthCache?.font !== font) {
		const context = mainWindow.document.createElement('canvas').getContext('2d');
		let width = 0;
		if (context) {
			context.font = font;
			width = context.measureText(INLINE_ATTACHMENT_ANCHOR).width;
		}
		anchorWidthCache = { font, width };
	}
	return anchorWidthCache.width;
}

/** Opens the attachment of the pill right before the cursor in a chat input, see {@link ChatInlineAttachments.openActivePill}. */
class OpenInlineAttachmentAction extends Action2 {

	static readonly ID = 'workbench.action.chat.openInlineAttachment';

	constructor() {
		super({
			id: OpenInlineAttachmentAction.ID,
			title: localize2('chat.openInlineAttachment', "Open Inline Attachment"),
			precondition: ChatContextKeys.enabled,
			keybinding: {
				when: ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.inputInlineAttachmentActive),
				primary: KeyCode.Enter,
				// Above sending the request, below accepting a suggestion.
				weight: KeybindingWeight.EditorContrib + 10,
			},
		});
	}

	run(accessor: ServicesAccessor): void {
		const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (editor) {
			ChatInlineAttachments.get(editor)?.openActivePill();
		}
	}
}

registerAction2(OpenInlineAttachmentAction);
