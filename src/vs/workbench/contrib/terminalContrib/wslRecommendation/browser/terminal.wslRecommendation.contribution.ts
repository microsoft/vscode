/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, type IDisposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { IExtensionManagementService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, NeverShowAgainScope, Severity } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../common/contributions.js';
import { InstallRecommendedExtensionAction } from '../../../extensions/browser/extensionsActions.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';

export class TerminalWslRecommendationContribution extends Disposable implements IWorkbenchContribution {
	static ID = 'terminalWslRecommendation';

	constructor(
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService notificationService: INotificationService,
		@IProductService productService: IProductService,
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

registerWorkbenchContribution2(TerminalWslRecommendationContribution.ID, TerminalWslRecommendationContribution, WorkbenchPhase.Eventually);
