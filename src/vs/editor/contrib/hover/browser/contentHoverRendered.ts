/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorHoverContext, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart, IRenderedHoverParts, RenderedHoverParts } from './hoverTypes.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { EditorHoverStatusBar } from './contentHoverStatusBar.js';
import { HoverStartSource } from './hoverOperation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { ContentHoverResult } from './contentHoverTypes.js';
import * as dom from '../../../../base/browser/dom.js';
import { HoverVerbosityAction } from '../../../common/languages.js';
import { MarkdownHoverParticipant } from './markdownHoverParticipant.js';
import { HoverColorPickerParticipant } from '../../colorPicker/browser/hoverColorPicker/hoverColorPickerParticipant.js';
import { localize } from '../../../../nls.js';
import { InlayHintsHover } from '../../inlayHints/browser/inlayHintsHover.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { HoverAction } from '../../../../base/browser/ui/hover/hoverWidget.js';

export class RenderedContentHover extends Disposable {

	public closestMouseDistance: number | undefined;
	public initialMousePosX: number | undefined;
	public initialMousePosY: number | undefined;

	public readonly showAtPosition: Position;
	public readonly showAtSecondaryPosition: Position;
	public readonly shouldFocus: boolean;
	public readonly source: HoverStartSource;
	public readonly shouldAppearBeforeContent: boolean;

	private readonly _renderedHoverParts: RenderedContentHoverParts;

	constructor(
		editor: ICodeEditor,
		hoverResult: ContentHoverResult,
		participants: IEditorHoverParticipant<IHoverPart>[],
		context: IEditorHoverContext,
		keybindingService: IKeybindingService
	) {
		super();
		const parts = hoverResult.hoverParts;
		this._renderedHoverParts = this._register(new RenderedContentHoverParts(
			editor,
			participants,
			parts,
			keybindingService,
			context
		));
		const contentHoverComputerOptions = hoverResult.options;
		const anchor = contentHoverComputerOptions.anchor;
		const { showAtPosition, showAtSecondaryPosition } = RenderedContentHover.computeHoverPositions(editor, anchor.range, parts);
		this.shouldAppearBeforeContent = parts.some(m => m.isBeforeContent);
		this.showAtPosition = showAtPosition;
		this.showAtSecondaryPosition = showAtSecondaryPosition;
		this.initialMousePosX = anchor.initialMousePosX;
		this.initialMousePosY = anchor.initialMousePosY;
		this.shouldFocus = contentHoverComputerOptions.shouldFocus;
		this.source = contentHoverComputerOptions.source;
	}

	public get domNode(): DocumentFragment {
		return this._renderedHoverParts.domNode;
	}

	public get domNodeHasChildren(): boolean {
		return this._renderedHoverParts.domNodeHasChildren;
	}

	public get focusedHoverPartIndex(): number {
		return this._renderedHoverParts.focusedHoverPartIndex;
	}

	public focusHoverPartWithIndex(index: number): void {
		this._renderedHoverParts.focusHoverPartWithIndex(index);
	}

	public getAccessibleWidgetContent(): string {
		return this._renderedHoverParts.getAccessibleContent();
	}

	public getAccessibleWidgetContentAtIndex(index: number): string {
		return this._renderedHoverParts.getAccessibleHoverContentAtIndex(index);
	}

	public async updateHoverVerbosityLevel(action: HoverVerbosityAction, index: number, focus?: boolean): Promise<void> {
		this._renderedHoverParts.updateHoverVerbosityLevel(action, index, focus);
	}

	public doesHoverAtIndexSupportVerbosityAction(index: number, action: HoverVerbosityAction): boolean {
		return this._renderedHoverParts.doesHoverAtIndexSupportVerbosityAction(index, action);
	}

	public isColorPickerVisible(): boolean {
		return this._renderedHoverParts.isColorPickerVisible();
	}

