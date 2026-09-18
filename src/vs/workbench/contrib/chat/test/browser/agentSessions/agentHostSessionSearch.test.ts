/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agent.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionInfo, IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentSessionSearchMatch, IAgentSessionSearchResult } from '../../../../../../platform/agentHost/common/agentHostSessionSearch.js';
import { AgentHostSessionSearchCapabilityMetaKey } from '../../../../../../platform/agentHost/common/meta/agentHostSessionSearchMeta.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { buildChatUri, SessionStatus, SESSION_META_EHCLI_ADOPTABLE_KEY, withSessionMultiRootMetadata } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { AgentHostSessionSearch, createAgentHostSessionSearchItem, getAgentHostSessionSearchWorkspace, IAgentHostSessionSearchItem, openAgentHostSessionSearchResult, SEARCH_AGENT_SESSION_CONTENT_COMMAND_ID, waitForAgentHostSessionSearchWidget } from '../../../browser/agentSessions/agentHost/agentHostSessionSearch.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatWidgetViewModelChangeEvent, IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatRequestViewModel, IChatResponseViewModel, IChatViewModel } from '../../../common/model/chatViewModel.js';
import { IEmbeddingsService } from '../../../../../services/embeddings/common/embeddingsService.js';
import { ISemanticSessionSearchOptions } from '../../../browser/agentSessions/agentHost/semanticSessionSearch.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IQuickInputButton, IQuickInputService, IQuickPick, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';

