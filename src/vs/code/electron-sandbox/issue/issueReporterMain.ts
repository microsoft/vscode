/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/issueReporter';
import 'vs/base/browser/ui/codicons/codiconStyles'; // make sure codicon css is loaded
import { safeInnerHtml } from 'vs/base/browser/dom';
import { isLinux, isWindows } from 'vs/base/common/platform';
import BaseHtml from 'vs/code/electron-sandbox/issue/issueReporterPage';
import { ElectronIPCMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';
import { IIssueMainService, IssueReporterWindowConfiguration } from 'vs/platform/issue/common/issue';
import { INativeHostService } from 'vs/platform/native/common/native';
import { NativeHostService } from 'vs/platform/native/electron-sandbox/nativeHostService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IMainProcessService } from 'vs/platform/ipc/common/mainProcessService';
import { IssueReporter } from './issueReporterService';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { getSingletonServiceDescriptors } from 'vs/platform/instantiation/common/extensions';
import { registerMainProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';

export function startup(configuration: IssueReporterWindowConfiguration) {
	const platformClass = isWindows ? 'windows' : isLinux ? 'linux' : 'mac';
	document.body.classList.add(platformClass); // used by our fonts

	safeInnerHtml(document.body, BaseHtml());

	const instantiationService = initServices(configuration.windowId);

	const issueReporter = instantiationService.createInstance(IssueReporter, configuration);
	issueReporter.render();
	document.body.style.display = 'block';
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
