// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import type { ModelRoutesConfig, ProviderConfig, RouteConfig, RoutingContext, SplitConfig } from './types.js';

export interface ResolvedRoute {
	provider: string;
	model: string;
	providerConfig: ProviderConfig;
}

export class ModelRouter {
	private config: ModelRoutesConfig;

	constructor(config: ModelRoutesConfig) {
		this.config = config;
	}

	resolveRoute(context: RoutingContext): ResolvedRoute {
		const sortedRoutes = [...this.config.routes].sort((a, b) => a.priority - b.priority);

		for (const route of sortedRoutes) {
			if (this.matchesRoute(route, context)) {
				return this.buildResolvedRoute(route);
			}
		}

		throw new Error(`No matching route found for agentRole="${context.agentRole}" taskType="${context.taskType ?? ''}"`);
	}

	resolveProvider(providerName: string): ProviderConfig {
		const provider = this.config.providers[providerName];
		if (!provider) {
			throw new Error(`Unknown provider: ${providerName}`);
		}

		return {
			...provider,
			apiKey: provider.apiKey ? this.resolveEnvVars(provider.apiKey) : undefined,
		};
	}

	reloadConfig(config: ModelRoutesConfig): void {
		this.config = config;
	}

	getConfig(): ModelRoutesConfig {
		return this.config;
	}

	private matchesRoute(route: RouteConfig, context: RoutingContext): boolean {
		const { match } = route;

		if (match.agentRole !== '*' && match.agentRole !== context.agentRole) {
			return false;
		}

		if (match.taskType && match.taskType !== context.taskType) {
			return false;
		}

		return true;
	}

	private buildResolvedRoute(route: RouteConfig): ResolvedRoute {
		if (route.split && route.split.length > 0) {
			const selected = this.weightedRandom(route.split);
			return {
				provider: selected.provider,
				model: selected.model,
				providerConfig: this.resolveProvider(selected.provider),
			};
		}

		if (!route.provider || !route.model) {
			throw new Error(`Route "${route.name}" has no provider/model and no split config`);
		}

		return {
			provider: route.provider,
			model: route.model,
			providerConfig: this.resolveProvider(route.provider),
		};
	}

	private weightedRandom(splits: SplitConfig[]): SplitConfig {
		const totalWeight = splits.reduce((sum, s) => sum + s.weight, 0);
		let random = Math.random() * totalWeight;

		for (const split of splits) {
			random -= split.weight;
			if (random <= 0) {
				return split;
			}
		}

		return splits[splits.length - 1];
	}

	private resolveEnvVars(value: string): string {
		return value.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
			const envValue = process.env[varName];
			if (envValue === undefined) {
				console.warn(`Environment variable ${varName} is not set`);
				return '';
			}
			return envValue;
		});
	}
}
