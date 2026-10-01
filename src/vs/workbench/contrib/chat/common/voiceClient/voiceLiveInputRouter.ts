/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IVoiceDispatchResult, IVoicePendingQuestion, IVoiceSessionContext, IVoiceToolCall } from './voiceClientService.js';
import { IBackendQuestionAnswer } from './voiceQuestionAnswers.js';

type VoiceSession = IVoiceSessionContext['sessions'][number];

export interface IVoiceLiveInputTarget {
	readonly session: VoiceSession | undefined;
	readonly questionIndex: number;
	readonly hasContext: boolean;
}

type VoiceLiveInputResult = { readonly toolCall: IVoiceToolCall; readonly clarification?: undefined } | { readonly clarification: string; readonly toolCall?: undefined };

function normalizeReply(text: string): string {
	return text.trim().replace(/[.!]+$/, '').trim().toLowerCase();
}

function ordinalNumber(text: string): number {
	const ordinal = normalizeReply(text).replace(/^option /, '');
	const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
	const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
	const index = words.indexOf(ordinal) >= 0 ? words.indexOf(ordinal) : ordinals.indexOf(ordinal);
	return index >= 0 ? index + 1 : /^\d+$/.test(ordinal) ? Number(ordinal) : 0;
}

function resolveOption(question: IVoicePendingQuestion, text: string): string | undefined {
	const reply = normalizeReply(text);
	const number = ordinalNumber(reply);
	const matches = question.options.filter(option => normalizeReply(option.label) === reply || (number > 0 && ordinalNumber(option.label) === number));
	if (matches.length > 1) {
		return undefined;
	}
	const option = number > 0 ? question.options[number - 1]?.value : undefined;
	if (matches.length === 1) {
		return option !== undefined && option !== matches[0].value ? undefined : matches[0].value;
	}
	return option;
}

function resolveAnswer(question: IVoicePendingQuestion, text: string): IBackendQuestionAnswer | undefined {
	if (question.type === 'text') {
		return text.trim() ? { question_id: question.id, freeform: text.trim() } : undefined;
	}
	const option = resolveOption(question, text);
	if (option !== undefined) {
		return question.type === 'multiSelect'
			? { question_id: question.id, values: [option] }
			: { question_id: question.id, value: option };
	}
	if (question.type === 'multiSelect') {
		const parts = text.split(/\s*,\s*|\s+and\s+/i);
		if (parts.length > 1) {
			const values = parts.map(part => resolveOption(question, part));
			if (values.every(value => value !== undefined)) {
				return { question_id: question.id, values: [...new Set(values)] };
			}
		}
	}
	// Freeform select answers must be explicit: an unrecognized ordinal or
	// duplicate label must not silently become a different kind of answer.
	const freeform = text.trim().replace(/^other(?:\s*:\s*|\s+)/i, '');
	return question.allow_freeform && /^other(?:\s*:\s*|\s+)\S/i.test(text.trim())
		? { question_id: question.id, freeform }
		: undefined;
}

function questionPrompt(question: IVoicePendingQuestion): string {
	const options = question.options.map((option, index) => `${index + 1}. ${option.label}`).join(' ');
	return localize('voice.live.questionPrompt', "{0} {1}", question.title, options).trim();
}

/**
 * Routes direct-provider replies using an input-turn snapshot, never model
 * guesses. Only a still-published pending occurrence can receive a response.
 * Approval commands are complete English replies; choices use displayed labels
 * or ordinals, and custom select answers start with "other". Forms accumulate
 * one answer per turn without submitting until complete or explicitly skipped.
 */
export class VoiceLiveInputRouter {
	private _context: IVoiceSessionContext = { sessions: [], display_locale: '' };
	private _hasContext = false;
	private readonly _answers = new Map<string, { schema: string; answers: IBackendQuestionAnswer[] }>();
	private readonly _submitted = new Set<string>();
	private readonly _calls = new Map<string, string>();

	private _key(session: VoiceSession): string {
		return JSON.stringify([session.id, session.pending?.request_id, session.pending?.pending_id]);
	}

	updateContext(context: IVoiceSessionContext): void {
		this._context = context;
		this._hasContext = true;
		const live = new Map(context.sessions.filter(session => session.pending).map(session => [this._key(session), JSON.stringify(session.pending)]));
		for (const [key, answerSet] of this._answers) {
			if (live.get(key) !== answerSet.schema) {
				this._answers.delete(key);
			}
		}
		for (const key of this._submitted) {
			if (!live.has(key)) {
				this._submitted.delete(key);
			}
		}
		for (const [callId, key] of this._calls) {
			if (!live.has(key)) {
				this._calls.delete(callId);
			}
		}
	}

