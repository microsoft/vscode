/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { CHATGPT_SUBSCRIPTION_MODEL_SOURCE_ID } from '../../../../platform/agentHost/common/agentModelSource.js';
import { ILanguageModelChatMetadataAndIdentifier } from './languageModels.js';

/** Presentation for a trusted model source owned by one language-model vendor. */
export interface ILanguageModelSourcePresentation {
	readonly ownerVendor: string;
	readonly sourceId: string;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly description: string;
}

export interface ILanguageModelSourcePresentationRegistry {
	register(presentation: ILanguageModelSourcePresentation): IDisposable;
	get(ownerVendor: string, sourceId: string): ILanguageModelSourcePresentation | undefined;
}

class LanguageModelSourcePresentationRegistry implements ILanguageModelSourcePresentationRegistry {
	private readonly _presentations = new Map<string, ILanguageModelSourcePresentation>();

	register(presentation: ILanguageModelSourcePresentation): IDisposable {
		const key = this._key(presentation.ownerVendor, presentation.sourceId);
		if (this._presentations.has(key)) {
			throw new Error(`A language model source presentation is already registered for ${presentation.ownerVendor}/${presentation.sourceId}`);
		}
		this._presentations.set(key, presentation);
		return toDisposable(() => {
			if (this._presentations.get(key) === presentation) {
				this._presentations.delete(key);
			}
		});
	}

	get(ownerVendor: string, sourceId: string): ILanguageModelSourcePresentation | undefined {
		return this._presentations.get(this._key(ownerVendor, sourceId));
	}

	private _key(ownerVendor: string, sourceId: string): string {
		return `${ownerVendor}\u0000${sourceId}`;
	}
}

export const languageModelSourcePresentationRegistry: ILanguageModelSourcePresentationRegistry = new LanguageModelSourcePresentationRegistry();

/**
 * Adds the source label to models provided by a ChatGPT subscription. Other model names remain
 * unadorned.
 */
export function getLanguageModelDisplayNameWithSubscriptionSource(
	model: ILanguageModelChatMetadataAndIdentifier,
	displayName = model.metadata.name,
): string {
	const modelGroup = model.metadata.modelGroup;
	if (modelGroup?.sourceId !== CHATGPT_SUBSCRIPTION_MODEL_SOURCE_ID) {
		return displayName;
	}

	const sourceLabel = languageModelSourcePresentationRegistry.get(model.metadata.vendor, modelGroup.sourceId)?.label;
	return sourceLabel
		? localize('chat.languageModelNameWithSubscriptionSource', "{0} ({1})", displayName, sourceLabel)
		: displayName;
}
