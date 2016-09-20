/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {getFileIconClasses} from 'vs/base/browser/ui/fileLabel/fileLabel';
import {IconLabel, IIconLabelOptions} from 'vs/base/browser/ui/iconLabel/iconLabel';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IEditorInput} from 'vs/platform/editor/common/editor';
import {getResource} from 'vs/workbench/common/editor';

export class EditorLabel extends IconLabel {
	private input: IEditorInput;
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
		this.input = input;
		this.options = options;

		this.render();
	}

	private render(): void {
		if (!this.input) {
			return;
		}

		const resource = getResource(this.input);

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

		this.setValue(this.input.getName(), this.input.getDescription(), { title, extraClasses, italic });
	}

	public dispose(): void {
		this.input = void 0;
		this.options = void 0;
	}
}