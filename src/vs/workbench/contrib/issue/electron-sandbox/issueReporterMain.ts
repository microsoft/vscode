/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeInnerHtml } from '../../../../base/browser/dom.js';
import '../../../../base/browser/ui/codicons/codiconStyles.js'; // make sure codicon css is loaded
import { mainWindow } from '../../../../base/browser/window.js';
import { isLinux, isWindows } from '../../../../base/common/platform.js';
import './media/issueReporter.css';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { getSingletonServiceDescriptors } from '../../../../platform/instantiation/common/extensions.js';
import { InstantiationService } from '../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ElectronIPCMainProcessService } from '../../../../platform/ipc/electron-sandbox/mainProcessService.js';
import { registerMainProcessRemoteService } from '../../../../platform/ipc/electron-sandbox/services.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { NativeHostService } from '../../../../platform/native/common/nativeHostService.js';
import BaseHtml from '../browser/issueReporterPage.js';
import { IProcessMainService, IIssueMainService, OldIssueReporterWindowConfiguration } from '../../../../platform/issue/common/issue.js';
import { IssueReporter } from './issueReporterService.js';

export interface IIssueReporterMain {
	startup(configuration: OldIssueReporterWindowConfiguration): void;
}

export function startup(configuration: OldIssueReporterWindowConfiguration): void {
	const platformClass = isWindows ? 'windows' : isLinux ? 'linux' : 'mac';
	mainWindow.document.body.classList.add(platformClass); // used by our fonts

	safeInnerHtml(mainWindow.document.body, BaseHtml());

	const instantiationService = initServices(configuration.windowId);

	const issueReporter = instantiationService.createInstance(IssueReporter, configuration);
	issueReporter.render();
	mainWindow.document.body.style.display = 'block';
	issueReporter.setInitialFocus();
}

function initServices(windowId: number) {
	const services = new ServiceCollection();

	const contributedServices = getSingletonServiceDescriptors();
	for (const [id, descriptor] of contributedServices) {
		services.set(id, descriptor);
	}

	services.set(IMainProcessService, new SyncDescriptor(ElectronIPCMainProcessService, [windowId]));
	services.set(INativeHostService, new SyncDescriptor(NativeHostService, [windowId]));

	return new InstantiationService(services, true);
}

registerMainProcessRemoteService(IIssueMainService, 'issue');
registerMainProcessRemoteService(IProcessMainService, 'process');
