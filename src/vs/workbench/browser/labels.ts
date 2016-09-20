/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import uri from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import {IconLabel, IIconLabelOptions} from 'vs/base/browser/ui/iconLabel/iconLabel';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IEditorInput} from 'vs/platform/editor/common/editor';
import {getResource} from 'vs/workbench/common/editor';
import {getPathLabel} from 'vs/base/common/labels';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

export interface IEditorLabel {
	name: string;
	description?: string;
	resource?: uri;
}

export interface IResourceLabelOptions extends IIconLabelOptions {
	isFolder?: boolean;
}

export class ResourceLabel extends IconLabel {
	private label: IEditorLabel;
	private options: IResourceLabelOptions;

	constructor(
		container: HTMLElement,
		@IExtensionService private extensionService: IExtensionService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IModeService private modeService: IModeService
	) {
		super(container);

		this.extensionService.onReady().then(() => {
			this.render(); // there can be additional modes once the extension host is ready so we need to render again
		});
	}

	public setLabel(label: IEditorLabel, options?: IResourceLabelOptions): void {
		this.label = label;
		this.options = options;

		this.render();
	}

	public clear(): void {
		this.label = void 0;
		this.options = void 0;

		this.setValue();
	}

	private render(): void {
		if (!this.label) {
			return;
		}

		const resource = this.label.resource;

		let title = '';
		if (this.options && this.options.title) {
			title = this.options.title;
		} else if (resource) {
			title = resource.fsPath;
		}

		const extraClasses = this.getIconClasses(resource);
		if (this.options && this.options.extraClasses) {
			extraClasses.push(...this.options.extraClasses);
		}

		const italic = this.options && this.options.italic;

		this.setValue(this.label.name, this.label.description, { title, extraClasses, italic });
	}

	public dispose(): void {
		this.label = void 0;
		this.options = void 0;
	}

	protected getIconClasses(arg1?: uri | string): string[] {
		let path: string;
		if (typeof arg1 === 'string') {
			path = arg1;
		} else if (arg1) {
			path = arg1.fsPath;
		}

		const classes = (this.options && this.options.isFolder) ? ['folder-icon'] : ['file-icon'];

		if (path) {
			const basename = paths.basename(path);
			const dotSegments = basename.split('.');

			const name = dotSegments[0]; // file.txt => "file", .dockerfile => "", file.some.txt => "file"
			if (name) {
				classes.push(`${this.cssEscape(name.toLowerCase())}-name-file-icon`);
			}

			const extensions = dotSegments.splice(1);
			if (extensions.length > 0) {
				for (let i = 0; i < extensions.length; i++) {
					classes.push(`${this.cssEscape(extensions.slice(i).join('.').toLowerCase())}-ext-file-icon`); // add each combination of all found extensions if more than one
				}
			}

			const langId = this.modeService.getModeIdByFilenameOrFirstLine(path);
			if (langId) {
				classes.push(`${this.cssEscape(langId)}-lang-file-icon`);
			}
		}

		return classes;
	}

	private cssEscape(val: string): string {
		return val.replace(/\s/g, '\\$&'); // make sure to not introduce CSS classes from files that contain whitespace
	}
}

export class EditorLabel extends ResourceLabel {

	public setEditor(editor: IEditorInput, options?: IResourceLabelOptions): void {
		this.setLabel({
			resource: getResource(editor),
			name: editor.getName(),
			description: editor.getDescription()
		}, options);
	}
}

export interface IFileLabelOptions extends IResourceLabelOptions {
	hidePath?: boolean;
}

export class FileLabel extends ResourceLabel {

	public setFile(resource: uri, options: IFileLabelOptions = Object.create(null)): void {
		this.setLabel({
			resource,
			name: paths.basename(resource.fsPath),
			description: !options.hidePath ? getPathLabel(paths.dirname(resource.fsPath), this.contextService) : void 0
		}, options);
	}
}