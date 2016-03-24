/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import typescript = require('vs/languages/typescript/common/typescript');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');

export namespace Defaults {

	export const ProjectResolver = new typescript.DefaultProjectResolver();

	export function addExtraLib(content: string, filePath?:string): void {
		ProjectResolver.addExtraLib(content, filePath);
	}

	export function setCompilerOptions(options: ts.CompilerOptions): void {
		ProjectResolver.setCompilerOptions(options);
	}
}
