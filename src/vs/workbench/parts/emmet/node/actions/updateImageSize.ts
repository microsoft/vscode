/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {EmmetEditorAction} from 'vs/workbench/parts/emmet/node/emmetActions';
import * as emmet from 'emmet';

import {FileAccessor} from 'vs/workbench/parts/emmet/node/fileAccessor';

import {CommonEditorRegistry, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {IEditorActionDescriptorData, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IMessageService} from 'vs/platform/message/common/message';
import {IFileService} from 'vs/platform/files/common/files';

class UpdateImageSizeAction extends EmmetEditorAction {

	static ID = 'editor.emmet.action.updateImageSize';

	protected fileAccessor: FileAccessor = null;

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor,
		@IConfigurationService configurationService: IConfigurationService,
		@IMessageService private messageService: IMessageService,
		@IFileService private fileService: IFileService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_emmet: typeof emmet) {
		// Create layer for working with files only when it is needed
		this.fileAccessor = new FileAccessor(this.messageService, this.fileService);

		// Setting layer Emmet for working with files
		_emmet.file(this.fileAccessor.listOfMethods);

		if (!_emmet.run('update_image_size', this.editorAccessor)) {
			this.noExpansionOccurred();
		}
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(UpdateImageSizeAction,
	UpdateImageSizeAction.ID,
	nls.localize('updateImageSize', "Emmet: Update Image Size"), void 0, 'Emmet: Update Image Size'));
