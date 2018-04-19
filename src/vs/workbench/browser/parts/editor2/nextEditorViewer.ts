/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { EditorInput, EditorOptions, GroupIdentifier } from 'vs/workbench/common/editor';
// import { EditorGroup } from '../../../common/editor/editorStacksModel';

export enum GridOrientation {
	VERTICAL,
	HORIZONTAL
}

export class NextEditorViewer {
	private _element: HTMLElement;
	// private model: NextEditorViewModel;

	constructor() {
		this._element = document.createElement('div');
		// this.model = new NextEditorViewModel(new TestGrid());
	}

	get element(): HTMLElement {
		return this._element;
	}

	split(location: number[], orientation: GridOrientation, input: EditorInput, options?: EditorOptions): TPromise<void> {


		return TPromise.as(void 0);
	}

	show(id: GroupIdentifier, input: EditorInput, options?: EditorOptions): TPromise<void> {
		return TPromise.as(void 0);
	}
}

// interface IGridPrimitives {
// 	split();
// 	move();
// 	close();
// }

// class TestGrid implements IGridPrimitives {

// 	split() {}

// 	move() {}

// 	close() {}
// }

// class NextEditorViewModel {
// 	private groups: EditorGroup[];

// 	constructor(grid: IGridPrimitives) {
// 		this.groups = [];
// 	}
// }