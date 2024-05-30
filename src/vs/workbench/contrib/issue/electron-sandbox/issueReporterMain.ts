/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeInnerHtml } from 'vs/base/browser/dom';
import 'vs/base/browser/ui/codicons/codiconStyles'; // make sure codicon css is loaded
import { isLinux, isWindows } from 'vs/base/common/platform';
import BaseHtml from 'vs/workbench/contrib/issue/browser/issueReporterPage';
import 'vs/css!./media/issueReporter';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { getSingletonServiceDescriptors } from 'vs/platform/instantiation/common/extensions';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IMainProcessService } from 'vs/platform/ipc/common/mainProcessService';
import { ElectronIPCMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';
import { registerMainProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';
import { IIssueMainService, IssueReporterWindowConfiguration } from 'vs/platform/issue/common/issue';
import { INativeHostService } from 'vs/platform/native/common/native';
import { NativeHostService } from 'vs/platform/native/common/nativeHostService';
import { IssueReporter2 } from 'vs/workbench/contrib/issue/electron-sandbox/issueReporterService2';
import { mainWindow } from 'vs/base/browser/window';

export function startup(configuration: IssueReporterWindowConfiguration) {
	const platformClass = isWindows ? 'windows' : isLinux ? 'linux' : 'mac';
	mainWindow.document.body.classList.add(platformClass); // used by our fonts

	safeInnerHtml(mainWindow.document.body, BaseHtml());

	const instantiationService = initServices(configuration.windowId);

	const issueReporter = instantiationService.createInstance(IssueReporter2, configuration);
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
