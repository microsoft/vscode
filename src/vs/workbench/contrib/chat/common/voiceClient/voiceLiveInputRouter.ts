/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IVoiceDispatchResult, IVoicePendingQuestion, IVoiceSessionContext, IVoiceSessionPending, IVoiceToolCall } from './voiceClientService.js';
import { formatQuestionPromptTitle } from './voicePendingNarration.js';
import { IBackendQuestionAnswer } from './voiceQuestionAnswers.js';

type VoiceSession = IVoiceSessionContext['sessions'][number];

export interface IVoiceLiveInputTarget {
	readonly session: VoiceSession | undefined;
	readonly questionIndex: number;
	readonly hasContext: boolean;
}

type VoiceLiveInputResult = { readonly toolCall: IVoiceToolCall; readonly clarification?: undefined } | { readonly clarification: string; readonly toolCall?: undefined };

const approvalReplies: Readonly<Record<string, { readonly approve: readonly string[]; readonly reject: readonly string[] }>> = {
	en: {
		approve: ['approve', 'approved', 'accept', 'accepted', 'allow', 'yes', 'i approve', 'i accept'],
		reject: ['reject', 'deny', 'no'],
	},
	ar: {
		// allow-any-unicode-next-line
		approve: ['نعم', 'أوافق', 'موافق', 'وافق', 'السماح'],
		// allow-any-unicode-next-line
		reject: ['لا', 'أرفض', 'ارفض', 'رفض'],
	},
	cs: {
		// allow-any-unicode-next-line
		approve: ['ano', 'schválit', 'schvaluji', 'povolit', 'souhlasím'],
		// allow-any-unicode-next-line
		reject: ['ne', 'zamítnout', 'odmítnout', 'odmítám'],
	},
	da: {
		approve: ['ja', 'godkend', 'godkende', 'tillad', 'accepter'],
		reject: ['nej', 'afvis', 'afvise'],
	},
	de: {
		approve: ['ja', 'genehmigen', 'genehmigt', 'akzeptieren', 'akzeptiert', 'erlauben', 'zustimmen'],
		reject: ['nein', 'ablehnen', 'abgelehnt', 'verwerfen', 'verweigern'],
	},
	es: {
		// allow-any-unicode-next-line
		approve: ['sí', 'aprobar', 'aprobado', 'aceptar', 'aceptado', 'permitir'],
		reject: ['no', 'rechazar', 'denegar'],
	},
	fr: {
		// allow-any-unicode-next-line
		approve: ['oui', 'approuver', 'approuvé', 'accepter', 'accepté', 'autoriser'],
		reject: ['non', 'refuser', 'rejeter'],
	},
	fi: {
		// allow-any-unicode-next-line
		approve: ['kyllä', 'hyväksy', 'hyväksyn', 'salli'],
		// allow-any-unicode-next-line
		reject: ['ei', 'hylkää', 'kiellä'],
	},
	hi: {
		// allow-any-unicode-next-line
		approve: ['हाँ', 'हां', 'मंज़ूर', 'मंजूर', 'स्वीकार करें', 'अनुमति दें'],
		// allow-any-unicode-next-line
		reject: ['नहीं', 'अस्वीकार करें', 'मना करें'],
	},
	hu: {
		// allow-any-unicode-next-line
		approve: ['igen', 'jóváhagyás', 'jóváhagyom', 'engedélyezés', 'engedélyezem', 'elfogadom'],
		// allow-any-unicode-next-line
		reject: ['nem', 'elutasítás', 'elutasítom', 'megtagadom'],
	},
	id: {
		approve: ['ya', 'setuju', 'izinkan', 'terima'],
		reject: ['tidak', 'tolak', 'menolak'],
	},
	it: {
		// allow-any-unicode-next-line
		approve: ['sì', 'approva', 'approvare', 'approvato', 'accetta', 'accettare', 'accettato', 'consenti'],
		reject: ['no', 'rifiuta', 'rifiutare', 'nega'],
	},
	pt: {
		approve: ['sim', 'aprovar', 'aprovado', 'aceitar', 'aceito', 'permitir'],
		// allow-any-unicode-next-line
		reject: ['não', 'rejeitar', 'rejeitado', 'recusar', 'negar'],
	},
	nb: {
		approve: ['ja', 'godkjenn', 'godta', 'tillat'],
		// allow-any-unicode-next-line
		reject: ['nei', 'avvis', 'avslå'],
	},
	nl: {
		approve: ['ja', 'goedkeuren', 'goedgekeurd', 'toestaan', 'accepteren'],
		reject: ['nee', 'afwijzen', 'weigeren'],
	},
	pl: {
		// allow-any-unicode-next-line
		approve: ['tak', 'zatwierdź', 'zatwierdzam', 'zezwól', 'akceptuję'],
		// allow-any-unicode-next-line
		reject: ['nie', 'odrzuć', 'odrzucam', 'odmów'],
	},
	ro: {
		// allow-any-unicode-next-line
		approve: ['da', 'aprobă', 'aprob', 'accept', 'permite'],
		reject: ['nu', 'respinge', 'refuz'],
	},
	ru: {
		// allow-any-unicode-next-line
		approve: ['да', 'одобрить', 'одобряю', 'разрешить', 'разрешаю', 'принять'],
		// allow-any-unicode-next-line
		reject: ['нет', 'отклонить', 'отклоняю', 'запретить', 'отказать'],
	},
	sv: {
		// allow-any-unicode-next-line
		approve: ['ja', 'godkänn', 'godkänner', 'tillåt', 'acceptera'],
		reject: ['nej', 'avvisa', 'neka'],
	},
	th: {
		// allow-any-unicode-next-line
		approve: ['ใช่', 'อนุมัติ', 'อนุญาต', 'ยอมรับ'],
		// allow-any-unicode-next-line
		reject: ['ไม่', 'ไม่ใช่', 'ปฏิเสธ', 'ไม่อนุญาต', 'ไม่อนุมัติ'],
	},
	tr: {
		// allow-any-unicode-next-line
		approve: ['evet', 'onayla', 'onaylıyorum', 'izin ver', 'kabul et'],
		// allow-any-unicode-next-line
		reject: ['hayır', 'reddet', 'reddediyorum'],
	},
	vi: {
		// allow-any-unicode-next-line
		approve: ['có', 'đồng ý', 'chấp thuận', 'cho phép', 'chấp nhận'],
		// allow-any-unicode-next-line
		reject: ['không', 'từ chối', 'bác bỏ'],
	},
	ja: {
		// allow-any-unicode-next-line
		approve: ['はい', '承認', '承認する', '承認します', '許可', '許可する', '許可します'],
		// allow-any-unicode-next-line
		reject: ['いいえ', '拒否', '拒否する', '拒否します', '却下', '却下する', '却下します'],
	},
	ko: {
		// allow-any-unicode-next-line
		approve: ['네', '예', '승인', '승인합니다', '허용', '허용합니다'],
		// allow-any-unicode-next-line
		reject: ['아니요', '거부', '거부합니다', '거절', '거절합니다'],
	},
	zh: {
		// allow-any-unicode-next-line
		approve: ['是', '是的', '同意', '批准', '允许', '允許', '接受'],
		// allow-any-unicode-next-line
		reject: ['不', '不同意', '拒绝', '拒絕', '不允许', '不允許'],
	},
};

