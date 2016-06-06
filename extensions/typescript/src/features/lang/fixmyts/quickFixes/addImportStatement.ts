/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from atom-typescript project, obtained from
 * https://github.com/TypeStrong/atom-typescript/tree/master/lib/main/lang
 * ------------------------------------------------------------------------------------------ */

import {QuickFix, QuickFixQueryInformation, Refactoring, CanProvideFixResponse} from "../quickFix";
import {getPathCompletionsForImport} from "../../utils";
import {EOL } from "os";
import * as ts from "typescript";


function getIdentifierAndFileNames(error: ts.Diagnostic, info: QuickFixQueryInformation) {

	var errorText: string = <any>error.messageText;

	// We don't support error chains yet
	if (typeof errorText !== 'string') {
		return undefined;
	};

	var match = errorText.match(/Cannot find name \'(\w+)\'./);

	// If for whatever reason the error message doesn't match
	if (!match) {
		return null;
	}

	var [, identifierName] = match;
	var result = getPathCompletionsForImport({
		prefix: identifierName,
		allFiles: info.program.getRootFileNames(),
		program: info.program,
		filePath: error.file.fileName,
		sourceFile: info.sourceFile
	});
	const files = result.map(x => x.pathCompletion);
	var file = files.length > 0 ? files[0].relativePath : undefined;
	var basename = files.length > 0 ? files[0].fileName : undefined;
	return { identifierName, file, basename };
}

export class AddImportStatement implements QuickFix {
	key = 'AddImportStatement';

	canProvideFix(info: QuickFixQueryInformation): CanProvideFixResponse {
		var relevantError = info.positionErrors.filter(x => x.code === 2304)[0];
		if (!relevantError) {
			return null;
		}
		if (info.positionNode.kind !== ts.SyntaxKind.Identifier) {
			return null;
		}
		var matches = getIdentifierAndFileNames(relevantError, info);
		if (!matches) {
			return null;
		}

		var { identifierName, file} = matches;
		return file ? { display: `import ${identifierName} = require(\"${file}\")` } : undefined;
	}

	provideFix(info: QuickFixQueryInformation): Refactoring[] {
		var relevantError = info.positionErrors.filter(x => x.code === 2304)[0];
		var identifier = <ts.Identifier>info.positionNode;

		var identifierName = identifier.text;
		var fileNameforFix = getIdentifierAndFileNames(relevantError, info);

		// Add stuff at the top of the file
		let refactorings: Refactoring[] = [{
			span: {
				start: 0,
				length: 0
			},
			newText: `import ${identifierName} = require(\"${fileNameforFix.file}\");${EOL}`,
			filePath: info.sourceFile.fileName
		}];

		// Also refactor the variable name to match the file name
		// TODO: the following code only takes into account location
		// There may be other locations where this is used.
		// Better that they trigger a *rename* explicitly later if they want to rename the variable
		// if (identifierName !== fileNameforFix.basename) {
		//	 refactorings.push({
		//		 span: {
		//			 start: identifier.getStart(),
		//			 length: identifier.end - identifier.getStart()
		//		 },
		//		 newText: fileNameforFix.basename,
		//		 filePath: info.srcFile.fileName
		//	 })
		// }

		return refactorings;
	}
}
