/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { IEnvironmentService, IDebugParams } from 'vs/platform/environment/common/environment';
import { IWorkbenchConstructionOptions } from 'vs/workbench/workbench.web.api';
import { URI } from 'vs/base/common/uri';

export const IWorkbenchEnvironmentService = createDecorator<IWorkbenchEnvironmentService>('environmentService');

export interface IWorkbenchEnvironmentService extends IEnvironmentService {

	_serviceBrand: undefined;

	readonly configuration: IWindowConfiguration;

	readonly options?: IWorkbenchConstructionOptions;

	readonly logFile: URI;
	readonly logExtensionHostCommunication: boolean;

	readonly debugSearch: IDebugParams;

	readonly webviewExternalEndpoint: string;
	readonly webviewResourceRoot: string;
	readonly webviewCspSource: string;

	readonly skipReleaseNotes: boolean | undefined;

}
