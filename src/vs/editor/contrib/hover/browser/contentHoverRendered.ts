/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorHoverContext, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart, IRenderedHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';
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
import * as dom from 'vs/base/browser/dom';
import * as nls from 'vs/nls';

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

	public get focusedHoverPartIndex(): number {
		return this._renderedHoverParts.focusedHoverPartIndex;
	}

	public getAccessibleWidgetContent(): string | undefined {
		return this._renderedHoverParts.getAccessibleWidgetContent();
	}

	public getAccessibleWidgetContentAtIndex(index: number): string {
		return this._renderedHoverParts.getAccessibleWidgetContentAtIndex(index);
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

interface IRenderedContentHoverPart extends IDisposable {
	element: HTMLElement;
	getAccessibleContent(): string;
}

class RenderedContentHoverPart implements IRenderedContentHoverPart {

	constructor(
		readonly renderedPart: IRenderedHoverPart<IHoverPart>,
		readonly participant: IEditorHoverParticipant<IHoverPart>
	) { }

	get element(): HTMLElement {
		return this.renderedPart.hoverElement;
	}

	getAccessibleContent(): string {
		const hoverPart = this.renderedPart.hoverPart;
		return this.participant.getAccessibleContent(hoverPart);
	}

	dispose(): void {
		this.renderedPart.dispose();
	}
}

class RenderedContentHoverStatusBar implements IRenderedContentHoverPart {

	constructor(readonly element: HTMLElement) { }

	getAccessibleContent(): string {
		return nls.localize('hoverAccessibilityStatusBar', 'There is a status bar here.');
	}

	dispose(): void { }
}


class RenderedContentHoverParts extends Disposable {

	private static readonly _DECORATION_OPTIONS = ModelDecorationOptions.register({
		description: 'content-hover-highlight',
		className: 'hoverHighlight'
	});

	private readonly _participants: IEditorHoverParticipant<IHoverPart>[];
	private readonly _renderedParts: IRenderedContentHoverPart[] = [];
	private readonly _fragment: DocumentFragment;

	private _focusedHoverPartIndex: number = -1;

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
		this._register(this._renderParts(hoverParts, context, keybindingService));
		this._register(this._registerListenersOnRenderedParts());
		this._register(this._createEditorDecorations(editor, hoverParts));
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

	private _renderParts(hoverParts: IHoverPart[], context: IEditorHoverContext, keybindingService: IKeybindingService): IDisposable {
		const statusBar = new EditorHoverStatusBar(keybindingService);
		const hoverContext: IEditorHoverRenderContext = { fragment: this._fragment, statusBar, ...context };
		const renderedHoverParts = this._renderHoverParts(hoverContext, hoverParts);
		this._renderedParts.push(...renderedHoverParts);
		const renderedHoverStatusBar = this._renderStatusBar(this._fragment, statusBar);
		if (renderedHoverStatusBar) { this._renderedParts.push(renderedHoverStatusBar); }
		return toDisposable(() => {
			this._renderedParts.forEach((renderedPart) => {
				renderedPart.dispose();
			});
		});
	}

	private _renderHoverParts(context: IEditorHoverRenderContext, hoverParts: IHoverPart[]): IRenderedContentHoverPart[] {
		const renderedContentHoverParts: IRenderedContentHoverPart[] = [];
		for (const participant of this._participants) {
			const hoverPartsForParticipant = hoverParts.filter(hoverPart => hoverPart.owner === participant);
			const hasHoverPartsForParticipant = hoverPartsForParticipant.length > 0;
			if (!hasHoverPartsForParticipant) {
				continue;
			}
			const renderedHoverPartsForParticipant = participant.renderHoverParts(context, hoverPartsForParticipant);
			const renderedContentHoverPartsForParticipant = renderedHoverPartsForParticipant.renderedHoverParts.map(renderedHoverPart => {
				return new RenderedContentHoverPart(renderedHoverPart, participant);
			});
			renderedContentHoverParts.push(...renderedContentHoverPartsForParticipant);
		}
		return renderedContentHoverParts;
	}

	private _renderStatusBar(fragment: DocumentFragment, statusBar: EditorHoverStatusBar): IRenderedContentHoverPart | undefined {
		if (!statusBar.hasContent) {
			return undefined;
		}
		const element = statusBar.hoverElement;
		fragment.appendChild(element);
		return new RenderedContentHoverStatusBar(element);
	}

	private _registerListenersOnRenderedParts(): IDisposable {
		const disposables = new DisposableStore();
		this._renderedParts.map((renderedPart: IRenderedContentHoverPart, index: number) => {
			const element = renderedPart.element;
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

	public getAccessibleWidgetContent(): string | undefined {
		const content: string[] = [];
		for (let i = 0; i < this._renderedParts.length; i++) {
			content.push(this.getAccessibleWidgetContentAtIndex(i));
		}
		return content.join('\n\n');
	}

	public getAccessibleWidgetContentAtIndex(index: number): string {
		const renderedHoverPart = this._renderedParts[index];
		return renderedHoverPart.getAccessibleContent();
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
