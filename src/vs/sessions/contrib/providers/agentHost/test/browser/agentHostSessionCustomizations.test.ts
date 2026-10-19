/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { McpServerStatus } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { CustomizationType, ResponsePartKind, ToolCallContributorKind, ToolCallStatus, type Customization, type ResponsePart } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { SessionCustomizationKind } from '../../../../../services/sessions/common/session.js';
import { autorun, observableValue } from '../../../../../../base/common/observable.js';
import { TestCustomizationJobScheduler } from '../../../../../../workbench/contrib/chat/test/common/testCustomizationJobScheduler.js';
import { createIncrementalChatCustomizationRefsParser, createProgressiveChatCustomizations, CustomizationIndex, type ICustomizationRefChatState, CustomizationRefKind, parseTurnCustomizationRefs, resolveChatCustomizations } from '../../../../../../workbench/contrib/chat/common/agentHostSessionCustomizations.js';

suite('Agent Host Session Customizations', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const root = URI.file('/repo');

	class CountingCustomizationIndex extends CustomizationIndex {
		pathResolutionCount = 0;

		protected override _resolvePathUncached(token: string) {
			this.pathResolutionCount++;
			return super._resolvePathUncached(token);
		}
	}

	function toolCall(toolName: string, toolInput: string, contributor?: { customizationId: string }): ResponsePart {
		return {
			kind: ResponsePartKind.ToolCall,
			toolCall: {
				status: ToolCallStatus.Completed,
				toolCallId: `${toolName}-${toolInput}`,
				toolName,
				displayName: toolName,
				invocationMessage: toolName,
				pastTenseMessage: toolName,
				success: true,
				toolInput,
				...(contributor ? { contributor: { kind: ToolCallContributorKind.MCP, customizationId: contributor.customizationId } } : {}),
			},
		} as ResponsePart;
	}

	const customizations: readonly Customization[] = [{
		id: 'dir-1',
		type: CustomizationType.Directory,
		uri: URI.file('/repo/.github/skills').toString(),
		name: 'Skills',
		enabled: true,
		contents: CustomizationType.Skill,
		writable: true,
		children: [
			{ id: 'skill-1', type: CustomizationType.Skill, uri: URI.file('/repo/.github/skills/sessions/SKILL.md').toString(), name: 'sessions' },
			{ id: 'rule-1', type: CustomizationType.Rule, uri: URI.file('/repo/.github/instructions/tests.instructions.md').toString(), name: 'writing-tests' },
			{ id: 'hook-1', type: CustomizationType.Hook, uri: URI.file('/repo/.github/hooks/pre.md').toString(), name: 'pre-commit' },
			{ id: 'mcp-1', type: CustomizationType.McpServer, uri: URI.file('/repo/.vscode/mcp.json').toString(), name: 'playwright', state: { kind: McpServerStatus.Ready } },
		],
	}];

	const index = new CustomizationIndex(customizations, [root]);

	function resolve(parts: ResponsePart[]): readonly { id: string; kind: SessionCustomizationKind }[] {
		return resolveChatCustomizations(parseTurnCustomizationRefs(parts), index)
			.map(customization => ({ id: customization.id, kind: customization.kind }));
	}

	test('resolves reads, skill invocations and MCP tool calls, in first-appearance order', () => {
		assert.deepStrictEqual(resolve([
			toolCall('view', '{"path":"/repo/.github/instructions/tests.instructions.md"}'),
			toolCall('playwright_click', '{"selector":"a"}', { customizationId: 'mcp-1' }),
			toolCall('Skill', '{"skill":"sessions"}'),
			toolCall('view', '{"path":".github/hooks/pre.md"}'),
		]), [
			{ id: 'rule-1', kind: SessionCustomizationKind.Instruction },
			{ id: 'mcp-1', kind: SessionCustomizationKind.McpServer },
			{ id: 'skill-1', kind: SessionCustomizationKind.Skill },
			{ id: 'hook-1', kind: SessionCustomizationKind.Hook },
		]);
	});

	test('maps an opaque customization URI from a remote host', () => {
		const id = 'mcp-top-level:copilotcli:session-1:github';
		const index = new CustomizationIndex([{
			id,
			type: CustomizationType.McpServer,
			uri: id,
			name: 'github',
			state: { kind: McpServerStatus.Stopped },
		}], [], uri => toAgentHostUri(uri, 'remote-host'));

		assert.deepStrictEqual(index.resolve({ kind: CustomizationRefKind.Mcp, value: id }), {
			id,
			kind: SessionCustomizationKind.McpServer,
			name: 'github',
			uri: toAgentHostUri(URI.parse(id), 'remote-host'),
		});
	});

	test('de-duplicates a customization reached through different references', () => {
		assert.deepStrictEqual(resolve([
			toolCall('Skill', '{"skill":"sessions"}'),
			toolCall('view', '{"path":"/repo/.github/skills/sessions/SKILL.md"}'),
			// A sibling file inside the skill folder still counts as that skill.
			toolCall('view', '{"path":"/repo/.github/skills/sessions/reference.md"}'),
		]), [{ id: 'skill-1', kind: SessionCustomizationKind.Skill }]);
	});

	test('matches Windows drive paths, escaped separators and file URIs', () => {
		assert.deepStrictEqual(resolve([
			toolCall('read', '{"file_path":"\\\\repo\\\\.github\\\\instructions\\\\tests.instructions.md"}'),
			toolCall('read', `{"uri":"${URI.file('/repo/.github/hooks/pre.md').toString()}"}`),
		]), [
			{ id: 'rule-1', kind: SessionCustomizationKind.Instruction },
			{ id: 'hook-1', kind: SessionCustomizationKind.Hook },
		]);
	});

	test('matches a Windows absolute path, whose drive prefix must stay attached', () => {
		const windowsIndex = new CustomizationIndex([
			{
				id: 'dir-1', type: CustomizationType.Directory, uri: URI.file('C:\\repo\\.github\\skills').toString(), name: 'Skills',
				enabled: true, contents: CustomizationType.Skill, writable: true,
				children: [{ id: 'skill-1', type: CustomizationType.Skill, uri: URI.file('C:\\repo\\.github\\skills\\sessions\\SKILL.md').toString(), name: 'sessions' }],
			},
		] as unknown as readonly Customization[]);

		assert.strictEqual(
			windowsIndex.resolve({ kind: CustomizationRefKind.Path, value: 'C:\\repo\\.github\\skills\\sessions\\SKILL.md' })?.id,
			'skill-1',
		);
	});

	test('ignores unrelated paths and streaming tool calls', () => {
		const streaming = {
			kind: ResponsePartKind.ToolCall,
			toolCall: { status: ToolCallStatus.Streaming, toolCallId: 'x', toolName: 'view', displayName: 'view', toolInput: '{"path":"/repo/.github/hooks/pre.md"}' },
		} as ResponsePart;

		assert.deepStrictEqual(resolve([
			toolCall('view', '{"path":"/repo/src/main.ts"}'),
			toolCall('bash', 'npm run compile'),
			streaming,
		]), []);
	});

	test('does not repeat stable path resolution work during incremental replay', () => {
		const countingIndex = new CountingCustomizationIndex(customizations, [root]);
		const refs = [
			{ kind: CustomizationRefKind.Path, value: '/repo/.github/hooks/pre.md' },
			{ kind: CustomizationRefKind.Path, value: '/repo/src/main.ts' },
		] as const;

		const resolved = [
			resolveChatCustomizations(refs.slice(0, 1), countingIndex),
			resolveChatCustomizations(refs, countingIndex),
			resolveChatCustomizations(refs, countingIndex),
		].map(customizations => customizations.map(customization => customization.id));

		assert.deepStrictEqual({
			pathResolutionCount: countingIndex.pathResolutionCount,
			resolved,
		}, {
			pathResolutionCount: 2,
			resolved: [['hook-1'], ['hook-1'], ['hook-1']],
		});
	});

	test('scopes cached misses to the customization index lifetime', () => {
		const ref = { kind: CustomizationRefKind.Path, value: '.github/hooks/pre.md' } as const;
		const oldRootIndex = new CountingCustomizationIndex(customizations, [URI.file('/other')]);
		const updatedRootIndex = new CountingCustomizationIndex(customizations, [root]);

		assert.deepStrictEqual({
			resolved: [
				oldRootIndex.resolve(ref)?.id,
				oldRootIndex.resolve(ref)?.id,
				updatedRootIndex.resolve(ref)?.id,
				updatedRootIndex.resolve(ref)?.id,
			],
			oldRootResolutionCount: oldRootIndex.pathResolutionCount,
			updatedRootResolutionCount: updatedRootIndex.pathResolutionCount,
		}, {
			resolved: [undefined, undefined, 'hook-1', 'hook-1'],
			oldRootResolutionCount: 1,
			updatedRootResolutionCount: 1,
		});
	});

	test('reuses unaffected path resolutions when customization paths change', () => {
		const stableRef = { kind: CustomizationRefKind.Path, value: '.github/hooks/pre.md' } as const;
		const addedRef = { kind: CustomizationRefKind.Path, value: '.github/hooks/post.md' } as const;
		const initial = new CountingCustomizationIndex(customizations, [root]);
		initial.resolve(stableRef);
		initial.resolve(addedRef);
		const updatedCustomizations: readonly Customization[] = customizations.map(customization => customization.type === CustomizationType.Directory
			? {
				...customization,
				children: [
					...(customization.children ?? []),
					{ id: 'hook-2', type: CustomizationType.Hook, uri: URI.file('/repo/.github/hooks/post.md').toString(), name: 'post-commit' },
				],
			}
			: customization);
		const updated = new CountingCustomizationIndex(updatedCustomizations, [root], undefined, initial);

		assert.deepStrictEqual({
			stable: updated.resolve(stableRef)?.id,
			added: updated.resolve(addedRef)?.id,
			initialPathResolutionCount: initial.pathResolutionCount,
			updatedPathResolutionCount: updated.pathResolutionCount,
		}, {
			stable: 'hook-1',
			added: 'hook-2',
			initialPathResolutionCount: 2,
			updatedPathResolutionCount: 1,
		});
	});

	test('invalidates a cached miss when a matching skill container is added', () => {
		const ref = { kind: CustomizationRefKind.Path, value: '.github/skills/new/reference.md' } as const;
		const initial = new CountingCustomizationIndex(customizations, [root]);
		const initialResult = initial.resolve(ref)?.id;
		const updatedCustomizations: readonly Customization[] = customizations.map(customization => customization.type === CustomizationType.Directory
			? {
				...customization,
				children: [
					...(customization.children ?? []),
					{ id: 'skill-2', type: CustomizationType.Skill, uri: URI.file('/repo/.github/skills/new/SKILL.md').toString(), name: 'new' },
				],
			}
			: customization);
		const updated = new CountingCustomizationIndex(updatedCustomizations, [root], undefined, initial);

		assert.deepStrictEqual({
			initialResult,
			updatedResult: updated.resolve(ref)?.id,
			initialPathResolutionCount: initial.pathResolutionCount,
			updatedPathResolutionCount: updated.pathResolutionCount,
		}, {
			initialResult: undefined,
			updatedResult: 'skill-2',
			initialPathResolutionCount: 1,
			updatedPathResolutionCount: 1,
		});
	});

	test('invalidates a cached hit when its customization is removed', () => {
		const ref = { kind: CustomizationRefKind.Path, value: '.github/hooks/pre.md' } as const;
		const initial = new CountingCustomizationIndex(customizations, [root]);
		const initialResult = initial.resolve(ref)?.id;
		const updatedCustomizations: readonly Customization[] = customizations.map(customization => customization.type === CustomizationType.Directory
			? {
				...customization,
				children: customization.children?.filter(child => child.id !== 'hook-1'),
			}
			: customization);
		const updated = new CountingCustomizationIndex(updatedCustomizations, [root], undefined, initial);

		assert.deepStrictEqual({
			initialResult,
			updatedResult: updated.resolve(ref)?.id,
			initialPathResolutionCount: initial.pathResolutionCount,
			updatedPathResolutionCount: updated.pathResolutionCount,
		}, {
			initialResult: 'hook-1',
			updatedResult: undefined,
			initialPathResolutionCount: 1,
			updatedPathResolutionCount: 1,
		});
	});

	test('parses each completed turn once and re-parses only the active turn', () => {
		const parsed: string[] = [];
		const parse = createIncrementalChatCustomizationRefsParser(parts => {
			parsed.push((parts[0] as { toolCall: { toolCallId: string } }).toolCall.toolCallId);
			return parseTurnCustomizationRefs(parts);
		});

		const turnOne = { id: 't1', responseParts: [toolCall('view', '{"path":"/repo/.github/hooks/pre.md"}')] };
		const turnTwo = { id: 't2', responseParts: [toolCall('Skill', '{"skill":"sessions"}')] };
		parse({ turns: [turnOne], activeTurn: turnTwo });
		parse({ turns: [turnOne], activeTurn: turnTwo });
		const final = parse({ turns: [turnOne, turnTwo] });

		assert.deepStrictEqual({
			parsed,
			refs: final.map(ref => ref.value),
		}, {
			// t1 parsed once and cached; the active t2 re-parsed per delta, then
			// parsed once more when it completes.
			parsed: ['view-{"path":"/repo/.github/hooks/pre.md"}', 'Skill-{"skill":"sessions"}', 'Skill-{"skill":"sessions"}', 'Skill-{"skill":"sessions"}'],
			refs: ['/repo/.github/hooks/pre.md', 'sessions'],
		});
	});

	test('a plugin folder under a dotted ancestor does not claim its siblings', () => {
		const pluginIndex = new CustomizationIndex([
			{ id: 'plugin-1', type: CustomizationType.Plugin, uri: URI.file('/home/.agents/plugins/foo').toString(), name: 'foo' },
		] as unknown as readonly Customization[]);

		assert.deepStrictEqual({
			inside: pluginIndex.resolve({ kind: CustomizationRefKind.Path, value: '/home/.agents/plugins/foo/skills/a/SKILL.md' })?.id,
			sibling: pluginIndex.resolve({ kind: CustomizationRefKind.Path, value: '/home/.agents/plugins/bar/SKILL.md' })?.id,
		}, {
			inside: 'plugin-1',
			sibling: undefined,
		});
	});

	test('a versioned plugin root does not claim its sibling roots', () => {
		const pluginIndex = new CustomizationIndex([
			{ id: 'plugin-1', type: CustomizationType.Plugin, uri: URI.file('/home/.agents/plugins/foo/1.2.0').toString(), name: 'foo' },
		] as unknown as readonly Customization[]);

		assert.deepStrictEqual({
			inside: pluginIndex.resolve({ kind: CustomizationRefKind.Path, value: '/home/.agents/plugins/foo/1.2.0/skills/a/SKILL.md' })?.id,
			sibling: pluginIndex.resolve({ kind: CustomizationRefKind.Path, value: '/home/.agents/plugins/bar/1.0.0/SKILL.md' })?.id,
		}, {
			inside: 'plugin-1',
			sibling: undefined,
		});
	});

	test('an empty customization tree resolves nothing', () => {
		assert.deepStrictEqual(
			resolveChatCustomizations(parseTurnCustomizationRefs([toolCall('Skill', '{"skill":"sessions"}')]), new CustomizationIndex(undefined)),
			[],
		);
	});
});