function normalizeReply(text: string, language = 'en'): string {
	// allow-any-unicode-next-line
	return text.normalize('NFC').trim().replace(/[.!。！।]+$/, '').trim().toLocaleLowerCase(language);
}

/** Speech recognition can merge repeated attempts into one transcript. */
function matchesExplicitReply(command: string, phrases: readonly string[]): boolean {
	const words = command.split(' ');
	return phrases.some(phrase => {
		const phraseWords = phrase.split(' ');
		return words.length % phraseWords.length === 0
			&& words.every((word, index) => word === phraseWords[index % phraseWords.length]);
	});
}

function ordinalNumber(text: string): number {
	const normalized = normalizeReply(text);
	const ordinal = normalized.replace(/^option /, '');
	if (/^\d+$/.test(ordinal)) {
		return Number(ordinal);
	}
	const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
	const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
	const index = words.indexOf(ordinal) >= 0 ? words.indexOf(ordinal) : ordinals.indexOf(ordinal);
	return index >= 0 ? index + 1 : 0;
}

function resolveOption(question: IVoicePendingQuestion, text: string, language: string): string | undefined {
	const reply = normalizeReply(text, language);
	const number = ordinalNumber(text);
	const matches = question.options.filter(option => normalizeReply(option.label, language) === reply || (number > 0 && ordinalNumber(option.label) === number));
	if (matches.length > 1) {
		return undefined;
	}
	const option = number > 0 ? question.options[number - 1]?.value : undefined;
	if (matches.length === 1) {
		return option !== undefined && option !== matches[0].value ? undefined : matches[0].value;
	}
	return option;
}

