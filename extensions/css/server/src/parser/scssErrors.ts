/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from './cssNodes';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export class SCSSIssueType implements nodes.IRule {
	id: string;
	message: string;

	public constructor(id: string, message: string) {
		this.id = id;
		this.message = message;
	}
}

export var SCSSParseError = {
	FromExpected: new SCSSIssueType('sass-fromexpected', localize('expected.from', "'from' expected")),
	ThroughOrToExpected: new SCSSIssueType('sass-throughexpected', localize('expected.through', "'through' or 'to' expected")),
	InExpected: new SCSSIssueType('sass-fromexpected', localize('expected.in', "'in' expected")),
};
