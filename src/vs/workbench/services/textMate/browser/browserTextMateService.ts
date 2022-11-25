/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextMateService } from 'vs/workbench/services/textMate/browser/textMate';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { AbstractTextMateService } from 'vs/workbench/services/textMate/browser/abstractTextMateService';
import { FileAccess } from 'vs/base/common/network';
// ESM-uncomment-begin
// import { URI } from '../../../../base/common/uri.js';
// ESM-uncomment-end

export class TextMateService extends AbstractTextMateService {
	protected async _loadVSCodeOnigurumWASM(): Promise<Response | ArrayBuffer> {
		// ESM-comment-begin
		const response = await fetch(FileAccess.asBrowserUri('vscode-oniguruma/../onig.wasm').toString(true));
		// ESM-comment-end
		// ESM-uncomment-begin
		// const response = await fetch(URI.joinPath(FileAccess.asBrowserUri(''), '../node_modules/vscode-oniguruma/release/onig.wasm').toString(true));
		// ESM-uncomment-end
		// Using the response directly only works if the server sets the MIME type 'application/wasm'.
		// Otherwise, a TypeError is thrown when using the streaming compiler.
		// We therefore use the non-streaming compiler :(.
		return await response.arrayBuffer();
	}
}

registerSingleton(ITextMateService, TextMateService, InstantiationType.Eager);
