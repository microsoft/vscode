/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { INativeWindowConfiguration, IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import type { IWorkbenchConstructionOptions as IWorkbenchOptions } from 'vs/workbench/workbench.web.api';
import { URI } from 'vs/base/common/uri';

export const IWorkbenchEnvironmentService = createDecorator<IWorkbenchEnvironmentService>('environmentService');

export interface IWorkbenchConfiguration extends IWindowConfiguration {
	backupWorkspaceResource?: URI;
}

export interface INativeWorkbenchConfiguration extends IWorkbenchConfiguration, INativeWindowConfiguration { }

export interface IWorkbenchEnvironmentService extends IEnvironmentService {

	readonly _serviceBrand: undefined;

	readonly configuration: IWorkbenchConfiguration;

	readonly options?: IWorkbenchOptions;

	readonly logFile: URI;

	readonly logExtensionHostCommunication?: boolean;
	readonly extensionEnabledProposedApi?: string[];

	readonly webviewExternalEndpoint: string;
	readonly webviewResourceRoot: string;
	readonly webviewCspSource: string;

	readonly skipReleaseNotes: boolean;
}

export interface INativeWorkbenchEnvironmentService extends IWorkbenchEnvironmentService, INativeEnvironmentService {

	readonly configuration: INativeWorkbenchConfiguration;

	readonly crashReporterDirectory?: string;
	readonly crashReporterId?: string;

	readonly execPath: string;
	readonly cliPath: string;

	readonly log?: string;
	readonly extHostLogsPath: URI;
}