suite('Progressive Chat Customizations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const root = URI.file('/repo');
	const customizations: readonly Customization[] = [{
		id: 'dir-1',
		type: CustomizationType.Directory,
		uri: URI.file('/repo/.github/hooks').toString(),
		name: 'Hooks',
		enabled: true,
		contents: CustomizationType.Hook,
		writable: true,
		children: [
			{ id: 'hook-a', type: CustomizationType.Hook, uri: URI.file('/repo/.github/hooks/a.md').toString(), name: 'a' },
			{ id: 'hook-b', type: CustomizationType.Hook, uri: URI.file('/repo/.github/hooks/b.md').toString(), name: 'b' },
		],
	}];

	class CountingCustomizationIndex extends CustomizationIndex {
		static resolutions = 0;
		protected override _resolvePathUncached(token: string) {
			CountingCustomizationIndex.resolutions++;
			return super._resolvePathUncached(token);
		}
	}

	function readTool(path: string): ResponsePart {
		return {
			kind: ResponsePartKind.ToolCall,
			toolCall: {
				status: ToolCallStatus.Completed,
				toolCallId: path,
				toolName: 'view',
				displayName: 'View',
				invocationMessage: 'View',
				pastTenseMessage: 'View',
				success: true,
				toolInput: JSON.stringify({ path }),
			},
		} as ResponsePart;
	}

	function createTurns(count: number, prefix = 'turn'): { id: string; responseParts: ResponsePart[] }[] {
		return Array.from({ length: count }, (_, i) => ({
			id: `${prefix}-${i}`,
			responseParts: [readTool(`/repo/src/file${i}.ts`), ...(i === count - 2 ? [readTool('.github/hooks/a.md')] : []), ...(i === count - 1 ? [readTool('.github/hooks/b.md')] : [])],
		}));
	}

	let parsedTurns = 0;

	function setup(turns: ICustomizationRefChatState['turns'], options: { msPerTick?: number; sliceBudgetMs?: number; activeTurn?: ICustomizationRefChatState['activeTurn'] } = {}) {
		CountingCustomizationIndex.resolutions = 0;
		parsedTurns = 0;
		const scheduler = new TestCustomizationJobScheduler(options.msPerTick);
		const chatState = observableValue<ICustomizationRefChatState | undefined>('chat', { turns, activeTurn: options.activeTurn });
		const index = observableValue('index', new CountingCustomizationIndex(customizations, [root]));
		const scope = observableValue<string>('scope', 'a');
		const result = createProgressiveChatCustomizations(undefined, chatState, index, {
			scheduler, scope, sliceBudgetMs: options.sliceBudgetMs,
			parseTurn: parts => { parsedTurns++; if (JSON.stringify(parts).includes('boom')) { throw new Error('boom'); } return parseTurnCustomizationRefs(parts); },
		});
		const observed: string[][] = [];
		const observer = new DisposableStore();
		store.add(observer);
		observer.add(autorun(reader => { observed.push(result.read(reader).map(c => c.id)); }));
		return { scheduler, chatState, index, scope, result, observed, observer };
	}

	test('selecting a chat does not resolve its transcript synchronously', () => {
		const { scheduler, observed } = setup(createTurns(200));

		assert.deepStrictEqual({ resolutions: CountingCustomizationIndex.resolutions, observed, pending: scheduler.pendingCount }, {
			resolutions: 0,
			observed: [[]],
			pending: 1,
		});
	});

	test('converges to the same customizations as resolving everything at once', () => {
		const turns = createTurns(50);
		const activeTurn = { responseParts: [readTool('.github/hooks/b.md'), readTool('/repo/.github/hooks/a.md')] };
		const { scheduler, result, observed } = setup(turns, { activeTurn });
		scheduler.flush();

		const expected = resolveChatCustomizations(
			createIncrementalChatCustomizationRefsParser()({ turns, activeTurn }),
			new CustomizationIndex(customizations, [root]),
		).map(c => c.id);
		assert.deepStrictEqual({ final: observed[observed.length - 1], expected, again: result.get().map(c => c.id) }, {
			final: ['hook-a', 'hook-b'],
			expected: ['hook-a', 'hook-b'],
			again: ['hook-a', 'hook-b'],
		});
	});

	test('slices are bounded by the budget and results only grow in order', () => {
		const { scheduler, observed } = setup(createTurns(100), { msPerTick: 1, sliceBudgetMs: 5 });
		const resolutionsPerSlice: number[] = [];
		let before = 0;
		while (scheduler.runNext()) {
			resolutionsPerSlice.push(parsedTurns - before);
			before = parsedTurns;
		}

		assert.deepStrictEqual({
			maxPerSlice: Math.max(...resolutionsPerSlice),
			sliceCount: resolutionsPerSlice.length > 10,
			total: parsedTurns,
			observed,
		}, {
			maxPerSlice: 5,
			sliceCount: true,
			total: 100,
			observed: [[], ['hook-a', 'hook-b']],
		});
	});

	test('completed turns are not resolved again when the active turn streams', () => {
		const turns = createTurns(30);
		const { scheduler, chatState, observed } = setup(turns);
		scheduler.flush();
		const settled = CountingCustomizationIndex.resolutions;

		chatState.set({ turns, activeTurn: { responseParts: [readTool('/repo/src/other.ts')] } }, undefined);
		chatState.set({ turns, activeTurn: { responseParts: [readTool('/repo/src/other.ts'), readTool('.github/hooks/b.md')] } }, undefined);

		assert.deepStrictEqual({ extraResolutions: CountingCustomizationIndex.resolutions - settled, pending: scheduler.pendingCount, last: observed[observed.length - 1] }, {
			extraResolutions: 1,
			pending: 0,
			last: ['hook-a', 'hook-b'],
		});
	});

	test('a completed active turn never drops its customizations at any read', () => {
		const earlier = { id: 't0', responseParts: [readTool('/repo/src/x.ts')] };
		const hookParts = [readTool('.github/hooks/b.md')];
		const { scheduler, chatState, observed } = setup([earlier]);
		scheduler.flush();
		chatState.set({ turns: [earlier], activeTurn: { id: 't1', responseParts: hookParts } }, undefined);
		const streamed = observed.length;

		chatState.set({ turns: [earlier, { id: 't1', responseParts: hookParts }] }, undefined);
		scheduler.flush();

		assert.deepStrictEqual({ reads: observed.slice(streamed - 1).map(ids => ids.join()), final: observed[observed.length - 1] }, {
			reads: ['hook-b'],
			final: ['hook-b'],
		});
	});

	test('a turn completing as the next one starts keeps its customizations at every read', () => {
		const earlier = { id: 't0', responseParts: [readTool('/repo/src/x.ts')] };
		const hookParts = [readTool('.github/hooks/b.md')];
		const { scheduler, chatState, observed } = setup([earlier]);
		scheduler.flush();
		chatState.set({ turns: [earlier], activeTurn: { id: 't1', responseParts: hookParts } }, undefined);
		const streamed = observed.length;

		chatState.set({ turns: [earlier, { id: 't1', responseParts: hookParts }], activeTurn: { id: 't2', responseParts: [readTool('/repo/src/y.ts')] } }, undefined);
		scheduler.flush();

		assert.deepStrictEqual({ reads: observed.slice(streamed - 1).map(ids => ids.join()), final: observed[observed.length - 1] }, {
			reads: ['hook-b'],
			final: ['hook-b'],
		});
	});

	for (const withNewActiveTurn of [false, true]) {
		test(`a turn completing before older history resolves keeps its customizations${withNewActiveTurn ? ' while a new turn starts' : ''}`, () => {
			const older = Array.from({ length: 20 }, (_, i) => ({ id: `old-${i}`, responseParts: [readTool(`/repo/src/file${i}.ts`)] }));
			const hookParts = [readTool('.github/hooks/b.md')];
			const newActive = { id: 'next', responseParts: [readTool('.github/hooks/a.md')] };
			const { scheduler, chatState, observed, result } = setup(older, { activeTurn: { id: 'done', responseParts: hookParts } });
			const completed = [...older, { id: 'done', responseParts: hookParts }];

			chatState.set({ turns: completed, activeTurn: withNewActiveTurn ? newActive : undefined }, undefined);
			const afterCompletion = result.get().map(c => c.id);
			scheduler.flush();

			const expected = resolveChatCustomizations(
				createIncrementalChatCustomizationRefsParser()({ turns: completed, activeTurn: withNewActiveTurn ? newActive : undefined }),
				new CustomizationIndex(customizations, [root]),
			).map(c => c.id);
			assert.deepStrictEqual({ reads: [...new Set(observed.map(ids => ids.join()))], afterCompletion, final: result.get().map(c => c.id), expected }, {
				reads: withNewActiveTurn ? ['hook-b', 'hook-b,hook-a'] : ['hook-b'],
				afterCompletion: withNewActiveTurn ? ['hook-b', 'hook-a'] : ['hook-b'],
				final: expected,
				expected: withNewActiveTurn ? ['hook-b', 'hook-a'] : ['hook-b'],
			});
		});
	}

	test('the active turn is shown while earlier turns are still being resolved', () => {
		const { observed } = setup(createTurns(20), { activeTurn: { id: 'active', responseParts: [readTool('.github/hooks/a.md')] } });

		assert.deepStrictEqual(observed, [['hook-a']]);
	});

	test('each distinct path is resolved once across turns, index rebuilds and slices, with bounded updates', () => {
		const turns = Array.from({ length: 300 }, (_, i) => ({
			id: `t${i}`,
			responseParts: [readTool(`/repo/src/shared${i % 10}.ts`), readTool(`/repo/src/unique${i}.ts`), ...(i === 299 ? [readTool('.github/hooks/a.md')] : [])],
		}));
		const { scheduler, index, observed } = setup(turns, { msPerTick: 1, sliceBudgetMs: 5 });
		for (let i = 0; i < 4; i++) {
			scheduler.runNext();
		}
		// Rebuilt twice before the slices have revisited the turns that were already resolved.
		index.set(new CountingCustomizationIndex(customizations, [root], undefined, index.get()), undefined);
		scheduler.runNext();
		index.set(new CountingCustomizationIndex(customizations, [root], undefined, index.get()), undefined);
		scheduler.flush();

		assert.deepStrictEqual({ resolutions: CountingCustomizationIndex.resolutions, updates: observed.length, final: observed[observed.length - 1] }, {
			resolutions: 300 + 10 + 1,
			updates: 2,
			final: ['hook-a'],
		});
	});

	test('a failing turn is skipped and the remaining turns still resolve', () => {
		const previous = errorHandler.getUnexpectedErrorHandler();
		const errors: unknown[] = [];
		setUnexpectedErrorHandler(error => errors.push(error));
		store.add(toDisposable(() => setUnexpectedErrorHandler(previous)));
		const turns = [
			{ id: 'a', responseParts: [readTool('.github/hooks/a.md')] },
			{ id: 'bad', responseParts: [readTool('/repo/boom')] },
			{ id: 'b', responseParts: [readTool('.github/hooks/b.md')] },
		];
		const { scheduler, observed } = setup(turns);
		scheduler.flush();

		assert.deepStrictEqual({ final: observed[observed.length - 1], errors: errors.length, pending: scheduler.pendingCount }, {
			final: ['hook-a', 'hook-b'],
			errors: 1,
			pending: 0,
		});
	});

	test('a slice is limited by the idle deadline but always makes progress', () => {
		const { scheduler } = setup(createTurns(10), { msPerTick: 1, sliceBudgetMs: 8 });
		scheduler.timeRemainingMs = 2;
		const perSlice: number[] = [];
		let before = 0;
		while (scheduler.runNext()) {
			perSlice.push(parsedTurns - before);
			before = parsedTurns;
		}

		assert.deepStrictEqual({ max: Math.max(...perSlice), total: parsedTurns }, { max: 2, total: 10 });
	});

	test('a timed-out idle callback still gets the full slice budget', () => {
		const { scheduler } = setup(createTurns(20), { msPerTick: 1, sliceBudgetMs: 8 });
		scheduler.didTimeout = true;
		scheduler.timeRemainingMs = 0;
		scheduler.runNext();

		assert.strictEqual(parsedTurns, 8);
	});

	test('a changed index keeps the previous result until turns are re-resolved', () => {
		const { scheduler, index, observed } = setup(createTurns(20));
		scheduler.flush();

		index.set(new CountingCustomizationIndex(customizations.map(c => ({ ...c, children: (c as { children: Customization[] }).children.filter(child => child.id !== 'hook-b') })) as unknown as Customization[], [root]), undefined);
		const duringRebuild = observed[observed.length - 1];
		scheduler.flush();

		assert.deepStrictEqual({ duringRebuild, final: observed[observed.length - 1] }, {
			duringRebuild: ['hook-a', 'hook-b'],
			final: ['hook-a'],
		});
	});

	test('switching away mid-job cancels the work and a new chat shows no stale results', () => {
		const { scheduler, chatState, scope, observer, result, observed } = setup(createTurns(100), { msPerTick: 1, sliceBudgetMs: 5 });
		scheduler.runNext();
		const partialResolutions = CountingCustomizationIndex.resolutions;

		chatState.set({ turns: createTurns(3, 'other') }, undefined);
		scope.set('b', undefined);
		scheduler.flush();
		const afterSwitch = observed[observed.length - 1];
		observer.clear();

		assert.deepStrictEqual({
			partialResolutions,
			afterSwitch,
			pendingAfterDispose: scheduler.pendingCount,
			resolutionsAfterFlush: CountingCustomizationIndex.resolutions,
			unobservedWork: (() => { scheduler.flush(); return CountingCustomizationIndex.resolutions; })(),
			resultAfterUnobserve: result.get().length,
		}, {
			partialResolutions: 5,
			afterSwitch: ['hook-a', 'hook-b'],
			pendingAfterDispose: 0,
			resolutionsAfterFlush: 7,
			unobservedWork: 7,
			resultAfterUnobserve: 2,
		});
	});

	test('prefilter keeps the path token results of the pattern-only parser', () => {
		const pattern = /[\w.~@$():[\]+-]*(?:[/\\]+[\w.~@$():[\]+-]+)+/g;
		const inputs = ['{}', '{"command":"ls"}', 'plain text without separators', '{"path":"a/b.ts"}', '{"p":"C:\\\\Users\\\\me\\\\x.md"}', '/', '\\', 'a b / c', ''];
		const actual = inputs.map(input => parseTurnCustomizationRefs([toolCall('view', input)]).map(ref => ref.value));
		const expected = inputs.map(input => [...new Set([...input.matchAll(pattern)].map(match => match[0]))]);

		assert.deepStrictEqual(actual, expected);
	});

	function toolCall(toolName: string, toolInput: string): ResponsePart {
		return {
			kind: ResponsePartKind.ToolCall,
			toolCall: { status: ToolCallStatus.Completed, toolCallId: toolInput, toolName, displayName: toolName, invocationMessage: toolName, pastTenseMessage: toolName, success: true, toolInput },
		} as ResponsePart;
	}
});
