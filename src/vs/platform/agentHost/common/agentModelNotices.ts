/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentModelInfo } from './agent.js';
import type { SessionModelInfo } from './state/protocol/state.js';

const DATA_RETENTION_WARNING_CODE = 'data_retention';
const PENDING_DEPRECATION_WARNING_CODE = 'model_pending_deprecation';

type ModelMessage = { readonly code: string; readonly message: string };
type ModelNoticeSource = {
	readonly warningText?: { readonly dataRetention?: string };
	readonly infoMessages?: readonly ModelMessage[];
	readonly warningMessages?: readonly ModelMessage[];
};

/** Converts SDK model messages to model-picker metadata. */
export function createAgentModelNoticesMeta(source: ModelNoticeSource): Record<string, unknown> | undefined {
	const warningText: Record<string, string> = {};
	const infoText: Record<string, string> = {};
	if (source.warningText?.dataRetention) {
		warningText[DATA_RETENTION_WARNING_CODE] = source.warningText.dataRetention;
	}
	for (const { code, message } of source.infoMessages ?? []) {
		if (message) {
			const target = code === PENDING_DEPRECATION_WARNING_CODE ? warningText : infoText;
			target[code || 'info'] = message;
		}
	}
	for (const { code, message } of source.warningMessages ?? []) {
		if (message) {
			warningText[code || 'warning'] = message;
		}
	}
	const rowWarning = source.warningMessages?.find(({ message }) => !!message)?.message
		?? warningText[PENDING_DEPRECATION_WARNING_CODE];
	const result = {
		...(Object.keys(warningText).length > 0 ? { warningText } : {}),
		...(Object.keys(infoText).length > 0 ? { infoText } : {}),
		...(rowWarning ? { rowWarning } : {}),
	};
	return Object.keys(result).length > 0 ? result : undefined;
}

/** Reads model-picker messages from Agent Host metadata. */
export function readAgentModelNoticesMeta(model: IAgentModelInfo | SessionModelInfo) {
	const meta = model._meta;
	return {
		warningText: asStringDictionary(meta?.warningText),
		infoText: asStringDictionary(meta?.infoText),
		rowWarning: typeof meta?.rowWarning === 'string' && meta.rowWarning.length > 0 ? meta.rowWarning : undefined,
	};
}

function asStringDictionary(value: unknown): Record<string, string> | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const entries = Object.entries(value).filter((entry): entry is [string, string] =>
		entry[0].length > 0 && typeof entry[1] === 'string' && entry[1].length > 0);
	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
