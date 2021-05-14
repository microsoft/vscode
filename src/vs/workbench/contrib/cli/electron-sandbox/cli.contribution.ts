/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import Severity from 'vs/base/common/severity';
import { Action2, ILocalizedString, registerAction2 } from 'vs/platform/actions/common/actions';
import product from 'vs/platform/product/common/product';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IsMacNativeContext } from 'vs/platform/contextkey/common/contextkeys';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { toErrorMessage } from 'vs/base/common/errorMessage';

const category: ILocalizedString = { value: localize('shellCommand', "Shell Command"), original: 'Shell Command' };

class InstallAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.installCommandLine',
			title: {
				value: localize('install', "Install '{0}' command in PATH", product.applicationName),
				original: `Install \'${product.applicationName}\' command in PATH`
			},
			category,
			f1: true,
			precondition: ContextKeyExpr.and(IsMacNativeContext, ContextKeyExpr.equals('remoteName', ''))
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		const dialogService = accessor.get(IDialogService);

		try {
			await nativeHostService.installShellCommand();
		} catch (error) {
			dialogService.show(Severity.Error, toErrorMessage(error), [localize('ok', "OK"),]);
		}
	}
}

class UninstallAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.uninstallCommandLine',
			title: {
				value: localize('uninstall', "Uninstall '{0}' command from PATH", product.applicationName),
				original: `Uninstall \'${product.applicationName}\' command from PATH`
			},
			category,
			f1: true,
			precondition: ContextKeyExpr.and(IsMacNativeContext, ContextKeyExpr.equals('remoteName', ''))
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		const dialogService = accessor.get(IDialogService);

		try {
			await nativeHostService.uninstallShellCommand();
		} catch (error) {
			dialogService.show(Severity.Error, toErrorMessage(error), [localize('ok', "OK"),]);
		}
	}
}

registerAction2(InstallAction);
registerAction2(UninstallAction);
