/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../../../../base/common/observable.js';
import { ObservableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { IModelDeltaDecoration, InjectedTextCursorStops } from '../../../../../../common/model.js';
import { Position } from '../../../../../../common/core/position.js';
import { Range } from '../../../../../../common/core/range.js';

export class JumpToView extends Disposable {
	constructor(
		private readonly _editor: ObservableCodeEditor,
		private readonly _data: IObservable<{ jumpToPosition: Position } | undefined>,
	) {
		super();

		const decorations = derived(this, reader => {
			const data = this._data.read(reader);
			if (!data) {
				return [];
			}

			const position = data.jumpToPosition;
			const decorationArray: IModelDeltaDecoration[] = [
				{
					range: Range.fromPositions(position),
					options: {
						description: 'inline-edit-jump-to',
						showIfCollapsed: true,
						after: {
							content: `Jump to`,
							inlineClassName: 'inline-edit-jump-to-pill',
							inlineClassNameAffectsLetterSpacing: true,
							cursorStops: InjectedTextCursorStops.None,
						}
					}
				}
			];

			return decorationArray;
		});

		this._register(this._editor.setDecorations(decorations));
	}
}
