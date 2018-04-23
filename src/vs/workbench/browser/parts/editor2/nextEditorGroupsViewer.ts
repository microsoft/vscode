/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { NextEditorGroupView } from 'vs/workbench/browser/parts/editor2/nextEditorGroupView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Orientation } from 'vs/base/browser/ui/splitview/splitview';
import { EditorLocation } from 'vs/workbench/browser/parts/editor2/nextEditor';

export enum EditorGroupsOrientation {
	VERTICAL,
	HORIZONTAL
}

export class NextEditorGroupsViewer {
	private _element: HTMLElement;
	private singletonTmpView: NextEditorGroupView;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this._element = document.createElement('div');
	}

	get element(): HTMLElement {
		return this._element;
	}

	split(location: EditorLocation, orientation: EditorGroupsOrientation): NextEditorGroupView {
		if (!this.singletonTmpView) {
			this.singletonTmpView = this.instantiationService.createInstance(NextEditorGroupView); // TODO@grid hook into GridWidget
		}

		this.singletonTmpView.render(this._element, orientation === EditorGroupsOrientation.HORIZONTAL ? Orientation.HORIZONTAL : Orientation.VERTICAL);

		return this.singletonTmpView;
	}

	groupAt(location: EditorLocation): NextEditorGroupView {
		return this.singletonTmpView;
	}

	get groups(): NextEditorGroupView[] {
		return this.singletonTmpView ? [this.singletonTmpView] : [];
	}
}