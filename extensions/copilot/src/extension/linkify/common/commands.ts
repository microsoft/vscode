/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents } from '../../../util/vs/base/common/uri';

// TODO: keep these commands around for backwards compatibility, but remove them in the future
export const openFileLinkCommand = '_github.copilot.openRelativePath';
export type OpenFileLinkCommandArgs = [path: string | UriComponents, requestId?: string];

export const openSymbolInFileCommand = '_github.copilot.openSymbolInFile';
export type OpenSymbolInFileCommandArgs = [inFileUri: UriComponents, symbolText: string, requestId?: string];

export function commandUri(command: string, args: readonly any[]): string {
	return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
}
