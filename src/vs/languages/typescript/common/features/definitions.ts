/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import * as network from 'vs/base/common/network';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import * as Modes from 'vs/editor/common/modes';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';
import * as projectService from 'vs/languages/typescript/common/project/projectService';

export function findDeclaration(project: projectService.IProject, resource: URI, position: EditorCommon.IPosition): Modes.IReference {

	var filename = resource.toString(),
		offset = project.host.getScriptLineMap(filename).getOffset(position);

	var infos = project.languageService.getDefinitionAtPosition(filename, offset);
	if (!infos || infos.length === 0) {
		return null;
	}

	// TODO@joh - how to handle multiple definitions
	var info = infos[0];

	if (!info.fileName) {
		// likely to be a primitive type
		return null;
	}

	return {
		resource: URI.parse(info.fileName),
		range: project.host.getScriptLineMap(info.fileName).getRangeFromSpan(info.textSpan)
	};
}
