/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeNavigator } from '../../../../../base/browser/ui/tree/tree.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { RenderableMatch } from '../../browser/searchModel.js';

const someEvent = new Emitter().event;

/**
 * Add stub methods as needed
 */
export class MockObjectTree<T, TRef> implements IDisposable {

	get onDidChangeFocus() { return someEvent; }
	get onDidChangeSelection() { return someEvent; }
	get onDidOpen() { return someEvent; }

	get onMouseClick() { return someEvent; }
	get onMouseDblClick() { return someEvent; }
	get onContextMenu() { return someEvent; }

	get onKeyDown() { return someEvent; }
	get onKeyUp() { return someEvent; }
	get onKeyPress() { return someEvent; }

	get onDidFocus() { return someEvent; }
	get onDidBlur() { return someEvent; }

	get onDidChangeCollapseState() { return someEvent; }
	get onDidChangeRenderNodeCount() { return someEvent; }

	get onDidDispose() { return someEvent; }
	get lastVisibleElement() { return this.elements[this.elements.length - 1]; }

	constructor(private elements: any[]) { }

	domFocus(): void { }

	collapse(location: TRef, recursive: boolean = false): boolean {
		return true;
	}

	expand(location: TRef, recursive: boolean = false): boolean {
		return true;
	}

	navigate(start?: TRef): ITreeNavigator<T> {
		const startIdx = start ? this.elements.indexOf(start) :
			undefined;

		return new ArrayNavigator(this.elements, startIdx);
	}

	getParentElement(elem: RenderableMatch) {
		return elem.parent();
	}

	dispose(): void {
	}
}

class ArrayNavigator<T> implements ITreeNavigator<T> {
	constructor(private elements: T[], private index = 0) { }

	current(): T | null {
		return this.elements[this.index];
	}

	previous(): T | null {
		return this.elements[--this.index];
	}

	first(): T | null {
		this.index = 0;
		return this.elements[this.index];
	}

	last(): T | null {
		this.index = this.elements.length - 1;
		return this.elements[this.index];
	}

	next(): T | null {
		return this.elements[++this.index];
	}
}
