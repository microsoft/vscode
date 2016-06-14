/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export const IEnvironmentService = createDecorator<IEnvironmentService>('environmentService');

export interface IEnvironmentService {
	serviceId: ServiceIdentifier<any>;

	appRoot: string;
	userDataPath: string;
	extensionsPath: string;
	extensionDevelopmentPath: string;
	isBuilt: boolean;
}
