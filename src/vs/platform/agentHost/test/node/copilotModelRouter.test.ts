/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import { ContextSizeConfigKey, createContextSizeConfigSchemaPropertyFromLimits } from '../../common/agentModelConfiguration.js';
import { ModelRouterDiagnosticSeverity, parseModelRouter } from '../../common/modelRouter.js';
import type { IModelRouterSituation } from '../../common/modelRouterSituation.js';
import { ReasoningEffortConfigKey } from '../../common/reasoningEffort.js';
import { MessageKind, TurnState, type IModelRoutedInfo, type Turn } from '../../common/state/sessionState.js';
import { applyPersistedTurnUsage } from '../../node/chatContributions/persistedTurnUsage/persistedTurnUsageContribution.js';
import { CopilotModelRouter, decideModelRouterSwitch, type IModelRouterPick, type IModelRouterPicker, type IModelRouterPickRequest } from '../../node/copilot/copilotModelRouter.js';
import type { IModelRouterFile } from '../../node/copilot/copilotModelRouterCatalog.js';

function model(id: string, efforts?: string[]): IAgentModelInfo {
	return {
		provider: 'copilotcli', id, name: id.toUpperCase(), supportsVision: true,
		...(efforts ? { configSchema: { type: 'object', properties: { [ReasoningEffortConfigKey]: { type: 'string', title: 'Effort', enum: efforts } } } } : {}),
	};
}

const models = [model('haiku', ['low', 'medium', 'high']), model('opus', ['low', 'medium', 'high'])];

function routerFile(extra = ''): IModelRouterFile {
	const content = `version: 1\ndescription: Test.\n${extra}routes:\n  - model: haiku\n    when: Small edits.\n  - model: opus\n    when: Planning.\n`;
	const result = parseModelRouter(content, 'daily.model-router.yaml');
	return { uri: URI.file('/home/.agents/model-routers/daily.model-router.yaml'), scope: 'user', name: 'daily', router: result.router, diagnostics: result.diagnostics };
}

function routedTurn(routed: IModelRoutedInfo, inputTokens = 1000): Turn {
	return {
		id: `t-${Math.random()}`,
		message: { text: 'earlier', origin: { kind: MessageKind.User }, model: { id: 'model-router:daily' } },
		responseParts: [],
		usage: { inputTokens, outputTokens: 10, _meta: { modelRouted: routed } },
		state: TurnState.Complete,
	} as Turn;
}

class FakePicker implements IModelRouterPicker {
	readonly requests: IModelRouterPickRequest[] = [];
	constructor(private readonly _pick: IModelRouterPick) { }
	async pick(request: IModelRouterPickRequest): Promise<IModelRouterPick> {
		this.requests.push(request);
		return this._pick;
	}
}

