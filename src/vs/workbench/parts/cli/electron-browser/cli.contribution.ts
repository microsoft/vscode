/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as path from 'path';
import * as cp from 'child_process';
import * as pfs from 'vs/base/node/pfs';
import * as platform from 'vs/base/common/platform';
import { nfcall } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import product from 'vs/platform/node/product';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IChoiceService, Choice } from 'vs/platform/dialogs/common/dialogs';
import Severity from 'vs/base/common/severity';
import { ILogService } from 'vs/platform/log/common/log';

function ignore<T>(code: string, value: T = null): (err: any) => TPromise<T> {
	return err => err.code === code ? TPromise.as<T>(value) : TPromise.wrapError<T>(err);
}

let _source: string = null;
function getSource(): string {
	if (!_source) {
		const root = URI.parse(require.toUrl('')).fsPath;
		_source = path.resolve(root, '..', 'bin', 'code');
	}
	return _source;
}

function isAvailable(): TPromise<boolean> {
	return pfs.exists(getSource());
}

class InstallAction extends Action {

	static readonly ID = 'workbench.action.installCommandLine';
	static LABEL = nls.localize('install', "Install '{0}' command in PATH", product.applicationName);

	constructor(
		id: string,
		label: string,
		@INotificationService private notificationService: INotificationService,
		@IChoiceService private choiceService: IChoiceService,
		@ILogService private logService: ILogService
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
				this.notificationService.info(message);
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
								.then(() => pfs.symlink(getSource(), this.target));
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
					this.logService.trace('cli#install', this.target);
					this.notificationService.info(nls.localize('successIn', "Shell command '{0}' successfully installed in PATH.", product.applicationName));
				});
		});
	}

	private isInstalled(): TPromise<boolean> {
		return pfs.lstat(this.target)
			.then(stat => stat.isSymbolicLink())
			.then(() => pfs.readlink(this.target))
			.then(link => link === getSource())
			.then(null, ignore('ENOENT', false));
	}

	private createBinFolder(): TPromise<void> {
		return new TPromise<void>((c, e) => {
			const choices: Choice[] = [nls.localize('ok', "OK"), nls.localize('cancel2', "Cancel")];

			this.choiceService.choose(Severity.Info, nls.localize('warnEscalation', "Code will now prompt with 'osascript' for Administrator privileges to install the shell command."), choices, 1, true).then(choice => {
				switch (choice) {
					case 0 /* OK */:
						const command = 'osascript -e "do shell script \\"mkdir -p /usr/local/bin && chown \\" & (do shell script (\\"whoami\\")) & \\" /usr/local/bin\\" with administrator privileges"';

						nfcall(cp.exec, command, {})
							.then(null, _ => TPromise.wrapError(new Error(nls.localize('cantCreateBinFolder', "Unable to create '/usr/local/bin'."))))
							.done(c, e);
						break;
					case 1 /* Cancel */:
						e(new Error(nls.localize('aborted', "Aborted")));
						break;
				}
			});
		});
	}
}

class UninstallAction extends Action {

	static readonly ID = 'workbench.action.uninstallCommandLine';
	static LABEL = nls.localize('uninstall', "Uninstall '{0}' command from PATH", product.applicationName);

	constructor(
		id: string,
		label: string,
		@INotificationService private notificationService: INotificationService,
		@ILogService private logService: ILogService
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
				this.notificationService.info(message);
				return undefined;
			}

			return pfs.unlink(this.target)
				.then(null, ignore('ENOENT'))
				.then(() => {
					this.logService.trace('cli#uninstall', this.target);
					this.notificationService.info(nls.localize('successFrom', "Shell command '{0}' successfully uninstalled from PATH.", product.applicationName));
				});
		});
	}
}

if (platform.isMacintosh) {
	const category = nls.localize('shellCommand', "Shell Command");

	const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(InstallAction, InstallAction.ID, InstallAction.LABEL), 'Shell Command: Install \'code\' command in PATH', category);
	workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(UninstallAction, UninstallAction.ID, UninstallAction.LABEL), 'Shell Command: Uninstall \'code\' command from PATH', category);
}
