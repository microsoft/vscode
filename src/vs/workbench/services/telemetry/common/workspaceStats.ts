/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as crypto from 'crypto';
import { TPromise } from 'vs/base/common/winjs.base';
import { onUnexpectedError } from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { IFileService, IFileStat } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';

const SshProtocolMatcher = /^([^@:]+@)?([^:]+):/;
const SshUrlMatcher = /^([^@:]+@)?([^:]+):(.+)$/;
const AuthorityMatcher = /^([^@]+@)?([^:]+)(:\d+)?$/;
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
	let domains = new Set<string>();
	let match: RegExpExecArray;
	while (match = RemoteMatcher.exec(text)) {
		let domain = extractDomain(match[1]);
		if (domain) {
			domains.add(domain);
		}
	}

	const whitemap = whitelist.reduce((map, key) => {
		map[key] = true;
		return map;
	}, Object.create(null));

	const elements: string[] = [];
	domains.forEach(e => elements.push(e));

	return elements
		.map(key => whitemap[key] ? key : key.replace(AnyButDot, 'a'));
}

function stripPort(authority: string): string {
	const match = authority.match(AuthorityMatcher);
	return match ? match[2] : null;
}

function normalizeRemote(host: string, path: string): string {
	if (host && path) {
		return (path.indexOf('/') === 0) ? `${host}${path}` : `${host}/${path}`;
	}
	return null;
}

function extractRemote(url: string): string {
	if (url.indexOf('://') === -1) {
		const match = url.match(SshUrlMatcher);
		if (match) {
			return normalizeRemote(match[2], match[3]);
		}
	}
	try {
		const uri = URI.parse(url);
		if (uri.authority) {
			return normalizeRemote(stripPort(uri.authority), uri.path);
		}
	} catch (e) {
		// ignore invalid URIs
	}
	return null;
}

export function getRemotes(text: string): string[] {
	const remotes: string[] = [];
	let match: RegExpExecArray;
	while (match = RemoteMatcher.exec(text)) {
		const remote = extractRemote(match[1]);
		if (remote) {
			remotes.push(remote);
		}
	}
	return remotes;
}

