/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import projectService = require('vs/languages/typescript/common/project/projectService');

export function find(project: projectService.IProject, resource: URI, position: EditorCommon.IPosition, includeDecl: boolean, insideFileOnly: boolean = false): Modes.IReference[] {

	var filename = resource.toString(),
		offset = project.host.getScriptLineMap(filename).getOffset(position),
		entries: ts.ReferenceEntry[];

	entries = insideFileOnly
		? project.languageService.getOccurrencesAtPosition(filename, offset)
		: project.languageService.getReferencesAtPosition(filename, offset);

	if(!entries) {
		return [];
	}

	return entries.filter(info => {
		var targetFile = project.languageService.getSourceFile(info.fileName);
		return (includeDecl || !isDeclaration(targetFile, info.textSpan.start));
	}).map(info => {
		var r:Modes.IReference = {
			resource: URI.parse(info.fileName),
			range: project.host.getScriptLineMap(info.fileName).getRangeFromSpan(info.textSpan)
		};
		return r;
	});
}

function isDeclaration(sourceFile:ts.SourceFile, offset: number) : boolean {
	var parent = ts.getTokenAtPosition(sourceFile, offset).parent; // offset,len points to name
	return parent && ts.isDeclaration(parent);
}