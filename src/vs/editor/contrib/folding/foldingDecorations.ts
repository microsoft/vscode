/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TrackedRangeStickiness } from 'vs/editor/common/editorCommon';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';
import { FoldingRegion, IDecorationProvider } from 'vs/editor/contrib/folding/foldingModel';

export class FoldingDecorationProvider implements IDecorationProvider {

	private COLLAPSED_VISUAL_DECORATION = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		afterContentClassName: 'inline-folded',
		linesDecorationsClassName: 'folding collapsed'
	});

	private EXPANDED_AUTO_HIDE_VISUAL_DECORATION = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		linesDecorationsClassName: 'folding autoHide'
	});

	private EXPANDED_VISUAL_DECORATION = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		linesDecorationsClassName: 'folding'
	});

	public autoHideFoldingControls: boolean = true;

	getDecorationOption(region: FoldingRegion): ModelDecorationOptions {
		if (region.isCollapsed) {
			return this.COLLAPSED_VISUAL_DECORATION;
		} else if (this.autoHideFoldingControls) {
			return this.EXPANDED_AUTO_HIDE_VISUAL_DECORATION;
		} else {
			return this.EXPANDED_VISUAL_DECORATION;
		}
	}
}
