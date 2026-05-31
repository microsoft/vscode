/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const watch = process.platform === 'win32' ? require('./watch-win32.ts').default : require('vscode-gulp-watch');

export default function (...args: any[]): ReturnType<typeof watch> {
	return watch.apply(null, args);
}