	public static computeHoverPositions(editor: ICodeEditor, anchorRange: Range, hoverParts: IHoverPart[]): { showAtPosition: Position; showAtSecondaryPosition: Position } {

		let startColumnBoundary = 1;
		if (editor.hasModel()) {
			// Ensure the range is on the current view line
			const viewModel = editor._getViewModel();
			const coordinatesConverter = viewModel.coordinatesConverter;
			const anchorViewRange = coordinatesConverter.convertModelRangeToViewRange(anchorRange);
			const anchorViewMinColumn = viewModel.getLineMinColumn(anchorViewRange.startLineNumber);
			const anchorViewRangeStart = new Position(anchorViewRange.startLineNumber, anchorViewMinColumn);
			startColumnBoundary = coordinatesConverter.convertViewPositionToModelPosition(anchorViewRangeStart).column;
		}

		// The anchor range is always on a single line
		const anchorStartLineNumber = anchorRange.startLineNumber;
		let secondaryPositionColumn = anchorRange.startColumn;
		let forceShowAtRange: Range | undefined;

		for (const hoverPart of hoverParts) {
			const hoverPartRange = hoverPart.range;
			const hoverPartRangeOnAnchorStartLine = hoverPartRange.startLineNumber === anchorStartLineNumber;
			const hoverPartRangeOnAnchorEndLine = hoverPartRange.endLineNumber === anchorStartLineNumber;
			const hoverPartRangeIsOnAnchorLine = hoverPartRangeOnAnchorStartLine && hoverPartRangeOnAnchorEndLine;
			if (hoverPartRangeIsOnAnchorLine) {
				// this message has a range that is completely sitting on the line of the anchor
				const hoverPartStartColumn = hoverPartRange.startColumn;
				const minSecondaryPositionColumn = Math.min(secondaryPositionColumn, hoverPartStartColumn);
				secondaryPositionColumn = Math.max(minSecondaryPositionColumn, startColumnBoundary);
			}
			if (hoverPart.forceShowAtRange) {
				forceShowAtRange = hoverPartRange;
			}
		}

		let showAtPosition: Position;
		let showAtSecondaryPosition: Position;
		if (forceShowAtRange) {
			const forceShowAtPosition = forceShowAtRange.getStartPosition();
			showAtPosition = forceShowAtPosition;
			showAtSecondaryPosition = forceShowAtPosition;
		} else {
			showAtPosition = anchorRange.getStartPosition();
			showAtSecondaryPosition = new Position(anchorStartLineNumber, secondaryPositionColumn);
		}
		return {
			showAtPosition,
			showAtSecondaryPosition,
		};
	}
}

interface IRenderedContentHoverPart {
	/**
	 * Type of rendered part
	 */
	type: 'hoverPart';
	/**
	 * Participant of the rendered hover part
	 */
	participant: IEditorHoverParticipant<IHoverPart>;
	/**
	 * The rendered hover part
	 */
	hoverPart: IHoverPart;
	/**
	 * The HTML element containing the hover status bar.
	 */
	hoverElement: HTMLElement;
}

interface IRenderedContentStatusBar {
	/**
	 * Type of rendered part
	 */
	type: 'statusBar';
	/**
	 * The HTML element containing the hover status bar.
	 */
	hoverElement: HTMLElement;
	/**
	 * The actions of the hover status bar.
	 */
	actions: HoverAction[];
}

type IRenderedContentHoverPartOrStatusBar = IRenderedContentHoverPart | IRenderedContentStatusBar;

class RenderedStatusBar implements IDisposable {

	constructor(fragment: DocumentFragment, private readonly _statusBar: EditorHoverStatusBar) {
		fragment.appendChild(this._statusBar.hoverElement);
	}

	get hoverElement(): HTMLElement {
		return this._statusBar.hoverElement;
	}

	get actions(): HoverAction[] {
		return this._statusBar.actions;
	}

	dispose() {
		this._statusBar.dispose();
	}
}

class RenderedContentHoverParts extends Disposable {

	private static readonly _DECORATION_OPTIONS = ModelDecorationOptions.register({
		description: 'content-hover-highlight',
		className: 'hoverHighlight'
	});

	private readonly _renderedParts: IRenderedContentHoverPartOrStatusBar[] = [];
	private readonly _fragment: DocumentFragment;
	private readonly _context: IEditorHoverContext;

	private _markdownHoverParticipant: MarkdownHoverParticipant | undefined;
	private _colorHoverParticipant: HoverColorPickerParticipant | undefined;
	private _focusedHoverPartIndex: number = -1;

