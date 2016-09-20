/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import uri from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import {EditorDescriptor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {IFileEditorDescriptor} from 'vs/workbench/parts/files/common/files';
import {getFileIconClasses} from 'vs/base/browser/ui/fileLabel/fileLabel';
import {IconLabel, IIconLabelOptions} from 'vs/base/browser/ui/iconLabel/iconLabel';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {IModeService} from 'vs/editor/common/services/modeService';
import {getPathLabel} from 'vs/base/common/labels';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

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

export interface IFileIconLabelOptions extends IIconLabelOptions {
	hidePath?: boolean;
	isFolder?: boolean;
}

export class FileLabel extends IconLabel {
	private file: uri;
	private options: IFileIconLabelOptions;

	constructor(
		container: HTMLElement,
		@IExtensionService private extensionService: IExtensionService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IModeService private modeService: IModeService
	) {
		super(container);

		this.extensionService.onReady().then(() => {
			this.render(); // there can be additional modes once the extension host is ready so we need to render again
		});
	}

	public setFile(resource: uri, options?: IFileIconLabelOptions): void {
		this.file = resource;
		this.options = options;

		this.render();
	}

	public clear(): void {
		this.file = void 0;
		this.options = void 0;

		this.setValue();
	}

	private render(): void {
		if (!this.file) {
			return;
		}

		const label = paths.basename(this.file.fsPath);

		let description: string;
		if (!this.options || !this.options.hidePath) {
			description = getPathLabel(paths.dirname(this.file.fsPath), this.contextService);
		}

		let title = '';
		if (this.options && this.options.title) {
			title = this.options.title;
		} else if (this.file) {
			title = this.file.fsPath;
		}

		const extraClasses = getFileIconClasses(this.file, path => this.modeService.getModeIdByFilenameOrFirstLine(path), this.options && this.options.isFolder);
		if (this.options && this.options.extraClasses) {
			extraClasses.push(...this.options.extraClasses);
		}

		const italic = this.options && this.options.italic;

		this.setValue(label, description, { title, extraClasses, italic });
	}

	public dispose(): void {
		this.file = void 0;
		this.options = void 0;
	}
}