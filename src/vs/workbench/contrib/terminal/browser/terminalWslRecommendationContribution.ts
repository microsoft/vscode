/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, type IDisposable } from 'vs/base/common/lifecycle';
import { basename } from 'vs/base/common/path';
import { isWindows } from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService, NeverShowAgainScope, Severity } from 'vs/platform/notification/common/notification';
import { IProductService } from 'vs/platform/product/common/productService';
import type { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { InstallRecommendedExtensionAction } from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';

export class TerminalWslRecommendationContribution extends Disposable implements IWorkbenchContribution {
	static ID = 'terminalWslRecommendation';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IProductService productService: IProductService,
		@INotificationService notificationService: INotificationService,
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@ITerminalService terminalService: ITerminalService,
	) {
		super();

		if (!isWindows) {
			return;
		}

		const exeBasedExtensionTips = productService.exeBasedExtensionTips;
		if (!exeBasedExtensionTips || !exeBasedExtensionTips.wsl) {
			return;
		}

		let listener: IDisposable | undefined = terminalService.onDidCreateInstance(async instance => {
			async function isExtensionInstalled(id: string): Promise<boolean> {
				const extensions = await extensionManagementService.getInstalled();
				return extensions.some(e => e.identifier.id === id);
			}

			if (!instance.shellLaunchConfig.executable || basename(instance.shellLaunchConfig.executable).toLowerCase() !== 'wsl.exe') {
				return;
			}

			listener?.dispose();
			listener = undefined;

			const extId = Object.keys(exeBasedExtensionTips.wsl.recommendations).find(extId => exeBasedExtensionTips.wsl.recommendations[extId].important);
			if (!extId || await isExtensionInstalled(extId)) {
				return;
			}

			notificationService.prompt(
				Severity.Info,
				localize('useWslExtension.title', "The '{0}' extension is recommended for opening a terminal in WSL.", exeBasedExtensionTips.wsl.friendlyName),
				[
					{
						label: localize('install', 'Install'),
						run: () => {
							instantiationService.createInstance(InstallRecommendedExtensionAction, extId).run();
						}
					}
				],
				{
					sticky: true,
					neverShowAgain: { id: 'terminalConfigHelper/launchRecommendationsIgnore', scope: NeverShowAgainScope.APPLICATION },
					onCancel: () => { }
				}
			);
		});
	}
}
