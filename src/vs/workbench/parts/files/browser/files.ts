/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EditorDescriptor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {IFileEditorDescriptor} from 'vs/workbench/parts/files/common/files';

/**
 * A lightweight descriptor of an editor for files. Optionally allows to specify a list of mime types the editor
 * should be used for. This allows for fine grained contribution of editors to the Platform based on mime types. Wildcards
 * can be used (e.g. text/*) to register an editor on a wider range of mime types.
 */
export class FileEditorDescriptor extends EditorDescriptor implements IFileEditorDescriptor {
	private mimetypes: string[];

	constructor(id: string, name: string, moduleId: string, ctorName: string, mimetypes: string[]) {
		super(id, name, moduleId, ctorName);

		this.mimetypes = mimetypes;
	}

	public getMimeTypes(): string[] {
		return this.mimetypes;
	}
}