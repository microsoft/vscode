/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as editorCommon from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';
import { ICoordinatesConverter, ViewEventsCollector, IViewModel } from 'vs/editor/common/viewModel/viewModel';
import { Selection } from 'vs/editor/common/core/selection';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { ICursorRevealRangeEvent, CursorEventType, CursorScrollRequest } from 'vs/editor/common/controller/cursorEvents';
import { Cursor } from "vs/editor/common/controller/cursor";
import { ViewEventEmitter } from "vs/editor/common/viewModel/viewModelImpl";
import { EmitterEvent } from "vs/base/common/eventEmitter";

export interface ICursorPositionChangedEvent {
	readonly position: Position;
	readonly viewPosition: Position;
	readonly secondaryPositions: Position[];
	readonly secondaryViewPositions: Position[];
	readonly isInEditableRange: boolean;
}

export interface ICursorSelectionChangedEvent {
	readonly selection: Selection;
	readonly viewSelection: Selection;
	readonly secondarySelections: Selection[];
	readonly secondaryViewSelections: Selection[];
}

function containsLineMappingChanged(events: viewEvents.ViewEvent[]): boolean {
	for (let i = 0, len = events.length; i < len; i++) {
		if (events[i].type === viewEvents.ViewEventType.ViewLineMappingChanged) {
			return true;
		}
	}
	return false;
}

export class ViewModelCursors extends ViewEventEmitter {

	private readonly configuration: editorCommon.IConfiguration;
	private readonly viewModel: IViewModel;
	private readonly cursor: Cursor;
	private readonly coordinatesConverter: ICoordinatesConverter;

	private lastCursorPositionChangedEvent: ICursorPositionChangedEvent;
	private lastCursorSelectionChangedEvent: ICursorSelectionChangedEvent;

	constructor(configuration: editorCommon.IConfiguration, viewModel: IViewModel, cursor: Cursor) {
		super();
		this.configuration = configuration;
		this.viewModel = viewModel;
		this.cursor = cursor;
		this.coordinatesConverter = viewModel.coordinatesConverter;
		this.lastCursorPositionChangedEvent = null;
		this.lastCursorSelectionChangedEvent = null;

		this._register(cursor.addBulkListener((events: EmitterEvent[]) => {
			const eventsCollector = new ViewEventsCollector();
			this._onCursorEvents(eventsCollector, events);
			this._emit(eventsCollector.finalize());
		}));

		this._register(viewModel.addEventListener((events: viewEvents.ViewEvent[]) => {
			if (!containsLineMappingChanged(events)) {
				return;
			}
			const eventsCollector = new ViewEventsCollector();
			this.onLineMappingChanged(eventsCollector);
			this._emit(eventsCollector.finalize());
		}));
	}

	private _onCursorEvents(eventsCollector: ViewEventsCollector, events: EmitterEvent[]): void {
		for (let i = 0, len = events.length; i < len; i++) {
			const _e = events[i];
			const type = _e.type;
			const data = _e.data;

			switch (type) {
				case CursorEventType.CursorPositionChanged: {
					const e = <ICursorPositionChangedEvent>data;
					this.onCursorPositionChanged(eventsCollector, e);
					break;
				}
				case CursorEventType.CursorSelectionChanged: {
					const e = <ICursorSelectionChangedEvent>data;
					this.onCursorSelectionChanged(eventsCollector, e);
					break;
				}
				case CursorEventType.CursorRevealRange: {
					const e = <ICursorRevealRangeEvent>data;
					this.onCursorRevealRange(eventsCollector, e);
					break;
				}
				case CursorEventType.CursorScrollRequest: {
					const e = <CursorScrollRequest>data;
					this.viewModel.viewLayout.setScrollPosition({
						scrollTop: e.desiredScrollTop
					});
					break;
				}
				default:
					console.info('View received unknown event: ');
					console.info(type, data);
			}
		}
	}

	public dispose(): void {
		super.dispose();
	}

	/**
	 * Limit position to be somewhere where it can actually be rendered
	 */
	private static _toPositionThatCanBeRendered(position: Position, stopRenderingLineAfter: number) {
		// Limit position to be somewhere where it can actually be rendered
		if (stopRenderingLineAfter !== -1 && position.column > stopRenderingLineAfter) {
			position = new Position(position.lineNumber, stopRenderingLineAfter);
		}
		return position;
	}

	private onCursorPositionChanged(eventsCollector: ViewEventsCollector, e: ICursorPositionChangedEvent): void {
		this.lastCursorPositionChangedEvent = e;

		const stopRenderingLineAfter = this.configuration.editor.viewInfo.stopRenderingLineAfter;

		let position = ViewModelCursors._toPositionThatCanBeRendered(e.viewPosition, stopRenderingLineAfter);
		let secondaryPositions: Position[] = [];
		for (let i = 0, len = e.secondaryPositions.length; i < len; i++) {
			secondaryPositions[i] = ViewModelCursors._toPositionThatCanBeRendered(e.secondaryViewPositions[i], stopRenderingLineAfter);
		}

		eventsCollector.emit(new viewEvents.ViewCursorPositionChangedEvent(position, secondaryPositions, e.isInEditableRange));
	}

	private onCursorSelectionChanged(eventsCollector: ViewEventsCollector, e: ICursorSelectionChangedEvent): void {
		this.lastCursorSelectionChangedEvent = e;

		eventsCollector.emit(new viewEvents.ViewCursorSelectionChangedEvent(e.viewSelection, e.secondaryViewSelections));
	}

	private onCursorRevealRange(eventsCollector: ViewEventsCollector, e: ICursorRevealRangeEvent): void {
		// Ensure event has viewRange
		const viewRange = (
			e.viewRange
				? e.viewRange
				: this.coordinatesConverter.convertModelRangeToViewRange(e.range)
		);
		eventsCollector.emit(new viewEvents.ViewRevealRangeRequestEvent(
			viewRange,
			e.verticalType,
			e.revealHorizontal
		));
	}

	private onLineMappingChanged(eventsCollector: ViewEventsCollector): void {
		if (this.lastCursorPositionChangedEvent) {
			const toViewPos = (pos: Position) => this.coordinatesConverter.convertModelPositionToViewPosition(pos);
			let e: ICursorPositionChangedEvent = {
				position: this.lastCursorPositionChangedEvent.position,
				viewPosition: toViewPos(this.lastCursorPositionChangedEvent.position),
				secondaryPositions: this.lastCursorPositionChangedEvent.secondaryPositions,
				secondaryViewPositions: this.lastCursorPositionChangedEvent.secondaryPositions.map(toViewPos),
				isInEditableRange: this.lastCursorPositionChangedEvent.isInEditableRange,
			};
			this.onCursorPositionChanged(eventsCollector, e);
		}

		if (this.lastCursorSelectionChangedEvent) {
			const toViewSel = (sel: Selection) => this.coordinatesConverter.convertModelSelectionToViewSelection(sel);
			let e: ICursorSelectionChangedEvent = {
				selection: this.lastCursorSelectionChangedEvent.selection,
				viewSelection: toViewSel(this.lastCursorSelectionChangedEvent.selection),
				secondarySelections: this.lastCursorSelectionChangedEvent.secondarySelections,
				secondaryViewSelections: this.lastCursorSelectionChangedEvent.secondarySelections.map(toViewSel),
			};
			this.onCursorSelectionChanged(eventsCollector, e);
		}
	}
}
