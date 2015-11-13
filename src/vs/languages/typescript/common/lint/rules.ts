/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import ts = require('vs/languages/typescript/common/lib/typescriptServices');

export interface IRuleContext {
	/**
	 * Report an error to a syntax element.
	 */
	reportError(node:ts.Node, message: string, code: string, position?: number, width?: number):void;
}

export interface IRuleContext2 extends IRuleContext {
	filename():string;
	languageService():ts.LanguageService;
}

export interface IStyleRule<T extends ts.Node> {
	code:string;
	name:string;
	filter?:ts.SyntaxKind[];
	checkNode(node:T, context:IRuleContext, position?:number):void;
}

export interface IStyleRule2<T extends ts.Node> extends IStyleRule<T> {
	checkNode(node:T, context:IRuleContext2, position?:number):void;
}
