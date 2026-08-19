/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { AgentService, IAgentServiceOptions } from './agentService.js';

export interface IAgentHostApplication<T extends AgentService = AgentService> {
	readonly agentService: T;
	readonly instantiationService: IInstantiationService;
	readonly services: ServiceCollection;
}

type AgentServiceFactory<T extends AgentService> = (instantiationService: IInstantiationService, services: ServiceCollection) => T;

export function createAgentHostApplication(parentInstantiationService: IInstantiationService, options: IAgentServiceOptions): IAgentHostApplication;
export function createAgentHostApplication<T extends AgentService>(parentInstantiationService: IInstantiationService, options: IAgentServiceOptions, factory: AgentServiceFactory<T>): IAgentHostApplication<T>;
export function createAgentHostApplication(parentInstantiationService: IInstantiationService, options: IAgentServiceOptions, factory?: AgentServiceFactory<AgentService>): IAgentHostApplication {
	const services = new ServiceCollection();
	const instantiationService = parentInstantiationService.createChild(services);
	try {
		const agentService = factory
			? factory(instantiationService, services)
			: instantiationService.createInstance(AgentService, options, services);
		return { agentService, instantiationService, services };
	} catch (error) {
		instantiationService.dispose();
		throw error;
	}
}
