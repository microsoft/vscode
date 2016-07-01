/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');

import * as emmet from 'emmet';
import {fileExists} from 'vs/base/node/pfs';
import fs = require('fs');
import {dirname, join, normalize, isValidBasename, isEqualOrParent} from 'vs/base/common/paths';

import {EmmetEditorAction} from 'vs/workbench/parts/emmet/node/emmetActions';
import {Action} from 'vs/base/common/actions';

import {CommonEditorRegistry, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {IEditorActionDescriptorData, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {IQuickOpenService, IInputOptions} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IFileService} from 'vs/platform/files/common/files';


class EncodeDecodeDataUrlAction extends EmmetEditorAction {

	static ID = 'editor.emmet.action.encodeDecodeDataUrl';
	private imageFilePath: string = null;

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IMessageService private messageService: IMessageService,
		@IFileService private fileService: IFileService) {
		super(descriptor, editor, configurationService);
	}

	private createPath(parent: string, fileName: string): string {
		return join(dirname(parent), fileName);
	};

	public runEmmetAction(_emmet: typeof emmet) {
		const currentLine = this.editorAccessor.getCurrentLine();
		if (!this.isDataURI(currentLine)) {
			this.encodeDecode(_emmet);
			return;
		}

		if (!this.contextService.getWorkspace()) {
			const message = nls.localize('noWorkspace', "Decoding a data:URL image is only available inside a workspace folder.");
			this.messageService.show(Severity.Info, message);
			return;
		}

		let options: IInputOptions = {
			prompt: nls.localize('enterImagePath', "Enter file path (absolute or relative)"),
			placeHolder: nls.localize('path', "File path")
		};

		const quickPromise = this.quickOpenService.input(options)
			.then(path => {
				// The full path to a new file relative an open file in the editor
				const fullpath = this.createPath(this.editorAccessor.getFilePath(), path);

				if (!this.isValidInput(path, fullpath)) {
					quickPromise.cancel();
				}

				this.imageFilePath = path;
				return fileExists(fullpath);
			})
			.then(fileExist => {
				if (!fileExist) {
					this.encodeDecode(_emmet, this.imageFilePath);
					return;
				}

				// If a file with the same name and location specified by path exists, give the user a choice
				const message = nls.localize('warnEscalation', "File **{0}** already exists. Do you want to overwrite the existing file?", this.imageFilePath);
				const actions = [
					new Action('cancel', nls.localize('cancel', "Cancel"), '', true),
					new Action('ok', nls.localize('ok', "OK"), '', true, () => {
						this.encodeDecode(_emmet, this.imageFilePath);
						return null;
					})
				];
				this.messageService.show(Severity.Warning, { message, actions });
			});
	}

	public encodeDecode(_emmet: any, filepath?: string) {
		/*
		 * This function implements a standard method *prompt*.
		 *
		 * Link to the original source code:
		 * https://github.com/emmetio/emmet/blob/afafbd27efa48e386513bfabf65756a10f4929ef/lib/action/base64.js#L78-L83
		 *
		 * Unfortunately, Emmet gets the path from the user using the *prompt*
		 * method, and does not allow pass the path explicitly. It is therefore
		 * necessary to replace the method so as to have the possibility
		 * to return the path already obtained by us.
		 */
		this.editorAccessor.prompt = (): string => filepath;
		if (!_emmet.run('encode_decode_data_url', this.editorAccessor)) {
			this.noExpansionOccurred();
		}
	}

	private isValidInput(input: any, fullpath: string): boolean {
		if (input === undefined) {
			return false;
		}

		// If the user wants to save a file outside the current workspace
		const workspaceRoot = this.contextService.getWorkspace().resource.fsPath;
		if (!isEqualOrParent(fullpath, workspaceRoot)) {
			const message = nls.localize('outsideOfWorkspace', "The path **{0}** is located outside the current workspace.", input);
			this.messageService.show(Severity.Error, message);
			return false;
		}

		// Validate all segments of path without absolute and empty segments
		// Valid: `images/test.png`, `./test.png`, `../images/test.png`, `\images\test.png`
		let isValidFilePath = true;
		const filePathSegments = normalize(input).split('/').filter(segment => {
			return segment.length !== 0 && segment !== '..';
		});

		for (let i = 0; i < filePathSegments.length; i++) {
			if (!isValidBasename(filePathSegments[i])) {
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
