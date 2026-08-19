/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { AgentService, IAgentServiceOptions } from './agentService.js';

export interface IAgentHostApplication<T extends AgentService = AgentService> {
	readonly agentService: T;
	readonly applicationInstantiationService: IInstantiationService;
	readonly applicationServices: ServiceCollection;
}

type AgentServiceFactory<T extends AgentService> = (applicationInstantiationService: IInstantiationService, applicationServices: ServiceCollection) => T;

export function createAgentHostApplication(bootstrapInstantiationService: IInstantiationService, options: IAgentServiceOptions): IAgentHostApplication;
export function createAgentHostApplication<T extends AgentService>(bootstrapInstantiationService: IInstantiationService, options: IAgentServiceOptions, factory: AgentServiceFactory<T>): IAgentHostApplication<T>;
export function createAgentHostApplication(bootstrapInstantiationService: IInstantiationService, options: IAgentServiceOptions, factory?: AgentServiceFactory<AgentService>): IAgentHostApplication {
	const applicationServices = new ServiceCollection();
	const applicationInstantiationService = bootstrapInstantiationService.createChild(applicationServices);
	try {
		const agentService = factory
			? factory(applicationInstantiationService, applicationServices)
			: applicationInstantiationService.createInstance(AgentService, options, applicationServices);
		return { agentService, applicationInstantiationService, applicationServices };
	} catch (error) {
		applicationInstantiationService.dispose();
		throw error;
	}
}
