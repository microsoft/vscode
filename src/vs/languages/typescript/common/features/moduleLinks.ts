/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import modulePaths = require('vs/languages/typescript/common/modulePaths');
import converter = require('vs/languages/typescript/common/features/converter');

interface ILinkFinder {
	(sourceFile: ts.SourceFile, offset: number): { path: string; external: boolean; };
}

function tripleSlashLinkFinder(sourceFile: ts.SourceFile, offset: number): { path: string; external: boolean; } {
	// maybe inside ///-ref-comment
	for (var i = 0, len = sourceFile.referencedFiles.length; i < len; i++) {
		var reference = sourceFile.referencedFiles[i];
		if(offset >= reference.pos && offset < reference.end) {
			return {
				path: reference.fileName,
				external: false
			};
		}
	}
}

function importRequireLinkFinder(sourceFile: ts.SourceFile, offset: number): { path: string; external: boolean; } {
	// check string literals inside import declarations
	var token = ts.getTokenAtPosition(sourceFile, offset);
	if(token.kind === ts.SyntaxKind.StringLiteral && token.parent.kind === ts.SyntaxKind.ExternalModuleReference) {
		return {
			path: (<ts.StringLiteral> token).text,
			external: true
		};
	}
}

function requireFunctionLinkFinder(sourceFile: ts.SourceFile, offset: number): { path: string; external: boolean; } {
	// check string literals inside require-calls
	var token = ts.getTokenAtPosition(sourceFile, offset);
	if(token.kind !== ts.SyntaxKind.StringLiteral) {
		return;
	}
	if(token.parent.kind !== ts.SyntaxKind.CallExpression) {
		return;
	}
	if(ts.getTextOfNode((<ts.CallExpression> token.parent).expression) !== 'require') {
		return;
	}
	return {
		path: (<ts.StringLiteral> token).text,
		external: true
	};
}

function amdDependencyArrayLinkFinder(sourceFile: ts.SourceFile, offset: number): { path: string; external: boolean; } {
	// check string literals inside string arrays
	var token = ts.getTokenAtPosition(sourceFile, offset);
	if(token.kind !== ts.SyntaxKind.StringLiteral) {
		return;
	}
	if(token.parent.kind !== ts.SyntaxKind.ArrayLiteralExpression) {
		return;
	}
	return {
		path: (<ts.StringLiteral> token).text,
		external: true
	};
}

export function findLink(sourceFile:ts.SourceFile, filename:string, position:EditorCommon.IPosition,
	host:ts.LanguageServiceHost, moduleRoot:string):Modes.IReference {

	var offset = converter.getOffset(sourceFile, position),
		ref: { external: boolean; path: string;},
		finder = [tripleSlashLinkFinder, importRequireLinkFinder, requireFunctionLinkFinder, amdDependencyArrayLinkFinder];

	for (var i = 0; !ref && i < finder.length; i++) {
		ref = finder[i](sourceFile, offset);
	}

	if(!ref) {
		return null;
	}

	// potential paths
	var path = ref.external ?
		modulePaths.external(ref.path, filename, moduleRoot) :
		modulePaths.internal(ref.path, filename);

	var candidate:string;
	if(host.getScriptSnapshot(path.value)) {
		candidate = path.value;
	} else if(path.alternateValue && host.getScriptSnapshot(path.alternateValue)) {
		candidate = path.alternateValue;
	}

	if(!candidate) {
		return null;
	}

	return <Modes.IReference> {
		resource: URI.parse(candidate),
		range: { startLineNumber: 1, startColumn: 1, endLineNumber: Number.MAX_VALUE, endColumn: Number.MAX_VALUE }
	};
}
