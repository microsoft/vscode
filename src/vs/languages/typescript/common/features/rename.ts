/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import typescript = require('vs/languages/typescript/common/typescript');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import projectService = require('vs/languages/typescript/common/project/projectService');

function rename(project: projectService.IProject, resource: URI, position: EditorCommon.IPosition, newName: string): Modes.IRenameResult {

	var filename = resource.toString(),
		offset = project.host.getScriptLineMap(filename).getOffset(position),
		renameInfo: ts.RenameInfo,
		result: Modes.IRenameResult;

	renameInfo = project.languageService.getRenameInfo(filename, offset);

	result = <Modes.IRenameResult> {
		currentName: renameInfo.displayName,
		edits: []
	};

	if (!renameInfo.canRename) {
		result.rejectReason = renameInfo.localizedErrorMessage;
		return result;
	}

	result.edits = project.languageService.findRenameLocations(filename, offset, false, false)
		.filter(location => {
			return !typescript.isDefaultLib(location.fileName);
		})
		.map(location => {
			return {
				resource: URI.parse(location.fileName),
				newText: newName,
				range: project.host.getScriptLineMap(location.fileName).getRangeFromSpan(location.textSpan)
			};
		});

	return result;
}

export = rename;