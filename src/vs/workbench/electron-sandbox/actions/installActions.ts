/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import Severity from 'vs/base/common/severity';
import { Action2, ILocalizedString } from 'vs/platform/actions/common/actions';
import product from 'vs/platform/product/common/product';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { IProductService } from 'vs/platform/product/common/productService';

const shellCommandCategory: ILocalizedString = { value: localize('shellCommand', "Shell Command"), original: 'Shell Command' };

export class InstallShellScriptAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.installCommandLine',
			title: {
				value: localize('install', "Install '{0}' command in PATH", product.applicationName),
				original: `Install \'${product.applicationName}\' command in PATH`
			},
			category: shellCommandCategory,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		const dialogService = accessor.get(IDialogService);
		const productService = accessor.get(IProductService);

		try {
			await nativeHostService.installShellCommand();

			dialogService.show(Severity.Info, localize('successIn', "Shell command '{0}' successfully installed in PATH.", productService.applicationName));
		} catch (error) {
			dialogService.show(Severity.Error, toErrorMessage(error));
		}
	}
}

export class UninstallShellScriptAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.uninstallCommandLine',
			title: {
				value: localize('uninstall', "Uninstall '{0}' command from PATH", product.applicationName),
				original: `Uninstall \'${product.applicationName}\' command from PATH`
			},
			category: shellCommandCategory,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		const dialogService = accessor.get(IDialogService);
		const productService = accessor.get(IProductService);

		try {
			await nativeHostService.uninstallShellCommand();

			dialogService.show(Severity.Info, localize('successFrom', "Shell command '{0}' successfully uninstalled from PATH.", productService.applicationName));
		} catch (error) {
			dialogService.show(Severity.Error, toErrorMessage(error));
		}
	}
}