	constructor(
		editor: ICodeEditor,
		participants: IEditorHoverParticipant<IHoverPart>[],
		hoverParts: IHoverPart[],
		keybindingService: IKeybindingService,
		context: IEditorHoverContext
	) {
		super();
		this._context = context;
		this._fragment = document.createDocumentFragment();
		this._register(this._renderParts(participants, hoverParts, context, keybindingService));
		this._register(this._registerListenersOnRenderedParts());
		this._register(this._createEditorDecorations(editor, hoverParts));
		this._updateMarkdownAndColorParticipantInfo(participants);
	}

	private _createEditorDecorations(editor: ICodeEditor, hoverParts: IHoverPart[]): IDisposable {
		if (hoverParts.length === 0) {
			return Disposable.None;
		}
		let highlightRange = hoverParts[0].range;
		for (const hoverPart of hoverParts) {
			const hoverPartRange = hoverPart.range;
			highlightRange = Range.plusRange(highlightRange, hoverPartRange);
		}
		const highlightDecoration = editor.createDecorationsCollection();
		highlightDecoration.set([{
			range: highlightRange,
			options: RenderedContentHoverParts._DECORATION_OPTIONS
		}]);
		return toDisposable(() => {
			highlightDecoration.clear();
		});
	}

	private _renderParts(participants: IEditorHoverParticipant<IHoverPart>[], hoverParts: IHoverPart[], hoverContext: IEditorHoverContext, keybindingService: IKeybindingService): IDisposable {
		const statusBar = new EditorHoverStatusBar(keybindingService);
		const hoverRenderingContext: IEditorHoverRenderContext = {
			fragment: this._fragment,
			statusBar,
			...hoverContext
		};
		const disposables = new DisposableStore();
		for (const participant of participants) {
			const renderedHoverParts = this._renderHoverPartsForParticipant(hoverParts, participant, hoverRenderingContext);
			disposables.add(renderedHoverParts);
			for (const renderedHoverPart of renderedHoverParts.renderedHoverParts) {
				this._renderedParts.push({
					type: 'hoverPart',
					participant,
					hoverPart: renderedHoverPart.hoverPart,
					hoverElement: renderedHoverPart.hoverElement,
				});
			}
		}
		const renderedStatusBar = this._renderStatusBar(this._fragment, statusBar);
		if (renderedStatusBar) {
			disposables.add(renderedStatusBar);
			this._renderedParts.push({
				type: 'statusBar',
				hoverElement: renderedStatusBar.hoverElement,
				actions: renderedStatusBar.actions,
			});
		}
		return toDisposable(() => { disposables.dispose(); });
	}

	private _renderHoverPartsForParticipant(hoverParts: IHoverPart[], participant: IEditorHoverParticipant<IHoverPart>, hoverRenderingContext: IEditorHoverRenderContext): IRenderedHoverParts<IHoverPart> {
		const hoverPartsForParticipant = hoverParts.filter(hoverPart => hoverPart.owner === participant);
		const hasHoverPartsForParticipant = hoverPartsForParticipant.length > 0;
		if (!hasHoverPartsForParticipant) {
			return new RenderedHoverParts([]);
		}
		return participant.renderHoverParts(hoverRenderingContext, hoverPartsForParticipant);
	}

	private _renderStatusBar(fragment: DocumentFragment, statusBar: EditorHoverStatusBar): RenderedStatusBar | undefined {
		if (!statusBar.hasContent) {
			return undefined;
		}
		return new RenderedStatusBar(fragment, statusBar);
	}

	private _registerListenersOnRenderedParts(): IDisposable {
		const disposables = new DisposableStore();
		this._renderedParts.forEach((renderedPart: IRenderedContentHoverPartOrStatusBar, index: number) => {
			const element = renderedPart.hoverElement;
			element.tabIndex = 0;
			disposables.add(dom.addDisposableListener(element, dom.EventType.FOCUS_IN, (event: Event) => {
				event.stopPropagation();
				this._focusedHoverPartIndex = index;
			}));
			disposables.add(dom.addDisposableListener(element, dom.EventType.FOCUS_OUT, (event: Event) => {
				event.stopPropagation();
				this._focusedHoverPartIndex = -1;
			}));
		});
		return disposables;
	}

	private _updateMarkdownAndColorParticipantInfo(participants: IEditorHoverParticipant<IHoverPart>[]) {
		const markdownHoverParticipant = participants.find(p => {
			return (p instanceof MarkdownHoverParticipant) && !(p instanceof InlayHintsHover);
		});
		if (markdownHoverParticipant) {
			this._markdownHoverParticipant = markdownHoverParticipant as MarkdownHoverParticipant;
		}
		this._colorHoverParticipant = participants.find(p => p instanceof HoverColorPickerParticipant);
	}

