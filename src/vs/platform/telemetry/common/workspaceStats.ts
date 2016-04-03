/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import winjs = require('vs/base/common/winjs.base');
import errors = require('vs/base/common/errors');
import {IFileService} from 'vs/platform/files/common/files';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

export class WorkspaceStats {
	constructor(
		@IFileService private fileService: IFileService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
	}

	private searchArray(arr: string[], regEx: RegExp): boolean {
		return arr.some(v => v.search(regEx) > -1);
	}

	private getWorkspaceTags(): winjs.TPromise<{ [index: string]: boolean }> {
		let tags: { [index: string]: boolean } = Object.create(null);
		let workspace = this.contextService.getWorkspace();

		if (workspace && this.fileService) {
			return this.fileService.resolveFile(workspace.resource).then(stats => {
				let names = stats.children.map(c => c.name);

				tags['workspace.empty'] = false;

				tags['workspace.language.cs'] = this.searchArray(names, /^.+\.cs$/i);
				tags['workspace.language.js'] = this.searchArray(names, /^.+\.js$/i);
				tags['workspace.language.ts'] = this.searchArray(names, /^.+\.ts$/i);
				tags['workspace.language.php'] = this.searchArray(names, /^.+\.php$/i);
				tags['workspace.language.python'] = this.searchArray(names, /^.+\.py$/i);
				tags['workspace.language.vb'] = this.searchArray(names, /^.+\.vb$/i);
				tags['workspace.language.aspx'] = this.searchArray(names, /^.+\.aspx$/i);

				tags['workspace.grunt'] = this.searchArray(names, /^gruntfile\.js$/i);
				tags['workspace.gulp'] = this.searchArray(names, /^gulpfile\.js$/i);
				tags['workspace.jake'] = this.searchArray(names, /^jakefile\.js$/i);

				tags['workspace.tsconfig'] = this.searchArray(names, /^tsconfig\.json$/i);
				tags['workspace.jsconfig'] = this.searchArray(names, /^jsconfig\.json$/i);
				tags['workspace.config.xml'] = this.searchArray(names, /^config\.xml/i);
				tags['workspace.vsc.extension'] = this.searchArray(names, /^vsc-extension-quickstart\.md/i);

				tags['workspace.ASP5'] = this.searchArray(names, /^project\.json$/i) && tags['workspace.language.cs'];
				tags['workspace.sln'] = this.searchArray(names, /^.+\.sln$|^.+\.csproj$/i);
				tags['workspace.unity'] = this.searchArray(names, /^Assets$/i) && this.searchArray(names, /^Library$/i) && this.searchArray(names, /^ProjectSettings/i);
				tags['workspace.npm'] = this.searchArray(names, /^package\.json$|^node_modules$/i);
				tags['workspace.bower'] = this.searchArray(names, /^bower\.json$|^bower_components$/i);

				tags['workspace.yeoman.code'] = this.searchArray(names, /^vscodequickstart\.md$/i);
				tags['workspace.yeoman.code.ext'] = this.searchArray(names, /^vsc-extension-quickstart\.md$/i);

				let mainActivity = this.searchArray(names, /^MainActivity\.cs$/i) || this.searchArray(names, /^MainActivity\.fs$/i);
				let appDelegate = this.searchArray(names, /^AppDelegate\.cs$/i) || this.searchArray(names, /^AppDelegate\.fs$/i);
				let androidManifest = this.searchArray(names, /^AndroidManifest\.xml$/i);

				let platforms = this.searchArray(names, /^platforms$/i);
				let plugins = this.searchArray(names, /^plugins$/i);
				let www = this.searchArray(names, /^www$/i);
				let properties = this.searchArray(names, /^Properties/i);
				let resources = this.searchArray(names, /^Resources/i);
				let jni = this.searchArray(names, /^JNI/i);

				if (tags['workspace.config.xml'] &&
					!tags['workspace.language.cs'] && !tags['workspace.language.vb'] && !tags['workspace.language.aspx']) {
					if (platforms && plugins && www) {
						tags['workspace.cordova.high'] = true;
					} else {
						tags['workspace.cordova.low'] = true;
					}
				}

				if (mainActivity && properties && resources) {
					tags['workspace.xamarin.android'] = true;
				}

				if (appDelegate && resources) {
					tags['workspace.xamarin.ios'] = true;
				}

				if (androidManifest && jni) {
					tags['workspace.android.cpp'] = true;
				}

				tags['workspace.reactNative'] = this.searchArray(names, /^android$/i) && this.searchArray(names, /^ios$/i) &&
					this.searchArray(names, /^index\.android\.js$/i) && this.searchArray(names, /^index\.ios\.js$/i);

				return tags;
			}, error => { errors.onUnexpectedError(error); return null; });
		} else {
			tags['workspace.empty'] = true;
			return winjs.TPromise.as(tags);
		}
	}

	public reportWorkspaceTags(): void {
		this.getWorkspaceTags().then((tags) => {
			this.telemetryService.publicLog('workspce.tags', tags);
		}, error => errors.onUnexpectedError(error));
	}
}