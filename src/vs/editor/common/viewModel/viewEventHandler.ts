/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { EmitterEvent } from 'vs/base/common/eventEmitter';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

export class ViewEventHandler {

	private _shouldRender: boolean;

	constructor() {
		this._shouldRender = true;
	}

	public shouldRender(): boolean {
		return this._shouldRender;
	}

	public forceShouldRender(): void {
		this._shouldRender = true;
	}

	protected setShouldRender(): void {
		this._shouldRender = true;
	}

	public onDidRender(): void {
		this._shouldRender = false;
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		return false;
	}
	public onCursorPositionChanged(e: viewEvents.ViewCursorPositionChangedEvent): boolean {
		return false;
	}
	public onCursorSelectionChanged(e: viewEvents.ViewCursorSelectionChangedEvent): boolean {
		return false;
	}
	public onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		return false;
	}
	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return false;
	}
	public onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boolean {
		return false;
	}
	public onLineChanged(e: viewEvents.ViewLineChangedEvent): boolean {
		return false;
	}
	public onLineMappingChanged(e: viewEvents.ViewLineMappingChangedEvent): boolean {
		return false;
	}
	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return false;
	}
	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return false;
	}
	public onRevealRangeRequest(e: viewEvents.ViewRevealRangeRequestEvent): boolean {
		return false;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return false;
	}
	public onScrollRequest(e: viewEvents.ViewScrollRequestEvent): boolean {
		return false;
	}
	public onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boolean {
		return false;
	}
	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return false;
	}

	// --- end event handlers

	public handleEvents(events: EmitterEvent[]): void {

		let shouldRender = false;

		for (let i = 0, len = events.length; i < len; i++) {
			let e = events[i];
			let data = e.getData();

			switch (e.getType()) {

				case viewEvents.ViewEventNames.LineMappingChangedEvent:
					if (this.onLineMappingChanged(<viewEvents.ViewLineMappingChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.ModelFlushedEvent:
					if (this.onFlushed(<viewEvents.ViewFlushedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.LinesDeletedEvent:
					if (this.onLinesDeleted(<viewEvents.ViewLinesDeletedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.LinesInsertedEvent:
					if (this.onLinesInserted(<viewEvents.ViewLinesInsertedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.LineChangedEvent:
					if (this.onLineChanged(<viewEvents.ViewLineChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.TokensChangedEvent:
					if (this.onTokensChanged(<viewEvents.ViewTokensChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.DecorationsChangedEvent:
					if (this.onDecorationsChanged(<viewEvents.ViewDecorationsChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.CursorPositionChangedEvent:
					if (this.onCursorPositionChanged(<viewEvents.ViewCursorPositionChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.CursorSelectionChangedEvent:
					if (this.onCursorSelectionChanged(<viewEvents.ViewCursorSelectionChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.RevealRangeEvent:
					if (this.onRevealRangeRequest(<viewEvents.ViewRevealRangeRequestEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.ScrollRequestEvent:
					if (this.onScrollRequest(<viewEvents.ViewScrollRequestEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.ConfigurationChanged:
					if (this.onConfigurationChanged(<viewEvents.ViewConfigurationChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.ViewScrollChanged:
					if (this.onScrollChanged(<viewEvents.ViewScrollChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.ZonesChanged:
					if (this.onZonesChanged(<viewEvents.ViewZonesChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.ViewFocusChanged:
					if (this.onFocusChanged(<viewEvents.ViewFocusChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				default:
					console.info('View received unknown event: ');
					console.info(e);
			}
		}

		if (shouldRender) {
			this._shouldRender = true;
		}
	}
}