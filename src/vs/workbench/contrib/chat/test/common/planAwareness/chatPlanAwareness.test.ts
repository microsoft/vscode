/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IQuotaSnapshot } from '../../../../../services/chat/common/chatEntitlementService.js';
import { addRecentChatRequests, canShowPlanNudge, CHAT_WELCOME_SETTING_ID, ChatWelcomeTreatment, CUSTOMIZATION_HINT_SETTING_ID, CustomizationHintTreatment, DEFAULT_PLAN_NUDGE_LIMITS, findModelOfFamily, getAgentLimitState, getCustomizationFileKind, getCustomizationHintPresentation, getFlagshipModels, getModelFamilies, getPlanCredits, getPlanCreditsAvailableFact, getPlanCreditsPhrase, getPlanCreditsSentence, getPlanFactMarkdown, getPlanFacts, getPlanFactText, getPlanListParts, getSeenPlanNudges, ICustomizationHintContext, IChatWelcomeContext, IPlanModelInfo, IPlanNudgeState, IPlanSuggestionsContext, IPlanSummary, parseAgentCommandLine, parseTerminalAgents, parsePlanNudgeDeveloperMode, parsePlanNudgeState, parseRecentChatRequests, PLAN_SUGGESTIONS_SETTING_ID, PlanNudgeId, PlanNudgeSurface, recordPlanNudgeDismissed, recordPlanNudgeShown, shouldShowCustomizationHint, shouldShowPlanInChatWelcome, shouldShowPlanSuggestions } from '../../../common/planAwareness/chatPlanAwareness.js';

