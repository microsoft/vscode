/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionModelInfo } from '../../state/protocol/state.js';
import type { IAgentModelInfo } from '../../agent.js';

const VSCODE_EXPERIMENTAL_MODEL_META_KEY = 'vscode.model.experimental';

/** The label the Copilot API reports in place of a vendor for a model that is not released: an internal or early-access one. */
const EXPERIMENTAL_VENDOR = 'Experimental';

/** Marks a model the Copilot API reports as experimental, going by the vendor it reports for it. */
export function withAgentModelExperimentalMeta(meta: Record<string, unknown> | undefined, vendor: string | undefined): Record<string, unknown> | undefined {
	return vendor === EXPERIMENTAL_VENDOR ? { ...meta, [VSCODE_EXPERIMENTAL_MODEL_META_KEY]: true } : meta;
}

/** Whether a model is experimental: an internal or early-access one, which can change or go away without notice. */
export function isAgentModelExperimental(model: IAgentModelInfo | SessionModelInfo): boolean {
	return model._meta?.[VSCODE_EXPERIMENTAL_MODEL_META_KEY] === true;
}