suite('AgentHostSessionSearch', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let clock: sinon.SinonFakeTimers;

	setup(() => { clock = sinon.useFakeTimers(); });
	teardown(() => { clock.restore(); sinon.restore(); });

	test('uses the existing editor sessions search button without a duplicate overflow entry', () => {
		const entries = MenuRegistry.getMenuItems(MenuId.AgentSessionsToolbar).filter(isIMenuItem)
			.filter(item => item.command.id === SEARCH_AGENT_SESSION_CONTENT_COMMAND_ID || item.command.id === 'agentSessionsViewer.find');
		assert.deepStrictEqual(entries.map(item => ({
			id: item.command.id, icon: item.command.icon, group: item.group, order: item.order, when: item.when?.serialize(),
		})), [{
			id: SEARCH_AGENT_SESSION_CONTENT_COMMAND_ID, icon: Codicon.search, group: 'navigation', order: 2, when: ChatContextKeys.enabled.serialize(),
		}]);
	});

	function metadata(id: string, provider = 'copilotcli'): IAgentSessionMetadata {
		return { session: URI.from({ scheme: provider, path: `/${id}` }), summary: id, startTime: 0, modifiedTime: 0 };
	}

	function match(session: IAgentSessionMetadata, snippet = 'saved text', chatId = 'default'): IAgentSessionSearchMatch {
		return { chat: buildChatUri(session.session, chatId), turnId: 'turn', role: 'user', snippet };
	}

	function host(overrides: Partial<IAgentConnection> = {}, supported = true, authority = 'local'): IAgentHostConnectionInfo {
		return {
			authority, name: authority, isAmbient: authority === 'local', address: undefined,
			connection: upcastPartial<IAgentConnection>({
				initializeResult: observableValue('initialize', upcastPartial<InitializeResult>({ _meta: { [AgentHostSessionSearchCapabilityMetaKey]: supported } })),
				listSessions: async () => [metadata('session')],
				searchSessionHistory: async () => ({ matches: [], hasMore: false }),
				...overrides,
			}),
		};
	}

	function workspace(folders: URI[], configuration?: URI): IWorkspace {
		return {
			id: 'workspace',
			configuration,
			folders: folders.map((uri, index) => ({ uri, index, name: uri.path, toResource: relative => URI.joinPath(uri, relative) })),
		};
	}

	test('scopes editor windows but keeps Agents and empty editor windows cross-workspace', () => {
		const opened = workspace([URI.file('/workspace')]);
		const scope = getAgentHostSessionSearchWorkspace(opened, false);
		assert.deepStrictEqual({
			editor: scope?.folders.map(folder => folder.uri.toString()),
			snapshot: scope?.folders !== opened.folders,
			agents: getAgentHostSessionSearchWorkspace(opened, true),
			empty: getAgentHostSessionSearchWorkspace(workspace([]), false),
		}, { editor: ['file:///workspace'], snapshot: true, agents: undefined, empty: undefined });
	});

	test('filters the workspace before requesting histories and includes archived sessions and secondary roots', async () => {
		const folder = URI.file('/workspace/repo');
		const sessions: IAgentSessionMetadata[] = [
			{ ...metadata('root'), workingDirectories: [folder] },
			{ ...metadata('child'), workingDirectories: [URI.joinPath(folder, 'src')], status: SessionStatus.IsArchived },
			{ ...metadata('secondary'), workingDirectories: [URI.file('/elsewhere'), folder] },
			{ ...metadata('similar-prefix'), workingDirectories: [URI.file('/workspace/repository')] },
			{ ...metadata('elsewhere'), workingDirectories: [URI.file('/elsewhere')] },
			metadata('no-workspace'),
		];
		const requested: string[] = [];
		let result = { total: 0, scanned: 0, items: 0 };
		const search = store.add(new AgentHostSessionSearch(() => [host({
			listSessions: async () => sessions,
			searchSessionHistory: async resource => {
				requested.push(resource.path);
				return { matches: [match(sessions.find(session => session.session.path === resource.path)!)], hasMore: false };
			},
		})], state => { result = { total: state.total, scanned: state.scanned, items: state.items.length }; }, new NullLogService(), () => workspace([folder])));
		search.setQuery('saved');
		await clock.tickAsync(300);
		assert.deepStrictEqual({ requested, result }, {
			requested: ['/root', '/child', '/secondary'], result: { total: 3, scanned: 3, items: 3 },
		});
	});

	test('uses the existing workspace-file identity and legacy worktree matching rules', async () => {
		const first = URI.file('/workspace/first');
		const second = URI.file('/workspace/second');
		const configuration = URI.file('/workspace/current.code-workspace');
		const sessions: IAgentSessionMetadata[] = [
			{ ...metadata('same-workspace'), workingDirectories: [URI.file('/old-root')], _meta: withSessionMultiRootMetadata(undefined, { workspaceFile: configuration.toString() }) },
			{ ...metadata('different-workspace'), workingDirectories: [first], _meta: withSessionMultiRootMetadata(undefined, { workspaceFile: URI.file('/workspace/other.code-workspace').toString() }) },
			{ ...metadata('second-root'), workingDirectories: [second] },
			{ ...metadata('legacy-worktree'), workingDirectories: [URI.file('/worktrees/branch')], project: { uri: first, displayName: 'first' }, _meta: { [SESSION_META_EHCLI_ADOPTABLE_KEY]: true } },
			{ ...metadata('unrelated-project'), project: { uri: first, displayName: 'first' } },
		];
		const requested: string[] = [];
		const search = store.add(new AgentHostSessionSearch(() => [host({
			listSessions: async () => sessions,
			searchSessionHistory: async resource => { requested.push(resource.path); return { matches: [], hasMore: false }; },
		})], () => { }, new NullLogService(), () => workspace([first, second], configuration)));
		search.setQuery('saved');
		await clock.tickAsync(300);
		assert.deepStrictEqual(requested, ['/same-workspace', '/second-root', '/legacy-worktree']);
	});

	test('respects remote workspace authorities and does not match another host by local path', async () => {
		const folder = URI.parse('vscode-remote://ssh-remote+first/workspace');
		const configuration = URI.parse('vscode-remote://ssh-remote+first/current.code-workspace');
		const requested: string[] = [];
		let unrelatedCatalogs = 0;
		const search = store.add(new AgentHostSessionSearch(() => [
			host({
				listSessions: async () => [
					{ ...metadata('matching'), workingDirectories: [folder] },
					{ ...metadata('other-authority'), workingDirectories: [folder.with({ authority: 'ssh-remote+second' })] },
					{ ...metadata('same-local-path'), workingDirectories: [URI.file('/workspace')] },
				],
				searchSessionHistory: async resource => { requested.push(resource.path); return { matches: [], hasMore: false }; },
			}),
			host({
				listSessions: async () => {
					unrelatedCatalogs++;
					return [{ ...metadata('other-host'), workingDirectories: [folder], _meta: withSessionMultiRootMetadata(undefined, { workspaceFile: configuration.toString() }) }];
				},
				searchSessionHistory: async resource => { requested.push(resource.path); return { matches: [], hasMore: false }; },
			}, true, 'another-host'),
		], () => { }, new NullLogService(), () => workspace([folder], configuration)));
		search.setQuery('saved');
		await clock.tickAsync(300);
		assert.deepStrictEqual({ requested, unrelatedCatalogs }, { requested: ['/matching'], unrelatedCatalogs: 0 });
	});

	test('can search a workspace folder provided by its matching remote agent host', async () => {
		const folder = toAgentHostUri(URI.file('/workspace'), 'remote-host');
		const requested: string[] = [];
		const search = store.add(new AgentHostSessionSearch(() => [host({
			listSessions: async () => [
				{ ...metadata('matching'), workingDirectories: [folder] },
				{ ...metadata('other-host'), workingDirectories: [toAgentHostUri(URI.file('/workspace'), 'different-host')] },
			],
			searchSessionHistory: async resource => { requested.push(resource.path); return { matches: [], hasMore: false }; },
		}, true, 'remote-host')], () => { }, new NullLogService(), () => workspace([folder])));
		search.setQuery('saved');
		await clock.tickAsync(300);
		assert.deepStrictEqual(requested, ['/matching']);
	});

	test('workspace changes discard stale results and search only the new workspace', async () => {
		const first = URI.file('/first');
		const second = URI.file('/second');
		let scope = workspace([first]);
		const catalog = new DeferredPromise<IAgentSessionMetadata[]>();
		const requested: string[] = [];
		const search = store.add(new AgentHostSessionSearch(() => [host({
			listSessions: async () => catalog.p,
			searchSessionHistory: async resource => { requested.push(resource.path); return { matches: [], hasMore: false }; },
		})], () => { }, new NullLogService(), () => scope));
		search.setQuery('saved');
		await clock.tickAsync(300);
		scope = workspace([second]);
		search.setQuery('saved');
		await clock.tickAsync(300);
		await catalog.complete([
			{ ...metadata('old'), workingDirectories: [first] },
			{ ...metadata('new'), workingDirectories: [second] },
		]);
		await clock.tickAsync(0);
		assert.deepStrictEqual(requested, ['/new']);
	});

	test('empty input performs no catalog or history requests; edits are debounced', async () => {
		const calls: string[] = [];
		const connection = host({
			listSessions: async () => { calls.push('catalog'); return [metadata('session')]; },
			searchSessionHistory: async (_session, query) => { calls.push(query); return { matches: [], hasMore: false }; },
		});
		const search = store.add(new AgentHostSessionSearch(() => [connection], () => { }, new NullLogService()));
		search.setQuery(' ');
		await clock.tickAsync(500);
		search.setQuery('""...');
		await clock.tickAsync(500);
		search.setQuery('x'.repeat(513));
		await clock.tickAsync(500);
		search.setQuery('first');
		await clock.tickAsync(200);
		search.setQuery('second');
		await clock.tickAsync(299);
		assert.deepStrictEqual(calls, []);
		await clock.tickAsync(1);
		assert.deepStrictEqual(calls, ['catalog', 'second']);
	});

	test('skips unsupported hosts and non-Copilot sessions and reports failures', async () => {
		const calls: string[] = [];
		const oldHost = host({ listSessions: async () => { throw new Error('must not enumerate'); } }, false, 'old');
		const failedHost = host({ listSessions: async () => { throw new Error('unavailable'); } }, true, 'failed');
		const supportedHost = host({
			listSessions: async () => [metadata('yes'), metadata('no', 'claude'), metadata('mock-only', 'copilot'), metadata('broken')],
			searchSessionHistory: async (session, query) => {
				calls.push(`${session.path}:${query}`);
				if (session.path === '/broken') {
					throw new Error('unavailable');
				}
				return { matches: [match(metadata('yes'))], hasMore: true };
			},
		});
		const states: { busy: boolean; scanned: number; total: number; failures: number; unavailableHosts: readonly string[]; hasMore: boolean }[] = [];
		const search = store.add(new AgentHostSessionSearch(() => [oldHost, failedHost, supportedHost], state => states.push(state), new NullLogService()));
		search.setQuery('literal');
		await clock.tickAsync(300);
		const last = states.at(-1)!;
		assert.deepStrictEqual({
			calls, busy: last.busy, scanned: last.scanned, total: last.total,
			failures: last.failures, unavailable: last.unavailableHosts, hasMore: last.hasMore,
		}, { calls: ['/yes:literal', '/broken:literal'], busy: false, scanned: 2, total: 2, failures: 2, unavailable: ['old'], hasMore: true });
	});

	test('uses local management search even when protocol extension methods are disabled', async () => {
		const calls: string[] = [];
		const session = metadata('local-session');
		const connection = host({
			listSessions: async () => { calls.push('catalog'); return [session]; },
			supportsSessionHistorySearch: async () => { calls.push('management-support'); return true; },
			searchSessionHistory: async () => {
				calls.push('management-search');
				return { matches: [match(session)], hasMore: false };
			},
		}, false);
		let result = { count: 0, unavailable: [] as readonly string[], failures: 0 };
		const search = store.add(new AgentHostSessionSearch(() => [connection], state => {
			result = { count: state.items.length, unavailable: state.unavailableHosts, failures: state.failures };
		}, new NullLogService()));
		search.setQuery('saved');
		await clock.tickAsync(300);
		assert.deepStrictEqual({ calls, result }, {
			calls: ['catalog', 'management-support', 'management-search'],
			result: { count: 1, unavailable: [], failures: 0 },
		});
	});

	for (const supported of [true, false]) {
		test(`checks the capability after a pending handshake ${supported ? 'supports' : 'rejects'} search`, async () => {
			const initializeResult = observableValue<InitializeResult | undefined>('initialize', undefined);
			const catalog = new DeferredPromise<IAgentSessionMetadata[]>();
			const calls: string[] = [];
			let unavailable: readonly string[] = [];
			const connection = host({
				initializeResult,
				listSessions: async () => {
					calls.push('catalog');
					const sessions = await catalog.p;
					initializeResult.set(upcastPartial<InitializeResult>({ _meta: { [AgentHostSessionSearchCapabilityMetaKey]: supported } }), undefined);
					return sessions;
				},
				searchSessionHistory: async session => {
					calls.push(session.scheme);
					return { matches: [], hasMore: false };
				},
			});
			const search = store.add(new AgentHostSessionSearch(() => [connection], state => { unavailable = state.unavailableHosts; }, new NullLogService()));
			search.setQuery('saved');
			await clock.tickAsync(300);
			assert.deepStrictEqual({ calls, unavailable }, { calls: ['catalog'], unavailable: [] });
			await catalog.complete([metadata('session')]);
			await clock.tickAsync(0);
			assert.deepStrictEqual({ calls, unavailable }, supported
				? { calls: ['catalog', 'copilotcli'], unavailable: [] }
				: { calls: ['catalog'], unavailable: ['local'] });
		});
	}

	test('query changes share four slots and stale completions cannot publish or queue more work', async () => {
		const pending: DeferredPromise<IAgentSessionSearchResult>[] = [];
		const calls: string[] = [];
		const updates: string[][] = [];
		let active = 0;
		let maximumActive = 0;
		const makeHost = (authority: string) => host({
			listSessions: async () => Array.from({ length: 6 }, (_, i) => metadata(`${authority}-${i}`)),
			searchSessionHistory: async (session, query) => {
				calls.push(query);
				active++;
				maximumActive = Math.max(maximumActive, active);
				if (query === 'old') {
					const deferred = new DeferredPromise<IAgentSessionSearchResult>();
					pending.push(deferred);
					await deferred.p;
				}
				active--;
				return { matches: [match(metadata(session.path.slice(1)), query)], hasMore: false };
			},
		}, true, authority);
		const search = store.add(new AgentHostSessionSearch(() => [makeHost('first'), makeHost('second')], state => updates.push(state.items.map(item => item.match.snippet)), new NullLogService()));
		search.setQuery('old');
		await clock.tickAsync(300);
		search.setQuery('intermediate');
		await clock.tickAsync(300);
		search.setQuery('new');
		await clock.tickAsync(300);
		for (const deferred of pending) {
			await deferred.complete({ matches: [], hasMore: false });
		}
		await clock.tickAsync(0);
		assert.deepStrictEqual({
			maximumActive, old: calls.filter(query => query === 'old').length,
			intermediate: calls.includes('intermediate'), latest: calls.filter(query => query === 'new').length,
			stalePublished: updates.some(items => items.includes('old')), final: updates.at(-1)?.length,
		}, { maximumActive: 4, old: 4, intermediate: false, latest: 12, stalePublished: false, final: 12 });
	});

	test('hiding cancels queued work and prevents late updates', async () => {
		const deferred = new DeferredPromise<IAgentSessionSearchResult>();
		let requests = 0;
		let updates = 0;
		const connection = host({
			listSessions: async () => Array.from({ length: 12 }, (_, i) => metadata(`${i}`)),
			searchSessionHistory: async () => { requests++; return deferred.p; },
		});
		const search = store.add(new AgentHostSessionSearch(() => [connection], () => { updates++; }, new NullLogService()));
		search.setQuery('old');
		await clock.tickAsync(300);
		search.setQuery('new');
		search.dispose();
		const updatesBeforeDispose = updates;
		await deferred.complete({ matches: [], hasMore: false });
		await clock.tickAsync(500);
		assert.deepStrictEqual({ requests, lateUpdates: updates - updatesBeforeDispose }, { requests: 4, lateUpdates: 0 });
	});

	test('clearing a query cancels in-flight generation without starting another scan', async () => {
		const catalog = new DeferredPromise<IAgentSessionMetadata[]>();
		let requests = 0;
		let resultCount = -1;
		const search = store.add(new AgentHostSessionSearch(() => [host({
			listSessions: () => catalog.p,
			searchSessionHistory: async () => { requests++; return { matches: [], hasMore: false }; },
		})], state => { resultCount = state.items.length; }, new NullLogService()));
		search.setQuery('old');
		await clock.tickAsync(300);
		search.setQuery('');
		await catalog.complete([metadata('session')]);
		await clock.tickAsync(0);
		assert.deepStrictEqual({ requests, resultCount }, { requests: 0, resultCount: 0 });
	});

	test('caps displayed matches and leaves remaining sessions unscanned', async () => {
		let last = { count: 0, hasMore: false, scanned: 0 };
		const search = store.add(new AgentHostSessionSearch(() => [host({
			listSessions: async () => Array.from({ length: 20 }, (_, i) => metadata(`${i}`)),
			searchSessionHistory: async session => ({ matches: Array.from({ length: 20 }, () => match(metadata(session.path.slice(1)))), hasMore: false }),
		})], state => { last = { count: state.items.length, hasMore: state.hasMore, scanned: state.scanned }; }, new NullLogService()));
		search.setQuery('saved');
		await clock.tickAsync(300);
		assert.deepStrictEqual({ count: last.count, hasMore: last.hasMore, stoppedEarly: last.scanned < 20 }, { count: 100, hasMore: true, stoppedEarly: true });
	});

	function semanticOptions(compute: IEmbeddingsService['computeEmbeddings'] = async (_provider, input) => input.map(() => ({ values: [1, 0] })), allProviders = ['copilot.text-embedding-3-small']): ISemanticSessionSearchOptions {
		return {
			providerId: 'copilot.text-embedding-3-small',
			embeddingsService: upcastPartial<IEmbeddingsService>({
				allProviders, onDidChange: Event.None, computeEmbeddings: compute,
			}),
		};
	}

	test('keyword mode never probes semantic capabilities or sends text for embedding', async () => {
		let count = 0;
		const search = store.add(new AgentHostSessionSearch(() => [host({
			searchSessionHistory: async () => ({ matches: [match(metadata('session'))], hasMore: false }),
			supportsSessionSemanticSearch: async () => assert.fail('semantic capability'),
			sessionSemanticSearch: async () => assert.fail('semantic request'),
		})], state => { count = state.items.length; }, new NullLogService()));
		search.setQuery('text');
		await clock.tickAsync(300);
		assert.strictEqual(count, 1);
	});

	test('finds independent paraphrases, preserves keywords, and scopes every semantic request after lexical refresh', async () => {
		const folder = URI.file('/workspace');
		const sessions = ['literal', 'paraphrase', 'outside'].map(id => ({
			...metadata(id), workingDirectories: [id === 'outside' ? URI.file('/elsewhere') : folder],
		}));
		const actions: string[] = [];
		const inputs: string[][] = [];
		const snapshots: string[][] = [];
		let descriptions: (string | undefined)[] = [];
		let coverage: { scanned: number; unavailable: number; incomplete: number } | undefined;
		const options = semanticOptions(async (_provider, input) => {
			inputs.push(input);
			return input.map(() => ({ values: [1, 0] }));
		});
		const search = store.add(new AgentHostSessionSearch(() => [host({
			listSessions: async () => sessions,
			searchSessionHistory: async uri => {
				actions.push(`${uri.path}:keyword`);
				return { matches: uri.path === '/literal' ? [match(sessions[0], 'fix an automobile')] : [], hasMore: false };
			},
			supportsSessionSemanticSearch: async () => true,
			sessionSemanticSearch: async (uri, request) => {
				actions.push(`${uri.path}:${request.kind}`);
				if (request.kind === 'pending') {
					return { kind: 'pending', chunks: [{ id: 1, contentHash: 'hash', text: 'repair a car' }], hasMore: false };
				}
				if (request.kind === 'store') {
					return { kind: 'store' };
				}
				return {
					kind: 'search', hasMore: false, incomplete: false,
					matches: [{ ...match(sessions.find(candidate => candidate.session.path === uri.path)!, 'repair a car'), score: 0.9 }],
				};
			},
		})], state => {
			snapshots.push(state.items.map(item => item.match.snippet));
			descriptions = state.items.map(item => item.description);
			coverage = state.semantic;
		}, new NullLogService(), () => workspace([folder]), () => options));
		search.setQuery('fix an automobile');
		await clock.tickAsync(300);
		assert.deepStrictEqual({
			scoped: actions.every(action => !action.startsWith('/outside')),
			refreshFirst: ['/literal', '/paraphrase'].every(id => actions.indexOf(`${id}:keyword`) < actions.indexOf(`${id}:pending`)),
			inputs,
			keywordProgress: snapshots.some(items => items.length === 1 && items[0] === 'fix an automobile'),
			snippets: snapshots.at(-1),
			kinds: descriptions.map(description => description?.split(' · ').at(-1)),
			coverage,
		}, {
			scoped: true, refreshFirst: true,
			inputs: [['fix an automobile'], ['repair a car'], ['repair a car']],
			keywordProgress: true, snippets: ['fix an automobile', 'repair a car'],
			kinds: ['Keyword and semantic match', 'Semantic match'],
			coverage: { scanned: 2, unavailable: 0, incomplete: 0 },
		});
	});

	for (const unavailable of ['provider', 'compute', 'host'] as const) {
		test(`keeps keyword results and reports unavailable semantic coverage after ${unavailable} failure`, async () => {
			const options = semanticOptions(async () => { throw new Error('private text must not be shown'); }, unavailable === 'provider' ? [] : undefined);
			let result: { count: number; semantic: { scanned: number; unavailable: number; incomplete: number } | undefined } | undefined;
			const search = store.add(new AgentHostSessionSearch(() => [host({
				searchSessionHistory: async () => ({ matches: [match(metadata('session'), 'keyword')], hasMore: false }),
				supportsSessionSemanticSearch: async () => unavailable !== 'host',
				sessionSemanticSearch: async () => assert.fail('request should not be reached'),
			})], state => { result = { count: state.items.length, semantic: state.semantic }; }, new NullLogService(), undefined, () => options));
			search.setQuery('keyword');
			await clock.tickAsync(300);
			assert.deepStrictEqual(result, { count: 1, semantic: { scanned: 1, unavailable: 1, incomplete: 1 } });
		});
	}

	for (const action of ['edit', 'toggle', 'hide', 'workspace'] as const) {
		test(`cancels embedding uploads on ${action} before any store or subsequent batch`, async () => {
			const blocked = new DeferredPromise<{ values: number[] }[]>();
			const calls: string[] = [];
			let providerToken: CancellationToken | undefined;
			let options: ISemanticSessionSearchOptions | undefined = semanticOptions(async (_provider, input, token) => {
				calls.push(`embed:${input[0]}`);
				if (input[0] === 'document') {
					providerToken = token;
					return blocked.p;
				}
				return [{ values: [1, 0] }];
			});
			let currentWorkspace = workspace([URI.file('/workspace')]);
			const search = store.add(new AgentHostSessionSearch(() => [host({
				listSessions: async () => [{ ...metadata('session'), workingDirectories: [URI.file('/workspace')] }],
				supportsSessionSemanticSearch: async () => true,
				sessionSemanticSearch: async (_uri, request) => {
					calls.push(request.kind);
					return { kind: 'pending', chunks: [{ id: 1, contentHash: 'hash', text: 'document' }], hasMore: true };
				},
			})], () => { }, new NullLogService(), () => currentWorkspace, () => options));
			search.setQuery('old');
			await clock.tickAsync(300);
			if (action === 'hide') {
				search.dispose();
			} else if (action === 'edit') {
				search.setQuery('');
			} else {
				options = undefined;
				if (action === 'workspace') {
					currentWorkspace = workspace([]);
				}
				search.setQuery('old');
			}
			await blocked.complete([{ values: [1, 0] }]);
			await clock.tickAsync(300);
			assert.deepStrictEqual({ calls, cancelled: providerToken?.isCancellationRequested }, {
				calls: ['embed:old', 'pending', 'embed:document'], cancelled: true,
			});
		});
	}

	test('semantic scanning continues beyond the keyword display cap and reports incomplete coverage', async () => {
		const sessions = Array.from({ length: 20 }, (_, index) => metadata(`${index}`));
		const requested: string[] = [];
		let result = { count: 0, hasMore: false, scanned: 0, paraphrase: false, incomplete: 0 };
		const options = semanticOptions();
		const search = store.add(new AgentHostSessionSearch(() => [host({
			listSessions: async () => sessions,
			searchSessionHistory: async uri => ({
				matches: Array.from({ length: 20 }, (_, index) => ({
					...match(sessions.find(session => session.session.path === uri.path)!), turnId: `${index}`,
				})), hasMore: false,
			}),
			supportsSessionSemanticSearch: async () => true,
			sessionSemanticSearch: async (uri, request) => {
				if (request.kind === 'pending') {
					return { kind: 'pending', chunks: [], hasMore: false };
				}
				requested.push(uri.path);
				return {
					kind: 'search', hasMore: false, incomplete: uri.path === '/19',
					matches: uri.path === '/19' ? [{ ...match(sessions[19], 'a paraphrase'), score: 0.8 }] : [],
				};
			},
		})], state => {
			result = {
				count: state.items.length, hasMore: state.hasMore, scanned: state.scanned,
				paraphrase: state.items.some(item => item.match.snippet === 'a paraphrase'),
				incomplete: state.semantic?.incomplete ?? 0,
			};
		}, new NullLogService(), undefined, () => options));
		search.setQuery('saved');
		await clock.tickAsync(300);
		assert.deepStrictEqual({ sessions: requested.length, result }, {
			sessions: 20, result: { count: 100, hasMore: true, scanned: 20, paraphrase: true, incomplete: 1 },
		});
	});

	test('reports the shared query budget and searches every session after uploads are exhausted', async () => {
		const sessions = Array.from({ length: 8 }, (_, index) => metadata(`${index}`));
		let documentChunks = 0;
		let queryEmbeddings = 0;
		let semanticSearches = 0;
		let final = { used: 0, exhausted: false, scanned: 0, incomplete: 0, count: 0 };
		const options = semanticOptions(async (_provider, input) => {
			if (input[0] === 'query') {
				queryEmbeddings++;
			} else {
				documentChunks += input.length;
			}
			return input.map(() => ({ values: [1, 0] }));
		});
		const search = store.add(new AgentHostSessionSearch(() => [host({
			listSessions: async () => sessions,
			supportsSessionSemanticSearch: async () => true,
			sessionSemanticSearch: async (uri, request) => {
				if (request.kind === 'pending') {
					return {
						kind: 'pending', hasMore: true,
						chunks: Array.from({ length: 16 }, (_, index) => ({ id: index + 1, contentHash: 'a'.repeat(64), text: 'synthetic document' })),
					};
				}
				if (request.kind === 'store') {
					return { kind: 'store' };
				}
				semanticSearches++;
				return {
					kind: 'search', hasMore: false, incomplete: false,
					matches: [{ ...match(sessions.find(session => session.session.path === uri.path)!, 'cached match'), score: 1 }],
				};
			},
		})], state => {
			final = {
				used: state.semanticBudget?.used ?? 0, exhausted: state.semanticBudget?.exhausted ?? false,
				scanned: state.scanned, incomplete: state.semantic?.incomplete ?? 0, count: state.items.length,
			};
		}, new NullLogService(), undefined, () => options));
		search.setQuery('query');
		await clock.tickAsync(300);
		assert.deepStrictEqual({ documentChunks, queryEmbeddings, semanticSearches, final }, {
			documentChunks: 2048, queryEmbeddings: 1, semanticSearches: 8,
			final: { used: 2048, exhausted: true, scanned: 8, incomplete: 8, count: 8 },
		});
	});

	for (const approval of ['decline', 'accept', 'missing'] as const) {
		test(`picker semantic toggle ${approval} preserves keyword results and revokes approval on scope changes`, async () => {
			const instantiation = store.add(new TestInstantiationService());
			const buttons = store.add(new Emitter<IQuickInputButton>());
			const changes = store.add(new Emitter<string>());
			const hidden = store.add(new Emitter<void>());
			const workspaceChanges = store.add(new Emitter<void>());
			const actions: string[] = [];
			let currentWorkspace = workspace([URI.file('/workspace')]);
			let disposed = false;
			let keywordRequests = 0;
			const picker = store.add(upcastPartial<IQuickPick<IAgentHostSessionSearchItem>>({
				value: '', items: [], buttons: [], selectedItems: [],
				onDidChangeValue: changes.event, onDidTriggerButton: buttons.event, onDidHide: Event.map(hidden.event, () => ({ reason: QuickInputHideReason.Gesture })),
				onDidAccept: Event.None, show: () => { }, hide: () => hidden.fire(), dispose: () => { disposed = true; },
			}));
			instantiation.stub(IQuickInputService, {});
			instantiation.stub(IQuickInputService, 'createQuickPick', () => picker);
			instantiation.stub(IAgentHostConnectionsService, {
				connections: [host({
					listSessions: async () => [{ ...metadata('session'), workingDirectories: [URI.file('/workspace')] }],
					searchSessionHistory: async () => {
						keywordRequests++;
						return { matches: [match(metadata('session'), 'keyword')], hasMore: false };
					},
					supportsSessionSemanticSearch: async () => true,
					sessionSemanticSearch: async (_session, request) => {
						actions.push(request.kind);
						return request.kind === 'pending' ? { kind: 'pending', chunks: [], hasMore: false }
							: { kind: 'search', matches: [], hasMore: false, incomplete: false };
					},
				})]
			});
			instantiation.stub(IChatWidgetService, {});
			instantiation.stub(IChatSessionsService, {});
			instantiation.stub(INotificationService, {});
			instantiation.stub(ILogService, new NullLogService());
			instantiation.stub(IWorkspaceContextService, {
				getWorkspace: () => currentWorkspace,
				onDidChangeWorkspaceFolders: Event.None, onDidChangeWorkbenchState: Event.None, onDidChangeWorkspaceName: workspaceChanges.event,
			});
			instantiation.stub(IWorkbenchEnvironmentService, { isSessionsWindow: false });
			instantiation.stub(IEmbeddingsService, {
				allProviders: approval === 'missing' ? [] : ['copilot.fake'], onDidChange: Event.None,
				computeEmbeddings: async () => { actions.push('compute'); return [{ values: [1, 0] }]; },
			});
			instantiation.stub(IDialogService, {
				confirm: async confirmation => {
					actions.push('confirm');
					assert.ok(confirmation.detail?.toString().includes('saved user and assistant messages in the current workspace'));
					assert.ok(confirmation.detail?.toString().includes('copilot.fake'));
					assert.ok(confirmation.detail?.toString().includes('may take time and use the provider\'s quota'));
					assert.ok(confirmation.detail?.toString().includes('at most 2048 document chunks across all sessions, plus one query embedding'));
					return { confirmed: approval === 'accept' };
				},
			});
			await CommandsRegistry.getCommand(SEARCH_AGENT_SESSION_CONTENT_COMMAND_ID)!.handler(instantiation);
			picker.value = 'keyword';
			changes.fire(picker.value);
			await clock.tickAsync(300);
			const defaultState = { checked: picker.buttons[0].toggle?.checked, count: picker.items.length, actions: [...actions] };
			buttons.fire(picker.buttons[0]);
			await clock.tickAsync(300);
			const enabledState = {
				checked: picker.buttons[0].toggle?.checked, count: picker.items.length,
				unavailable: picker.description?.includes('Semantic unavailable; showing keyword results') ?? false,
				actions: [...actions], keywordRequests,
				hybridTitle: picker.title?.endsWith('— Keyword and Semantic'),
				budget: picker.description?.includes('Document embedding budget: 0/2048 chunks per query') ?? false,
			};
			currentWorkspace = workspace([]);
			workspaceChanges.fire();
			await clock.tickAsync(300);
			const changedScope = { checked: picker.buttons[0].toggle?.checked, actions: [...actions] };
			picker.hide();
			assert.deepStrictEqual({ defaultState, enabledState, changedScope, disposed }, {
				defaultState: { checked: false, count: 1, actions: [] },
				enabledState: {
					checked: approval === 'accept', count: 1, unavailable: approval === 'missing',
					actions: approval === 'accept' ? ['confirm', 'compute', 'pending', 'search'] : approval === 'decline' ? ['confirm'] : [],
					keywordRequests: approval === 'accept' ? 2 : 1,
					hybridTitle: approval === 'accept', budget: approval === 'accept',
				},
				changedScope: {
					checked: false,
					actions: approval === 'accept' ? ['confirm', 'compute', 'pending', 'search'] : approval === 'decline' ? ['confirm'] : [],
				},
				disposed: true,
			});
		});
	}

	test('formats plain text with author, project, distinct host, archive label and exact peer chat', () => {
		const session = {
			host: host({}, true, 'remote-machine'),
			metadata: { ...metadata('id'), summary: '$(zap) Title\nsecond', project: { uri: URI.file('/project'), displayName: 'Project' }, status: SessionStatus.IsArchived },
		};
		const item = createAgentHostSessionSearchItem(session, match(session.metadata, '$(alert) **text**\nline', 'peer'))!;
		assert.deepStrictEqual({
			label: item.label, description: item.description, detail: item.detail, ariaLabel: item.ariaLabel,
			scheme: item.resource.scheme, fragment: item.resource.fragment,
			unrelated: createAgentHostSessionSearchItem(session, match(metadata('different'))),
		}, {
			label: '\\$(zap) Title second', description: 'User · remote-machine · Project · Archived', detail: '\\$(alert) **text** line',
			ariaLabel: '$(zap) Title second, User · remote-machine · Project · Archived, $(alert) **text** line',
			scheme: 'remote-remote-machine-copilotcli', fragment: 'peer', unrelated: undefined,
		});
	});

	test('acceptance opens the exact chat and reveals the matching assistant turn', async () => {
		const session = { host: host(), metadata: metadata('session') };
		const item = createAgentHostSessionSearchItem(session, { ...match(session.metadata, 'answer', 'peer'), role: 'assistant' })!;
		const request = upcastPartial<IChatRequestViewModel>({ id: 'turn', message: { text: 'prompt', parts: [] }, messageText: 'prompt' });
		const response = upcastPartial<IChatResponseViewModel>({ id: 'response', requestId: 'turn', setVote: () => { } });
		const actions: string[] = [];
		const widget = upcastPartial<IChatWidget>({
			viewModel: upcastPartial<IChatViewModel>({ getItems: () => [request, response] }),
			reveal: target => actions.push(`reveal:${target.id}`),
			focus: target => actions.push(`focus:${target.id}`),
		});
		const revealed = await openAgentHostSessionSearchResult(item, async resource => {
			actions.push(resource.toString());
			return widget;
		});
		assert.deepStrictEqual({ actions, revealed }, { actions: ['agent-host-copilotcli:/session#peer', 'reveal:response', 'focus:response'], revealed: true });
	});

	test('a missing turn does not silently reveal another message with identical text', async () => {
		const session = { host: host(), metadata: metadata('session') };
		const item = createAgentHostSessionSearchItem(session, match(session.metadata, '…saved text…'))!;
		const actions: string[] = [];
		const request = upcastPartial<IChatRequestViewModel>({ id: 'live-id', message: { text: '', parts: [] }, messageText: 'prefix saved text suffix' });
		const widget = upcastPartial<IChatWidget>({
			viewModel: upcastPartial<IChatViewModel>({ getItems: () => [request] }),
			reveal: target => actions.push(target.id), focus: () => { },
		});
		const revealed = await openAgentHostSessionSearchResult(item, async () => widget);
		assert.deepStrictEqual({ actions, revealed }, { actions: [], revealed: false });
	});

	test('waits for Sessions widget loading and matches both host identity and peer chat', async () => {
		const session = { host: host(), metadata: metadata('session') };
		const item = createAgentHostSessionSearchItem(session, match(session.metadata, 'saved', 'peer'))!;
		const added = store.add(new Emitter<IChatWidget>());
		const changed = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const existing = upcastPartial<IChatWidget>({
			onDidChangeViewModel: Event.None,
			viewModel: upcastPartial<IChatViewModel>({ sessionResource: item.resource.with({ scheme: 'remote-other-copilotcli' }) }),
		});
		const widgets: IChatWidget[] = [existing];
		const widgetService = upcastPartial<IChatWidgetService>({ getAllWidgets: () => widgets, onDidAddWidget: added.event });
		const connections = upcastPartial<IAgentHostConnectionsService>({
			resolveSessionResourceIdentity: resource => ({
				connectionAuthority: resource.scheme === 'remote-other-copilotcli' ? 'other' : 'local',
				backendSession: session.metadata.session,
			}),
		});
		let resolved: IChatWidget | undefined;
		const waiting = waitForAgentHostSessionSearchWidget(item, widgetService, connections).then(widget => { resolved = widget; });
		await clock.tickAsync(0);
		assert.strictEqual(resolved, undefined);
		let resource = item.resource.with({ fragment: '' });
		const widget = upcastPartial<IChatWidget>({
			onDidChangeViewModel: changed.event,
			get viewModel() { return upcastPartial<IChatViewModel>({ sessionResource: resource }); },
		});
		widgets.push(widget);
		added.fire(widget);
		await clock.tickAsync(0);
		assert.strictEqual(resolved, undefined);
		resource = item.resource;
		changed.fire({ previousSessionResource: undefined, currentSessionResource: resource });
		await waiting;
		assert.strictEqual(resolved, widget);
	});

	test('waiting for a deleted or unloaded chat times out and disposes listeners', async () => {
		const session = { host: host(), metadata: metadata('session') };
		const item = createAgentHostSessionSearchItem(session, match(session.metadata))!;
		const added = store.add(new Emitter<IChatWidget>());
		const waiting = waitForAgentHostSessionSearchWidget(item, upcastPartial<IChatWidgetService>({
			getAllWidgets: () => [], onDidAddWidget: added.event,
		}), upcastPartial<IAgentHostConnectionsService>({}));
		await clock.tickAsync(10_000);
		assert.strictEqual(await waiting, undefined);
	});
});
