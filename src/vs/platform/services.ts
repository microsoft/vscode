/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

export interface IServicesContext {
	[serviceName: string]: any;
	instantiationService: IInstantiationService;
}