/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import rewriter = require('vs/languages/typescript/common/js/rewriting');

class ShebangRewriter implements rewriter.ISyntaxRewriter {

	private static _hash = '#'.charCodeAt(0);
	private static _bang = '!'.charCodeAt(0);

	get name() {
		return 'rewriter.shebang';
	}

	computeEdits(context: rewriter.AnalyzerContext): void {
		var text = context.sourceFile.getFullText();
		if (text.charCodeAt(0) !== ShebangRewriter._hash || text.charCodeAt(1) !== ShebangRewriter._bang) {
			return;
		}
		var end = ~text.indexOf('\n') || ~text.indexOf('\r');
		end = !end ? text.length : ~end;
		context.newDelete(0, end);
	}
}

export = ShebangRewriter;