/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as paths from 'path';
import {EventEmitter} from 'events';
import {Uri, workspace} from 'vscode';

export interface LaunchTarget {
	label: string;
	description: string;
	directory: Uri;
	resource: Uri;
	target: Uri;
}


export default function getLaunchTargets(): Thenable<LaunchTarget[]> {
	return workspace.findFiles('{**/*.sln,**/*.csproj,**/project.json}', '{**/node_modules/**,**/.git/**,**/bower_components/**}', 100).then(resources => {
		return select(resources, Uri.file(workspace.rootPath));
	});
}

function select(resources: Uri[], root: Uri): LaunchTarget[] {

	if (!Array.isArray(resources)) {
		return [];
	}

	var targets: LaunchTarget[] = [],
		hasCsProjFiles = false,
		hasProjectJson = false,
		hasProjectJsonAtRoot = false;

	hasCsProjFiles = resources
		.some(resource => /\.csproj$/.test(resource.fsPath));

	resources.forEach(resource => {

		// sln files
		if (hasCsProjFiles && /\.sln$/.test(resource.fsPath)) {
			targets.push({
				label: paths.basename(resource.fsPath),
				description: workspace.asRelativePath(paths.dirname(resource.fsPath)),
				resource,
				target: resource,
				directory: Uri.file(paths.dirname(resource.fsPath))
			});
		}

		// project.json files
		if (/project.json$/.test(resource.fsPath)) {

			var dirname = paths.dirname(resource.fsPath);
			hasProjectJson = true;
			hasProjectJsonAtRoot = hasProjectJsonAtRoot || dirname === root.fsPath;

			targets.push({
				label: paths.basename(resource.fsPath),
				description: workspace.asRelativePath(paths.dirname(resource.fsPath)),
				resource,
				target: Uri.file(dirname),
				directory: Uri.file(dirname)
			});
		}
	});

	if (hasProjectJson && !hasProjectJsonAtRoot) {
		targets.push({
			label: paths.basename(root.fsPath),
			description: '',
			resource: root,
			target: root,
			directory: root
		});
	}

	return targets.sort((a, b) => a.directory.fsPath.localeCompare(b.directory.fsPath));
}

