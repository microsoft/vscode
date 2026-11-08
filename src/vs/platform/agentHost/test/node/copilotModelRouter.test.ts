/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import { ModelRouterDiagnosticSeverity, parseModelRouter } from '../../common/modelRouter.js';
import { ReasoningEffortConfigKey } from '../../common/reasoningEffort.js';
import { MessageKind, TurnState, type IModelRoutedInfo, type Turn } from '../../common/state/sessionState.js';
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
			routed: { router: 'daily', chosenModel: 'haiku', defaulted: true },
			notices: ['The model router daily used HAIKU, its first model, because routing was unavailable.'],
		});
	});

	test('a confident pick chooses its route and effort', async () => {
		const picker = new FakePicker({ model: 'opus', confidence: 0.9, probabilities: { opus: 0.9, haiku: 0.1 }, effortScore: 2 });
		const result = await resolve({ file: routerFile(), picker });
		assert.deepStrictEqual({ result, askEffort: picker.requests[0].askEffort, candidates: picker.requests[0].candidates.map(c => c.when) }, {
			result: { selection: { id: 'opus', config: { [ReasoningEffortConfigKey]: 'high' } }, routed: { router: 'daily', chosenModel: 'opus', preference: 'Planning.', effort: 'high' }, notices: [] },
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
		assert.deepStrictEqual(results.map(r => [r.selection?.id, r.routed?.kept]), [['opus', true], ['opus', true]]);
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
});
