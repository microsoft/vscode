/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import uri from 'vs/base/common/uri';
import {getFileIconClasses} from 'vs/base/browser/ui/fileLabel/fileLabel';
import {IconLabel, IIconLabelOptions} from 'vs/base/browser/ui/iconLabel/iconLabel';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IEditorInput} from 'vs/platform/editor/common/editor';
import {getResource} from 'vs/workbench/common/editor';

export interface IEditorLabel {
	name: string;
	description?: string;
	resource?: uri;
}

export class EditorLabel extends IconLabel {
	private label: IEditorLabel;
	private options: IIconLabelOptions;

	constructor(
		container: HTMLElement,
		@IExtensionService private extensionService: IExtensionService,
		@IModeService private modeService: IModeService
	) {
		super(container);

		this.extensionService.onReady().then(() => {
			this.render(); // there can be additional modes once the extension host is ready so we need to render again
		});
	}

	public setInput(input: IEditorInput, options?: IIconLabelOptions): void {
		this.setLabel({
			resource: getResource(input),
			name: input.getName(),
			description: input.getDescription()
		}, options);
	}

	public setLabel(label: IEditorLabel, options?: IIconLabelOptions): void {
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

		const italic = this.options && this.options.italic;

		const extraClasses = getFileIconClasses(resource, path => this.modeService.getModeIdByFilenameOrFirstLine(path));
		if (this.options && this.options.extraClasses) {
			extraClasses.push(...this.options.extraClasses);
		}

		this.setValue(this.label.name, this.label.description, { title, extraClasses, italic });
	}

	public dispose(): void {
		this.label = void 0;
		this.options = void 0;
	}
}