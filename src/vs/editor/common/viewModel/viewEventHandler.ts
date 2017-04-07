/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

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
	public onLineMappingChanged(e: viewEvents.ViewLineMappingChangedEvent): boolean {
		return false;
	}
	public onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
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
	public onTokensColorsChanged(e: viewEvents.ViewTokensColorsChangedEvent): boolean {
		return false;
	}
	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return false;
	}

	// --- end event handlers

	public handleEvents(events: viewEvents.ViewEvent[]): void {

		let shouldRender = false;

		for (let i = 0, len = events.length; i < len; i++) {
			let e = events[i];

			switch (e.type) {

				case viewEvents.ViewEventType.ViewConfigurationChanged:
					if (this.onConfigurationChanged(e)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventType.ViewCursorPositionChanged:
					if (this.onCursorPositionChanged(e)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventType.ViewCursorSelectionChanged:
					if (this.onCursorSelectionChanged(e)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventType.ViewDecorationsChanged:
					if (this.onDecorationsChanged(e)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventType.ViewFlushed:
					if (this.onFlushed(e)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventType.ViewFocusChanged:
					if (this.onFocusChanged(e)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventType.ViewLineMappingChanged:
					if (this.onLineMappingChanged(e)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventType.ViewLinesChanged:
					if (this.onLinesChanged(e)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventType.ViewLinesDeleted:
					if (this.onLinesDeleted(e)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventType.ViewLinesInserted:
					if (this.onLinesInserted(e)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventType.ViewRevealRangeRequest:
					if (this.onRevealRangeRequest(e)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventType.ViewScrollChanged:
					if (this.onScrollChanged(e)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventType.ViewScrollRequest:
					if (this.onScrollRequest(e)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventType.ViewTokensChanged:
					if (this.onTokensChanged(e)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventType.ViewTokensColorsChanged:
					if (this.onTokensColorsChanged(e)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventType.ViewZonesChanged:
					if (this.onZonesChanged(e)) {
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
