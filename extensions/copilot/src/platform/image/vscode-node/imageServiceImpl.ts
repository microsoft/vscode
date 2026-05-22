/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { ILogService } from '../../log/common/logService';
import { ImageServiceImpl } from '../node/imageServiceImpl';

export class VSCodeImageServiceImpl extends ImageServiceImpl {
	constructor(
		@ICAPIClientService capiClient: ICAPIClientService,
		@ILogService private readonly logService: ILogService,
	) {
		super(capiClient);
	}

	override async resizeImage(data: Uint8Array, mimeType: string): Promise<{ data: Uint8Array; mimeType: string }> {
		try {
			const result = await vscode.commands.executeCommand('_chat.resizeImage', data, mimeType);
			if (result instanceof Uint8Array) {
				return { data: result, mimeType };
			}
		} catch (e) {
			this.logService.trace(`ImageService: failed to resize image, using original: ${e}`);
		}
		return { data, mimeType };
	}
}
