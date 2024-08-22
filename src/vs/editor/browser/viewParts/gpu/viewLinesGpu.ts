/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from 'vs/base/common/errors';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { ViewLineOptions } from '../lines/viewLineOptions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { ViewLinesChangedEvent, ViewScrollChangedEvent } from 'vs/editor/common/viewEvents';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';

export class ViewLinesGpu extends ViewPart {
	constructor(context: ViewContext, private readonly canvas: HTMLCanvasElement) {
		super(context);
	}

	public static canRender(options: ViewLineOptions, viewportData: ViewportData, lineNumber: number): boolean {
		const d = viewportData.getViewLineRenderingData(lineNumber);
		// TODO
		return d.content.indexOf('e') !== -1;
	}

	public override prepareRender(ctx: RenderingContext): void {
		throw new BugIndicatingError('Should not be called');
	}

	public override render(ctx: RestrictedRenderingContext): void {
		throw new BugIndicatingError('Should not be called');
	}

	override onLinesChanged(e: ViewLinesChangedEvent): boolean {
		return true;
	}

	override onScrollChanged(e: ViewScrollChangedEvent): boolean {
		return true;
	}

	// subscribe to more events

	public renderText(viewportData: ViewportData): void {
		const options = new ViewLineOptions(this._context.configuration, this._context.theme.type);

		const ctx = this.canvas.getContext('2d')!;
		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		ctx.strokeStyle = 'black';
		const vp = this._context.viewLayout.getCurrentViewport();
		const left = this._context.configuration.options.get(EditorOption.layoutInfo).contentLeft;
		this.canvas.width = vp.width;
		this.canvas.height = vp.height;
		ctx.font = `${this._context.configuration.options.get(EditorOption.fontSize)}px monospace`;

		for (let i = viewportData.startLineNumber; i <= viewportData.endLineNumber; i++) {
			if (!ViewLinesGpu.canRender(options, viewportData, i)) {
				continue;
			}
			const line = viewportData.getViewLineRenderingData(i);

			ctx.strokeText(line.content, left, viewportData.relativeVerticalOffset[i - viewportData.startLineNumber] + viewportData.lineHeight - this._context.viewLayout.getCurrentScrollTop());
		}
	}
}