suite('ChatPlanAwareness', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('getPlanCredits only advertises credits that are worth advertising', () => {
		const quota = (snapshot: Partial<IQuotaSnapshot>): IQuotaSnapshot => ({ percentRemaining: 100, unlimited: false, ...snapshot });
		assert.deepStrictEqual([
			getPlanCredits(undefined, true, undefined),
			getPlanCredits(quota({ hasQuota: false }), true, undefined),
			getPlanCredits(quota({ unlimited: true }), true, undefined),
			getPlanCredits(quota({ unlimited: true, creditsUsed: 120 }), true, undefined),
			getPlanCredits(quota({ percentRemaining: 10, entitlement: 1000, quotaRemaining: 100 }), true, undefined),
			getPlanCredits(quota({ percentRemaining: 75, entitlement: 1000, quotaRemaining: 750.5 }), true, '2026-12-01'),
			getPlanCredits(quota({ percentRemaining: 50, entitlement: 300, resetAt: Date.UTC(2026, 11, 1) / 1000 }), false, undefined),
			getPlanCredits(quota({ percentRemaining: 50 }), false, undefined),
		], [
			undefined,
			undefined,
			{ kind: 'unlimited' },
			{ kind: 'organizationCovered' },
			undefined,
			{ kind: 'remaining', remaining: 750, resetDate: new Date('2026-12-01'), unit: 'credits' },
			{ kind: 'remaining', remaining: 150, resetDate: new Date(Date.UTC(2026, 11, 1)), unit: 'premiumRequests' },
			undefined,
		]);
	});

	test('models only include pickable Copilot models, naming the most capable of each family', () => {
		const model = (name: string, category?: string, outputCost?: number, extra?: Partial<IPlanModelInfo>): IPlanModelInfo => ({ vendor: 'copilot', family: name, id: name, name, isUserSelectable: true, category, outputCost, ...extra });
		const models = [
			model('GPT-6 Luna', 'lightweight', 50),
			model('GPT-6 Astra', 'powerful', 5000),
			model('GPT-6.1 Sol Fast (Preview)', 'powerful', 2000),
			model('GPT-6.1 Sol', 'powerful', 1000),
			model('GPT-5.6 Sol Fast (Preview)', 'powerful', 4000),
			model('Claude Sonnet 5.5', 'versatile', 1000),
			// An older version of a model line can cost more than its newest version
			model('Claude Opus 4.6', 'powerful', 2500),
			model('Claude Opus 5.5', 'powerful', 2000),
			model('Gemini 4 Argon', 'powerful', 1000, { isUserSelectable: false }),
			model('Grok 4.6', 'versatile', 600),
			model('Grok 4.7', 'versatile', 600),
			model('Gemini 4 Carbon', 'powerful', 1000, { vendor: 'ollama' }),
			model('Auto', undefined, undefined, { id: 'auto', family: 'claude-haiku-5.5' }),
		];
		assert.deepStrictEqual({
			families: getModelFamilies(models, 'copilot'),
			claude: findModelOfFamily(models, 'Claude', 'copilot')?.name,
			// The organization disabled Gemini, so Grok takes its place
			flagships: getFlagshipModels(models, 'copilot'),
			withGemini: getFlagshipModels([...models, model('Gemini 4 Carbon', 'powerful', 1000), model('Gemini 4 Argon', 'powerful', 1000)], 'copilot').names,
			onlyAuto: getFlagshipModels([model('Auto', undefined, undefined, { id: 'auto', family: 'claude-haiku-5.5' })], 'copilot'),
		}, {
			families: ['Claude', 'GPT', 'Grok'],
			claude: 'Claude Opus 5.5',
			flagships: { names: ['Claude Opus 5.5', 'GPT-6 Astra', 'Grok 4.7'], hasMore: true },
			withGemini: ['Claude Opus 5.5', 'GPT-6 Astra', 'Gemini 4 Argon'],
			onlyAuto: { names: [], hasMore: false },
		});
	});

	test('plan facts emphasize the credits and models', () => {
		const plan: IPlanSummary = {
			planName: 'Copilot Enterprise',
			paidByOrganization: true,
			organization: 'contoso',
			credits: { kind: 'remaining', remaining: 10000, resetDate: new Date(Date.UTC(2026, 11, 1)), unit: 'credits' },
			modelFamilies: ['Claude', 'GPT', 'Gemini'],
			models: ['Claude Opus 5.5', 'GPT-6 Astra', 'Gemini 4 Argon'],
			hasMoreModels: true,
			harnesses: ['Claude', 'Codex'],
		};
		const individual: IPlanSummary = { ...plan, planName: 'Copilot Pro', paidByOrganization: false, organization: undefined, credits: undefined, models: ['Claude Opus 5.5'], hasMoreModels: false, harnesses: [] };
		assert.deepStrictEqual({
			facts: getPlanFacts(plan, 'en').map(getPlanFactMarkdown),
			individual: getPlanFacts(individual, 'en').map(getPlanFactText),
			sentences: [plan, individual, { ...individual, credits: { kind: 'remaining', remaining: 300, resetDate: undefined, unit: 'premiumRequests' } } satisfies IPlanSummary].map(summary => getPlanFactMarkdown(getPlanCreditsSentence(summary, 'en'))),
			available: [plan, individual].map(summary => getPlanFactMarkdown(getPlanCreditsAvailableFact(summary, 'en'))),
			// An organization may pay for a Business plan without naming itself
			phrases: [plan, { ...plan, organization: undefined, credits: undefined }, individual, { ...individual, credits: plan.credits }].map(summary => getPlanFactMarkdown(getPlanCreditsPhrase(summary, 'en'))),
			// The models and harnesses that the user can pick, laid out like the fact
			choices: getPlanFacts(plan, 'en').map(fact => fact.choices && getPlanListParts(fact.choices.names, 'en', fact.choices.listType).map(part => part.isItem ? `[${part.value}]` : part.value).join('')),
		}, {
			facts: [
				'**10,000 AI credits** available, paid by your organization',
				'**Claude Opus 5.5, GPT-6 Astra, Gemini 4 Argon**, …',
				'Use the **Copilot, Claude, or Codex** harness',
			],
			individual: ['Included in your Copilot Pro plan', 'Claude Opus 5.5 models'],
			sentences: [
				'You have **10,000 AI credits** available, paid by your organization.',
				'Included in your Copilot Pro plan.',
				'You have **300 premium requests** available in your Copilot Pro plan.',
			],
			available: ['You have **10,000 AI credits** available.', 'Included in your Copilot Pro plan.'],
			phrases: ['**10,000 AI credits** available, paid by your organization', 'Paid by your organization', 'Included in your Copilot Pro plan', '**10,000 AI credits** available in your Copilot Pro plan'],
			choices: [undefined, '[Claude Opus 5.5], [GPT-6 Astra], [Gemini 4 Argon]', '[Copilot], [Claude], or [Codex]'],
		});
	});

	test('customization file hint: files, inactivity, copy and experiment triggers', () => {
		const day = 24 * 60 * 60 * 1000;
		const now = 100 * day;
		const decide = (context: Partial<ICustomizationHintContext>) => {
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const show = shouldShowCustomizationHint({ enabled: true, recentChatRequests: [now - 20 * day], inactiveDays: undefined, withinLimits: true, now, ...context }, telemetryService);
			return { show, triggers: telemetryService.triggers };
		};
		const defaults = {
			text: 'Copilot picks up your skill files',
			credits: { before: '', emphasis: '10,000 AI credits', after: ' available, paid by your organization' },
			action: 'Use Now',
		};
		const present = (treatments: { text?: unknown; action?: unknown }, credits: string | undefined) => {
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const presentation = getCustomizationHintPresentation({ text: treatments.text, action: treatments.action }, defaults, { credits, plan: 'Copilot Enterprise' }, telemetryService);
			return { text: getPlanFactMarkdown(presentation.text), credits: presentation.credits && getPlanFactMarkdown(presentation.credits), action: presentation.action, triggers: telemetryService.triggers };
		};
		const copyTriggers = [CustomizationHintTreatment.Text, CustomizationHintTreatment.Action];
		const enabledTrigger = `config.${CUSTOMIZATION_HINT_SETTING_ID}`;
		assert.deepStrictEqual({
			kinds: ['/w/CLAUDE.md', '/w/AGENTS.md', '/w/.github/copilot-instructions.md', '/w/.github/skills/review/SKILL.md', '/w/.github/agents/fix.agent.md', '/w/.github/prompts/tests.prompt.md', '/w/.claude/rules/style.md', '/w/README.md', '/w/hooks.json'].map(path => getCustomizationFileKind(URI.file(path))),
			// Every arm logs the setting trigger for inactive users, and the inactivity trigger once the hint is enabled
			treatmentArm: decide({}),
			controlArm: decide({ enabled: false }),
			activeUser: decide({ recentChatRequests: [now - 2 * day] }),
			activeUserShorterTreatment: decide({ recentChatRequests: [now - 2 * day], inactiveDays: 1 }),
			// No request in two weeks, but four in four weeks
			regularUser: decide({ recentChatRequests: [now - 15 * day, now - 16 * day, now - 17 * day, now - 20 * day] }),
			fewRequests: decide({ recentChatRequests: [now - 15 * day, now - 16 * day, now - 30 * day, now - 40 * day] }),
			neverUsed: decide({ recentChatRequests: [], inactiveDays: 90 }),
			stillUnknown: decide({ recentChatRequests: undefined }),
			invalidDays: decide({ recentChatRequests: [now - 20 * day], inactiveDays: 'soon' }),
			dismissed: decide({ withinLimits: false }),
			defaults: present({}, '10,000 AI credits'),
			treatments: present({ text: 'Copilot follows this too: {credits} on your {plan} seat', action: 'Try Copilot' }, '10,000 AI credits'),
			// Too long for one line
			longText: present({ text: 'Copilot follows this file too. '.repeat(5) }, '10,000 AI credits'),
			invalidTreatments: present({ text: 'You have {credits}', action: '' }, undefined),
		}, {
			kinds: ['instructions', 'instructions', 'instructions', 'skill', 'agent', 'prompt', 'instructions', undefined, undefined],
			treatmentArm: { show: true, triggers: [enabledTrigger, CustomizationHintTreatment.InactiveDays] },
			controlArm: { show: false, triggers: [enabledTrigger] },
			activeUser: { show: false, triggers: [CustomizationHintTreatment.InactiveDays] },
			activeUserShorterTreatment: { show: true, triggers: [enabledTrigger, CustomizationHintTreatment.InactiveDays] },
			regularUser: { show: false, triggers: [CustomizationHintTreatment.InactiveDays] },
			fewRequests: { show: true, triggers: [enabledTrigger, CustomizationHintTreatment.InactiveDays] },
			neverUsed: { show: true, triggers: [enabledTrigger, CustomizationHintTreatment.InactiveDays] },
			stillUnknown: { show: false, triggers: [CustomizationHintTreatment.InactiveDays] },
			invalidDays: { show: true, triggers: [enabledTrigger, CustomizationHintTreatment.InactiveDays] },
			dismissed: { show: false, triggers: [enabledTrigger, CustomizationHintTreatment.InactiveDays] },
			defaults: { text: 'Copilot picks up your skill files', credits: '**10,000 AI credits** available, paid by your organization', action: 'Use Now', triggers: copyTriggers },
			treatments: { text: 'Copilot follows this too: **10,000 AI credits** on your Copilot Enterprise seat', credits: undefined, action: 'Try Copilot', triggers: copyTriggers },
			longText: { text: 'Copilot picks up your skill files', credits: '**10,000 AI credits** available, paid by your organization', action: 'Use Now', triggers: copyTriggers },
			invalidTreatments: { text: 'Copilot picks up your skill files', credits: '**10,000 AI credits** available, paid by your organization', action: 'Use Now', triggers: copyTriggers },
		});
	});

	test('plan in the empty Chat view: organization plans, two requests in the period and experiment triggers', () => {
		const day = 24 * 60 * 60 * 1000;
		const now = 100 * day;
		const decide = (context: Partial<IChatWelcomeContext>) => {
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const show = shouldShowPlanInChatWelcome({ enabled: true, paidByOrganization: true, recentChatRequests: [now - 22 * day, now - 30 * day], inactiveDays: undefined, now, ...context }, telemetryService);
			return { show, triggers: telemetryService.triggers };
		};
		const enabledTrigger = `config.${CHAT_WELCOME_SETTING_ID}`;
		assert.deepStrictEqual({
			treatmentArm: decide({}),
			controlArm: decide({ enabled: false }),
			individualPlan: decide({ paidByOrganization: false }),
			oneRecentRequest: decide({ recentChatRequests: [now - day, now - 30 * day] }),
			twoRecentRequests: decide({ recentChatRequests: [now - day, now - 20 * day] }),
			twoRecentRequestsShorterTreatment: decide({ recentChatRequests: [now - day, now - 20 * day], inactiveDays: 14 }),
			neverUsed: decide({ recentChatRequests: [] }),
			stillUnknown: decide({ recentChatRequests: undefined }),
		}, {
			treatmentArm: { show: true, triggers: [enabledTrigger, ChatWelcomeTreatment.InactiveDays] },
			controlArm: { show: false, triggers: [enabledTrigger] },
			individualPlan: { show: false, triggers: [] },
			oneRecentRequest: { show: true, triggers: [enabledTrigger, ChatWelcomeTreatment.InactiveDays] },
			twoRecentRequests: { show: false, triggers: [ChatWelcomeTreatment.InactiveDays] },
			twoRecentRequestsShorterTreatment: { show: true, triggers: [enabledTrigger, ChatWelcomeTreatment.InactiveDays] },
			neverUsed: { show: true, triggers: [enabledTrigger, ChatWelcomeTreatment.InactiveDays] },
			stillUnknown: { show: false, triggers: [ChatWelcomeTreatment.InactiveDays] },
		});
	});

	test('plan suggestions: users who did not use Copilot in four weeks, and experiment triggers', () => {
		const day = 24 * 60 * 60 * 1000;
		const now = 100 * day;
		const decide = (context: Partial<IPlanSuggestionsContext>) => {
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const show = shouldShowPlanSuggestions({ enabled: true, recentChatRequests: [now - 30 * day], now, ...context }, telemetryService);
			return { show, triggers: telemetryService.triggers };
		};
		const trigger = `config.${PLAN_SUGGESTIONS_SETTING_ID}`;
		assert.deepStrictEqual({
			// Every arm logs the trigger for the users that suggestions apply to
			treatmentArm: decide({}),
			controlArm: decide({ enabled: false }),
			neverUsed: decide({ recentChatRequests: [], enabled: false }),
			recentRequest: decide({ recentChatRequests: [now - 27 * day] }),
			stillUnknown: decide({ recentChatRequests: undefined }),
		}, {
			treatmentArm: { show: true, triggers: [trigger] },
			controlArm: { show: false, triggers: [trigger] },
			neverUsed: { show: false, triggers: [trigger] },
			recentRequest: { show: false, triggers: [] },
			stillUnknown: { show: false, triggers: [] },
		});
	});

	test('remembers the most recent Copilot requests', () => {
		assert.deepStrictEqual({
			added: addRecentChatRequests([20], 30, 0, 10, 50, 40),
			stored: parseRecentChatRequests('[10, 30, "x", 20]'),
			nothingStored: parseRecentChatRequests(undefined),
			incompatible: parseRecentChatRequests('{"last": 30}'),
		}, {
			added: [50, 40, 30, 20],
			stored: [30, 20, 10],
			nothingStored: undefined,
			incompatible: undefined,
		});
	});

	test('canShowPlanNudge limits moments and hints', () => {
		const day = 24 * 60 * 60 * 1000;
		let state: IPlanNudgeState = parsePlanNudgeState(undefined);
		const results: boolean[] = [];
		// Without the limit on different suggestions, which the next test covers
		const limits = { ...DEFAULT_PLAN_NUDGE_LIMITS, maxSeenNudges: Infinity };

		results.push(canShowPlanNudge(state, PlanNudgeId.AgentUsageLimit, PlanNudgeSurface.Moment, 0, limits));
		state = recordPlanNudgeShown(state, PlanNudgeId.AgentUsageLimit, PlanNudgeSurface.Moment, 0);
		results.push(canShowPlanNudge(state, PlanNudgeId.AgentUsageLimit, PlanNudgeSurface.Moment, 2 * day, limits)); // moments are spaced out
		results.push(canShowPlanNudge(state, PlanNudgeId.AgentUsageLimit, PlanNudgeSurface.Moment, 6 * day, { ...limits, momentIntervalMs: 0 })); // the same moment at most once a week, even when urgent
		results.push(canShowPlanNudge(state, PlanNudgeId.AgentUsageLimit, PlanNudgeSurface.Moment, 7 * day, limits));
		state = recordPlanNudgeShown(state, PlanNudgeId.AgentUsageLimit, PlanNudgeSurface.Moment, 7 * day);
		state = recordPlanNudgeShown(state, PlanNudgeId.AgentUsageLimit, PlanNudgeSurface.Moment, 14 * day);
		results.push(canShowPlanNudge(state, PlanNudgeId.AgentUsageLimit, PlanNudgeSurface.Moment, 30 * day, limits)); // each moment a few times

		for (let i = 0; i < 3; i++) {
			results.push(canShowPlanNudge(state, PlanNudgeId.ReviewChanges, PlanNudgeSurface.Hint, 0, limits));
			state = recordPlanNudgeShown(state, PlanNudgeId.ReviewChanges, PlanNudgeSurface.Hint, 0);
		}
		results.push(canShowPlanNudge(state, PlanNudgeId.ReviewChanges, PlanNudgeSurface.Hint, 0, limits));

		// The customization file hint shows until the user closes it
		for (let i = 0; i < 5; i++) {
			state = recordPlanNudgeShown(state, PlanNudgeId.CustomizationFile, PlanNudgeSurface.Hint, 0);
		}
		results.push(canShowPlanNudge(state, PlanNudgeId.CustomizationFile, PlanNudgeSurface.Hint, 0, limits));
		state = recordPlanNudgeDismissed(state, PlanNudgeId.CustomizationFile);
		results.push(canShowPlanNudge(state, PlanNudgeId.CustomizationFile, PlanNudgeSurface.Hint, 0, limits));

		assert.deepStrictEqual(results, [true, false, false, true, false, true, true, true, false, true, false]);
		assert.deepStrictEqual(parsePlanNudgeState(JSON.stringify(state)), state);
		assert.deepStrictEqual(parsePlanNudgeState('{"shownCounts":{"a":"x"},"dismissed":[1,"b"]}'), { lastMomentShownAt: undefined, lastShownAt: {}, shownCounts: {}, dismissed: ['b'] });
	});

	test('suggestions stop after the user has seen two different ones', () => {
		let state = parsePlanNudgeState(undefined);
		const canShow = (id: PlanNudgeId) => canShowPlanNudge(state, id, PlanNudgeSurface.Hint, 0);
		const snapshot = () => ({ seen: getSeenPlanNudges(state), banner: canShow(PlanNudgeId.CustomizationFile), review: canShow(PlanNudgeId.ReviewChanges), search: canShow(PlanNudgeId.SearchFallback), chat: canShow(PlanNudgeId.ChatWelcome) });
		const steps = [snapshot()];
		// Repeats and quiet entry points do not use up the budget
		state = recordPlanNudgeShown(state, PlanNudgeId.CustomizationFile, PlanNudgeSurface.Hint, 0);
		state = recordPlanNudgeShown(state, PlanNudgeId.CustomizationFile, PlanNudgeSurface.Hint, 0);
		state = recordPlanNudgeShown(state, PlanNudgeId.SearchFallback, PlanNudgeSurface.Hint, 0);
		steps.push(snapshot());
		state = recordPlanNudgeShown(state, PlanNudgeId.ReviewChanges, PlanNudgeSurface.Hint, 0);
		steps.push(snapshot());
		assert.deepStrictEqual({
			steps,
			developerMode: [undefined, 'all', { customizationFile: true, reviewChanges: false, unknown: true }].map(value => [...parsePlanNudgeDeveloperMode(value)]),
		}, {
			steps: [
				{ seen: [], banner: true, review: true, search: true, chat: true },
				{ seen: [PlanNudgeId.CustomizationFile], banner: true, review: true, search: true, chat: true },
				// Chat is where the user already is, so its suggestions remain, and the customization file hint shows until closed
				{ seen: [PlanNudgeId.CustomizationFile, PlanNudgeId.ReviewChanges], banner: true, review: false, search: false, chat: true },
			],
			developerMode: [[], [], [PlanNudgeId.CustomizationFile]],
		});
	});

	test('detects the moments to suggest Copilot with the terminal agents that the product configures', () => {
		const agents = parseTerminalAgents([
			{ name: 'Test Agent', commands: ['test-agent', 'npx @test/agent'], promptArguments: ['-p', 'run'], modelFamily: 'claude', limitReachedOutput: ['limitreached', 'error:\\D{0,20}429'], limitApproachingOutput: ['\\d+%used'] },
			{ name: 'Other Agent', commands: ['other'], limitReachedOutput: ['outofcredits'] },
			// Not valid: without commands, without a valid pattern, or without a name
			{ name: 'No Commands', commands: [], limitReachedOutput: ['x'] },
			{ name: 'Invalid Pattern', commands: ['invalid'], limitReachedOutput: ['('] },
			{ name: ' ', commands: ['unnamed'], limitReachedOutput: ['x'] },
		]);
		const [testAgent, otherAgent] = agents;
		const parse = (commandLine: string) => {
			const result = parseAgentCommandLine(commandLine, agents);
			return result && { agent: result.agent.name, prompt: result.prompt };
		};
		assert.deepStrictEqual({
			agents: agents.map(agent => ({ name: agent.name, modelFamily: agent.modelFamily })),
			commandLines: ['test-agent', 'test-agent -p "add input validation"', 'test-agent run \'fix the build\'', 'test-agent "add a login page"', 'test-agent --resume', 'npx  @test/agent', 'test-agentic', 'other "go on"', 'git commit'].map(parse),
			limits: ['Limit reached · resets 8pm', 'Error: request rejected (429)', '90% used', 'Limit\x20re\nached', 'Done in 3s'].map(output => getAgentLimitState(output, testAgent)),
			otherLimits: ['Out of credits', '90% used'].map(output => getAgentLimitState(output, otherAgent)),
			noAgents: parseTerminalAgents(undefined),
		}, {
			agents: [{ name: 'Test Agent', modelFamily: 'Claude' }, { name: 'Other Agent', modelFamily: undefined }],
			commandLines: [
				{ agent: 'Test Agent', prompt: undefined },
				{ agent: 'Test Agent', prompt: 'add input validation' },
				{ agent: 'Test Agent', prompt: 'fix the build' },
				{ agent: 'Test Agent', prompt: 'add a login page' },
				{ agent: 'Test Agent', prompt: undefined },
				{ agent: 'Test Agent', prompt: undefined },
				undefined,
				{ agent: 'Other Agent', prompt: 'go on' },
				undefined,
			],
			limits: ['reached', 'reached', 'approaching', 'reached', undefined],
			otherLimits: ['reached', undefined],
			noAgents: [],
		});
	});
});