	isPendingCurrent(sessionId: string, pendingId: string): boolean {
		return this._context.sessions.some(session => session.id === sessionId && session.pending?.pending_id === pendingId && !this._submitted.has(this._key(session)));
	}

	isActiveSession(sessionId: string): boolean {
		return this._context.sessions.filter(session => session.is_active).length === 1
			&& this._context.sessions.some(session => session.is_active && session.id === sessionId);
	}

	getQuestionPrompt(sessionId: string, pendingId: string): string | undefined {
		const session = this._context.sessions.find(candidate => candidate.id === sessionId && candidate.pending?.pending_id === pendingId);
		const question = session?.pending?.questions?.[this._answers.get(this._key(session))?.answers.length ?? 0];
		return question ? questionPrompt(question) : undefined;
	}

	captureTarget(): IVoiceLiveInputTarget {
		const active = this._context.sessions.filter(session => session.is_active);
		const session = active.length === 1 ? structuredClone(active[0]) : undefined;
		return { session, questionIndex: session ? this._answers.get(this._key(session))?.answers.length ?? 0 : 0, hasContext: this._hasContext };
	}

	resolve(callId: string, text: string, target: IVoiceLiveInputTarget): VoiceLiveInputResult {
		const stale = { clarification: localize('voice.live.stalePrompt', "The voice input or pending prompt changed. Please focus the intended chat input and answer its current prompt again.") };
		if (!target.hasContext) {
			return stale;
		}
		if (!text.trim()) {
			return { clarification: localize('voice.live.emptyReply', "I did not receive a voice reply. Please try again in the intended chat input.") };
		}
		const { session } = target;
		const current = session ? this._context.sessions.find(candidate => candidate.id === session.id) : undefined;
		if (!session) {
			return this._context.sessions.some(candidate => candidate.is_active)
				? stale
				: { toolCall: { callId, name: 'send_to_chat', args: { text } } };
		}
		if (!current || JSON.stringify(current.pending) !== JSON.stringify(session.pending)) {
			return stale;
		}
		const pending = session.pending;
		if (!pending) {
			if (session.agent_state === 'waiting_for_confirmation' || session.confirmation_type) {
				return { clarification: localize('voice.live.unsupportedPrompt', "This prompt cannot be answered by voice. Please respond in the chat input.") };
			}
			return { toolCall: { callId, name: 'send_to_chat', args: { text, coding_session_id: session.id } } };
		}
		const key = this._key(session);
		if (this._submitted.has(key)) {
			return stale;
		}
		const reply = normalizeReply(text);
		let response: object;
		if (pending.type === 'approval') {
			const approve = ['approve', 'approved', 'accept', 'accepted', 'allow', 'yes', 'i approve', 'i accept'].includes(reply.replace(/\s+/g, ' '));
			const reject = ['reject', 'deny', 'no'].includes(reply);
			if (!approve && !reject) {
				return { clarification: localize('voice.live.explicitApproval', "Please say approve or reject for this prompt, or respond in the chat input.") };
			}
			response = { type: approve ? 'approve' : 'reject' };
		} else if (reply === 'skip') {
			if (!pending.allow_skip) {
				return { clarification: localize('voice.live.skipNotAllowed', "This form cannot be skipped. Please answer its questions or respond in the chat input.") };
			}
			const answers = this._answers.get(key)?.answers;
			response = { type: 'skip', ...(answers?.length ? { answers } : {}) };
		} else {
			const answers = this._answers.get(key)?.answers ?? [];
			const question = pending.questions?.[answers.length];
			if (!question || target.questionIndex !== answers.length) {
				return stale;
			}
			const answer = resolveAnswer(question, text);
			if (!answer) {
				return {
					clarification: question.allow_freeform
						? localize('voice.live.chooseOrCustomAnswer', "Please say an exact choice or its number, or say other followed by a custom answer. {0}", questionPrompt(question))
						: localize('voice.live.chooseAnswer', "Please say an exact choice or its number. {0}", questionPrompt(question))
				};
			}
			answers.push(answer);
			this._answers.set(key, { schema: JSON.stringify(pending), answers });
			const next = pending.questions?.[answers.length];
			if (next) {
				return { clarification: questionPrompt(next) };
			}
			response = { type: 'answer', answers };
		}
		this._submitted.add(key);
		this._calls.set(callId, key);
		return {
			toolCall: {
				callId,
				name: 'respond_to_session',
				args: { coding_session_id: session.id, request_id: pending.request_id, pending_id: pending.pending_id, response },
			},
		};
	}

	handleResult(callId: string, result: string | IVoiceDispatchResult): void {
		const key = this._calls.get(callId);
		this._calls.delete(callId);
		if (key && typeof result !== 'string' && !result.ok) {
			this._submitted.delete(key);
			this._answers.delete(key);
		}
	}
}