export function getHashedRemotes(text: string): string[] {
	return getRemotes(text).map(r => {
		return crypto.createHash('sha1').update(r).digest('hex');
	});
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

	private getWorkspaceTags(configuration: IWindowConfiguration): TPromise<Tags> {
		const tags: Tags = Object.create(null);

		const { filesToOpen, filesToCreate, filesToDiff } = configuration;
		tags['workbench.filesToOpen'] = filesToOpen && filesToOpen.length || undefined;
		tags['workbench.filesToCreate'] = filesToCreate && filesToCreate.length || undefined;
		tags['workbench.filesToDiff'] = filesToDiff && filesToDiff.length || undefined;

		const workspace = this.contextService.getWorkspace();
		tags['workspace.roots'] = workspace ? workspace.roots.length : 0;
		tags['workspace.empty'] = !workspace;

		const folders = workspace ? workspace.roots : this.environmentService.appQuality !== 'stable' && this.findFolders(configuration);
		if (folders && folders.length && this.fileService) {
			return this.fileService.resolveFiles(folders.map(resource => ({ resource }))).then(results => {
				const names = (<IFileStat[]>[]).concat(...results.map(result => result.success ? (result.stat.children || []) : [])).map(c => c.name);

				tags['workspace.grunt'] = this.searchArray(names, /^gruntfile\.js$/i);
				tags['workspace.gulp'] = this.searchArray(names, /^gulpfile\.js$/i);
				tags['workspace.jake'] = this.searchArray(names, /^jakefile\.js$/i);

				tags['workspace.tsconfig'] = this.searchArray(names, /^tsconfig\.json$/i);
				tags['workspace.jsconfig'] = this.searchArray(names, /^jsconfig\.json$/i);
				tags['workspace.config.xml'] = this.searchArray(names, /^config\.xml/i);
				tags['workspace.vsc.extension'] = this.searchArray(names, /^vsc-extension-quickstart\.md/i);

				tags['workspace.ASP5'] = this.searchArray(names, /^project\.json$/i) && this.searchArray(names, /^.+\.cs$/i);
				tags['workspace.sln'] = this.searchArray(names, /^.+\.sln$|^.+\.csproj$/i);
				tags['workspace.unity'] = this.searchArray(names, /^Assets$/i) && this.searchArray(names, /^Library$/i) && this.searchArray(names, /^ProjectSettings/i);
				tags['workspace.npm'] = this.searchArray(names, /^package\.json$|^node_modules$/i);
				tags['workspace.bower'] = this.searchArray(names, /^bower\.json$|^bower_components$/i);

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
			}, error => { onUnexpectedError(error); return null; });
		} else {
			return TPromise.as(tags);
		}
	}

	private findFolders(configuration: IWindowConfiguration): URI[] {
		const folder = this.findFolder(configuration);
		return folder && [folder];
	}

	private findFolder({ filesToOpen, filesToCreate, filesToDiff }: IWindowConfiguration): URI {
		if (filesToOpen && filesToOpen.length) {
			return this.parentURI(URI.file(filesToOpen[0].filePath));
		} else if (filesToCreate && filesToCreate.length) {
			return this.parentURI(URI.file(filesToCreate[0].filePath));
		} else if (filesToDiff && filesToDiff.length) {
			return this.parentURI(URI.file(filesToDiff[0].filePath));
		}
		return undefined;
	}

	private parentURI(uri: URI): URI {
		const path = uri.path;
		const i = path.lastIndexOf('/');
		return i !== -1 ? uri.with({ path: path.substr(0, i) }) : undefined;
	}

	public reportWorkspaceTags(configuration: IWindowConfiguration): void {
		this.getWorkspaceTags(configuration).then((tags) => {
			this.telemetryService.publicLog('workspce.tags', tags);
		}, error => onUnexpectedError(error));
	}

	private reportRemoteDomains(workspaceUris: URI[]): void {
		TPromise.join<string[]>(workspaceUris.map(workspaceUri => {
			const path = workspaceUri.path;
			const uri = workspaceUri.with({ path: `${path !== '/' ? path : ''}/.git/config` });
			return this.fileService.resolveContent(uri, { acceptTextOnly: true }).then(
				content => getDomainsOfRemotes(content.value, SecondLevelDomainWhitelist),
				err => [] // ignore missing or binary file
			);
		})).then(domains => {
			const set = domains.reduce((set, list) => list.reduce((set, item) => set.add(item), set), new Set<string>());
			const list: string[] = [];
			set.forEach(item => list.push(item));
			this.telemetryService.publicLog('workspace.remotes', { domains: list.sort() });
		}, onUnexpectedError);
	}

	private reportRemotes(workspaceUris: URI[]): void {
		TPromise.join<string[]>(workspaceUris.map(workspaceUri => {
			let path = workspaceUri.path;
			let uri = workspaceUri.with({ path: `${path !== '/' ? path : ''}/.git/config` });
			return this.fileService.resolveContent(uri, { acceptTextOnly: true }).then(
				content => getHashedRemotes(content.value),
				err => [] // ignore missing or binary file
			);
		})).then(hashedRemotes => this.telemetryService.publicLog('workspace.hashedRemotes', { remotes: hashedRemotes }), onUnexpectedError);
	}

	private reportAzureNode(workspaceUris: URI[], tags: Tags): TPromise<Tags> {
		// TODO: should also work for `node_modules` folders several levels down
		const uris = workspaceUris.map(workspaceUri => {
			const path = workspaceUri.path;
			return workspaceUri.with({ path: `${path !== '/' ? path : ''}/node_modules` });
		});
		return this.fileService.resolveFiles(uris.map(resource => ({ resource }))).then(
			results => {
				const names = (<IFileStat[]>[]).concat(...results.map(result => result.success ? (result.stat.children || []) : [])).map(c => c.name);
				const referencesAzure = this.searchArray(names, /azure/i);
				if (referencesAzure) {
					tags['node'] = true;
				}
				return tags;
			},
			err => {
				return tags;
			});
	}

	private reportAzureJava(workspaceUris: URI[], tags: Tags): TPromise<Tags> {
		return TPromise.join(workspaceUris.map(workspaceUri => {
			const path = workspaceUri.path;
			const uri = workspaceUri.with({ path: `${path !== '/' ? path : ''}/pom.xml` });
			return this.fileService.resolveContent(uri, { acceptTextOnly: true }).then(
				content => !!content.value.match(/azure/i),
				err => false
			);
		})).then(javas => {
			if (javas.indexOf(true) !== -1) {
				tags['java'] = true;
			}
			return tags;
		});
	}

	private reportAzure(uris: URI[]) {
		const tags: Tags = Object.create(null);
		this.reportAzureNode(uris, tags).then((tags) => {
			return this.reportAzureJava(uris, tags);
		}).then((tags) => {
			if (Object.keys(tags).length) {
				this.telemetryService.publicLog('workspace.azure', tags);
			}
		}).then(null, onUnexpectedError);
	}

	public reportCloudStats(): void {
		const workspace = this.contextService.getWorkspace();
		const uris = workspace && workspace.roots;
		if (uris && uris.length && this.fileService) {
			this.reportRemoteDomains(uris);
			this.reportRemotes(uris);
			this.reportAzure(uris);
		}
	};
}