	public focusHoverPartWithIndex(index: number): void {
		if (index < 0 || index >= this._renderedParts.length) {
			return;
		}
		this._renderedParts[index].hoverElement.focus();
	}

	public getAccessibleContent(): string {
		const content: string[] = [];
		for (let i = 0; i < this._renderedParts.length; i++) {
			content.push(this.getAccessibleHoverContentAtIndex(i));
		}
		return content.join('\n\n');
	}

	public getAccessibleHoverContentAtIndex(index: number): string {
		const renderedPart = this._renderedParts[index];
		if (!renderedPart) {
			return '';
		}
		if (renderedPart.type === 'statusBar') {
			const statusBarDescription = [localize('hoverAccessibilityStatusBar', "This is a hover status bar.")];
			for (const action of renderedPart.actions) {
				const keybinding = action.actionKeybindingLabel;
				if (keybinding) {
					statusBarDescription.push(localize('hoverAccessibilityStatusBarActionWithKeybinding', "It has an action with label {0} and keybinding {1}.", action.actionLabel, keybinding));
				} else {
					statusBarDescription.push(localize('hoverAccessibilityStatusBarActionWithoutKeybinding', "It has an action with label {0}.", action.actionLabel));
				}
			}
			return statusBarDescription.join('\n');
		}
		return renderedPart.participant.getAccessibleContent(renderedPart.hoverPart);
	}

	public async updateHoverVerbosityLevel(action: HoverVerbosityAction, index: number, focus?: boolean): Promise<void> {
		if (!this._markdownHoverParticipant) {
			return;
		}
		const normalizedMarkdownHoverIndex = this._normalizedIndexToMarkdownHoverIndexRange(this._markdownHoverParticipant, index);
		if (normalizedMarkdownHoverIndex === undefined) {
			return;
		}
		const renderedPart = await this._markdownHoverParticipant.updateMarkdownHoverVerbosityLevel(action, normalizedMarkdownHoverIndex, focus);
		if (!renderedPart) {
			return;
		}
		this._renderedParts[index] = {
			type: 'hoverPart',
			participant: this._markdownHoverParticipant,
			hoverPart: renderedPart.hoverPart,
			hoverElement: renderedPart.hoverElement,
		};
		this._context.onContentsChanged();
	}

	public doesHoverAtIndexSupportVerbosityAction(index: number, action: HoverVerbosityAction): boolean {
		if (!this._markdownHoverParticipant) {
			return false;
		}
		const normalizedMarkdownHoverIndex = this._normalizedIndexToMarkdownHoverIndexRange(this._markdownHoverParticipant, index);
		if (normalizedMarkdownHoverIndex === undefined) {
			return false;
		}
		return this._markdownHoverParticipant.doesMarkdownHoverAtIndexSupportVerbosityAction(normalizedMarkdownHoverIndex, action);
	}

	public isColorPickerVisible(): boolean {
		return this._colorHoverParticipant?.isColorPickerVisible() ?? false;
	}

	private _normalizedIndexToMarkdownHoverIndexRange(markdownHoverParticipant: MarkdownHoverParticipant, index: number): number | undefined {
		const renderedPart = this._renderedParts[index];
		if (!renderedPart || renderedPart.type !== 'hoverPart') {
			return undefined;
		}
		const isHoverPartMarkdownHover = renderedPart.participant === markdownHoverParticipant;
		if (!isHoverPartMarkdownHover) {
			return undefined;
		}
		const firstIndexOfMarkdownHovers = this._renderedParts.findIndex(renderedPart =>
			renderedPart.type === 'hoverPart'
			&& renderedPart.participant === markdownHoverParticipant
		);
		if (firstIndexOfMarkdownHovers === -1) {
			throw new BugIndicatingError();
		}
		return index - firstIndexOfMarkdownHovers;
	}

	public get domNode(): DocumentFragment {
		return this._fragment;
	}

	public get domNodeHasChildren(): boolean {
		return this._fragment.hasChildNodes();
	}

	public get focusedHoverPartIndex(): number {
		return this._focusedHoverPartIndex;
	}
}
