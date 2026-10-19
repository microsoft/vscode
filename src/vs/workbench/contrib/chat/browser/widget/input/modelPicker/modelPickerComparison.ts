/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../../../base/common/observable.js';
import { RawContextKey } from '../../../../../../../platform/contextkey/common/contextkey.js';

export const ModelComparisonAvailableContext = new RawContextKey<boolean>('chatModelComparisonAvailable', false);
export const ModelComparisonPickerFocusedContext = new RawContextKey<boolean>('chatModelComparisonPickerFocused', false);

/** Comparison selection controller rendered by the shared tabbed model picker. */
export interface IModelPickerComparison {
	readonly available: IObservable<boolean>;
	/** Composer label for the committed selection, independent of the open setup draft. */
	readonly summary: IObservable<string | undefined>;
	/**
	 * One model id per attempt in the committed selection (duplicated for extra variant
	 * attempts of the same model), parallel to `summary`. When all ids are distinct, the
	 * composer shows each attempt's own icon; repeated ids retain the labeled summary.
	 */
	readonly summaryModelIds?: IObservable<readonly string[] | undefined>;
	readonly state: IObservable<IModelPickerComparisonState | undefined>;
	readonly label: string;
	readonly startCommandId?: string;
	readonly showPickerHint?: IObservable<boolean>;
	start(): void;
	cancel(): void;
	reset(): void;
	select(modelId: string): void;
	back(): void;
	next(): void;
	finish(): void;
	setCount(count: number): void;
	/**
	 * Extra attempts of a selected model at another configuration (e.g. the same model at a
	 * different thinking effort), beyond its single default-configured attempt. Empty when the
	 * model is not currently selected or has no variants.
	 */
	getVariants(modelId: string): readonly IModelPickerComparisonVariant[];
	/** Adds another attempt of a selected model at a specific configuration. */
	addVariant(
		modelId: string,
		configuration: Readonly<Record<string, string | number | boolean | null>>,
		label: string,
		baseConfiguration?: Readonly<Record<string, string | number | boolean | null>>,
	): void;
	removeVariant(modelId: string, index: number): void;
	/** Reconciles draft and committed variants after a selected model's persisted base configuration changes. */
	reconcileVariants?(modelId: string, baseConfiguration: Readonly<Record<string, string | number | boolean | null>>): void;
}

/** One extra configured attempt of an already-selected model. */
export interface IModelPickerComparisonVariant {
	readonly configuration: Readonly<Record<string, string | number | boolean | null>>;
	/** The configuration's display label, e.g. "Max", shown beside the model name. */
	readonly label: string;
}

export interface IModelPickerComparisonState {
	readonly title: string;
	readonly description: string;
	readonly summary: string;
	readonly selectedModelIds: readonly string[];
	readonly multiple: boolean;
	/** The most models that can be checked at once; a comparison may allow more than it accepts and disable Done and Next instead. */
	readonly maxSelections: number;
	readonly canGoBack: boolean;
	readonly canGoNext: boolean;
	readonly canFinish: boolean;
	/** Whether this step is followed by another; Next then stays visible and is disabled until `canGoNext`. Defaults to `canGoNext`. */
	readonly hasNextStep?: boolean;
	/** A short footer status, such as how many models are selected or what must change before continuing. */
	readonly status?: { readonly text: string; readonly warning?: boolean };
	readonly count?: { readonly label: string; readonly value: number; readonly min: number; readonly max: number };
}
