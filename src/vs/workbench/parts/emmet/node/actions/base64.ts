/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');

import * as Paths from 'vs/base/common/paths';
import {fileExists} from 'vs/base/node/pfs';
import {createPath} from '../fileAccessor';
import {EmmetEditorAction} from '../emmetActions';
import {Action} from 'vs/base/common/actions';

import {CommonEditorRegistry, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {IEditorActionDescriptorData, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IQuickOpenService, IInputOptions} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IMessageService, Severity} from 'vs/platform/message/common/message';

class EncodeDecodeDataUrlAction extends EmmetEditorAction {

	static ID = 'editor.emmet.action.encodeDecodeDataUrl';
	private imageFilePath: string = null;

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor,
		@IConfigurationService configurationService: IConfigurationService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IMessageService private messageService: IMessageService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_module) {
		const currentLine = this.editorAccessor.getCurrentLine();
		if (!this.isDataURI(currentLine)) {
			this.encodeDecode(_module);
			return;
		}

		let options: IInputOptions = {
			prompt: nls.localize('enterImagePath', "Enter path to file (absolute or relative)"),
			placeHolder: nls.localize('path', "Path to file")
		};

		const quickPromise = this.quickOpenService.input(options)
			.then(path => {
				if (!this.isValidInput(path)) {
					quickPromise.cancel();
				}

				this.imageFilePath = path;

				const fullpath = createPath(this.editorAccessor.getFilePath(), path);
				return fileExists(fullpath);
			})
			.then(status => {
				if (!status) {
					this.encodeDecode(_module, this.imageFilePath);
					return;
				}

				const message = nls.localize('warnEscalation', "File **{0}** already exists.  Do you want to overwrite the existing file?", this.imageFilePath);
				const actions = [
					new Action('cancel', nls.localize('cancel', "Cancel"), '', true),
					new Action('ok', nls.localize('ok', "OK"), '', true, () => {
						this.encodeDecode(_module, this.imageFilePath);
						return null;
					})
				];
				this.messageService.show(Severity.Warning, { message, actions });
			});
	}

	public encodeDecode(_module: any, filepath?: string) {
		this.editorAccessor.prompt = (): string => {
			return filepath;
		};

		if (!_module.run('encode_decode_data_url', this.editorAccessor)) {
			this.editorAccessor.noExpansionOccurred();
		}
	}

	private isValidInput(input: any): boolean {
		if (input === undefined) {
			return false;
		}

		// Validate all segments of path without absolute and empty segments
		// Valid: `images/test.png`, `./test.png`, `../images/test.png`, `\images\test.png`
		let isValidFilePath = true;
		const filePathSegments = Paths.normalize(input).split('/').filter(segment => {
			return segment.length !== 0 && segment !== '..';
		});

		for (let i = 0; i < filePathSegments.length; i++) {
			if (!Paths.isValidBasename(filePathSegments[i])) {
				isValidFilePath = false;
				break;
			}
		}

		if (!isValidFilePath) {
			const message = nls.localize('invalidFileNameError', "The name **{0}** is not valid as a file or folder name. Please choose a different name.", input);
			this.messageService.show(Severity.Error, message);
			return false;
		}

		return true;
	}

	private isDataURI(data: string): boolean {
		return /(?:src=|url\()['"]?data:/.test(data);
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(EncodeDecodeDataUrlAction,
	EncodeDecodeDataUrlAction.ID,
	nls.localize('encodeDecodeDataUrl', "Emmet: Encode\\Decode data:URL image"), void 0, 'Emmet: Encode\\Decode data:URL image'));
