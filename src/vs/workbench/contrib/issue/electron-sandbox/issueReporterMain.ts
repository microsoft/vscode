/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeInnerHtml } from '../../../../base/browser/dom';
import '../../../../base/browser/ui/codicons/codiconStyles'; // make sure codicon css is loaded
import { mainWindow } from '../../../../base/browser/window';
import { isLinux, isWindows } from '../../../../base/common/platform';
import 'vs/css!./media/issueReporter';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors';
import { getSingletonServiceDescriptors } from '../../../../platform/instantiation/common/extensions';
import { InstantiationService } from '../../../../platform/instantiation/common/instantiationService';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService';
import { ElectronIPCMainProcessService } from '../../../../platform/ipc/electron-sandbox/mainProcessService';
import { registerMainProcessRemoteService } from '../../../../platform/ipc/electron-sandbox/services';
import { INativeHostService } from '../../../../platform/native/common/native';
import { NativeHostService } from '../../../../platform/native/common/nativeHostService';
import BaseHtml from '../browser/issueReporterPage';
import { IProcessMainService, IIssueMainService, OldIssueReporterWindowConfiguration } from '../../../../platform/issue/common/issue';
import { IssueReporter } from './issueReporterService';


export function startup(configuration: OldIssueReporterWindowConfiguration) {
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
