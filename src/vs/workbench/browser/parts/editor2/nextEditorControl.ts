/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

'use strict';

import { Disposable } from 'vs/base/common/lifecycle';
import { EditorInput, EditorOptions, IEditorGroup } from 'vs/workbench/common/editor';
import { INextEditor } from 'vs/workbench/services/editor/common/nextEditorGroupsService';
import { Dimension } from 'vs/base/browser/dom';

export class NextEditorControl extends Disposable {

	private dimension: Dimension;

	constructor(
		private parent: HTMLElement,
		private group: IEditorGroup
	) {
		super();
	}

	openEditor(input: EditorInput, options?: EditorOptions): INextEditor {

		return Object.create(null);
	}

	layout(dimension: Dimension): void {
		this.dimension = dimension;
	}
}