/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IVoiceSessionContext, IVoiceSessionPending } from '../../../common/voiceClient/voiceClientService.js';
import { VoiceLiveInputRouter } from '../../../common/voiceClient/voiceLiveInputRouter.js';

suite('VoiceLiveInputRouter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const approval: IVoiceSessionPending = { type: 'approval', request_id: 'request', pending_id: 'approval', message: 'Run the command?' };
	const questions: IVoiceSessionPending = {
		type: 'questions', request_id: 'request', pending_id: 'questions', allow_skip: true,
		questions: [
			{ id: 'region', type: 'singleSelect', title: 'Which region?', allow_freeform: false, options: [{ label: 'West', value: 'westus' }, { label: 'East', value: 'eastus' }] },
			{ id: 'name', type: 'text', title: 'What name?', allow_freeform: true, options: [] },
		],
	};

	function context(active: string, pending?: IVoiceSessionPending, displayLocale = 'en-US'): IVoiceSessionContext {
		return {
			display_locale: displayLocale,
			sessions: ['chat-session:/a', 'chat-session:/b'].map(id => ({
				id, is_active: id === active, agent_state: pending ? 'waiting_for_confirmation' : 'idle', pending,
			})),
		};
	}

	test('reads form context with a single question and its retry', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', {
			...questions,
			message: 'What should candyFactory do?',
			questions: [{ ...questions.questions![0], title: 'Function behavior' }],
		}));
		const initial = router.getQuestionPrompt('chat-session:/a', 'questions');
		const retry = router.resolve('retry', 'not a choice', router.captureTarget()).clarification;
		assert.deepStrictEqual({ initial, retry }, {
			initial: 'What should candyFactory do? Function behavior 1. West 2. East',
			retry: 'Please say an exact choice or its number. What should candyFactory do? Function behavior 1. West 2. East',
		});
	});

	test('asks one numbered field at a time instead of a compound form question', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', {
			...questions,
			message: 'What should the new file be named, and what should it contain?',
			questions: [
				{ id: 'filename', type: 'text', title: 'File name', allow_freeform: true, options: [] },
				{ id: 'contents', type: 'text', title: 'File contents', allow_freeform: true, options: [] },
			],
		}));
		const initial = router.getQuestionPrompt('chat-session:/a', 'questions');
		const first = router.resolve('filename', 'chocolate.ts', router.captureTarget());
		const current = router.getQuestionPrompt('chat-session:/a', 'questions');
		const final = router.resolve('contents', 'A function called chocolate', router.captureTarget());
		assert.deepStrictEqual({ initial, first, current, response: final.toolCall?.args.response }, {
			initial: 'Please answer one question at a time. Question 1 of 2: File name',
			first: { clarification: 'Question 2 of 2: File contents' },
			current: 'Question 2 of 2: File contents',
			response: { type: 'answer', answers: [{ question_id: 'filename', freeform: 'chocolate.ts' }, { question_id: 'contents', freeform: 'A function called chocolate' }] },
		});
	});

	test('normalizes question titles and form context before formatting or deduplicating them', () => {
		const router = new VoiceLiveInputRouter();
		const prompts = ['  Deployment settings  ', '  Which region?  '].map(message => {
			router.updateContext(context('chat-session:/a', {
				...questions, message,
				questions: [{ ...questions.questions![0], title: '  Which region?  ' }],
			}));
			return router.getQuestionPrompt('chat-session:/a', 'questions');
		});
		assert.deepStrictEqual(prompts, [
			'Deployment settings Which region? 1. West 2. East',
			'Which region? 1. West 2. East',
		]);
	});

	test('omits reply guidance until a voice locale is known', () => {
		const router = new VoiceLiveInputRouter();
		const guidance = () => [router.getQuestionReplyGuidance(), router.getApprovalReplyGuidance()];
		const beforeContext = guidance();
		router.updateContext(context('chat-session:/a', approval, ''));
		const emptyLocale = guidance();
		router.updateContext(context('chat-session:/a', approval, 'en-US'));
		assert.deepStrictEqual({ beforeContext, emptyLocale, english: guidance() }, {
			beforeContext: ['', ''], emptyLocale: ['', ''], english: ['', ''],
		});
	});

	test('matches Turkish displayed choices with locale-aware casing and preserves English ordinals', () => {
		assert.deepStrictEqual(['ısparta', 'izmir', 'FIRST', 'SECOND'].map(text => {
			const router = new VoiceLiveInputRouter();
			router.updateContext(context('chat-session:/a', {
				...questions,
				questions: [{
					id: 'city', type: 'singleSelect', title: 'Which city?', allow_freeform: false,
					options: [{ label: 'Isparta', value: 'isparta' }, { label: 'İzmir', value: 'izmir' }],
				}],
			}, 'tr-TR'));
			return router.resolve(text, text, router.captureTarget()).toolCall?.args.response;
		}), ['isparta', 'izmir', 'isparta', 'izmir'].map(value => ({ type: 'answer', answers: [{ question_id: 'city', value }] })));
	});

	test('matches Turkish multi-select labels with locale-aware casing', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', {
			...questions,
			questions: [{
				id: 'city', type: 'multiSelect', title: 'Which cities?', allow_freeform: false,
				options: [{ label: 'Isparta', value: 'isparta' }, { label: 'İzmir', value: 'izmir' }],
			}],
		}, 'tr-TR'));
		assert.deepStrictEqual(router.resolve('cities', 'ısparta and izmir', router.captureTarget()).toolCall?.args.response, {
			type: 'answer', answers: [{ question_id: 'city', values: ['isparta', 'izmir'] }],
		});
	});

	test('pins an approval to the captured input even when another session has the identical prompt', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', approval));
		const target = router.captureTarget();
		router.updateContext(context('chat-session:/b', approval));
		assert.deepStrictEqual(router.resolve('call', 'Yes.', target), {
			toolCall: {
				callId: 'call', name: 'respond_to_session', args: {
					coding_session_id: 'chat-session:/a', request_id: 'request', pending_id: 'approval', response: { type: 'approve' },
				}
			},
		});
	});

	test('does not interpret qualified or ambiguous approval as consent or as a new chat request', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', approval));
		assert.deepStrictEqual(['yes, but wait', 'do not approve', 'maybe', 'approve both', 'approve?', 'approved?', 'I accept if it is safe', 'I accept, but wait', 'I do not accept'].map(text => {
			const result = router.resolve(text, text, router.captureTarget());
			return result.clarification !== undefined;
		}), [true, true, true, true, true, true, true, true, true]);
	});

	test('accepts complete natural approval phrases without guessing or changing the prompt owner', () => {
		assert.deepStrictEqual(['approve', 'approved.', 'accept', 'accepted!', 'allow', 'yes', 'I approve', 'I  accept.'].map(text => {
			const router = new VoiceLiveInputRouter();
			router.updateContext(context('chat-session:/a', approval));
			const target = router.captureTarget();
			router.updateContext(context('chat-session:/b', approval));
			const result = router.resolve('natural-approval', text, target);
			return { session: result.toolCall?.args.coding_session_id, response: result.toolCall?.args.response };
		}), Array.from({ length: 8 }, () => ({ session: 'chat-session:/a', response: { type: 'approve' } })));
	});

	test('rejects resolved, replaced, or changed pending occurrences', () => {
		assert.deepStrictEqual([undefined, { ...approval, pending_id: 'replacement' }, { ...approval, message: 'Run a different command?' }].map(pending => {
			const router = new VoiceLiveInputRouter();
			router.updateContext(context('chat-session:/a', approval));
			const target = router.captureTarget();
			router.updateContext(context('chat-session:/a', pending));
			return router.resolve('call', 'approve', target).clarification !== undefined;
		}), [true, true, true]);
	});

	test('collects a form sequentially and submits exact option values to its owning pending item', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', questions));
		const first = router.resolve('first', 'option two', router.captureTarget());
		const final = router.resolve('final', 'My deployment', router.captureTarget());
		assert.deepStrictEqual({ first, final }, {
			first: { clarification: 'Question 2 of 2: What name?' },
			final: {
				toolCall: {
					callId: 'final', name: 'respond_to_session', args: {
						coding_session_id: 'chat-session:/a', request_id: 'request', pending_id: 'questions',
						response: { type: 'answer', answers: [{ question_id: 'region', value: 'eastus' }, { question_id: 'name', freeform: 'My deployment' }] },
					}
				}
			},
		});
	});

	test('refuses an ordinal captured before the same pending form reordered its options', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', questions));
		const target = router.captureTarget();
		router.updateContext(context('chat-session:/a', {
			...questions,
			questions: questions.questions?.map(question => ({ ...question, options: [...question.options].reverse() })),
		}));
		assert.strictEqual(router.resolve('old-option-order', 'second', target).clarification !== undefined, true);
	});

	test('clears partial form answers when the same pending occurrence republishes a changed schema', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', questions));
		router.resolve('old-first', 'first', router.captureTarget());
		const oldSecond = router.captureTarget();
		router.updateContext(context('chat-session:/a', {
			...questions,
			questions: questions.questions?.map(question => ({
				...question,
				options: question.options.map(option => ({ ...option, value: `new-${option.value}` })),
			})),
		}));
		const resetIndex = router.captureTarget().questionIndex;
		const nextPrompt = router.getQuestionPrompt('chat-session:/a', 'questions');
		const stale = router.resolve('old-second', 'Old deployment', oldSecond);
		router.resolve('new-first', 'first', router.captureTarget());
		const final = router.resolve('new-second', 'New deployment', router.captureTarget());
		assert.deepStrictEqual({ resetIndex, nextPrompt, stale: stale.clarification !== undefined, response: final.toolCall?.args.response }, {
			resetIndex: 0, nextPrompt: 'Please answer one question at a time. Question 1 of 2: Which region? 1. West 2. East', stale: true,
			response: { type: 'answer', answers: [{ question_id: 'region', value: 'new-westus' }, { question_id: 'name', freeform: 'New deployment' }] },
		});
	});

	test('keeps partial form answers isolated across inputs and refuses a stale question turn', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', questions));
		const stale = router.captureTarget();
		router.resolve('first-a', 'first', router.captureTarget());
		router.updateContext(context('chat-session:/b', questions));
		const firstB = router.resolve('first-b', 'second', router.captureTarget());
		const staleA = router.resolve('late-a', 'first', stale);
		router.updateContext(context('chat-session:/a', questions));
		const finalA = router.resolve('final-a', 'A deployment', router.captureTarget());
		assert.deepStrictEqual({
			firstB, staleA: staleA.clarification !== undefined,
			answers: finalA.toolCall?.args.response,
		}, {
			firstB: { clarification: 'Question 2 of 2: What name?' }, staleA: true,
			answers: { type: 'answer', answers: [{ question_id: 'region', value: 'westus' }, { question_id: 'name', freeform: 'A deployment' }] },
		});
	});

	test('does not submit the same approval twice and permits a retry after a rejected dispatch', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', approval));
		const target = router.captureTarget();
		router.resolve('first', 'approve', target);
		const duplicate = router.resolve('duplicate', 'approve', target);
		router.handleResult('first', { ok: false, reason: 'stale_pending' });
		const retry = router.resolve('retry', 'reject', router.captureTarget());
		assert.deepStrictEqual({
			duplicate: duplicate.clarification !== undefined, retry: retry.toolCall?.args.response,
		}, { duplicate: true, retry: { type: 'reject' } });
	});

	test('does not guess an answer for duplicate labels, out-of-range ordinals, or unsupported prompts', () => {
		const duplicate = { ...questions, questions: [{ ...questions.questions![0], options: [{ label: 'Same', value: 'a' }, { label: 'Same', value: 'b' }] }] };
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', duplicate));
		const results = ['Same', 'third'].map(text => router.resolve(text, text, router.captureTarget()).clarification !== undefined);
		router.updateContext({ sessions: [{ id: 'chat-session:/a', is_active: true, agent_state: 'waiting_for_confirmation', confirmation_type: 'elicitation' }], display_locale: 'en-US' });
		results.push(router.resolve('unsupported', 'yes', router.captureTarget()).clarification !== undefined);
		assert.deepStrictEqual(results, [true, true, true]);
	});

	test('pins ordinary dictation and refuses it if a pending prompt appeared during capture', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a'));
		const target = router.captureTarget();
		router.updateContext(context('chat-session:/b'));
		const sent = router.resolve('send', 'Fix tests', target);
		router.updateContext(context('chat-session:/b', approval));
		const blocked = router.resolve('late', 'Fix tests', target);
		assert.deepStrictEqual({ sent, blocked: blocked.clarification !== undefined }, {
			sent: { toolCall: { callId: 'send', name: 'send_to_chat', args: { text: 'Fix tests', coding_session_id: 'chat-session:/a' } } }, blocked: true,
		});
	});

	test('does not bypass an active pending prompt for a navigation-like utterance', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext({
			display_locale: 'en-US',
			sessions: [
				{ id: 'chat-session:/a', label: 'Alpha', is_active: true, agent_state: 'waiting_for_confirmation', pending: approval },
				{ id: 'chat-session:/b', label: 'Favorite chocolate', is_active: false, agent_state: 'idle' },
			],
		});

		assert.strictEqual(router.resolve('switch', 'Switch to the favorite chocolate session.', router.captureTarget()).clarification !== undefined, true);
	});

	test('preserves session-related and non-English utterances as ordinary chat requests', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext({
			display_locale: 'de-DE',
			sessions: [
				{ id: 'chat-session:/a', label: 'Alpha', is_active: true, agent_state: 'idle' },
				{ id: 'chat-session:/b', label: 'Favorite chocolate', is_active: false, agent_state: 'idle' },
			],
		});
		const target = router.captureTarget();
		const utterances = [
			'Which session am I in right now?',
			'How many sessions do I have?',
			'Switch to the session named Favorite chocolate.',
			'Wechsle zur Sitzung Lieblingsschokolade.',
			'Fix the session timeout in the tests.',
		];

		assert.deepStrictEqual(utterances.map((text, index) => router.resolve(`call-${index}`, text, target).toolCall), utterances.map((text, index) => ({
			callId: `call-${index}`,
			name: 'send_to_chat',
			args: { text, coding_session_id: 'chat-session:/a' },
		})));
	});

	test('preserves adversarial long transcripts without intent parsing', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a'));
		const target = router.captureTarget();
		const repeatedDiscourse = `${'okay, '.repeat(50_000)}switch to the favorite chocolate session`;
		const repeatedAnnotations = `${'[mouth noise] '.repeat(50_000)}switch to the favorite chocolate session`;

		assert.deepStrictEqual([
			router.resolve('repeated-discourse', repeatedDiscourse, target).toolCall?.args.text,
			router.resolve('repeated-annotations', repeatedAnnotations, target).toolCall?.args.text,
		], [repeatedDiscourse, repeatedAnnotations]);
	});

	test('accepts localized approval words, displayed labels, and numeric choices', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', approval, 'de-DE'));
		const approvalResult = router.resolve('approval', 'ja', router.captureTarget());
		const localizedQuestions: IVoiceSessionPending = {
			...questions,
			questions: [{
				id: 'region',
				type: 'singleSelect',
				title: 'Welche Region?',
				allow_freeform: false,
				options: [{ label: 'Westen', value: 'westus' }, { label: 'Osten', value: 'eastus' }],
			}],
		};
		router.updateContext(context('chat-session:/a', localizedQuestions, 'de-DE'));
		const labelResult = router.resolve('label', 'Osten', router.captureTarget());
		router.handleResult('label', { ok: false, reason: 'invalid_answer' });
		const numericResult = router.resolve('numeric', '2', router.captureTarget());

		assert.deepStrictEqual({
			approval: approvalResult.toolCall?.args.response,
			label: labelResult.toolCall?.args.response,
			numeric: numericResult.toolCall?.args.response,
		}, {
			approval: { type: 'approve' },
			label: { type: 'answer', answers: [{ question_id: 'region', value: 'eastus' }] },
			numeric: { type: 'answer', answers: [{ question_id: 'region', value: 'eastus' }] },
		});
	});

	test('accepts English approval commands in a non-English voice language without guessing qualified replies', () => {
		assert.deepStrictEqual(['approve', 'reject', 'yes', 'no', 'ja', 'verwerfen', 'approve, but wait'].map(text => {
			const router = new VoiceLiveInputRouter();
			router.updateContext(context('chat-session:/a', approval, 'de-DE'));
			const result = router.resolve(text, text, router.captureTarget());
			return result.toolCall?.args.response ?? result.clarification;
		}), [
			{ type: 'approve' }, { type: 'reject' }, { type: 'approve' }, { type: 'reject' },
			{ type: 'approve' }, { type: 'reject' },
			'Please approve or reject by voice, or use the controls in chat.',
		]);
	});

	for (const { locale, approvals, rejections, ambiguous } of [
		{ locale: 'en-US', approvals: ['yes', 'I approve.'], rejections: ['no', 'reject!'], ambiguous: ['yes, but wait', 'do not approve', 'approve?'] },
		{ locale: 'ar-SA', approvals: ['نعم.', 'أوافق', 'موافق'], rejections: ['لا', 'أرفض', 'رفض'], ambiguous: ['لا توافق', 'نعم ولكن انتظر', 'أوافق؟'] },
		{ locale: 'cs-CZ', approvals: ['Ano.', 'schválit', 'souhlasím'], rejections: ['ne', 'zamítnout', 'odmítám'], ambiguous: ['ano ale počkej', 'neschvaluji', 'ano?'] },
		{ locale: 'da-DK', approvals: ['Ja.', 'godkend', 'tillad'], rejections: ['nej', 'afvis', 'afvise'], ambiguous: ['ja men vent', 'godkend ikke', 'ja?'] },
		{ locale: 'de-DE', approvals: ['Ja.', 'genehmigen', 'akzeptiert'], rejections: ['Nein!', 'verwerfen', 'ablehnen'], ambiguous: ['ja, aber warte', 'nicht genehmigen', 'ja?'] },
		{ locale: 'es-ES', approvals: ['Sí.', 'aprobar', 'aceptar'], rejections: ['no', 'rechazar', 'denegar'], ambiguous: ['sí, pero espera', 'no aprobar', 'sí?'] },
		{ locale: 'fr-FR', approvals: ['Oui!', 'approuver', 'accepte\u0301'], rejections: ['non', 'refuser', 'rejeter'], ambiguous: ['oui mais attends', 'ne pas approuver', 'oui?'] },
		{ locale: 'fi-FI', approvals: ['Kyllä.', 'hyväksy', 'salli'], rejections: ['ei', 'hylkää', 'kiellä'], ambiguous: ['kyllä mutta odota', 'älä hyväksy', 'kyllä?'] },
		{ locale: 'hi-IN', approvals: ['हाँ।', 'मंज़ूर', 'अनुमति दें'], rejections: ['नहीं।', 'अस्वीकार करें', 'मना करें'], ambiguous: ['हाँ लेकिन रुको', 'अनुमति मत दें', 'हाँ?'] },
		{ locale: 'hu-HU', approvals: ['Igen.', 'jóváhagyom', 'engedélyezem'], rejections: ['nem', 'elutasítom', 'megtagadom'], ambiguous: ['igen de várj', 'nem hagyom jóvá', 'igen?'] },
		{ locale: 'id-ID', approvals: ['Ya.', 'setuju', 'izinkan'], rejections: ['tidak', 'tolak', 'menolak'], ambiguous: ['ya tapi tunggu', 'jangan izinkan', 'ya?'] },
		{ locale: 'it-IT', approvals: ['Sì.', 'approva', 'accetta'], rejections: ['no', 'rifiuta', 'nega'], ambiguous: ['sì ma aspetta', 'non approvare', 'sì?'] },
		{ locale: 'pt-BR', approvals: ['Sim!', 'aprovar', 'aceitar'], rejections: ['Não.', 'rejeitar', 'recusar'], ambiguous: ['sim mas espere', 'não aprovar', 'sim?'] },
		{ locale: 'nb-NO', approvals: ['Ja.', 'godkjenn', 'tillat'], rejections: ['nei', 'avvis', 'avslå'], ambiguous: ['ja men vent', 'ikke godkjenn', 'ja?'] },
		{ locale: 'nl-NL', approvals: ['Ja.', 'goedkeuren', 'toestaan'], rejections: ['nee', 'afwijzen', 'weigeren'], ambiguous: ['ja maar wacht', 'niet goedkeuren', 'ja?'] },
		{ locale: 'pl-PL', approvals: ['Tak.', 'zatwierdź', 'akceptuję'], rejections: ['nie', 'odrzuć', 'odmów'], ambiguous: ['tak ale poczekaj', 'nie zatwierdzaj', 'tak?'] },
		{ locale: 'ro-RO', approvals: ['Da.', 'aprobă', 'permite'], rejections: ['nu', 'respinge', 'refuz'], ambiguous: ['da dar așteaptă', 'nu aproba', 'da?'] },
		{ locale: 'ru-RU', approvals: ['Да.', 'одобрить', 'разрешаю'], rejections: ['нет', 'отклонить', 'отказать'], ambiguous: ['да но подожди', 'не одобряй', 'да?'] },
		{ locale: 'sv-SE', approvals: ['Ja.', 'godkänn', 'tillåt'], rejections: ['nej', 'avvisa', 'neka'], ambiguous: ['ja men vänta', 'godkänn inte', 'ja?'] },
		{ locale: 'th-TH', approvals: ['ใช่', 'อนุมัติ', 'อนุญาต'], rejections: ['ไม่ใช่', 'ปฏิเสธ', 'ไม่อนุญาต'], ambiguous: ['อย่าอนุมัติ', 'ใช่แต่รอก่อน', 'อนุมัติ?'] },
		{ locale: 'tr-TR', approvals: ['Evet.', 'ONAYLIYORUM', 'İZİN VER'], rejections: ['HAYIR.', 'reddet', 'reddediyorum'], ambiguous: ['evet ama bekle', 'onaylama', 'evet?'] },
		{ locale: 'vi-VN', approvals: ['Có.', 'đồng ý', 'cho phép'], rejections: ['không', 'từ chối', 'bác bỏ'], ambiguous: ['có nhưng đợi đã', 'đừng chấp thuận', 'có?'] },
		{ locale: 'ja-JP', approvals: ['はい。', '承認します', '許可する'], rejections: ['いいえ。', '拒否します', '却下する'], ambiguous: ['承認しない', 'はい、でも待って', '承認しますか？'] },
		{ locale: 'ko-KR', approvals: ['네.', '승인합니다', '허용'], rejections: ['아니요.', '거부합니다', '거절'], ambiguous: ['승인하지 마세요', '네 하지만 기다려', '승인?'] },
		{ locale: 'zh-CN', approvals: ['是的。', '批准', '允许'], rejections: ['不同意。', '拒绝', '不允许'], ambiguous: ['不要批准', '是的但是等等', '批准？'] },
		{ locale: 'zh-Hant-TW', approvals: ['同意！', '允許', '接受'], rejections: ['拒絕。', '不允許', '不同意'], ambiguous: ['不要批准', '同意但是等等', '允許？'] },
	]) {
		test(`matches only complete approval and rejection phrases for ${locale}`, () => {
			const result = (text: string) => {
				const router = new VoiceLiveInputRouter();
				router.updateContext(context('chat-session:/a', approval, locale));
				return router.resolve(text, text, router.captureTarget()).toolCall?.args.response;
			};
			const repeat = (text: string) => {
				const phrase = text.replace(/[.!。！।]+$/, '');
				return `${phrase} ${phrase}`;
			};
			assert.deepStrictEqual({
				approvals: approvals.map(result), rejections: rejections.map(result), ambiguous: ambiguous.map(result),
				repeatedApprovals: approvals.map(text => result(repeat(text))),
				repeatedRejections: rejections.map(text => result(repeat(text))),
				mixed: result(`${repeat(approvals[0])} ${rejections[0]}`),
			}, {
				approvals: approvals.map(() => ({ type: 'approve' })),
				rejections: rejections.map(() => ({ type: 'reject' })),
				ambiguous: ambiguous.map(() => undefined),
				repeatedApprovals: approvals.map(() => ({ type: 'approve' })),
				repeatedRejections: rejections.map(() => ({ type: 'reject' })),
				mixed: undefined,
			});
		});
	}

	test('does not treat repeated but qualified or concatenated commands as consent', () => {
		assert.deepStrictEqual(['approve approve but wait', 'approve approve?', 'do not approve approve', 'approveapprove', 'approve reject', 'reject approve'].map(text => {
			const router = new VoiceLiveInputRouter();
			router.updateContext(context('chat-session:/a', approval));
			return router.resolve(text, text, router.captureTarget()).toolCall?.args.response;
		}), [undefined, undefined, undefined, undefined, undefined, undefined]);
	});

	test('does not interpret phrases from another voice language or guess unsupported languages', () => {
		assert.deepStrictEqual([
			{ locale: 'en-US', reply: 'ja' },
			{ locale: 'es-ES', reply: 'oui' },
			{ locale: 'uk-UA', reply: 'так' },
			{ locale: 'uk-UA', reply: 'approve' },
		].map(({ locale, reply }) => {
			const router = new VoiceLiveInputRouter();
			router.updateContext(context('chat-session:/a', approval, locale));
			return router.resolve('call', reply, router.captureTarget()).toolCall?.args.response;
		}), [undefined, undefined, undefined, { type: 'approve' }]);
	});

	test('validates multilingual approvals against the captured pending occurrence', () => {
		assert.deepStrictEqual(['current', 'replaced', 'submitted'].map(state => {
			const router = new VoiceLiveInputRouter();
			router.updateContext(context('chat-session:/a', approval, 'de-DE'));
			const target = router.captureTarget();
			if (state === 'replaced') {
				router.updateContext(context('chat-session:/a', { ...approval, pending_id: 'replacement' }, 'de-DE'));
			} else if (state === 'submitted') {
				router.resolve('other', 'ja', target);
			}
			return router.resolve('call', 'verwerfen', target).toolCall?.args.response;
		}), [{ type: 'reject' }, undefined, undefined]);
	});

	test('guides non-English question narration and accepts English replies across a form', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', questions, 'de-DE'));
		const initial = router.getQuestionPrompt('chat-session:/a', 'questions');
		const invalid = router.resolve('invalid', 'zweite', router.captureTarget());
		const next = router.resolve('first', 'second', router.captureTarget());
		const final = router.resolve('final', 'My deployment', router.captureTarget());
		assert.deepStrictEqual({ initial, invalid, next, response: final.toolCall?.args.response }, {
			initial: 'Please answer one question at a time. Question 1 of 2: Which region? 1. West 2. East Please answer by voice, or use the controls in chat.',
			invalid: { clarification: 'Please say an exact choice or its number. Please answer one question at a time. Question 1 of 2: Which region? 1. West 2. East Please answer by voice, or use the controls in chat.' },
			next: { clarification: 'Question 2 of 2: What name? Please answer by voice, or use the controls in chat.' },
			response: { type: 'answer', answers: [{ question_id: 'region', value: 'eastus' }, { question_id: 'name', freeform: 'My deployment' }] },
		});
	});

	test('accepts localized displayed choices and free-text replies throughout a localized question form', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', {
			...questions,
			questions: [
				{
					id: 'region', type: 'singleSelect', title: 'Welche Region?', allow_freeform: false,
					options: [{ label: 'Westen', value: 'westus' }, { label: 'Osten', value: 'eastus' }],
				},
				{ id: 'name', type: 'text', title: 'Welcher Name?', allow_freeform: true, options: [] },
			],
		}, 'de-DE'));
		const prompt = router.getQuestionPrompt('chat-session:/a', 'questions');
		const first = router.resolve('first', 'Osten', router.captureTarget());
		const final = router.resolve('final', 'Meine Bereitstellung', router.captureTarget());
		assert.deepStrictEqual({ prompt, first, response: final.toolCall?.args.response }, {
			prompt: 'Please answer one question at a time. Question 1 of 2: Welche Region? 1. Westen 2. Osten Please answer by voice, or use the controls in chat.',
			first: { clarification: 'Question 2 of 2: Welcher Name? Please answer by voice, or use the controls in chat.' },
			response: { type: 'answer', answers: [{ question_id: 'region', value: 'eastus' }, { question_id: 'name', freeform: 'Meine Bereitstellung' }] },
		});
	});

	test('supports English multi-select, custom answers, and skip with a non-English voice language', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', {
			...questions, questions: [{ ...questions.questions![0], type: 'multiSelect', allow_freeform: true }],
		}, 'fr-FR'));
		const selected = router.resolve('multi', 'first and East', router.captureTarget());
		router.handleResult('multi', { ok: false, reason: 'invalid_answer' });
		const custom = router.resolve('custom', 'other Central US', router.captureTarget());
		router.handleResult('custom', { ok: false, reason: 'invalid_answer' });
		const skipped = router.resolve('skip', 'skip', router.captureTarget());
		assert.deepStrictEqual([selected, custom, skipped].map(result => result.toolCall?.args.response), [
			{ type: 'answer', answers: [{ question_id: 'region', values: ['westus', 'eastus'] }] },
			{ type: 'answer', answers: [{ question_id: 'region', freeform: 'Central US' }] },
			{ type: 'skip' },
		]);
	});

	test('supports exact multi-select choices and explicit custom answers without guessing', () => {
		const router = new VoiceLiveInputRouter();
		const pending = { ...questions, questions: [{ ...questions.questions![0], type: 'multiSelect' as const, allow_freeform: true }] };
		router.updateContext(context('chat-session:/a', pending));
		const selected = router.resolve('multi', 'first and East', router.captureTarget());
		router.handleResult('multi', { ok: false, reason: 'invalid_answer' });
		const custom = router.resolve('custom', 'other Central US', router.captureTarget());
		assert.deepStrictEqual([selected, custom].map(result => result.toolCall?.args.response), [
			{ type: 'answer', answers: [{ question_id: 'region', values: ['westus', 'eastus'] }] },
			{ type: 'answer', answers: [{ question_id: 'region', freeform: 'Central US' }] },
		]);
	});

	test('revisiting a form narrates its current question and skipping preserves already supplied answers', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', questions));
		router.resolve('first', 'West', router.captureTarget());
		const prompt = router.getQuestionPrompt('chat-session:/a', 'questions');
		const skipped = router.resolve('skip', 'skip', router.captureTarget());
		assert.deepStrictEqual({ prompt, response: skipped.toolCall?.args.response }, {
			prompt: 'Question 2 of 2: What name?', response: { type: 'skip', answers: [{ question_id: 'region', value: 'westus' }] },
		});
	});

	test('does not treat skip as a text answer when skipping is disallowed', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', { ...questions, allow_skip: false, questions: [questions.questions![1]] }));
		assert.strictEqual(router.resolve('skip', 'skip', router.captureTarget()).clarification !== undefined, true);
	});

	test('does not confuse a numbered choice with a conflicting label or an unspoken option value', () => {
		const router = new VoiceLiveInputRouter();
		router.updateContext(context('chat-session:/a', {
			...questions, questions: [{
				...questions.questions![0], options: [{ label: 'West', value: 'opaque-one' }, { label: 'One', value: 'opaque-two' }],
			}]
		}));
		assert.deepStrictEqual(['one', '1', 'opaque-one'].map(text => router.resolve(text, text, router.captureTarget()).clarification !== undefined), [true, true, true]);
	});
});
