/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IModelPickerWorkflow, IModelPickerWorkflowState, IModelPickerWorkflowVariant } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerWorkflow.js';
import { SESSION_COMPARISON_MAX_ATTEMPTS, SESSION_COMPARISON_MIN_ATTEMPTS } from '../../../services/sessions/common/sessionComparison.js';

type ComparisonStep = 'attempts' | 'judge' | 'synthesizer';

interface IComparisonModelSelection {
	readonly models: readonly string[];
	readonly repeatCount: number;
	/** Extra attempts of an already-selected model at another configuration, keyed by model id. */
	readonly variants: Readonly<Record<string, readonly IModelPickerWorkflowVariant[]>>;
	readonly judge?: string;
	readonly synthesizer?: string;
}

/** One resolved attempt: a selected model, and its configuration override when it is a variant. */
export interface IComparisonAttempt {
	readonly modelId: string;
	readonly configuration?: Readonly<Record<string, string | number | boolean | null>>;
	/** The variant's display label, e.g. "Max", when this attempt is a variant of its model. */
	readonly variantLabel?: string;
}

/**
 * How many real, distinct attempts are configured: one per selected model, plus one per
 * variant. Unlike {@link getAttempts}, this never applies the legacy single-model
 * repeat-count fallback, so checking exactly one model (with no variants) counts as one
 * attempt, not the default repeat count, for Done/Next gating and the footer status.
 */
function getAttemptCount(selection: IComparisonModelSelection | undefined): number {
	if (!selection) {
		return 0;
	}
	return selection.models.reduce((sum, modelId) => sum + 1 + (selection.variants[modelId]?.length ?? 0), 0);
}

function getAttempts(selection: IComparisonModelSelection | undefined): readonly IComparisonAttempt[] {
	if (!selection) {
		return [];
	}
	// Legacy path, preserved for existing single-model repeat-count callers: a lone selected
	// model with no variants runs repeatCount times at its one configuration.
	if (selection.models.length === 1 && !(selection.variants[selection.models[0]]?.length)) {
		return Array.from({ length: selection.repeatCount }, () => ({ modelId: selection.models[0] }));
	}
	return selection.models.flatMap(modelId => [
		{ modelId },
		...(selection.variants[modelId] ?? []).map(variant => ({ modelId, configuration: variant.configuration, variantLabel: variant.label })),
	]);
}

/** The composer pill text: the attempt models by name, or a count when names are not resolvable. */
function getAttemptsSummaryText(attempts: readonly IComparisonAttempt[], getModelLabel?: (modelId: string) => string | undefined): string {
	const labels = getModelLabel && attempts.map(attempt => {
		const label = getModelLabel(attempt.modelId);
		return label && (attempt.variantLabel ? `${label} ${attempt.variantLabel}` : label);
	});
	return labels?.every((label): label is string => !!label)
		? labels.join(', ')
		: localize('comparisonPicker.summary', "{0} Attempts", attempts.length);
}

/** How many models are selected, flagged when there are more than a comparison can run. */
function getAttemptsStatus(count: number): { readonly text: string; readonly warning?: boolean } | undefined {
	if (count === 0) {
		return undefined;
	}
	if (count > SESSION_COMPARISON_MAX_ATTEMPTS) {
		return { text: localize('comparisonPicker.selectedOverLimit', "{0} selected · {1} max", count, SESSION_COMPARISON_MAX_ATTEMPTS), warning: true };
	}
	return { text: localize('comparisonPicker.selectedCount', "{0} selected", count) };
}

export class SessionComparisonModelSelection extends Disposable implements IModelPickerWorkflow {
	private readonly _committed = observableValue<IComparisonModelSelection | undefined>(this, undefined);
	private readonly _draft = observableValue<IComparisonModelSelection | undefined>(this, undefined);
	private readonly _step = observableValue<ComparisonStep>(this, 'attempts');

