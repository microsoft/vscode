/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import * as pfs from 'vs/base/node/pfs';
import { nfcall } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IEditorService } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

interface ILegacyUse {
	file: string;
	lineNumber: number;
}

function ignore<T>(code: string, value: T = null): (err: any) => TPromise<T> {
	return err => err.code === code ? TPromise.as<T>(value) : TPromise.wrapError<T>(err);
}

function readOrEmpty(name: string): TPromise<string> {
	return pfs.readFile(name, 'utf8').then(null, ignore('ENOENT', ''));
}

const root = URI.parse(require.toUrl('')).fsPath;
const source = path.resolve(root, '..', 'bin', 'code');
const isAvailable = fs.existsSync(source);

class InstallAction extends Action {

	static ID = 'workbench.action.installCommandLine';
	static LABEL = nls.localize('install', "Install 'code' command in PATH");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IMessageService private messageService: IMessageService,
		@IEditorService private editorService: IEditorService
	) {
		super(id, label);
	}

	get applicationName(): string {
		return this.contextService.getConfiguration().env.applicationName;
	}

	private get target(): string {
		return `/usr/local/bin/${ this.applicationName }`;
	}

	run(): TPromise<void> {
		return this.checkLegacy()
			.then(uses => {
				if (uses.length > 0) {
					const { file, lineNumber } = uses[0];
					const resource = URI.create('file', null, file);
					const env = this.contextService.getConfiguration().env;
					const message = nls.localize('exists', "Please remove the alias referencing '{0}' in '{1}' (line {2}) and retry this action.", env.darwinBundleIdentifier, file, lineNumber);
					const input = { resource, mime: 'text/x-shellscript' };
					const actions = [
						new Action('inlineEdit', nls.localize('editFile', "Edit '{0}'", file), '', true, () => {
							return this.editorService.openEditor(input).then(() => {
								const message = nls.localize('again', "Please remove the '{0}' alias from '{1}' before continuing.", this.applicationName, file);
								const actions = [
									new Action('cancel', nls.localize('cancel', "Cancel")),
									new Action('continue', nls.localize('continue', "Continue"), '', true, () => this.run())
								];

								this.messageService.show(Severity.Info, { message, actions });
							});
						})
					];

					this.messageService.show(Severity.Warning, { message, actions });
					return TPromise.as(null);
				}

				return this.isInstalled()
					.then(isInstalled => {
						if (!isAvailable || isInstalled) {
							return TPromise.as(null);
						} else {
							const createSymlink = () => {
								return pfs.unlink(this.target)
									.then(null, ignore('ENOENT'))
									.then(() => pfs.symlink(source, this.target));
							};

							return createSymlink().then(null, err => {
								if (err.code === 'EACCES' || err.code === 'ENOENT') {
									return this.createBinFolder()
										.then(() => createSymlink());
								}

								return TPromise.wrapError(err);
							});
						}
					})
					.then(() => this.messageService.show(Severity.Info, nls.localize('successIn', "Shell command '{0}' successfully installed in PATH.", this.applicationName)));
			});
	}

	private isInstalled(): TPromise<boolean> {
		return pfs.lstat(this.target)
			.then(stat => stat.isSymbolicLink())
			.then(() => pfs.readlink(this.target))
			.then(link => link === source)
			.then(null, ignore('ENOENT', false));
	}

	private createBinFolder(): TPromise<void> {
		return new TPromise<void>((c, e) => {
			const message = nls.localize('warnEscalation', "Code will now prompt with 'osascript' for Administrator privileges to install the shell command.");
			const actions = [
				new Action('cancel2', nls.localize('cancel2', "Cancel"), '', true, () => { e(new Error(nls.localize('aborted', "Aborted"))); return null; }),
				new Action('ok', nls.localize('ok', "OK"), '', true, () => {
					const command = 'osascript -e "do shell script \\"mkdir -p /usr/local/bin && chown \\" & (do shell script (\\"whoami\\")) & \\" /usr/local/bin\\" with administrator privileges"';

					nfcall(cp.exec, command, {})
						.then(null, _ => TPromise.wrapError(new Error(nls.localize('cantCreateBinFolder', "Unable to create '/usr/local/bin'."))))
						.done(c, e);

					return null;
				})
			];

			this.messageService.show(Severity.Info, { message, actions });
		});
	}

	checkLegacy(): TPromise<ILegacyUse[]> {
		const files = [
			path.join(os.homedir(), '.bash_profile'),
			path.join(os.homedir(), '.bashrc'),
			path.join(os.homedir(), '.zshrc')
		];

		return TPromise.join(files.map(f => readOrEmpty(f))).then(result => {
			return result.reduce((result, contents, index) => {
				const file = files[index];
				const env = this.contextService.getConfiguration().env;
				const lines = contents.split(/\r?\n/);

				lines.some((line, index) => {
					if (line.indexOf(env.darwinBundleIdentifier) > -1 && !/^\s*#/.test(line)) {
						result.push({ file, lineNumber: index + 1 });
						return true;
					}

					return false;
				});

				return result;
			}, [] as ILegacyUse[]);
		});
	}
}

class UninstallAction extends Action {

	static ID = 'workbench.action.uninstallCommandLine';
	static LABEL = nls.localize('uninstall', "Uninstall 'code' command from PATH");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	private get applicationName(): string {
		return this.contextService.getConfiguration().env.applicationName;
	}

	private get target(): string {
		return `/usr/local/bin/${ this.applicationName }`;
	}

	run(): TPromise<void> {
		return pfs.unlink(this.target)
			.then(null, ignore('ENOENT'))
			.then(() => this.messageService.show(Severity.Info, nls.localize('successFrom', "Shell command '{0}' successfully uninstalled from PATH.", this.applicationName)));
	}
}

class DarwinCLIHelper implements IWorkbenchContribution {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IMessageService messageService: IMessageService
	) {
		const installAction = instantiationService.createInstance(InstallAction, InstallAction.ID, InstallAction.LABEL);

		installAction.checkLegacy().done(files => {
			if (files.length > 0) {
				const message = nls.localize('update', "Code needs to change the '{0}' shell command. Would you like to do this now?", installAction.applicationName);
				const now = new Action('changeNow', nls.localize('changeNow', "Change Now"), '', true, () => installAction.run());
				const later = new Action('later', nls.localize('later', "Later"), '', true, () => {
					messageService.show(Severity.Info, nls.localize('laterInfo', "Remember you can always run the '{0}' action from the Command Palette.", installAction.label));
					return null;
				});
				const actions = [later, now];

				messageService.show(Severity.Info, { message, actions });
			}
		});
	}

	getId(): string {
		return 'darwin.cli';
	}
}

if (isAvailable && process.platform === 'darwin') {
	const category = nls.localize('shellCommand', "Shell Command");

	const workbenchActionsRegistry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(InstallAction, InstallAction.ID, InstallAction.LABEL), category);
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(UninstallAction, UninstallAction.ID, UninstallAction.LABEL), category);

	const workbenchRegistry = <IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench);
	workbenchRegistry.registerWorkbenchContribution(DarwinCLIHelper);
}
