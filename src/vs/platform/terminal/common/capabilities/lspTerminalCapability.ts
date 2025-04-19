/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
// eslint-disable-next-line local/code-import-patterns
import { ITextModelContentProvider } from '../../../../editor/common/services/resolverService.js'; //Now this complains :/

export interface ILspTerminalModelContentProvider extends ITextModelContentProvider {
	setContent(resource: URI, content: string): void;
	getContent(resource: URI): string;
	dispose(): void;
}
