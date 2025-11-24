/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const watch = (await (process.platform === 'win32' ? import('./watch-win32.ts') : import('vscode-gulp-watch'))).default;

export default function (...args: any[]): ReturnType<typeof watch> {
	return watch.apply(null, args);
}
