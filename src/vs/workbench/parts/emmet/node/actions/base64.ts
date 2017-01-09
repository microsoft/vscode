/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');

import { fileExists } from 'vs/base/node/pfs';
import fs = require('fs');
import { dirname, join, normalize, isValidBasename } from 'vs/base/common/paths';

import { EmmetEditorAction, EmmetActionContext } from 'vs/workbench/parts/emmet/node/emmetActions';
import { Action } from 'vs/base/common/actions';

import { ServicesAccessor, editorAction } from 'vs/editor/common/editorCommonExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorCommon';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IQuickOpenService, IInputOptions } from 'vs/platform/quickOpen/common/quickOpen';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

@editorAction
class EncodeDecodeDataUrlAction extends EmmetEditorAction {

	private imageFilePath: string = null;

	constructor() {
		super({
			id: 'editor.emmet.action.encodeDecodeDataUrl',
			label: nls.localize('encodeDecodeDataUrl', "Emmet: Encode\\Decode data:URL image"),
			alias: 'Emmet: Encode\\Decode data:URL image',
			precondition: EditorContextKeys.Writable
		});
	}

	private createPath(parent: string, fileName: string): string {
		// TO DO replace with IFileService
		var stat = fs.statSync(parent);
		if (stat && !stat.isDirectory()) {
			parent = dirname(parent);
		}
		return join(parent, fileName);
	}

	public runEmmetAction(accessor: ServicesAccessor, ctx: EmmetActionContext) {
		const workspaceContext = accessor.get(IWorkspaceContextService);
		const messageService = accessor.get(IMessageService);
		const quickOpenService = accessor.get(IQuickOpenService);

		const currentLine = ctx.editorAccessor.getCurrentLine();
		if (!this.isDataURI(currentLine)) {
			this.encodeDecode(ctx);
			return;
		}

		if (!workspaceContext.hasWorkspace()) {
			const message = nls.localize('noWorkspace', "Decoding a data:URL image is only available inside a workspace folder.");
			messageService.show(Severity.Info, message);
			return;
		}

		let options: IInputOptions = {
			prompt: nls.localize('enterImagePath', "Enter file path (absolute or relative)"),
			placeHolder: nls.localize('path', "File path")
		};

		const quickPromise = quickOpenService.input(options)
			.then(path => {
				if (!this.isValidInput(messageService, path)) {
					quickPromise.cancel();
				}

				this.imageFilePath = path;
				const fullpath = this.createPath(ctx.editorAccessor.getFilePath(), path);
				return fileExists(fullpath);
			})
			.then(status => {
				if (!status) {
					this.encodeDecode(ctx, this.imageFilePath);
					return;
				}

				const message = nls.localize('warnEscalation', "File **{0}** already exists.  Do you want to overwrite the existing file?", this.imageFilePath);
				const actions = [
					new Action('ok', nls.localize('ok', "OK"), '', true, () => {
						this.encodeDecode(ctx, this.imageFilePath);
						return null;
					}),
					new Action('cancel', nls.localize('cancel', "Cancel"), '', true)
				];
				messageService.show(Severity.Warning, { message, actions });
			});
	}

	public encodeDecode(ctx: EmmetActionContext, filepath?: string) {
		ctx.editorAccessor.prompt = (): string => {
			return filepath;
		};

		if (!ctx.emmet.run('encode_decode_data_url', ctx.editorAccessor)) {
			this.noExpansionOccurred(ctx.editor);
		}
	}

	private isValidInput(messageService: IMessageService, input: any): boolean {
		if (input === undefined) {
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
			messageService.show(Severity.Error, message);
			return false;
		}

		return true;
	}

	private isDataURI(data: string): boolean {
		return /(?:src=|url\()['"]?data:/.test(data);
	}
}