	readonly label = localize('comparisonPicker.compare', "Compare Models");
	readonly enabled = derived(this, reader => !!this._committed.read(reader));
	readonly configured = this.enabled;
	readonly attempts = derived(this, reader => getAttempts(this._committed.read(reader)));
	readonly attemptModelIds = derived(this, reader => this.attempts.read(reader).map(attempt => attempt.modelId));
	readonly judgeModelId = derived(this, reader => this._committed.read(reader)?.judge);
	readonly synthesizerModelId = derived(this, reader => this._committed.read(reader)?.synthesizer);
	readonly summary = derived(this, reader => this.enabled.read(reader)
		? getAttemptsSummaryText(this.attempts.read(reader), this._getModelLabel)
		: undefined);
	/** The composer shows each attempt's own icon instead of the joined name list. */
	readonly summaryModelIds = derived(this, reader => this.enabled.read(reader) ? this.attemptModelIds.read(reader) : undefined);
	readonly state = derived<IModelPickerWorkflowState | undefined>(this, reader => {
		const draft = this._draft.read(reader);
		if (!draft || !this.available.read(reader)) {
			return undefined;
		}
		const step = this._step.read(reader);
		const { models, judge, synthesizer } = draft;
		// Any number of models can be checked, but every step can only be continued or finished
		// with 2 to 10 total attempts (a model with variants contributes more than one).
		const attemptCount = getAttemptCount(draft);
		const valid = attemptCount >= SESSION_COMPARISON_MIN_ATTEMPTS && attemptCount <= SESSION_COMPARISON_MAX_ATTEMPTS;
		return {
			title: step === 'attempts' ? localize('comparisonPicker.attempts', "Attempts")
				: step === 'judge' ? localize('comparisonPicker.judge', "Judge")
					: localize('comparisonPicker.synthesizer', "Synthesizer"),
			description: step === 'attempts' ? localize('comparisonPicker.attemptsDescription', "Select two or more models to run one prompt in parallel. Compare results or have them judged and combined.")
				: step === 'judge' ? localize('comparisonPicker.judgeDescription', "Select a model to review the attempts and pick a winner. Skip this step to compare them yourself.")
					: localize('comparisonPicker.synthesizerDescription', "Select a model to combine the best parts of each attempt. Synthesis starts only when you ask."),
			summary: getAttemptsSummaryText(getAttempts(draft), this._getModelLabel),
			selectedModelIds: step === 'attempts' ? models : step === 'judge' ? judge ? [judge] : [] : synthesizer ? [synthesizer] : [],
			multiple: step === 'attempts',
			maxSelections: step === 'attempts' ? Number.POSITIVE_INFINITY : 1,
			canGoBack: step !== 'attempts',
			canGoNext: valid && (step === 'attempts' || step === 'judge' && judge !== undefined),
			canFinish: valid,
			hasNextStep: step !== 'synthesizer',
			status: step === 'attempts' ? getAttemptsStatus(attemptCount) : undefined,
		};
	});

	constructor(
		readonly available: IObservable<boolean>,
		configurationResolving: IObservable<boolean> = constObservable(false),
		private readonly _getModelLabel?: (modelId: string) => string | undefined,
	) {
		super();
		this._register(autorun(reader => {
			if (!available.read(reader) && !configurationResolving.read(reader)) {
				this.reset();
			}
		}));
	}

	start(): void {
		if (!this.available.get()) {
			throw new Error('Model comparison is not available.');
		}
		transaction(tx => {
			this._draft.set(this._committed.get() ?? { models: [], repeatCount: 2, variants: {} }, tx);
			this._step.set('attempts', tx);
		});
	}

	cancel(): void {
		transaction(tx => {
			this._draft.set(undefined, tx);
			this._step.set('attempts', tx);
		});
	}

	reset(): void {
		transaction(tx => {
			this._committed.set(undefined, tx);
			this._draft.set(undefined, tx);
			this._step.set('attempts', tx);
		});
	}

