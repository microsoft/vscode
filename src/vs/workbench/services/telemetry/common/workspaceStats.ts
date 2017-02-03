/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import winjs = require('vs/base/common/winjs.base');
import errors = require('vs/base/common/errors');
import URI from 'vs/base/common/uri';
import { ArraySet } from 'vs/base/common/set';
import { IFileService } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IOptions } from 'vs/workbench/common/options';

const SshProtocolMatcher = /^([^@:]+@)?([^:]+):/;
const SecondLevelDomainMatcher = /([^@:.]+\.[^@:.]+)(:\d+)?$/;
const RemoteMatcher = /^\s*url\s*=\s*(.+\S)\s*$/mg;
const AnyButDot = /[^.]/g;
const SecondLevelDomainWhitelist = [
	'github.com',
	'bitbucket.org',
	'visualstudio.com',
	'gitlab.com',
	'heroku.com',
	'azurewebsites.net',
	'ibm.com',
	'amazon.com',
	'amazonaws.com',
	'cloudapp.net',
	'rhcloud.com',
	'google.com'
];

type Tags = { [index: string]: boolean | number };

function stripLowLevelDomains(domain: string): string {
	let match = domain.match(SecondLevelDomainMatcher);
	return match ? match[1] : null;
}

function extractDomain(url: string): string {
	if (url.indexOf('://') === -1) {
		let match = url.match(SshProtocolMatcher);
		if (match) {
			return stripLowLevelDomains(match[2]);
		}
	}
	try {
		let uri = URI.parse(url);
		if (uri.authority) {
			return stripLowLevelDomains(uri.authority);
		}
	} catch (e) {
		// ignore invalid URIs
	}
	return null;
}

export function getDomainsOfRemotes(text: string, whitelist: string[]): string[] {
	let domains = new ArraySet<string>();
	let match: RegExpExecArray;
	while (match = RemoteMatcher.exec(text)) {
		let domain = extractDomain(match[1]);
		if (domain) {
			domains.set(domain);
		}
	}

	const whitemap = whitelist.reduce((map, key) => {
		map[key] = true;
		return map;
	}, Object.create(null));

	return domains.elements
		.map(key => whitemap[key] ? key : key.replace(AnyButDot, 'a'));
}

export class WorkspaceStats {
	constructor(
		@IFileService private fileService: IFileService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
	}

	private searchArray(arr: string[], regEx: RegExp): boolean {
		return arr.some(v => v.search(regEx) > -1) || undefined;
	}

	private getWorkspaceTags(workbenchOptions: IOptions): winjs.TPromise<Tags> {
		const tags: Tags = Object.create(null);

		const { filesToOpen, filesToCreate, filesToDiff } = workbenchOptions;
		tags['workbench.filesToOpen'] = filesToOpen && filesToOpen.length || undefined;
		tags['workbench.filesToCreate'] = filesToCreate && filesToCreate.length || undefined;
		tags['workbench.filesToDiff'] = filesToDiff && filesToDiff.length || undefined;

		const workspace = this.contextService.getWorkspace();
		tags['workspace.empty'] = !workspace;

		const folder = workspace ? workspace.resource : this.environmentService.appQuality !== 'stable' && this.findFolder(workbenchOptions);
		if (folder && this.fileService) {
			return this.fileService.resolveFile(folder).then(stats => {
				let names = (stats.children || []).map(c => c.name);

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
			return winjs.TPromise.as(tags);
		}
	}

	private findFolder({ filesToOpen, filesToCreate, filesToDiff }: IOptions): URI {
		if (filesToOpen && filesToOpen.length) {
			return this.parentURI(filesToOpen[0].resource);
		} else if (filesToCreate && filesToCreate.length) {
			return this.parentURI(filesToCreate[0].resource);
		} else if (filesToDiff && filesToDiff.length) {
			return this.parentURI(filesToDiff[0].resource);
		}
		return undefined;
	}

	private parentURI(uri: URI): URI {
		const path = uri.path;
		const i = path.lastIndexOf('/');
		return i !== -1 ? uri.with({ path: path.substr(0, i) }) : undefined;
	}

	public reportWorkspaceTags(workbenchOptions: IOptions): void {
		this.getWorkspaceTags(workbenchOptions).then((tags) => {
			this.telemetryService.publicLog('workspce.tags', tags);
		}, error => errors.onUnexpectedError(error));
	}

	private reportRemotes(workspaceUri: URI): void {
		let uri = workspaceUri.with({ path: `${workspaceUri.path}/.git/config` });
		this.fileService.resolveContent(uri, { acceptTextOnly: true }).then(
			content => {
				let domains = getDomainsOfRemotes(content.value, SecondLevelDomainWhitelist);
				this.telemetryService.publicLog('workspace.remotes', { domains });
			},
			err => {
				// ignore missing or binary file
			}
		).then(null, errors.onUnexpectedError);
	}

	private reportAzureNode(workspaceUri: URI, tags: Tags): winjs.TPromise<Tags> {
		// TODO: should also work for `node_modules` folders several levels down
		let uri = workspaceUri.with({ path: `${workspaceUri.path}/node_modules` });
		return this.fileService.resolveFile(uri).then(
			stats => {
				let names = (stats.children || []).map(c => c.name);
				let referencesAzure = this.searchArray(names, /azure/i);
				if (referencesAzure) {
					tags['node'] = true;
				}
				return tags;
			},
			err => {
				return tags;
			});
	}

	private reportAzureJava(workspaceUri: URI, tags: Tags): winjs.TPromise<Tags> {
		let uri = workspaceUri.with({ path: `${workspaceUri.path}/pom.xml` });
		return this.fileService.resolveContent(uri, { acceptTextOnly: true }).then(
			content => {
				let referencesAzure = content.value.match(/azure/i) !== null;
				if (referencesAzure) {
					tags['java'] = true;
				}
				return tags;
			},
			err => {
				return tags;
			}
		);
	}

	private reportAzure(uri: URI) {
		const tags: Tags = Object.create(null);
		this.reportAzureNode(uri, tags).then((tags) => {
			return this.reportAzureJava(uri, tags);
		}).then((tags) => {
			if (Object.keys(tags).length) {
				this.telemetryService.publicLog('workspace.azure', tags);
			}
		}).then(null, errors.onUnexpectedError);
	}

	public reportCloudStats(): void {
		const workspace = this.contextService.getWorkspace();
		let uri = workspace ? workspace.resource : null;
		if (uri && this.fileService) {
			this.reportRemotes(uri);
			this.reportAzure(uri);
		}
	}
}