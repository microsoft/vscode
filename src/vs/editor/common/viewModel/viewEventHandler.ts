/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { EmitterEvent } from 'vs/base/common/eventEmitter';
import * as editorCommon from 'vs/editor/common/editorCommon';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { ScrollEvent } from 'vs/base/common/scrollable';

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

	public onLineMappingChanged(): boolean {
		return false;
	}
	public onModelFlushed(): boolean {
		return false;
	}
	public onModelDecorationsChanged(e: viewEvents.IViewDecorationsChangedEvent): boolean {
		return false;
	}
	public onModelLinesDeleted(e: viewEvents.IViewLinesDeletedEvent): boolean {
		return false;
	}
	public onModelLineChanged(e: viewEvents.IViewLineChangedEvent): boolean {
		return false;
	}
	public onModelLinesInserted(e: viewEvents.IViewLinesInsertedEvent): boolean {
		return false;
	}
	public onModelTokensChanged(e: viewEvents.IViewTokensChangedEvent): boolean {
		return false;
	}
	public onCursorPositionChanged(e: viewEvents.IViewCursorPositionChangedEvent): boolean {
		return false;
	}
	public onCursorSelectionChanged(e: viewEvents.IViewCursorSelectionChangedEvent): boolean {
		return false;
	}
	public onCursorRevealRange(e: viewEvents.IViewRevealRangeEvent): boolean {
		return false;
	}
	public onCursorScrollRequest(e: viewEvents.IViewScrollRequestEvent): boolean {
		return false;
	}
	public onConfigurationChanged(e: editorCommon.IConfigurationChangedEvent): boolean {
		return false;
	}
	public onScrollChanged(e: ScrollEvent): boolean {
		return false;
	}
	public onZonesChanged(): boolean {
		return false;
	}
	public onViewFocusChanged(isFocused: boolean): boolean {
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
					if (this.onLineMappingChanged()) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.ModelFlushedEvent:
					if (this.onModelFlushed()) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.LinesDeletedEvent:
					if (this.onModelLinesDeleted(<viewEvents.IViewLinesDeletedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.LinesInsertedEvent:
					if (this.onModelLinesInserted(<viewEvents.IViewLinesInsertedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.LineChangedEvent:
					if (this.onModelLineChanged(<viewEvents.IViewLineChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.TokensChangedEvent:
					if (this.onModelTokensChanged(<viewEvents.IViewTokensChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.DecorationsChangedEvent:
					if (this.onModelDecorationsChanged(<viewEvents.IViewDecorationsChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.CursorPositionChangedEvent:
					if (this.onCursorPositionChanged(<viewEvents.IViewCursorPositionChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.CursorSelectionChangedEvent:
					if (this.onCursorSelectionChanged(<viewEvents.IViewCursorSelectionChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.RevealRangeEvent:
					if (this.onCursorRevealRange(<viewEvents.IViewRevealRangeEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.ScrollRequestEvent:
					if (this.onCursorScrollRequest(<viewEvents.IViewScrollRequestEvent>data)) {
						shouldRender = true;
					}
					break;

				case editorCommon.EventType.ConfigurationChanged:
					if (this.onConfigurationChanged(<editorCommon.IConfigurationChangedEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.ViewScrollChanged:
					if (this.onScrollChanged(<ScrollEvent>data)) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.ZonesChanged:
					if (this.onZonesChanged()) {
						shouldRender = true;
					}
					break;

				case viewEvents.ViewEventNames.ViewFocusChanged:
					if (this.onViewFocusChanged(<boolean>data)) {
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