/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as viewEvents from '../../../common/viewEvents.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import { ViewGpuContext } from '../../gpu/viewGpuContext.js';
import { DynamicViewOverlay } from '../../view/dynamicViewOverlay.js';
import { RenderingContext } from '../../view/renderingContext.js';
import { ViewLineOptions } from '../viewLines/viewLineOptions.js';
import './gpuMark.css';

/**
 * A mark on lines to make identification of GPU-rendered lines vs DOM easier.
 */
export class GpuMarkOverlay extends DynamicViewOverlay {

	public static readonly CLASS_NAME = 'gpu-mark';

	private readonly _context: ViewContext;

	private _renderResult: string[] | null;

	constructor(context: ViewContext, private readonly _viewGpuContext: ViewGpuContext) {
		super();
		this._context = context;
		this._renderResult = null;
		this._context.addEventHandler(this);
	}

	public override dispose(): void {
		this._context.removeEventHandler(this);
		this._renderResult = null;
		super.dispose();
	}

	// --- begin event handlers

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		return true;
	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		return true;
	}
	public override onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}
	public override onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return true;
	}
	public override onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return true;
	}
	public override onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return true;
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollTopChanged;
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}
	public override onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		return true;
	}

	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
		const visibleEndLineNumber = ctx.visibleRange.endLineNumber;

		const viewportData = ctx.viewportData;
		const options = new ViewLineOptions(this._context.configuration, this._context.theme.type);

		const output: string[] = [];
		for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
			const lineIndex = lineNumber - visibleStartLineNumber;
			const cannotRenderReasons = this._viewGpuContext.canRenderDetailed(options, viewportData, lineNumber);
			output[lineIndex] = cannotRenderReasons.length ? `<div class="${GpuMarkOverlay.CLASS_NAME}" title="Cannot render on GPU: ${cannotRenderReasons.join(', ')}"></div>` : '';
		}

		this._renderResult = output;
	}

	public render(startLineNumber: number, lineNumber: number): string {
		if (!this._renderResult) {
			return '';
		}
		const lineIndex = lineNumber - startLineNumber;
		if (lineIndex < 0 || lineIndex >= this._renderResult.length) {
			return '';
		}
		return this._renderResult[lineIndex];
	}
}
