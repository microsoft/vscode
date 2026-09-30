/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Request and response shapes of the Laya decision model. They mirror the types of
 * `@receptron/laya` (and TypeSafe Jev's `system_one` API) but are declared here so that the
 * extension host never imports the package, which would load the native ONNX runtime.
 */

export interface ChoiceQuestion {
	readonly type: 'choice';
	readonly instructions: string | object;
	/** Option name to short description (or `null`), or a plain list of option names. */
	readonly criteria: Readonly<Record<string, string | null>> | readonly string[];
}

export interface ScoreQuestion {
	readonly type: 'score';
	readonly instructions: string | object;
	/** Ordered levels, index 0 is the lowest. */
	readonly criteria: readonly string[];
}

export interface NoulQuestion {
	readonly type: 'noul';
	readonly instructions: string | object;
	readonly criteria?: { readonly true?: string; readonly false?: string };
}

export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export interface ChoiceAnswer {
	readonly type: 'choice';
	readonly choice: string;
	readonly probabilities: Record<string, number>;
	readonly confidence: number;
	readonly rl_agent: { readonly act_probability: number };
}

export interface ScoreAnswer {
	readonly type: 'score';
	/** Expected level, between 0 and the number of levels minus one. */
	readonly score: number;
	readonly legend: Record<string, string>;
	readonly probabilities: Record<string, number>;
	readonly confidence: number;
	readonly rl_agent: { readonly act_probability: number };
}

export interface NoulAnswer {
	readonly type: 'noul';
	/** Calibrated probability that the statement is true. */
	readonly noul: number;
	readonly rl_agent: { readonly act_probability: number };
}

export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export type AnswerFor<Q extends Question> = Q extends ChoiceQuestion ? ChoiceAnswer : Q extends ScoreQuestion ? ScoreAnswer : NoulAnswer;

export interface DecisionResult<Q extends Record<string, Question>> {
	readonly model: string;
	readonly answers: { [K in keyof Q]: AnswerFor<Q[K]> };
	readonly usage: { readonly input_tokens: number; readonly output_tokens: number };
}
