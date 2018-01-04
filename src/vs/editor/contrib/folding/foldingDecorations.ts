/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TrackedRangeStickiness, IModelDeltaDecoration, IModelDecorationsChangeAccessor } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IDecorationProvider } from 'vs/editor/contrib/folding/foldingModel';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

export class FoldingDecorationProvider implements IDecorationProvider {

	private COLLAPSED_VISUAL_DECORATION = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		afterContentClassName: 'inline-folded',
		linesDecorationsClassName: 'folding collapsed'
	});

	private EXPANDED_AUTO_HIDE_VISUAL_DECORATION = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		linesDecorationsClassName: 'folding'
	});

	private EXPANDED_VISUAL_DECORATION = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		linesDecorationsClassName: 'folding alwaysShowFoldIcons'
	});

	public autoHideFoldingControls: boolean = true;

	constructor(private editor: ICodeEditor) {
	}

	getDecorationOption(isCollapsed: boolean): ModelDecorationOptions {
		if (isCollapsed) {
			return this.COLLAPSED_VISUAL_DECORATION;
		} else if (this.autoHideFoldingControls) {
			return this.EXPANDED_AUTO_HIDE_VISUAL_DECORATION;
		} else {
			return this.EXPANDED_VISUAL_DECORATION;
		}
	}

	deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[]): string[] {
		return this.editor.deltaDecorations(oldDecorations, newDecorations);
	}

	changeDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T): T {
		return this.editor.changeDecorations(callback);
	}
}
