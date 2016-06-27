/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IEditorActionDescriptorData, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {EmmetEditorAction} from './emmetActions';
import {EditorAccessor} from './editorAccessor';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';

export class BasicEmmetEditorAction extends EmmetEditorAction {

	protected editorAccessor: EditorAccessor;
	private emmetActionName: string;

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService, actionName: string) {
		super(descriptor, editor, configurationService);
		this.editorAccessor = new EditorAccessor(editor);
		this.emmetActionName = actionName;
	}

	public runEmmetAction(_module) {
		if (!_module.run(this.emmetActionName, this.editorAccessor)) {
			this.editorAccessor.noExpansionOccurred();
		}
	}
}
