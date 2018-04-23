/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// import { TPromise } from 'vs/base/common/winjs.base';
import { EditorGroup } from 'vs/workbench/common/editor/editorStacksModel';

export enum GridOrientation {
	VERTICAL,
	HORIZONTAL
}

export class NextEditorsViewer {
	private _element: HTMLElement;
	// private model: NextEditorViewModel;

	constructor() {
		this._element = document.createElement('div');
		// this.model = new NextEditorViewModel(new TestGrid());
	}

	get element(): HTMLElement {
		return this._element;
	}

	split(location: number[], orientation: GridOrientation): EditorGroup /* IEditorGroupView */ {

		// TODO this should return some GridView/IEditorGroupView type which combines a newly created EditorGroup and HTML container

		return void 0;
	}

	groupAt(location: number[]): EditorGroup /* IEditorGroupView */ {
		return void 0;
	}

	get groups(): EditorGroup[] /* IEditorGroupView */ {
		return [];
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