suite('CopilotModelRouter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const engine = new CopilotModelRouter(new NullLogService());
	const resolve = (options: { file?: IModelRouterFile; picker?: IModelRouterPicker; previousTurns?: Turn[]; text?: string }) => engine.resolve({
		chat: 'chat-1', modelId: 'model-router:daily', file: options.file, text: options.text ?? 'plan the migration', models, previousTurns: options.previousTurns ?? [], picker: options.picker,
	});

	test('keeps the chat\'s model when the router is missing or invalid', async () => {
		const invalid: IModelRouterFile = { ...routerFile(), router: undefined, diagnostics: [{ severity: ModelRouterDiagnosticSeverity.Error, message: 'Add `version: 1`.' }] };
		assert.deepStrictEqual([await resolve({}), await resolve({ file: invalid })], [
			{ selection: undefined, notices: ['The model router daily was not found, so this chat kept its current model.'] },
			{ selection: undefined, notices: ['The model router daily has a problem, so this chat kept its current model: Add `version: 1`.'] },
		]);
	});

	test('without a decision model, a first turn uses the first route and says why', async () => {
		const result = await resolve({ file: routerFile() });
		assert.deepStrictEqual(result, {
			selection: { id: 'haiku' },
			routed: { router: 'daily', chosenModel: 'haiku', defaulted: true, firstTurnOnly: true },
			notices: ['The model router daily used HAIKU, its first model, because routing was unavailable.'],
		});
	});

	test('a confident pick chooses its route and effort', async () => {
		const picker = new FakePicker({ model: 'opus', confidence: 0.9, probabilities: { opus: 0.9, haiku: 0.1 }, effortScore: 2 });
		const result = await resolve({ file: routerFile(), picker });
		assert.deepStrictEqual({ result, askEffort: picker.requests[0].askEffort, candidates: picker.requests[0].candidates.map(c => c.when) }, {
			result: { selection: { id: 'opus', config: { [ReasoningEffortConfigKey]: 'high' } }, routed: { router: 'daily', chosenModel: 'opus', preference: 'Planning.', effort: 'high', firstTurnOnly: true }, notices: [] },
			askEffort: true,
			candidates: ['Small edits.', 'Planning.'],
		});
	});

	test('a follow-up stays on its model without a decision model, or when switching is first-turn, the default', async () => {
		const previousTurns = [routedTurn({ router: 'daily', chosenModel: 'opus' })];
		const picker = new FakePicker({ model: 'haiku', confidence: 0.9, probabilities: { haiku: 0.9, opus: 0.1 } });
		const results = [
			await resolve({ file: routerFile('switching: auto\n'), previousTurns }),
			await resolve({ file: routerFile(), previousTurns, picker }),
		];
		// Only a router that routes the first turn alone marks its picks, so the chat shows no routing line for the turns after it.
		assert.deepStrictEqual(results.map(r => [r.selection?.id, r.routed?.kept, r.routed?.firstTurnOnly]), [['opus', true, undefined], ['opus', true, true]]);
		assert.strictEqual(picker.requests.length, 0);
	});

	test('with switching auto, a follow-up moves to the route its message clearly fits, sending recent turns as text', async () => {
		const previousTurns = [routedTurn({ router: 'daily', chosenModel: 'opus' })];
		const picker = new FakePicker({ model: 'haiku', confidence: 0.9, probabilities: { haiku: 0.9, opus: 0.1 } });
		const result = await resolve({ file: routerFile('switching: auto\n'), previousTurns, picker, text: 'rename this variable' });
		assert.deepStrictEqual({ selection: result.selection?.id, switchedFrom: result.routed?.switchedFrom, recent: picker.requests[0].followUp?.recentTurns }, {
			selection: 'haiku', switchedFrom: 'opus', recent: [{ prompt: 'earlier', response: '' }],
		});
	});

	test('the switch policy stays on near ties and holds in long chats', () => {
		const pick: IModelRouterPick = { model: 'haiku', confidence: 0.9, probabilities: { haiku: 0.9, opus: 0.1 } };
		assert.deepStrictEqual([
			decideModelRouterSwitch({ currentModel: 'opus', pick, turnsSinceSwitch: undefined, switches: 0 }),
			decideModelRouterSwitch({ currentModel: 'opus', pick: { ...pick, probabilities: { haiku: 0.6, opus: 0.5 } }, turnsSinceSwitch: undefined, switches: 0 }),
			decideModelRouterSwitch({ currentModel: 'opus', pick, turnsSinceSwitch: 1, switches: 1 }),
		], ['switch', 'stay', 'stay']);
	});

	test('switching to this router, from another router or a hand-picked model, routes afresh', async () => {
		const picker = new FakePicker({ model: 'opus', confidence: 0.9, probabilities: { opus: 0.9, haiku: 0.1 } });
		const handPicked = { ...routedTurn({ router: 'x', chosenModel: 'x' }), usage: { inputTokens: 10, outputTokens: 1 }, message: { text: 'earlier', origin: { kind: MessageKind.User }, model: { id: 'haiku' } } } as Turn;
		const fromOtherRouter = await resolve({ file: routerFile(), picker, previousTurns: [routedTurn({ router: 'other', chosenModel: 'haiku' })] });
		const fromHandPicked = await resolve({ file: routerFile(), picker, previousTurns: [handPicked] });
		assert.deepStrictEqual({
			selections: [fromOtherRouter.selection?.id, fromHandPicked.selection?.id],
			switchedFrom: [fromOtherRouter.routed?.switchedFrom, fromHandPicked.routed?.switchedFrom],
			followUps: picker.requests.map(r => !!r.followUp),
		}, { selections: ['opus', 'opus'], switchedFrom: ['haiku', 'haiku'], followUps: [false, false] });
	});

	test('a pick stays its router\'s only while no other router was selected after it', async () => {
		const picker = new FakePicker({ model: 'opus', confidence: 0.9, probabilities: { opus: 0.9, haiku: 0.1 } });
		const unrouted = (router: string) => ({ ...routedTurn({ router, chosenModel: 'x' }), usage: undefined, message: { text: 'earlier', origin: { kind: MessageKind.User }, model: { id: `model-router:${router}` } } } as Turn);
		const file = routerFile('switching: first-turn\n');
		const afterOtherFailed = await resolve({ file, picker, previousTurns: [routedTurn({ router: 'daily', chosenModel: 'haiku' }), unrouted('other')] });
		const repairedAfterOtherPicked = await resolve({ file, picker, previousTurns: [routedTurn({ router: 'other', chosenModel: 'haiku' }), unrouted('daily')] });
		const afterOwnFailed = await resolve({ file, picker, previousTurns: [routedTurn({ router: 'daily', chosenModel: 'haiku' }), unrouted('daily')] });
		assert.deepStrictEqual({
			selections: [afterOtherFailed.selection?.id, repairedAfterOtherPicked.selection?.id, afterOwnFailed.selection?.id],
			picks: picker.requests.length,
		}, { selections: ['opus', 'opus', 'haiku'], picks: 2 });
	});

	test('applies a route\'s context size, keeps a long window once the chat has one, and names the router by its display name', async () => {
		const contextSize = createContextSizeConfigSchemaPropertyFromLimits(200_000, 1_000_000)!;
		const withWindows = models.map((candidate): IAgentModelInfo => ({ ...candidate, configSchema: { type: 'object', properties: { ...candidate.configSchema?.properties, [ContextSizeConfigKey]: contextSize } } }));
		const content = 'version: 1\ndisplay-name: Daily Driver\ndescription: Test.\neffort: off\nroutes:\n  - model: haiku\n    when: Small edits.\n    context-size: default\n  - model: opus\n    when: Planning.\n    context-size: long\n';
		const file: IModelRouterFile = { ...routerFile(), router: parseModelRouter(content, 'daily.model-router.yaml').router };
		const route = (previousTurns: Turn[], picker?: IModelRouterPicker) => engine.resolve({ chat: 'chat-1', modelId: 'model-router:daily', file, text: 'plan the migration', models: withWindows, previousTurns, picker });
		const picked = await route([], new FakePicker({ model: 'opus', confidence: 0.9, probabilities: { opus: 0.9, haiku: 0.1 } }));
		const unavailable = await route([]);
		const kept = await route([routedTurn({ router: 'daily', chosenModel: 'haiku', contextSize: 'long', longContext: true })]);
		// The long window is the chat's, so it holds across another router's pick, a turn on a model with one size, and until the user picks a model by hand.
		// It also holds when no route asked for it and the earlier model ran on its larger window by default.
		const handPicked = { ...routedTurn({ router: 'x', chosenModel: 'x' }), usage: { inputTokens: 10, outputTokens: 1 }, message: { text: 'earlier', origin: { kind: MessageKind.User }, model: { id: 'haiku' } } } as Turn;
		const stickyLong = await Promise.all([
			route([routedTurn({ router: 'other', chosenModel: 'haiku', contextSize: 'long', longContext: true })]),
			route([routedTurn({ router: 'daily', chosenModel: 'opus', contextSize: 'long', longContext: true }), routedTurn({ router: 'daily', chosenModel: 'haiku' })]),
			route([routedTurn({ router: 'other', chosenModel: 'opus', longContext: true })]),
			route([routedTurn({ router: 'daily', chosenModel: 'haiku', contextSize: 'long', longContext: true }), handPicked]),
		]);
		assert.deepStrictEqual(stickyLong.map(result => result.selection), [
			{ id: 'haiku', config: { [ContextSizeConfigKey]: 1_000_000 } },
			{ id: 'haiku', config: { [ContextSizeConfigKey]: 1_000_000 } },
			{ id: 'haiku', config: { [ContextSizeConfigKey]: 1_000_000 } },
			{ id: 'haiku', config: { [ContextSizeConfigKey]: 200_000 } },
		]);
		// A model that defaults to its larger window is on a long window without the router sending a size.
		const longByDefault = withWindows.map((candidate): IAgentModelInfo => ({ ...candidate, configSchema: { type: 'object', properties: { ...candidate.configSchema?.properties, [ContextSizeConfigKey]: createContextSizeConfigSchemaPropertyFromLimits(200_000, 1_000_000, 1_000_000)! } } }));
		const implicit = (previousTurns: Turn[]) => engine.resolve({ chat: 'chat-1', modelId: 'model-router:daily', file: routerFile('effort: off\n'), text: 'plan the migration', models: longByDefault, previousTurns, picker: undefined });
		const implicitLong = [await implicit([]), await implicit([routedTurn({ router: 'daily', chosenModel: 'haiku', longContext: true })])];
		assert.deepStrictEqual(implicitLong.map(result => [result.selection, result.routed?.longContext, result.routed?.contextSize]), [
			[{ id: 'haiku' }, true, undefined],
			[{ id: 'haiku' }, true, undefined],
		]);
		assert.deepStrictEqual({ picked, unavailable: { selection: unavailable.selection, notices: unavailable.notices }, kept: { selection: kept.selection, contextSize: kept.routed?.contextSize, contextTokens: kept.routed?.contextTokens } }, {
			picked: {
				selection: { id: 'opus', config: { [ContextSizeConfigKey]: 1_000_000 } },
				routed: { router: 'daily', routerLabel: 'Daily Driver', chosenModel: 'opus', preference: 'Planning.', contextSize: 'long', contextTokens: 1_000_000, longContext: true, firstTurnOnly: true },
				notices: [],
			},
			unavailable: { selection: { id: 'haiku', config: { [ContextSizeConfigKey]: 200_000 } }, notices: ['The model router Daily Driver used HAIKU, its first model, because routing was unavailable.'] },
			kept: { selection: { id: 'haiku', config: { [ContextSizeConfigKey]: 1_000_000 } }, contextSize: 'long', contextTokens: 1_000_000 },
		});
	});

	test('a turn the router could not route does not end the chat\'s long window after a restart', async () => {
		const contextSize = createContextSizeConfigSchemaPropertyFromLimits(200_000, 1_000_000)!;
		const withWindows = models.map((candidate): IAgentModelInfo => ({ ...candidate, configSchema: { type: 'object', properties: { ...candidate.configSchema?.properties, [ContextSizeConfigKey]: contextSize } } }));
		const content = 'version: 1\ndescription: Test.\neffort: off\nroutes:\n  - model: haiku\n    when: Small edits.\n    context-size: default\n  - model: opus\n    when: Planning.\n    context-size: long\n';
		const file: IModelRouterFile = { ...routerFile(), router: parseModelRouter(content, 'daily.model-router.yaml').router };
		const route = (previousTurns: readonly Turn[]) => engine.resolve({ chat: 'chat-1', modelId: 'model-router:daily', file, text: 'plan the migration', models: withWindows, previousTurns, picker: undefined });
		const long = routedTurn({ router: 'daily', chosenModel: 'haiku', contextSize: 'long', longContext: true });
		// A turn sent while the router file was invalid, as the provider restores it after a host
		// restart: its selection is the model it ran on, and it has no usage until the saved one is applied.
		const restored: Turn = { id: 'unrouted', message: { text: 'earlier', origin: { kind: MessageKind.User }, model: { id: 'haiku' } }, responseParts: [], usage: undefined, state: TurnState.Complete };
		const saved = (usage: object) => new Map([[restored.id, JSON.stringify(usage)]]);
		const unrouted = await route(applyPersistedTurnUsage([long, restored], saved({ inputTokens: 10, outputTokens: 1, _meta: { modelRouterUnrouted: 'daily' } })));
		const handPicked = await route(applyPersistedTurnUsage([long, restored], saved({ inputTokens: 10, outputTokens: 1 })));
		assert.deepStrictEqual({
			unrouted: { selection: unrouted.selection, kept: unrouted.routed?.kept },
			handPicked: { selection: handPicked.selection, kept: handPicked.routed?.kept },
		}, {
			// The router's own pick still stands, on the window the chat already has.
			unrouted: { selection: { id: 'haiku', config: { [ContextSizeConfigKey]: 1_000_000 } }, kept: true },
			// A model the user picked by hand is theirs, window included.
			handPicked: { selection: { id: 'haiku', config: { [ContextSizeConfigKey]: 200_000 } }, kept: undefined },
		});
	});

	test('tells the decision about the turn and about each model, when there is something to tell', async () => {
		const priced = models.map((candidate, index): IAgentModelInfo => ({ ...candidate, _meta: { priceCategory: index === 0 ? 'low' : 'high' } }));
		const picker = new FakePicker({ model: 'opus', confidence: 0.9, probabilities: { opus: 0.9, haiku: 0.1 } });
		const route = (available: readonly IAgentModelInfo[], situation?: IModelRouterSituation) => engine.resolve({ chat: 'chat-1', modelId: 'model-router:daily', file: routerFile(), text: 'fix this', models: available, previousTurns: [], picker, situation });
		await route(priced, { attachments: [{ kind: 'image', count: 1 }], mode: 'plan' });
		await route(models, {});
		assert.deepStrictEqual(picker.requests.map(request => ({ situation: request.situation, facts: request.candidates.map(candidate => candidate.facts) })), [
			{ situation: ['Attached: 1 image', 'Plan mode: the agent plans first and carries the plan out when the user is ready'], facts: ['low cost', 'high cost'] },
			{ situation: undefined, facts: [undefined, undefined] },
		]);
	});

	test('routes a message that is only an attachment or a "continue" with one, and not one with nothing in it', async () => {
		const picker = new FakePicker({ model: 'opus', confidence: 0.9, probabilities: { opus: 0.9, haiku: 0.1 } });
		const route = (previousTurns: Turn[], situation: IModelRouterSituation, text = ' ') => engine.resolve({ chat: 'chat-1', modelId: 'model-router:daily', file: routerFile('switching: auto\n'), text, models, previousTurns, picker, situation });
		const image: IModelRouterSituation = { attachments: [{ kind: 'image', count: 1 }] };
		const onHaiku = () => [routedTurn({ router: 'daily', chosenModel: 'haiku' })];
		const first = await route([], image);
		const followUp = await route(onHaiku(), image);
		const continueWithImage = await route(onHaiku(), image, 'continue');
		const nothing = await route([], { mode: 'plan' });
		const nothingLater = await route(onHaiku(), {});
		const continueAlone = await route(onHaiku(), { mode: 'plan' }, 'continue');
		assert.deepStrictEqual({
			asked: picker.requests.length,
			first: first.routed?.chosenModel,
			followUp: followUp.routed?.chosenModel,
			continueWithImage: continueWithImage.routed?.chosenModel,
			nothing: nothing.routed,
			nothingLater: nothingLater.routed?.kept,
			continueAlone: continueAlone.routed?.kept,
		}, {
			asked: 3,
			first: 'opus',
			followUp: 'opus',
			continueWithImage: 'opus',
			nothing: { router: 'daily', chosenModel: 'haiku', defaulted: true },
			nothingLater: true,
			continueAlone: true,
		});
	});

	test('picks a named route by name, even when two run on the same model, and keeps it for the chat', async () => {
		const content = 'version: 1\ndescription: Test.\neffort: off\nroutes:\n  - name: feature\n    model: opus\n    when: Building.\n  - name: bug-fix\n    model: opus\n    when: Fixing.\n';
		const file: IModelRouterFile = { ...routerFile(), router: parseModelRouter(content, 'daily.model-router.yaml').router };
		const picker = new FakePicker({ model: 'bug-fix', confidence: 0.9, probabilities: { 'bug-fix': 0.9, feature: 0.1 } });
		const route = (previousTurns: Turn[]) => engine.resolve({ chat: 'chat-1', modelId: 'model-router:daily', file, text: 'fix the crash', models, previousTurns, picker });
		const picked = await route([]);
		const kept = await route([routedTurn({ router: 'daily', chosenModel: 'opus', routeName: 'bug-fix' })]);
		// A chat routed while named routes were written as playbooks saved the name as `playbook`.
		const keptFromPlaybook = await route([routedTurn({ router: 'daily', chosenModel: 'opus', playbook: 'bug-fix' } as IModelRoutedInfo)]);
		assert.deepStrictEqual({ candidates: picker.requests[0].candidates.map(candidate => candidate.id), picked: picked.routed, kept: kept.routed, keptFromPlaybook: keptFromPlaybook.routed, picks: picker.requests.length }, {
			candidates: ['feature', 'bug-fix'],
			picked: { router: 'daily', chosenModel: 'opus', routeName: 'bug-fix', preference: 'Fixing.', firstTurnOnly: true },
			kept: { router: 'daily', chosenModel: 'opus', routeName: 'bug-fix', kept: true, firstTurnOnly: true },
			keptFromPlaybook: { router: 'daily', chosenModel: 'opus', routeName: 'bug-fix', kept: true, firstTurnOnly: true },
			picks: 1,
		});
	});

	test('with switching auto, a chat moves between named routes that run on the same model', async () => {
		const content = 'version: 1\ndescription: Test.\neffort: off\nswitching: auto\nroutes:\n  - name: feature\n    model: opus\n    when: Building.\n  - name: bug-fix\n    model: opus\n    when: Fixing.\n';
		const file: IModelRouterFile = { ...routerFile(), router: parseModelRouter(content, 'daily.model-router.yaml').router };
		const picker = new FakePicker({ model: 'bug-fix', confidence: 0.9, probabilities: { 'bug-fix': 0.9, feature: 0.1 } });
		const moved = await engine.resolve({ chat: 'chat-1', modelId: 'model-router:daily', file, text: 'fix the crash', models, previousTurns: [routedTurn({ router: 'daily', chosenModel: 'opus', routeName: 'feature' })], picker });
		assert.deepStrictEqual({ routed: moved.routed, notices: moved.notices }, {
			routed: { router: 'daily', chosenModel: 'opus', routeName: 'bug-fix', switchedFrom: 'opus', preference: 'Fixing.' },
			notices: ['This request fits another route, so the model router daily moved this chat to its bug-fix route on OPUS.'],
		});
	});

	test('a kept named route whose model has changed keeps an effort that model has', async () => {
		const content = 'version: 1\ndescription: Test.\nroutes:\n  - name: feature\n    model: [big, haiku]\n    when: Building.\n    guidance: Plan first.\n';
		const file: IModelRouterFile = { ...routerFile(), router: parseModelRouter(content, 'daily.model-router.yaml').router };
		// The chat's first turn ran on `big` at an effort only that model has.
		const previousTurns = [routedTurn({ router: 'daily', chosenModel: 'big', routeName: 'feature', effort: 'xhigh' })];
		const selectionWith = async (available: IAgentModelInfo[]) => (await engine.resolve({ chat: 'chat-1', modelId: 'model-router:daily', file, text: 'go on', models: available, previousTurns, picker: undefined })).selection;
		assert.deepStrictEqual({
			sameModel: await selectionWith([model('big', ['low', 'high', 'xhigh']), ...models]),
			otherModel: await selectionWith(models),
			modelWithoutEfforts: await selectionWith([model('haiku')]),
		}, {
			sameModel: { id: 'big', config: { [ReasoningEffortConfigKey]: 'xhigh' } },
			otherModel: { id: 'haiku', config: { [ReasoningEffortConfigKey]: 'high' } },
			modelWithoutEfforts: { id: 'haiku' },
		});
	});
});
