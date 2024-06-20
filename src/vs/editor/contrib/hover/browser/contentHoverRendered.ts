/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorHoverContext, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ContentHoverComputer } from 'vs/editor/contrib/hover/browser/contentHoverComputer';
import { EditorHoverStatusBar } from 'vs/editor/contrib/hover/browser/contentHoverStatusBar';
import { HoverStartSource } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { HoverResult } from 'vs/editor/contrib/hover/browser/contentHoverTypes';

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
		hoverResult: HoverResult,
		participants: IEditorHoverParticipant<IHoverPart>[],
		computer: ContentHoverComputer,
		context: IEditorHoverContext,
		keybindingService: IKeybindingService
	) {
		super();
		const anchor = hoverResult.anchor;
		const parts = hoverResult.hoverParts;
		this._renderedHoverParts = this._register(new RenderedContentHoverParts(
			editor,
			participants,
			parts,
			context,
			keybindingService
		));
		const { showAtPosition, showAtSecondaryPosition } = RenderedContentHover.computeHoverPositions(editor, anchor.range, parts);
		this.shouldAppearBeforeContent = parts.some(m => m.isBeforeContent);
		this.showAtPosition = showAtPosition;
		this.showAtSecondaryPosition = showAtSecondaryPosition;
		this.initialMousePosX = anchor.initialMousePosX;
		this.initialMousePosY = anchor.initialMousePosY;
		this.shouldFocus = computer.shouldFocus;
		this.source = computer.source;
	}

	public get domNode(): DocumentFragment {
		return this._renderedHoverParts.domNode;
	}

	public get domNodeHasChildren(): boolean {
		return this._renderedHoverParts.domNodeHasChildren;
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

class RenderedContentHoverParts extends Disposable {

	private static readonly _DECORATION_OPTIONS = ModelDecorationOptions.register({
		description: 'content-hover-highlight',
		className: 'hoverHighlight'
	});

	private readonly _participants: IEditorHoverParticipant<IHoverPart>[];
	private readonly _fragment: DocumentFragment;

	constructor(
		editor: ICodeEditor,
		participants: IEditorHoverParticipant<IHoverPart>[],
		hoverParts: IHoverPart[],
		context: IEditorHoverContext,
		keybindingService: IKeybindingService
	) {
		super();
		this._participants = participants;
		this._fragment = document.createDocumentFragment();
		const statusBar = new EditorHoverStatusBar(keybindingService);
		const hoverContext: IEditorHoverRenderContext = { fragment: this._fragment, statusBar, ...context };
		this._register(this._renderHoverParts(hoverContext, hoverParts));
		this._register(this._renderStatusBar(this._fragment, statusBar));
		this._register(this._addEditorDecorations(editor, hoverParts));
	}

	private _addEditorDecorations(editor: ICodeEditor, hoverParts: IHoverPart[]): IDisposable {
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

	private _renderHoverParts(context: IEditorHoverRenderContext, hoverParts: IHoverPart[]): IDisposable {
		const disposables = new DisposableStore();
		for (const participant of this._participants) {
			const hoverPartsForParticipant = hoverParts.filter(hoverPart => hoverPart.owner === participant);
			const hasHoverPartsForParticipant = hoverPartsForParticipant.length > 0;
			if (!hasHoverPartsForParticipant) {
				continue;
			}
			disposables.add(participant.renderHoverParts(context, hoverPartsForParticipant));
		}
		return disposables;
	}

	private _renderStatusBar(fragment: DocumentFragment, statusBar: EditorHoverStatusBar): IDisposable {
		if (!statusBar.hasContent) {
			return Disposable.None;
		}
		fragment.appendChild(statusBar.hoverElement);
		return statusBar;
	}

	public get domNode(): DocumentFragment {
		return this._fragment;
	}

	public get domNodeHasChildren(): boolean {
		return this._fragment.hasChildNodes();
	}
}
