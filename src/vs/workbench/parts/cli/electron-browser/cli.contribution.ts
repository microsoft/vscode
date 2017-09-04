/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as path from 'path';
import * as cp from 'child_process';
import * as pfs from 'vs/base/node/pfs';
import { nfcall } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IEditorService } from 'vs/platform/editor/common/editor';
import product from 'vs/platform/node/product';

interface ILegacyUse {
	file: string;
	lineNumber: number;
}

function ignore<T>(code: string, value: T = null): (err: any) => TPromise<T> {
	return err => err.code === code ? TPromise.as<T>(value) : TPromise.wrapError<T>(err);
}

const root = URI.parse(require.toUrl('')).fsPath;
const source = path.resolve(root, '..', 'bin', 'code');

function isAvailable(): TPromise<boolean> {
	return pfs.exists(source);
}

class InstallAction extends Action {

	static ID = 'workbench.action.installCommandLine';
	static LABEL = nls.localize('install', "Install '{0}' command in PATH", product.applicationName);

	constructor(
		id: string,
		label: string,
		@IMessageService private messageService: IMessageService,
		@IEditorService private editorService: IEditorService
	) {
		super(id, label);
	}

	private get target(): string {
		return `/usr/local/bin/${product.applicationName}`;
	}

	run(): TPromise<void> {
		return isAvailable().then(isAvailable => {
			if (!isAvailable) {
				const message = nls.localize('not available', "This command is not available");
				this.messageService.show(Severity.Info, message);
				return undefined;
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
				.then(() => {
					this.messageService.show(Severity.Info, nls.localize('successIn', "Shell command '{0}' successfully installed in PATH.", product.applicationName));
				});
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
				new Action('ok', nls.localize('ok', "OK"), '', true, () => {
					const command = 'osascript -e "do shell script \\"mkdir -p /usr/local/bin && chown \\" & (do shell script (\\"whoami\\")) & \\" /usr/local/bin\\" with administrator privileges"';

					nfcall(cp.exec, command, {})
						.then(null, _ => TPromise.wrapError(new Error(nls.localize('cantCreateBinFolder', "Unable to create '/usr/local/bin'."))))
						.done(c, e);

					return null;
				}),
				new Action('cancel2', nls.localize('cancel2', "Cancel"), '', true, () => { e(new Error(nls.localize('aborted', "Aborted"))); return null; })
			];

			this.messageService.show(Severity.Info, { message, actions });
		});
	}
}

class UninstallAction extends Action {

	static ID = 'workbench.action.uninstallCommandLine';
	static LABEL = nls.localize('uninstall', "Uninstall '{0}' command from PATH", product.applicationName);

	constructor(
		id: string,
		label: string,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	private get target(): string {
		return `/usr/local/bin/${product.applicationName}`;
	}

	run(): TPromise<void> {
		return isAvailable().then(isAvailable => {
			if (!isAvailable) {
				const message = nls.localize('not available', "This command is not available");
				this.messageService.show(Severity.Info, message);
				return undefined;
			}

			return pfs.unlink(this.target)
				.then(null, ignore('ENOENT'))
				.then(() => {
					this.messageService.show(Severity.Info, nls.localize('successFrom', "Shell command '{0}' successfully uninstalled from PATH.", product.applicationName));
				});
		});
	}
}

if (process.platform === 'darwin') {
	const category = nls.localize('shellCommand', "Shell Command");

	const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(InstallAction, InstallAction.ID, InstallAction.LABEL), 'Shell Command: Install \'code\' command in PATH', category);
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(UninstallAction, UninstallAction.ID, UninstallAction.LABEL), 'Shell Command: Uninstall \'code\' command from PATH', category);
}
