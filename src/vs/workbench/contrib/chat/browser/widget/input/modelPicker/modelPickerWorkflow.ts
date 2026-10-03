/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../../../base/common/observable.js';

/** Owner-defined selection steps rendered by the tabbed model picker. */
export interface IModelPickerWorkflow {
	readonly available: IObservable<boolean>;
	/** Composer label for the committed selection, independent of the open setup draft. */
	readonly summary: IObservable<string | undefined>;
	readonly state: IObservable<IModelPickerWorkflowState | undefined>;
	readonly label: string;
	start(): void;
	cancel(): void;
	reset(): void;
	select(modelId: string): void;
	back(): void;
	next(): void;
	finish(): void;
	setCount(count: number): void;
}

export interface IModelPickerWorkflowState {
	readonly title: string;
	readonly description: string;
	readonly summary: string;
	readonly selectedModelIds: readonly string[];
	readonly multiple: boolean;
	/** The most models that can be checked at once; a workflow may allow more than it accepts and disable Done and Next instead. */
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
