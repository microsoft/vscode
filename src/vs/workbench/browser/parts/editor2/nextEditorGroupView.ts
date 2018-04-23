/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { EditorGroup } from 'vs/workbench/common/editor/editorStacksModel';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { IView, Orientation } from 'vs/base/browser/ui/splitview/splitview';
import { Event } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class NextEditorGroupView implements IView {

	minimumSize: number = 200;
	maximumSize: number = Number.MAX_VALUE;

	private _onDidChange: Event<number | undefined> = Event.None;
	get onDidChange(): Event<number | undefined> { return this._onDidChange; }

	private _group: EditorGroup;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this._group = instantiationService.createInstance(EditorGroup, 'Editor Group'); // TODO@grid group label?
	}

	get group(): EditorGroup {
		return this._group;
	}

	openEditor(input: EditorInput, options?: EditorOptions): void {
		this._group.openEditor(input, options);
	}

	render(container: HTMLElement, orientation: Orientation): void {
		// TODO@grid implement
	}

	layout(size: number, orientation: Orientation): void {
		//TODO@grid propagte to children
	}
}