function resolveAnswer(question: IVoicePendingQuestion, text: string, language: string): IBackendQuestionAnswer | undefined {
	if (question.type === 'text') {
		return text.trim() ? { question_id: question.id, freeform: text.trim() } : undefined;
	}
	const option = resolveOption(question, text, language);
	if (option !== undefined) {
		return question.type === 'multiSelect'
			? { question_id: question.id, values: [option] }
			: { question_id: question.id, value: option };
	}
	if (question.type === 'multiSelect') {
		const parts = text.split(/\s*,\s*|\s+and\s+/i);
		if (parts.length > 1) {
			const values = parts.map(part => resolveOption(question, part, language));
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

function questionPrompt(question: IVoicePendingQuestion, guidance: string, pending: IVoiceSessionPending, questionIndex: number): string {
	const options = question.options.map((option, index) => `${index + 1}. ${option.label}`).join(' ');
	const prompt = formatQuestionPromptTitle(question, pending.message, questionIndex, pending.questions?.length);
	return [localize('voice.live.questionPrompt', "{0} {1}", prompt, options).trim(), guidance].filter(Boolean).join(' ');
}

/** Routes only explicit, deterministic replies to captured, still-current pending occurrences, never model guesses. Ambiguous replies cannot authorize actions, and forms submit only when complete or explicitly skipped. */
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

	getQuestionReplyGuidance(): string {
		return !this._hasContext || !this._context.display_locale || /^en(?:-|$)/i.test(this._context.display_locale)
			? ''
			: localize('voice.live.questionReply', "Please answer by voice, or use the controls in chat.");
	}

	getApprovalReplyGuidance(): string {
		const language = this._context.display_locale.toLowerCase().split('-')[0];
		if (!this._hasContext || !language || language === 'en') {
			return '';
		}
		return approvalReplies[language]
			? localize('voice.live.approvalReply', "Please approve or reject by voice, or use the controls in chat.")
			: localize('voice.live.englishApprovalReply', "Please approve or reject in English, or use the controls in chat.");
	}

	getQuestionPrompt(sessionId: string, pendingId: string): string | undefined {
		const session = this._context.sessions.find(candidate => candidate.id === sessionId && candidate.pending?.pending_id === pendingId);
		const index = session ? this._answers.get(this._key(session))?.answers.length ?? 0 : 0;
		const pending = session?.pending;
		const question = pending?.questions?.[index];
		return question && pending ? questionPrompt(question, this.getQuestionReplyGuidance(), pending, index) : undefined;
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
			const language = this._context.display_locale.toLowerCase().split('-')[0];
			const localizedReplies = approvalReplies[language];
			const command = reply.replace(/\s+/g, ' ');
			const localizedCommand = localizedReplies ? normalizeReply(text, language).replace(/\s+/g, ' ') : command;
			const approve = matchesExplicitReply(command, approvalReplies.en.approve) || !!localizedReplies && matchesExplicitReply(localizedCommand, localizedReplies.approve);
			const reject = matchesExplicitReply(command, approvalReplies.en.reject) || !!localizedReplies && matchesExplicitReply(localizedCommand, localizedReplies.reject);
			if (!approve && !reject) {
				return { clarification: this.getApprovalReplyGuidance() || localize('voice.live.explicitApproval', "Please say approve or reject for this prompt, or respond in the chat input.") };
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
			const answer = resolveAnswer(question, text, this._context.display_locale || 'en');
			if (!answer) {
				return {
					clarification: question.allow_freeform
						? localize('voice.live.chooseOrCustomAnswer', "Please say an exact choice or its number, or say other followed by a custom answer. {0}", questionPrompt(question, this.getQuestionReplyGuidance(), pending, answers.length))
						: localize('voice.live.chooseAnswer', "Please say an exact choice or its number. {0}", questionPrompt(question, this.getQuestionReplyGuidance(), pending, answers.length))
				};
			}
			answers.push(answer);
			this._answers.set(key, { schema: JSON.stringify(pending), answers });
			const next = pending.questions?.[answers.length];
			if (next) {
				return { clarification: questionPrompt(next, this.getQuestionReplyGuidance(), pending, answers.length) };
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
