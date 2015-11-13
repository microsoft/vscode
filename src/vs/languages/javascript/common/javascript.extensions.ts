/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import platform = require('vs/platform/platform');
import typescript = require('vs/languages/typescript/common/typescript');
import {AsyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
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

// ----- JavaScript extension ---------------------------------------------------------------

export namespace Extensions {

	export var Identifier = 'javascript';

	platform.Registry.add(Identifier, Extensions);

	var projectResolver: AsyncDescriptor<typescript.IProjectResolver2>;

	export function setProjectResolver(desc: AsyncDescriptor<typescript.IProjectResolver2>): void {
		projectResolver = desc;
	}

	export function getProjectResolver(): AsyncDescriptor<typescript.IProjectResolver2> {
		return projectResolver;
	}
}
