/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createModelClient } from './client.ts';
import { ModelRouterError } from './errors.ts';
import { validateConfig } from './http.ts';
import type { ClientOptions, ModelClient, ModelConfig } from './types.ts';

/** Each AI feature has a slot, so users can mix a strong model with a cheap or local one. */
export type ModelRole = 'chat' | 'agent' | 'edit' | 'completion';

export const MODEL_ROLES: readonly ModelRole[] = ['chat', 'agent', 'edit', 'completion'];

const ROLE_LABELS: Record<ModelRole, string> = {
	chat: 'Chat',
	agent: 'Agent',
	edit: 'Inline edit',
	completion: 'Tab completion',
};

/** The models a user added and which one serves each role. */
export class ModelRegistry {
	private readonly models = new Map<string, ModelConfig>();
	private readonly roles = new Map<ModelRole, string>();
	private readonly options: ClientOptions;

	constructor(options: ClientOptions = {}) {
		this.options = options;
	}

	add(config: ModelConfig): void {
		validateConfig(config);
		this.models.set(config.id, config);
	}

	remove(id: string): void {
		this.models.delete(id);
		for (const [role, modelId] of this.roles) {
			if (modelId === id) {
				this.roles.delete(role);
			}
		}
	}

	get(id: string): ModelConfig | undefined {
		return this.models.get(id);
	}

	list(): ModelConfig[] {
		return [...this.models.values()];
	}

	assign(role: ModelRole, id: string): void {
		if (!this.models.has(id)) {
			throw new ModelRouterError('invalid_config', `No model with id "${id}" has been added.`);
		}
		this.roles.set(role, id);
	}

	unassign(role: ModelRole): void {
		this.roles.delete(role);
	}

	/**
	 * Agent and inline edit fall back to the chat model, then to the first model added.
	 * Tab completion never falls back: a slow model there makes the editor feel broken.
	 */
	modelFor(role: ModelRole): ModelConfig | undefined {
		const assigned = this.roles.get(role);
		if (assigned) {
			return this.models.get(assigned);
		}
		if (role === 'completion') {
			return undefined;
		}
		const chat = this.roles.get('chat');
		return (chat && this.models.get(chat)) || this.models.values().next().value;
	}

	clientFor(role: ModelRole): ModelClient {
		const config = this.modelFor(role);
		if (!config) {
			throw new ModelRouterError('invalid_config', `No model is set for ${ROLE_LABELS[role]}. Add one in Settings > Models.`);
		}
		return createModelClient(config, this.options);
	}
}
