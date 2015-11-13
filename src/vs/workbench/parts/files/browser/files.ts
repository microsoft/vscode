/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');
import {FileEditorInput} from 'vs/workbench/parts/files/common/files';
import {EditorDescriptor, IEditorInputActionContext, EditorInputActionContributor} from 'vs/workbench/browser/parts/editor/baseEditor';

/**
 * A variant of the editor input action contributor to contribute only to inputs that match a set of given mimes
 * and implement the FileEditorInput API. This is useful to dynamically contribute editor actions to specific
 * file types.
 */
export class FileEditorInputActionContributor extends EditorInputActionContributor {
	private mimes: string[];

	constructor(mimes: string[]) {
		super();

		this.mimes = mimes;
	}

	/* We override toId() to make the caching of actions based on the mime of the input if given */
	protected toId(context: IEditorInputActionContext): string {
		let id = super.toId(context);

		let mime = this.getMimeFromContext(context);
		if (mime) {
			id += mime;
		}

		return id;
	}

	private getMimeFromContext(context: IEditorInputActionContext): string {
		if (context && context.input && context.input instanceof FileEditorInput) {
			let fileInput = <FileEditorInput>context.input;
			return fileInput.getMime();
		}

		return null;
	}

	private hasMime(context: IEditorInputActionContext): boolean {
		let mime = this.getMimeFromContext(context);
		if (mime) {
			let mimes = mime.split(',');
			for (let i = 0; i < mimes.length; i++) {
				if (this.mimes.indexOf(strings.trim(mimes[i])) >= 0) {
					return true;
				}
			}
		}

		return false;
	}

	public hasActions(context: IEditorInputActionContext): boolean {
		if (!this.hasMime(context)) {
			return false;
		}

		return super.hasActions(context);
	}

	public hasSecondaryActions(context: IEditorInputActionContext): boolean {
		if (!this.hasMime(context)) {
			return false;
		}

		return super.hasSecondaryActions(context);
	}
}

/**
 * A lightweight descriptor of an editor for files. Optionally allows to specify a list of mime types the editor
 * should be used for. This allows for fine grained contribution of editors to the Platform based on mime types. Wildcards
 * can be used (e.g. text/*) to register an editor on a wider range of mime types.
 */
export class FileEditorDescriptor extends EditorDescriptor {
	private mimetypes: string[];

	constructor(id: string, name: string, moduleId: string, ctorName: string, mimetypes: string[]) {
		super(id, name, moduleId, ctorName);

		this.mimetypes = mimetypes;
	}

	public getMimeTypes(): string[] {
		return this.mimetypes;
	}
}