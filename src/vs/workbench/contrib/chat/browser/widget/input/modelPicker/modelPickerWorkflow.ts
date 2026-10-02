/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../../../base/common/observable.js';

/** Owner-defined selection steps rendered by the tabbed model picker. */
export interface IModelPickerWorkflow {
	readonly available: IObservable<boolean>;
	readonly state: IObservable<IModelPickerWorkflowState | undefined>;
	readonly label: string;
	start(): void;
	cancel(): void;
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
	readonly maxSelections: number;
	readonly canGoBack: boolean;
	readonly canGoNext: boolean;
	readonly canFinish: boolean;
	readonly count?: { readonly label: string; readonly value: number; readonly min: number; readonly max: number };
}
