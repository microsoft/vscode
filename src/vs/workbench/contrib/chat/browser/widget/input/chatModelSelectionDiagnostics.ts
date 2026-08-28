/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService, IStorageValueChangeEvent, StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { getSelectedModelStorageKey, SELECTED_MODEL_STORAGE_KEY_PREFIX } from '../../../common/chatSelectedModel.js';
import { ChatAgentLocation } from '../../../common/constants.js';

export type ChatModelSelectionLogLevel = 'debug' | 'info' | 'error';
export type ChatModelSelectionLogValue = string | number | boolean | undefined;

export interface IChatModelSelectionDiagnosticContext {
	readonly surface: string;
	readonly location: ChatAgentLocation;
	readonly modelTarget: string | undefined;
	readonly sessionKey: string | undefined;
	readonly conversationKey: string | undefined;
	readonly metadata?: Readonly<Record<string, ChatModelSelectionLogValue>>;
}

export interface IChatModelSelectionDiagnostics {
	report(event: string, details: Readonly<Record<string, ChatModelSelectionLogValue>>, level?: ChatModelSelectionLogLevel): void;
}

export class ChatModelSelectionDiagnostics implements IChatModelSelectionDiagnostics {

	constructor(
		private readonly _logService: ILogService,
		private readonly _storageService: IStorageService,
		private readonly _getContext: () => IChatModelSelectionDiagnosticContext,
	) { }

	report(event: string, details: Readonly<Record<string, ChatModelSelectionLogValue>>, level: ChatModelSelectionLogLevel = 'debug'): void {
		const context = this._getContext();
		const fields = {
			surface: context.surface,
			sessionKey: context.sessionKey,
			conversationKey: context.conversationKey,
			modelTarget: context.modelTarget,
			storageKey: getSelectedModelStorageKey(context.location, context.modelTarget),
			...context.metadata,
			...details,
		};
		const message = `[ChatModelSelection] event=${event} ${Object.entries(fields)
			.map(([key, value]) => `${key}=${value === undefined ? 'undefined' : JSON.stringify(value)}`)
			.join(' ')}`;
		switch (level) {
			case 'debug':
				this._logService.debug(message);
				break;
			case 'info':
				this._logService.info(message);
				break;
			case 'error':
				this._logService.error(message);
				break;
		}
	}

	logStorageChange(event: IStorageValueChangeEvent, currentModel: string | undefined): void {
		if (!event.key.startsWith(SELECTED_MODEL_STORAGE_KEY_PREFIX) || event.key.endsWith('.isDefault')) {
			return;
		}
		const context = this._getContext();
		const activeStorageKey = getSelectedModelStorageKey(context.location, context.modelTarget);
		const storedModel = this._storageService.get(event.key, StorageScope.PROFILE);
		const matchesActiveKey = event.key === activeStorageKey;
		const conflictsWithCurrentModel = matchesActiveKey && !!storedModel && !!currentModel && storedModel !== currentModel;
		this.report('storage-change', {
			changedKey: event.key,
			external: event.external,
			matchesActiveKey,
			conflictsWithCurrentModel,
			storedModel,
			currentModel,
		}, event.external || conflictsWithCurrentModel ? 'info' : 'debug');
	}
}

export const NullChatModelSelectionDiagnostics: IChatModelSelectionDiagnostics = {
	report: () => { },
};
