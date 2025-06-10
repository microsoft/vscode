/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, type IDisposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/path.js';
import { localize } from '../../../../../nls.js';
import { IExtensionManagementService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, NeverShowAgainScope, NotificationPriority, Severity } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../common/contributions.js';
import { InstallRecommendedExtensionAction } from '../../../extensions/browser/extensionsActions.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';

export class TerminalNushellRecommendationContribution extends Disposable implements IWorkbenchContribution {
	static ID = 'terminalNushellRecommendation';

	constructor(
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService notificationService: INotificationService,
		@IProductService productService: IProductService,
		@ITerminalService terminalService: ITerminalService,
	) {
		super();

		const exeBasedExtensionTips = productService.exeBasedExtensionTips;
		if (!exeBasedExtensionTips || !exeBasedExtensionTips.nushell) {
			return;
		}

		let listener: IDisposable | undefined = terminalService.onDidCreateInstance(async instance => {
			async function isExtensionInstalled(id: string): Promise<boolean> {
				const extensions = await extensionManagementService.getInstalled();
				return extensions.some(e => e.identifier.id === id);
			}

			const executableName = instance.shellLaunchConfig.executable;
			if (!executableName) {
				return;
			}

			const executableBasename = basename(executableName).toLowerCase();
			// Check for both 'nu' and 'nu.exe' to support both Unix and Windows
			if (executableBasename !== 'nu' && executableBasename !== 'nu.exe') {
				return;
			}

			listener?.dispose();
			listener = undefined;

			const extId = Object.keys(exeBasedExtensionTips.nushell.recommendations).find(extId => exeBasedExtensionTips.nushell.recommendations[extId].important);
			if (!extId || await isExtensionInstalled(extId)) {
				return;
			}

			notificationService.prompt(
				Severity.Info,
				localize('useNushellExtension.title', "The '{0}' extension is recommended for opening a terminal in Nushell.", exeBasedExtensionTips.nushell.friendlyName),
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
					priority: NotificationPriority.OPTIONAL,
					neverShowAgain: { id: 'terminalConfigHelper/nushellRecommendationIgnore', scope: NeverShowAgainScope.APPLICATION },
					onCancel: () => { }
				}
			);
		});
	}
}

registerWorkbenchContribution2(TerminalNushellRecommendationContribution.ID, TerminalNushellRecommendationContribution, WorkbenchPhase.Eventually);