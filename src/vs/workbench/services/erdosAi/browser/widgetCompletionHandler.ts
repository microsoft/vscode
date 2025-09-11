/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWidgetCompletionHandler } from '../common/widgetCompletionHandler.js';
import { IFileCommandHandler } from '../../erdosAiCommands/common/fileCommandHandler.js';

export class WidgetCompletionHandler extends Disposable implements IWidgetCompletionHandler {
	readonly _serviceBrand: undefined;

	constructor(
		@IFileCommandHandler private readonly fileCommandHandler: IFileCommandHandler
	) {
		super();
	}

	async extractFileContentForWidget(filename: string, startLine?: number, endLine?: number): Promise<string> {
		return await this.fileCommandHandler.extractFileContentForWidget(filename, startLine, endLine);
	}
}
