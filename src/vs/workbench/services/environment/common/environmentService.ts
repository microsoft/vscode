/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkbenchConstructionOptions } from 'vs/workbench/workbench.web.api';

export const IWorkbenchEnvironmentService = createDecorator<IWorkbenchEnvironmentService>('environmentService');

export interface IWorkbenchEnvironmentService extends IEnvironmentService {

	_serviceBrand: ServiceIdentifier<IEnvironmentService>;

	readonly configuration: IWindowConfiguration;

	readonly options?: IWorkbenchConstructionOptions;
}
