/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import type { SessionModelInfo } from '../../state/protocol/state.js';
import type { IAgentModelInfo } from '../../agent.js';

const VSCODE_ENSEMBLE_META_KEY = 'vscode.chat.ensemble';

/** How the host presents its Auto model as Ensemble. */
export interface IAgentModelEnsembleMeta {
	readonly intelligenceUsesHydraFusion: boolean;
}

export function withAgentModelEnsembleMeta(meta: Record<string, unknown> | undefined, ensemble: IAgentModelEnsembleMeta): Record<string, unknown> {
	return { ...meta, [VSCODE_ENSEMBLE_META_KEY]: { intelligenceUsesHydraFusion: ensemble.intelligenceUsesHydraFusion } };
}

export function readAgentModelEnsembleMeta(model: IAgentModelInfo | SessionModelInfo): IAgentModelEnsembleMeta | undefined {
	const value = model._meta?.[VSCODE_ENSEMBLE_META_KEY];
	const intelligenceUsesHydraFusion = isObject(value) ? (value as { intelligenceUsesHydraFusion?: unknown }).intelligenceUsesHydraFusion : undefined;
	return typeof intelligenceUsesHydraFusion === 'boolean' ? { intelligenceUsesHydraFusion } : undefined;
}
