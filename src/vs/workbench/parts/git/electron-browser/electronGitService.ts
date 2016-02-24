/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promise, TPromise } from 'vs/base/common/winjs.base';
import { RawServiceState } from 'vs/workbench/parts/git/common/git';
import { NoOpGitService } from 'vs/workbench/parts/git/common/noopGitService';
import { GitService } from 'vs/workbench/parts/git/browser/gitServices';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IOutputService } from 'vs/workbench/parts/output/common/output';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEventService } from 'vs/platform/event/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Client } from 'vs/base/node/service.cp';
import { RawGitService, DelayedRawGitService } from 'vs/workbench/parts/git/node/rawGitService';
import URI from 'vs/base/common/uri';
import { spawn, exec } from 'child_process';
import { join } from 'path';
import { remote } from 'electron';

function findSpecificGit(gitPath: string): Promise {
	return new Promise((c, e) => {
		var child = spawn(gitPath, ['--version']);
		child.on('error', e);
		child.on('exit', (code: number) => code ? e(new Error('Not found')) : c(gitPath));
	});
}

function findGitDarwin(): Promise {
	return new Promise((c, e) => {
		exec('which git', (err, gitPathBuffer) => {
			if (err) {
				return e('git not found');
			}

			let gitPath = gitPathBuffer.toString().replace(/^\s+|\s+$/g, '');

			if (gitPath !== '/usr/bin/git')	{
				return c(gitPath);
			}

			// must check if XCode is installed
			exec('xcode-select -p', (err: any) => {
				if (err && err.code === 2) {
					// git is not installed, and launching /usr/bin/git
					// will prompt the user to install it

					return e('git not found');
				}

				// make sure git executes
				exec('git --version', err => {
					if (err) {
						return e('git not found');
					}

					return c(gitPath);
				});
			});
		});
	});
}

function findSystemGitWin32(base: string): Promise {
	if (!base) {
		return Promise.wrapError('Not found');
	}

	return findSpecificGit(join(base, 'Git', 'cmd', 'git.exe'));
}

function findGitWin32(): Promise {
	return findSystemGitWin32(process.env['ProgramW6432'])
		.then(null, () => findSystemGitWin32(process.env['ProgramFiles(x86)']))
		.then(null, () => findSystemGitWin32(process.env['ProgramFiles']))
		.then(null, () => findSpecificGit('git'));
}

function findGit(hint: string): Promise {
	var first = hint ? findSpecificGit(hint) : Promise.wrapError(null);

	return first.then(null, () => {
		switch (process.platform) {
			case 'darwin': return findGitDarwin();
			case 'win32': return findGitWin32();
			default: return findSpecificGit('git');
		}
	});
}

class UnavailableRawGitService extends RawGitService {
	constructor() {
		super(null);
	}
}

class DisabledRawGitService extends RawGitService {
	constructor() {
		super(null);
	}

	public serviceState(): TPromise<RawServiceState> {
		return TPromise.as<RawServiceState>(RawServiceState.Disabled);
	}
}

export function createNativeRawGitService(workspaceRoot: string, gitPath: string, defaultEncoding: string): Promise {
	return findGit(gitPath).then(gitPath => {
		const client = new Client(
			URI.parse(require.toUrl('bootstrap')).fsPath,
			{
				serverName: 'Git',
				timeout: 1000 * 60,
				args: [gitPath, workspaceRoot, defaultEncoding, remote.process.execPath],
				env: {
					ATOM_SHELL_INTERNAL_RUN_AS_NODE: 1,
					AMD_ENTRYPOINT: 'vs/workbench/parts/git/electron-browser/gitApp'
				}
			}
		);

		return client.getService('GitService', RawGitService);
	}, () => new UnavailableRawGitService());
}

class ElectronRawGitService extends DelayedRawGitService {
	constructor(workspaceRoot: string, @IConfigurationService configurationService: IConfigurationService) {
		super(configurationService.loadConfiguration().then(conf => {
			var enabled = conf.git ? conf.git.enabled : true;

			if (!enabled) {
				return TPromise.as(new DisabledRawGitService());
			}

			var gitPath = (conf.git && conf.git.path) || null;
			var encoding = (conf.files && conf.files.encoding) || 'utf8';

			return createNativeRawGitService(workspaceRoot, gitPath, encoding);
		}));
	}
}

export class ElectronGitService extends GitService {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IEventService eventService: IEventService,
		@IMessageService messageService: IMessageService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IOutputService outputService: IOutputService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		let workspace = contextService.getWorkspace();
		let raw = !workspace
			? new NoOpGitService()
			: instantiationService.createInstance(ElectronRawGitService, workspace.resource.fsPath);

		super(raw, instantiationService, eventService, messageService, editorService, outputService, contextService, lifecycleService);
	}
}
