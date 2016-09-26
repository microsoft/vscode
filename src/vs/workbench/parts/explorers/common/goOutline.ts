/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import path = require('path');
import { getBinPath } from './goPath';

import { TreeViewNode } from './treeViewModel';

// Keep in sync with https://github.com/lukehoban/go-outline
export interface GoOutlineRange {
	start: number;
	end: number;
}

export interface GoOutlineDeclaration {
	label: string;
	type: string;
	receiverType?: string;
	icon?: string; // icon class or null to use the default images based on the type
	start: number;
	end: number;
	children?: GoOutlineDeclaration[];
	signature?: GoOutlineRange;
	comment?: GoOutlineRange;
}

function documentSymbolToSymbolStat(decl: GoOutlineDeclaration): TreeViewNode {
	const children = decl.children && decl.children.length > 0
								 ? decl.children.map(documentSymbolToSymbolStat)
								 : [];

  return new TreeViewNode(decl.label, decl.type, decl.start, decl.end, children);
}

export function documentSymbols(filename: string): Promise<TreeViewNode[]> {
	return new Promise<GoOutlineDeclaration[]>((resolve, reject) => {
		let gooutline = getBinPath('go-outline');
		// Spawn `go-outline` process
		let p = cp.execFile(gooutline, ['-f', filename], {}, (err, stdout, stderr) => {
			try {
				if (err && (<any>err).code === 'ENOENT') {
					console.log('Go-outline not installed');
					// promptForMissingTool('go-outline');
				}
				if (err) return resolve(null);
				let result = stdout.toString();
				let decls = <GoOutlineDeclaration[]>JSON.parse(result);
				let symbols = decls.map(documentSymbolToSymbolStat);
				return resolve(symbols);
			} catch (e) {
				reject(e);
			}
		});
	});
}