/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import nodes = require('vs/languages/css/common/parser/cssNodes');

export class SassIssueType implements nodes.IRule {
	id: string;
	message: string;

	public constructor(id:string, message: string) {
		this.id = id;
		this.message = message;
	}
}

export var ParseError = {
	FromExpected: new SassIssueType('sass-fromexpected', nls.localize('expected.from', "'from' expected")),
	ThroughOrToExpected: new SassIssueType('sass-throughexpected', nls.localize('expected.through', "'through' or 'to' expected")),
	InExpected: new SassIssueType('sass-fromexpected', nls.localize('expected.in', "'in' expected")),
};
