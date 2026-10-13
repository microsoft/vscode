/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguageModelConfigurationSchema } from './languageModels.js';

export const IChatModelDefaultsService = createDecorator<IChatModelDefaultsService>('chatModelDefaultsService');

export interface IChatModelDefaultsCapabilities {
	readonly version: 1;
	readonly scopeAwareDefaults: true;
	readonly numericSuggestions: true;
	readonly customNumericValues: true;
	/** This API makes no claim about the paired request consumer. */
	readonly requestConfigurationFidelity: 'unverified';
}

export interface IChatModelDefaultsTarget {
	readonly id: string;
	readonly label: string;
}

export interface IChatModelDefaultsSnapshot {
	readonly targetId: string;
	readonly status: 'available' | 'unavailable' | 'unsupported';
	readonly schema?: ILanguageModelConfigurationSchema;
	readonly preferences: { readonly scoped?: IStringDictionary<unknown>; readonly profile?: IStringDictionary<unknown> };
	readonly effective: IStringDictionary<unknown>;
	readonly sources: IStringDictionary<'scoped' | 'profile' | 'default'>;
	readonly revision: string;
}

export interface IChatModelDefaultsPatch {
	readonly set?: IStringDictionary<unknown>;
	readonly reset?: readonly string[];
}

export interface IChatModelDefaultsUpdateResult {
	readonly outcome: 'applied' | 'conflict' | 'failed';
	readonly snapshot: IChatModelDefaultsSnapshot;
}

export interface IChatModelDefaultsService {
	readonly _serviceBrand: undefined;
	readonly capabilities: IChatModelDefaultsCapabilities;
	readonly onDidChange: Event<{ readonly modelId: string; readonly targetId: string }>;
	getTargets(modelId: string): readonly IChatModelDefaultsTarget[];
	inspect(modelId: string, targetId: string): IChatModelDefaultsSnapshot;
	update(modelId: string, targetId: string, patch: IChatModelDefaultsPatch, expectedRevision: string, validateAccess: () => void): Promise<IChatModelDefaultsUpdateResult>;
}
