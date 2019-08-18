/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import { onUnexpectedError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { IFileService, IFileStat } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { endsWith } from 'vs/base/common/strings';
import { ITextFileService, } from 'vs/workbench/services/textfile/common/textfiles';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { IWorkspaceStatsService, Tags } from 'vs/workbench/contrib/stats/common/workspaceStats';
import { IWorkspaceInformation } from 'vs/platform/diagnostics/common/diagnostics';

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

function stripLowLevelDomains(domain: string): string | null {
	const match = domain.match(SecondLevelDomainMatcher);
	return match ? match[1] : null;
}

function extractDomain(url: string): string | null {
	if (url.indexOf('://') === -1) {
		const match = url.match(SshProtocolMatcher);
		if (match) {
			return stripLowLevelDomains(match[2]);
		} else {
			return null;
		}
	}
	try {
		const uri = URI.parse(url);
		if (uri.authority) {
			return stripLowLevelDomains(uri.authority);
		}
	} catch (e) {
		// ignore invalid URIs
	}
	return null;
}

export function getDomainsOfRemotes(text: string, whitelist: string[]): string[] {
	const domains = new Set<string>();
	let match: RegExpExecArray | null;
	while (match = RemoteMatcher.exec(text)) {
		const domain = extractDomain(match[1]);
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

function stripPort(authority: string): string | null {
	const match = authority.match(AuthorityMatcher);
	return match ? match[2] : null;
}

function normalizeRemote(host: string | null, path: string, stripEndingDotGit: boolean): string | null {
	if (host && path) {
		if (stripEndingDotGit && endsWith(path, '.git')) {
			path = path.substr(0, path.length - 4);
		}
		return (path.indexOf('/') === 0) ? `${host}${path}` : `${host}/${path}`;
	}
	return null;
}

function extractRemote(url: string, stripEndingDotGit: boolean): string | null {
	if (url.indexOf('://') === -1) {
		const match = url.match(SshUrlMatcher);
		if (match) {
			return normalizeRemote(match[2], match[3], stripEndingDotGit);
		}
	}
	try {
		const uri = URI.parse(url);
		if (uri.authority) {
			return normalizeRemote(stripPort(uri.authority), uri.path, stripEndingDotGit);
		}
	} catch (e) {
		// ignore invalid URIs
	}
	return null;
}

export function getRemotes(text: string, stripEndingDotGit: boolean = false): string[] {
	const remotes: string[] = [];
	let match: RegExpExecArray | null;
	while (match = RemoteMatcher.exec(text)) {
		const remote = extractRemote(match[1], stripEndingDotGit);
		if (remote) {
			remotes.push(remote);
		}
	}
	return remotes;
}

export function getHashedRemotesFromConfig(text: string, stripEndingDotGit: boolean = false): string[] {
	return getRemotes(text, stripEndingDotGit).map(r => {
		return crypto.createHash('sha1').update(r).digest('hex');
	});
}

export class WorkspaceStats implements IWorkbenchContribution {

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWindowService private readonly windowService: IWindowService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ISharedProcessService private readonly sharedProcessService: ISharedProcessService,
		@IWorkspaceStatsService private readonly workspaceStatsService: IWorkspaceStatsService
	) {
		this.report();
	}

	private report(): void {

		// Workspace Stats
		this.workspaceStatsService.getTags()
			.then(tags => this.reportWorkspaceTags(tags), error => onUnexpectedError(error));

		// Cloud Stats
		this.reportCloudStats();

		this.reportProxyStats();

		const diagnosticsChannel = this.sharedProcessService.getChannel('diagnostics');
		diagnosticsChannel.call('reportWorkspaceStats', this.getWorkspaceInformation());
	}

	private getWorkspaceInformation(): IWorkspaceInformation {
		const workspace = this.contextService.getWorkspace();
		const state = this.contextService.getWorkbenchState();
		const id = this.workspaceStatsService.getTelemetryWorkspaceId(workspace, state);
		return {
			id: workspace.id,
			telemetryId: id,
			folders: workspace.folders,
			configuration: workspace.configuration
		};
	}

	private reportWorkspaceTags(tags: Tags): void {
		/* __GDPR__
			"workspce.tags" : {
				"${include}": [
					"${WorkspaceTags}"
				]
			}
		*/
		this.telemetryService.publicLog('workspce.tags', tags);
	}

	private reportRemoteDomains(workspaceUris: URI[]): void {
		Promise.all<string[]>(workspaceUris.map(workspaceUri => {
			const path = workspaceUri.path;
			const uri = workspaceUri.with({ path: `${path !== '/' ? path : ''}/.git/config` });
			return this.fileService.exists(uri).then(exists => {
				if (!exists) {
					return [];
				}
				return this.textFileService.read(uri, { acceptTextOnly: true }).then(
					content => getDomainsOfRemotes(content.value, SecondLevelDomainWhitelist),
					err => [] // ignore missing or binary file
				);
			});
		})).then(domains => {
			const set = domains.reduce((set, list) => list.reduce((set, item) => set.add(item), set), new Set<string>());
			const list: string[] = [];
			set.forEach(item => list.push(item));
			/* __GDPR__
				"workspace.remotes" : {
					"domains" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetryService.publicLog('workspace.remotes', { domains: list.sort() });
		}, onUnexpectedError);
	}

	private reportRemotes(workspaceUris: URI[]): void {
		Promise.all<string[]>(workspaceUris.map(workspaceUri => {
			return this.workspaceStatsService.getHashedRemotesFromUri(workspaceUri, true);
		})).then(hashedRemotes => {
			/* __GDPR__
					"workspace.hashedRemotes" : {
						"remotes" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
					}
				*/
			this.telemetryService.publicLog('workspace.hashedRemotes', { remotes: hashedRemotes });
		}, onUnexpectedError);
	}

	/* __GDPR__FRAGMENT__
		"AzureTags" : {
			"node" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		}
	*/
	private reportAzureNode(workspaceUris: URI[], tags: Tags): Promise<Tags> {
		// TODO: should also work for `node_modules` folders several levels down
		const uris = workspaceUris.map(workspaceUri => {
			const path = workspaceUri.path;
			return workspaceUri.with({ path: `${path !== '/' ? path : ''}/node_modules` });
		});
		return this.fileService.resolveAll(uris.map(resource => ({ resource }))).then(
			results => {
				const names = (<IFileStat[]>[]).concat(...results.map(result => result.success ? (result.stat!.children || []) : [])).map(c => c.name);
				const referencesAzure = WorkspaceStats.searchArray(names, /azure/i);
				if (referencesAzure) {
					tags['node'] = true;
				}
				return tags;
			},
			err => {
				return tags;
			});
	}

	private static searchArray(arr: string[], regEx: RegExp): boolean | undefined {
		return arr.some(v => v.search(regEx) > -1) || undefined;
	}

	/* __GDPR__FRAGMENT__
		"AzureTags" : {
			"java" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
		}
	*/
	private reportAzureJava(workspaceUris: URI[], tags: Tags): Promise<Tags> {
		return Promise.all(workspaceUris.map(workspaceUri => {
			const path = workspaceUri.path;
			const uri = workspaceUri.with({ path: `${path !== '/' ? path : ''}/pom.xml` });
			return this.fileService.exists(uri).then(exists => {
				if (!exists) {
					return false;
				}
				return this.textFileService.read(uri, { acceptTextOnly: true }).then(
					content => !!content.value.match(/azure/i),
					err => false
				);
			});
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
				/* __GDPR__
					"workspace.azure" : {
						"${include}": [
							"${AzureTags}"
						]
					}
				*/
				this.telemetryService.publicLog('workspace.azure', tags);
			}
		}).then(undefined, onUnexpectedError);
	}

	private reportCloudStats(): void {
		const uris = this.contextService.getWorkspace().folders.map(folder => folder.uri);
		if (uris.length && this.fileService) {
			this.reportRemoteDomains(uris);
			this.reportRemotes(uris);
			this.reportAzure(uris);
		}
	}

	private reportProxyStats() {
		this.windowService.resolveProxy('https://www.example.com/')
			.then(proxy => {
				let type = proxy ? String(proxy).trim().split(/\s+/, 1)[0] : 'EMPTY';
				if (['DIRECT', 'PROXY', 'HTTPS', 'SOCKS', 'EMPTY'].indexOf(type) === -1) {
					type = 'UNKNOWN';
				}
				type ResolveProxyStatsClassification = {
					type: { classification: 'SystemMetaData', purpose: 'PerformanceAndHealth' };
				};
				this.telemetryService.publicLog2<{ type: String }, ResolveProxyStatsClassification>('resolveProxy.stats', { type });
			}).then(undefined, onUnexpectedError);
	}
}
