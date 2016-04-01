/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import fs = require('fs');
import path = require('path');

/**
 * ExcludedFilesService
 */
export class ExcludedFilesService {

	excludedFilesConfig = {};
	workspacePath = '';

	/**
	 * Needs the current workspace and the excluded files configuration
	 *
	 */
	constructor(workspacePath:string, excludedFilesConfig) {
		this.excludedFilesConfig = excludedFilesConfig;
		this.workspacePath = workspacePath;
	}

	/**
	 * Retrieves and processes excluded files config, also based on the
	 * VCS (.gitignore, etc) files are excluded as well
	 *
	 */
	retrieve():any {
		if (typeof this.excludedFilesConfig['VCS'] !== 'undefined') {
			if (this.excludedFilesConfig['VCS'] === true) {
				this.retrieveGitIgnored();
			}
			delete this.excludedFilesConfig['VCS'];
		}
		return this.excludedFilesConfig;
	}

	/**
	 * Processes .gitignore, if entry "VCS": true is set on files.exclude from settings file
	 * and adds them to the excludes object
	 *
	 */
	private retrieveGitIgnored() {
		var gitignorePath = this.workspacePath + path.sep + '.gitignore';
		if (fs.existsSync(gitignorePath)) {
			var contents = fs.readFileSync(gitignorePath).toString();
			var entriesList = contents.split(/\r?\n/);
			entriesList.forEach(entry => this.excludedFilesConfig[entry] = true);
		}
	}
}