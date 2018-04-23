/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { NextEditorGroupView } from 'vs/workbench/browser/parts/editor2/nextEditorGroupView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Orientation } from 'vs/base/browser/ui/splitview/splitview';
import { EditorLocation } from 'vs/workbench/browser/parts/editor2/nextEditor';
import { Dimension, clearNode } from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';

export enum EditorGroupsOrientation {
	VERTICAL,
	HORIZONTAL
}

export class NextEditorGroupsViewer extends Disposable {
	private _element: HTMLElement;
	private singletonTmpView: NextEditorGroupView;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();

		this._element = document.createElement('div');
	}

	get element(): HTMLElement {
		return this._element;
	}

	get groups(): NextEditorGroupView[] {
		return this.singletonTmpView ? [this.singletonTmpView] : [];
	}

	groupAt(location: EditorLocation): NextEditorGroupView {
		return this.singletonTmpView;
	}

	split(location: EditorLocation, orientation: EditorGroupsOrientation): NextEditorGroupView {
		if (!this.singletonTmpView) {
			this.singletonTmpView = this._register(this.instantiationService.createInstance(NextEditorGroupView)); // TODO@grid hook into GridWidget

			const parent = this._element.parentElement;
			clearNode(parent);
			this._element = this.singletonTmpView.element;
			parent.appendChild(this._element);
		}

		return this.singletonTmpView;
	}

	layout(dimension: Dimension): void {
		if (this.singletonTmpView) {
			this.singletonTmpView.layout(dimension.width, Orientation.HORIZONTAL);
		}
	}
}