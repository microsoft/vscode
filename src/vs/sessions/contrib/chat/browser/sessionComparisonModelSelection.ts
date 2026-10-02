/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IModelPickerWorkflow, IModelPickerWorkflowState } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerWorkflow.js';
import { SESSION_COMPARISON_MAX_ATTEMPTS } from '../../../services/sessions/common/sessionComparison.js';

type ComparisonStep = 'attempts' | 'judge' | 'synthesizer';

export class SessionComparisonModelSelection extends Disposable implements IModelPickerWorkflow {
	private readonly _enabled = observableValue(this, false);
	private readonly _configured = observableValue(this, false);
	readonly configured: IObservable<boolean> = this._configured;
	private readonly _step = observableValue<ComparisonStep>(this, 'attempts');
	private readonly _models = observableValue<readonly string[]>(this, []);
	private readonly _repeatCount = observableValue(this, 2);
	private readonly _judge = observableValue<string | undefined>(this, undefined);
	private readonly _synthesizer = observableValue<string | undefined>(this, undefined);

	readonly label = localize('comparisonPicker.compare', "Compare Models");
	readonly enabled: IObservable<boolean> = this._enabled;
	readonly attemptModelIds = derived(this, reader => {
		const models = this._models.read(reader);
		return models.length === 1 ? Array<string>(this._repeatCount.read(reader)).fill(models[0]) : models;
	});
	readonly judgeModelId: IObservable<string | undefined> = this._judge;
	readonly synthesizerModelId: IObservable<string | undefined> = this._synthesizer;
	readonly state = derived<IModelPickerWorkflowState | undefined>(this, reader => {
		if (!this.enabled.read(reader) || !this.available.read(reader)) {
			return undefined;
		}
		const step = this._step.read(reader);
		const models = this._models.read(reader);
		const judge = this._judge.read(reader);
		const synthesizer = this._synthesizer.read(reader);
		const valid = models.length > 0;
		return {
			title: step === 'attempts' ? localize('comparisonPicker.attempts', "Attempts")
				: step === 'judge' ? localize('comparisonPicker.judge', "Judge")
					: localize('comparisonPicker.synthesizer', "Synthesizer"),
			description: step === 'attempts' ? localize('comparisonPicker.attemptsDescription', "Choose 2 to 10 models, or run one model 2 to 10 times.")
				: step === 'judge' ? localize('comparisonPicker.judgeDescription', "Optionally choose a model to review the attempts and recommend a winner. Leave unselected to run attempts only.")
					: localize('comparisonPicker.synthesizerDescription', "Optionally choose a model to combine the best parts after review. Synthesis starts only when you request it."),
			summary: localize('comparisonPicker.summary', "{0} Attempts", this.attemptModelIds.read(reader).length),
			selectedModelIds: step === 'attempts' ? models : step === 'judge' ? judge ? [judge] : [] : synthesizer ? [synthesizer] : [],
			multiple: step === 'attempts',
			maxSelections: step === 'attempts' ? SESSION_COMPARISON_MAX_ATTEMPTS : 1,
			canGoBack: step !== 'attempts',
			canGoNext: valid && (step === 'attempts' || step === 'judge' && judge !== undefined),
			canFinish: valid && (step === 'synthesizer' || step === 'judge' && judge === undefined),
			count: step === 'attempts' && models.length === 1 ? {
				label: localize('comparisonPicker.runs', "Number of Runs"),
				value: this._repeatCount.read(reader),
				min: 2,
				max: SESSION_COMPARISON_MAX_ATTEMPTS,
			} : undefined,
		};
	});

	constructor(readonly available: IObservable<boolean>, configurationResolving: IObservable<boolean> = constObservable(false)) {
		super();
		this._register(autorun(reader => {
			if (!available.read(reader) && !configurationResolving.read(reader)) {
				this.cancel();
			}
		}));
	}

	start(): void {
		if (!this.available.get()) {
			throw new Error('Model comparison is not available.');
		}
		transaction(tx => {
			this._enabled.set(true, tx);
			this._configured.set(false, tx);
			this._step.set('attempts', tx);
		});
	}

	cancel(): void {
		transaction(tx => {
			this._enabled.set(false, tx);
			this._configured.set(false, tx);
			this._step.set('attempts', tx);
			this._models.set([], tx);
			this._repeatCount.set(2, tx);
			this._judge.set(undefined, tx);
			this._synthesizer.set(undefined, tx);
		});
	}

	select(modelId: string): void {
		transaction(tx => {
			this._configured.set(false, tx);
			switch (this._step.get()) {
				case 'attempts': {
					const models = this._models.get();
					if (models.includes(modelId)) {
						this._models.set(models.filter(id => id !== modelId), tx);
					} else if (models.length < SESSION_COMPARISON_MAX_ATTEMPTS) {
						this._models.set([...models, modelId], tx);
					}
					break;
				}
				case 'judge':
					this._judge.set(this._judge.get() === modelId ? undefined : modelId, tx);
					if (!this._judge.get()) {
						this._synthesizer.set(undefined, tx);
					}
					break;
				case 'synthesizer':
					this._synthesizer.set(this._synthesizer.get() === modelId ? undefined : modelId, tx);
					break;
			}
		});
	}

	setCount(count: number): void {
		if (!Number.isInteger(count) || count < 2 || count > SESSION_COMPARISON_MAX_ATTEMPTS) {
			throw new Error('Comparison run count must be an integer between 2 and 10.');
		}
		transaction(tx => {
			this._repeatCount.set(count, tx);
			this._configured.set(false, tx);
		});
	}

	back(): void {
		this._step.set(this._step.get() === 'synthesizer' ? 'judge' : 'attempts', undefined);
	}

	next(): void {
		if (!this.state.get()?.canGoNext) {
			throw new Error('The comparison step is not ready.');
		}
		this._step.set(this._step.get() === 'attempts' ? 'judge' : 'synthesizer', undefined);
	}

	finish(): void {
		if (!this.state.get()?.canFinish) {
			throw new Error('The comparison is not ready.');
		}
		this._configured.set(true, undefined);
	}

	retainModels(availableIds: ReadonlySet<string>): void {
		transaction(tx => {
			const models = this._models.get();
			const retained = models.filter(id => availableIds.has(id));
			if (retained.length !== models.length) {
				this._configured.set(false, tx);
				this._models.set(retained, tx);
				this._step.set('attempts', tx);
			}
			const judge = this._judge.get();
			if (judge && !availableIds.has(judge)) {
				this._configured.set(false, tx);
				this._judge.set(undefined, tx);
				this._synthesizer.set(undefined, tx);
				this._step.set(retained.length ? 'judge' : 'attempts', tx);
			}
			const synthesizer = this._synthesizer.get();
			if (synthesizer && !availableIds.has(synthesizer)) {
				this._configured.set(false, tx);
				this._synthesizer.set(undefined, tx);
			}
		});
	}
}
