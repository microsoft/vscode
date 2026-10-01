/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { IModelPickerMultiModelDelegate } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerActionItem.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../workbench/contrib/chat/common/languageModels.js';

/** The most models one prompt can run on at once. */
export const SESSION_COMPARISON_MAX_MODELS = 4;

/**
 * The new-session composer's Compare mode: the models one prompt should run on
 * side by side. The model picker edits it; the composer reads it on send.
 */
export class SessionMultiModelSelection extends Disposable implements IModelPickerMultiModelDelegate {

	private readonly _enabled = observableValue<boolean>(this, false);
	private readonly _selectedModelIds = observableValue<readonly string[]>(this, []);

	readonly enabled: IObservable<boolean>;
	readonly selectedModelIds: IObservable<readonly string[]> = this._selectedModelIds;
	readonly maxModels = SESSION_COMPARISON_MAX_MODELS;

	/** Whether a send runs a comparison: Compare mode is on and at least two models are chosen. */
	readonly isComparing: IObservable<boolean>;

	constructor(readonly available: IObservable<boolean>) {
		super();
		this.enabled = derived(this, reader => this.available.read(reader) && this._enabled.read(reader));
		this.isComparing = derived(this, reader => this.enabled.read(reader) && this._selectedModelIds.read(reader).length >= 2);
	}

	setEnabled(enabled: boolean): void {
		transaction(tx => {
			this._enabled.set(enabled, tx);
			if (!enabled) {
				this._selectedModelIds.set([], tx);
			}
		});
	}

	toggleModel(model: ILanguageModelChatMetadataAndIdentifier): void {
		const selected = this._selectedModelIds.get();
		if (selected.includes(model.identifier)) {
			this._selectedModelIds.set(selected.filter(id => id !== model.identifier), undefined);
		} else if (selected.length < this.maxModels) {
			this._selectedModelIds.set([...selected, model.identifier], undefined);
		}
	}

	/** Drops chosen models the current pool no longer offers, e.g. after the harness changed. */
	retainModels(available: readonly ILanguageModelChatMetadataAndIdentifier[]): void {
		const selected = this._selectedModelIds.get();
		const retained = selected.filter(id => available.some(model => model.identifier === id));
		if (retained.length !== selected.length) {
			this._selectedModelIds.set(retained, undefined);
		}
	}

	reset(): void {
		this.setEnabled(false);
	}
}
