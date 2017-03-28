/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import { join, dirname } from 'path';
import * as Lint from 'tslint';

export class Rule extends Lint.Rules.AbstractRule {
	public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
		return this.applyWithWalker(new ImportPatterns(sourceFile, this.getOptions()));
	}
}

class ImportPatterns extends Lint.RuleWalker {

	private imports: { [path: string]: boolean; } = Object.create(null);

	constructor(file: ts.SourceFile, opts: Lint.IOptions) {
		super(file, opts);
	}

	protected visitImportDeclaration(node: ts.ImportDeclaration): void {
		let path = node.moduleSpecifier.getText();

		// remove quotes
		path = path.slice(1, -1);

		if (path[0] === '.') {
			path = join(dirname(node.getSourceFile().fileName), path);
		}

		if (this.imports[path]) {
			this.addFailure(this.createFailure(node.getStart(), node.getWidth(), `Duplicate imports for '${path}'.`));
		}

		this.imports[path] = true;
	}
}
