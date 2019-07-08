/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextMateService } from 'vs/workbench/services/textMate/common/textMateService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { AbstractTextMateService } from 'vs/workbench/services/textMate/browser/abstractTextMateService';
import { IOnigLib } from 'vscode-textmate';

export class TextMateService extends AbstractTextMateService {

	protected _loadVSCodeTextmate(): Promise<typeof import('vscode-textmate')> {
		return import('vscode-textmate');
	}

	protected _loadOnigLib(): Promise<IOnigLib> | undefined {
		return undefined;
	}
}

registerSingleton(ITextMateService, TextMateService);