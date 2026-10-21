/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ILanguageModelChatMetadataAndIdentifier } from './languageModels.js';

/** Presentation for a trusted model source owned by one language-model vendor. */
export interface ILanguageModelSourcePresentation {
	readonly ownerVendor: string;
	/** Opaque source identity, not suitable for display or product telemetry. */
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
			throw new Error('A language model source presentation is already registered for this owner and source.');
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

/** Resolves a model's trusted source within its owning vendor. */
export function getLanguageModelSourcePresentation(model: ILanguageModelChatMetadataAndIdentifier): ILanguageModelSourcePresentation | undefined {
	const sourceId = model.metadata.modelGroup?.sourceId;
	return sourceId ? languageModelSourcePresentationRegistry.get(model.metadata.vendor, sourceId) : undefined;
}

/** Adds a registered source label without changing the provider's model name. */
export function getLanguageModelDisplayNameWithSubscriptionSource(
	model: ILanguageModelChatMetadataAndIdentifier,
	displayName = model.metadata.name,
): string {
	const sourceLabel = getLanguageModelSourcePresentation(model)?.label;
	return sourceLabel
		? localize('chat.languageModelNameWithSubscriptionSource', "{0} ({1})", displayName, sourceLabel)
		: displayName;
}
