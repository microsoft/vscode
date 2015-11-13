/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');
import rewriter = require('vs/languages/typescript/common/js/rewriting');

export class GlobalVariableCollector implements rewriter.ISyntaxRewriter {

	public get name() {
		return 'rewriter.globalVariables';
	}

	private _pattern = /(\/\* ?globals? )([\s\S]+?)\*\//gm;

	computeEdits(context: rewriter.AnalyzerContext): void {

		this._pattern.lastIndex = 0;

		var text = context.sourceFile.getFullText(),
			match: RegExpExecArray,
			declares: string[] = [];

		while ((match = this._pattern.exec(text))) {

			match[2].split(',').forEach(part => {
				part = part.trim();
				var colonIdx = part.indexOf(':');
				part = part.substring(0, ~colonIdx ? colonIdx : undefined);

				declares.push(strings.format('declare var {0}:any;\n', part));
			});

			context.newAppend(declares.join(strings.empty));
		}
	}
}