	private _getDraft(): IComparisonModelSelection {
		const draft = this._draft.get();
		if (!draft) {
			throw new Error('Comparison setup is not active.');
		}
		return draft;
	}

	select(modelId: string): void {
		const draft = this._getDraft();
		switch (this._step.get()) {
			case 'attempts': {
				const models = draft.models;
				if (models.includes(modelId)) {
					// Deselecting a model discards its queued variants with it.
					const { [modelId]: _removed, ...variants } = draft.variants;
					this._draft.set({ ...draft, models: models.filter(id => id !== modelId), variants }, undefined);
				} else {
					this._draft.set({ ...draft, models: [...models, modelId] }, undefined);
				}
				break;
			}
			case 'judge': {
				const judge = draft.judge === modelId ? undefined : modelId;
				this._draft.set({ ...draft, judge, synthesizer: judge ? draft.synthesizer : undefined }, undefined);
				break;
			}
			case 'synthesizer':
				this._draft.set({ ...draft, synthesizer: draft.synthesizer === modelId ? undefined : modelId }, undefined);
				break;
		}
	}

	getVariants(modelId: string): readonly IModelPickerWorkflowVariant[] {
		const draft = this._draft.get();
		return draft?.models.includes(modelId) ? draft.variants[modelId] ?? [] : [];
	}

	addVariant(modelId: string, configuration: Readonly<Record<string, string | number | boolean | null>>, label: string): void {
		const draft = this._getDraft();
		if (!draft.models.includes(modelId)) {
			throw new Error('Select the model before adding another attempt of it.');
		}
		const variants = [...(draft.variants[modelId] ?? []), { configuration, label }];
		this._draft.set({ ...draft, variants: { ...draft.variants, [modelId]: variants } }, undefined);
	}

	removeVariant(modelId: string, index: number): void {
		const draft = this._getDraft();
		const variants = (draft.variants[modelId] ?? []).filter((_, candidate) => candidate !== index);
		this._draft.set({ ...draft, variants: { ...draft.variants, [modelId]: variants } }, undefined);
	}

	setCount(count: number): void {
		if (!Number.isInteger(count) || count < 2 || count > SESSION_COMPARISON_MAX_ATTEMPTS) {
			throw new Error('Comparison run count must be an integer between 2 and 10.');
		}
		this._draft.set({ ...this._getDraft(), repeatCount: count }, undefined);
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
		transaction(tx => {
			this._committed.set(this._getDraft(), tx);
			this._draft.set(undefined, tx);
			this._step.set('attempts', tx);
		});
	}

	retainModels(availableIds: ReadonlySet<string>): void {
		transaction(tx => {
			const committed = this._committed.get();
			if (committed && [...committed.models, committed.judge, committed.synthesizer].some(id => id !== undefined && !availableIds.has(id))) {
				this._committed.set(undefined, tx);
			}
			const draft = this._draft.get();
			if (!draft) {
				return;
			}
			const models = draft.models.filter(id => availableIds.has(id));
			const judge = draft.judge && availableIds.has(draft.judge) ? draft.judge : undefined;
			const synthesizer = judge && draft.synthesizer && availableIds.has(draft.synthesizer) ? draft.synthesizer : undefined;
			const variants = models.length !== draft.models.length
				? Object.fromEntries(Object.entries(draft.variants).filter(([modelId]) => models.includes(modelId)))
				: draft.variants;
			if (models.length !== draft.models.length || judge !== draft.judge || synthesizer !== draft.synthesizer) {
				this._draft.set({ ...draft, models, judge, synthesizer, variants }, tx);
				if (models.length !== draft.models.length) {
					this._step.set('attempts', tx);
				} else if (judge !== draft.judge) {
					this._step.set(models.length ? 'judge' : 'attempts', tx);
				}
			}
		});
	}
}
