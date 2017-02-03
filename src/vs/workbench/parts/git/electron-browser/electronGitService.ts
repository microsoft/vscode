/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IRawGitService, RawServiceState, IGitConfiguration } from 'vs/workbench/parts/git/common/git';
import { UnscopedGitService } from 'vs/workbench/parts/git/node/unscopedGitService';
import { GitService } from 'vs/workbench/parts/git/browser/gitServices';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IOutputService } from 'vs/workbench/parts/output/common/output';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { getDelayedChannel, getNextTickChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';
import { GitChannelClient, UnavailableGitChannel } from 'vs/workbench/parts/git/common/gitIpc';
import { RawGitService, DelayedRawGitService } from 'vs/workbench/parts/git/node/rawGitService';
import URI from 'vs/base/common/uri';
import { spawn, exec } from 'child_process';
import { join } from 'path';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { readdir } from 'vs/base/node/pfs';
import { IFileService } from 'vs/platform/files/common/files';

interface IGit {
	path: string;
	version: string;
}

function parseVersion(raw: string): string {
	return raw.replace(/^git version /, '');
}

function findSpecificGit(path: string): TPromise<IGit> {
	return new TPromise<IGit>((c, e) => {
		const buffers: Buffer[] = [];
		const child = spawn(path, ['--version']);
		child.stdout.on('data', b => buffers.push(b));
		child.on('error', e);
		child.on('exit', code => code ? e(new Error('Not found')) : c({ path, version: parseVersion(Buffer.concat(buffers).toString('utf8').trim()) }));
	});
}

function findGitDarwin(): TPromise<IGit> {
	return new TPromise<IGit>((c, e) => {
		exec('which git', (err, gitPathBuffer) => {
			if (err) {
				return e('git not found');
			}

			const path = gitPathBuffer.toString().replace(/^\s+|\s+$/g, '');

			function getVersion(path: string) {
				// make sure git executes
				exec('git --version', (err, stdout) => {
					if (err) {
						return e('git not found');
					}

					return c({ path, version: parseVersion(stdout.toString('utf8').trim()) });
				});
			}

			if (path !== '/usr/bin/git') {
				return getVersion(path);
			}

			// must check if XCode is installed
			exec('xcode-select -p', (err: any) => {
				if (err && err.code === 2) {
					// git is not installed, and launching /usr/bin/git
					// will prompt the user to install it

					return e('git not found');
				}

				getVersion(path);
			});
		});
	});
}

function findSystemGitWin32(base: string): TPromise<IGit> {
	if (!base) {
		return TPromise.wrapError('Not found');
	}

	return findSpecificGit(join(base, 'Git', 'cmd', 'git.exe'));
}

function findGitHubGitWin32(): TPromise<IGit> {
	const github = join(process.env['LOCALAPPDATA'], 'GitHub');

	return readdir(github).then(children => {
		const git = children.filter(child => /^PortableGit/.test(child))[0];

		if (!git) {
			return TPromise.wrapError('Not found');
		}

		return findSpecificGit(join(github, git, 'cmd', 'git.exe'));
	});
}

function findGitWin32(): TPromise<IGit> {
	return findSystemGitWin32(process.env['ProgramW6432'])
		.then(null, () => findSystemGitWin32(process.env['ProgramFiles(x86)']))
		.then(null, () => findSystemGitWin32(process.env['ProgramFiles']))
		.then(null, () => findSpecificGit('git'))
		.then(null, () => findGitHubGitWin32());
}

function findGit(hint: string): TPromise<IGit> {
	var first = hint ? findSpecificGit(hint) : TPromise.wrapError(null);

	return first.then(null, () => {
		switch (process.platform) {
			case 'darwin': return findGitDarwin();
			case 'win32': return findGitWin32();
			default: return findSpecificGit('git');
		}
	});
}

class DisabledRawGitService extends RawGitService {
	constructor() {
		super(null);
	}

	serviceState(): TPromise<RawServiceState> {
		return TPromise.as(RawServiceState.Disabled);
	}
}

function createRemoteRawGitService(gitPath: string, execPath: string, workspaceRoot: string, encoding: string, verbose: boolean): IRawGitService {
	const promise = TPromise.timeout(0) // free event loop cos finding git costs
		.then(() => findGit(gitPath))
		.then(({ path, version }) => {
			const client = new Client(
				URI.parse(require.toUrl('bootstrap')).fsPath,
				{
					serverName: 'Git',
					timeout: 1000 * 60,
					args: [path, workspaceRoot, encoding, execPath, version],
					env: {
						ELECTRON_RUN_AS_NODE: 1,
						PIPE_LOGGING: 'true',
						AMD_ENTRYPOINT: 'vs/workbench/parts/git/node/gitApp',
						VERBOSE_LOGGING: String(verbose)
					}
				}
			);

			return client.getChannel('git');
		})
		.then(null, () => new UnavailableGitChannel());

	const channel = getNextTickChannel(getDelayedChannel(promise));
	return new GitChannelClient(channel);
}

interface IRawGitServiceBootstrap {
	createRawGitService(gitPath: string, workspaceRoot: string, defaultEncoding: string, exePath: string, version: string): TPromise<IRawGitService>;
}

function createRawGitService(gitPath: string, execPath: string, workspaceRoot: string, encoding: string, verbose: boolean): IRawGitService {
	const requirePromise = new TPromise<IRawGitServiceBootstrap>((c, e) => {
		return require(['vs/workbench/parts/git/node/rawGitServiceBootstrap'], c, e);
	});

	const servicePromise = requirePromise.then(({ createRawGitService }) => {
		return findGit(gitPath)
			.then(({ path, version }) => createRawGitService(path, workspaceRoot, encoding, execPath, version))
			.then(null, () => new RawGitService(null));
	});

	return new DelayedRawGitService(servicePromise);
}

function createUnscopedRawGitService(gitPath: string, execPath: string, encoding: string): IRawGitService {
	const promise = findGit(gitPath)
		.then(({ path, version }) => new UnscopedGitService(path, version, encoding, execPath))
		.then(null, () => new RawGitService(null));

	return new DelayedRawGitService(promise);
}

export class ElectronGitService extends GitService {

	private static USE_REMOTE_PROCESS_SERVICE = true;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService fileService: IFileService,
		@IMessageService messageService: IMessageService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IOutputService outputService: IOutputService,
		@ITextFileService textFileService: ITextFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IStorageService storageService: IStorageService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		const conf = configurationService.getConfiguration<IGitConfiguration>('git');
		const filesConf = configurationService.getConfiguration<any>('files');
		const workspace = contextService.getWorkspace();
		const gitPath = conf.path || null;
		const encoding = (filesConf && filesConf.encoding) || 'utf8';
		const verbose = !environmentService.isBuilt || environmentService.verbose;

		let raw: IRawGitService;

		if (!conf.enabled) {
			raw = new DisabledRawGitService();
		} else if (!workspace) {
			raw = createUnscopedRawGitService(gitPath, environmentService.execPath, encoding);
		} else {
			const workspaceRoot = workspace.resource.fsPath;

			if (ElectronGitService.USE_REMOTE_PROCESS_SERVICE) {
				raw = createRemoteRawGitService(gitPath, environmentService.execPath, workspaceRoot, encoding, verbose);
			} else {
				raw = createRawGitService(gitPath, environmentService.execPath, workspaceRoot, encoding, verbose);
			}
		}

		super(raw, instantiationService, fileService, messageService, editorService, outputService, textFileService, contextService, lifecycleService, storageService, configurationService);
	}
}
