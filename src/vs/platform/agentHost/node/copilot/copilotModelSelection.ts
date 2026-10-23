/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, CopilotSession } from '@github/copilot-sdk';
import { localize } from '../../../../nls.js';
import type { ModelSelection, ModelSourceInfo } from '../../common/state/sessionState.js';

type ModelSwitchOptions = Omit<Parameters<CopilotSession['rpc']['model']['switchTo']>[0], 'modelId' | 'providerId'>;
type CatalogProvider = Awaited<ReturnType<CopilotClient['rpc']['models']['list']>>['models'][number]['provider'];

export function readCopilotModelSource(provider: CatalogProvider): ModelSourceInfo | undefined {
	if (provider === undefined) {
		return undefined;
	}
	if (!provider || typeof provider.id !== 'string' || !provider.id.trim() || typeof provider.label !== 'string' || !provider.label.trim()) {
		throw new Error('Runtime returned an invalid model source reference.');
	}
	return { id: provider.id, displayName: provider.label };
}

/** Confirms the effective pair after runtime availability and policy reconciliation. */
export async function assertCopilotModelSource(session: CopilotSession, model: ModelSelection | undefined): Promise<void> {
	if (model?.modelSourceId === undefined) {
		return;
	}
	const catalog = await session.rpc.model.list();
	const available = catalog.list.some(row => {
		if (!row || typeof row !== 'object' || Array.isArray(row) || row.id !== model.id) {
			return false;
		}
		const provider = row.provider;
		return provider !== null && typeof provider === 'object' && !Array.isArray(provider) && provider.id === model.modelSourceId;
	});
	if (!catalog.providers?.some(provider => provider.id === model.modelSourceId) || !available) {
		throw new Error(localize('copilot.modelSourceUnavailable', "The selected model source and model are no longer available."));
	}
	const current = await session.rpc.model.getCurrent();
	if (current.modelId !== model.id || current.providerId !== model.modelSourceId) {
		throw new Error(localize('copilot.modelSourceNotApplied', "The runtime did not activate the selected model source and model. No message was sent."));
	}
}

export async function switchCopilotModelSource(session: CopilotSession, model: ModelSelection, options: ModelSwitchOptions): Promise<void> {
	if (typeof model.modelSourceId !== 'string' || !model.modelSourceId.trim()) {
		throw new Error('An exact model source is required.');
	}
	const result = await session.rpc.model.switchTo({ ...options, modelId: model.id, providerId: model.modelSourceId, requireAvailable: true });
	if (result.deferred || (result.status !== 'applied' && result.status !== 'unchanged')) {
		throw new Error(localize('copilot.modelSourceDeferred', "The runtime has not applied the selected model source and model. No message was sent."));
	}
	await assertCopilotModelSource(session, model);
}
