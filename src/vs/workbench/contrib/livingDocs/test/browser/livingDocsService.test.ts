/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { LivingDocsService } from '../../browser/livingDocsService.js';
import { AgentPolicy, IAgentDef, IFreshness, ILivingDoc } from '../../common/livingDocsModel.js';
import { buildContextGroups } from '../../common/contextGroups.js';
import { parseLivingDoc } from '../../common/livingDocMarkdown.js';

const METRICS_CSV = [
	'week,date,mrr,signups,churn,active',
	'22,Jun 08,40300,290,3.1,179',
	'23,Jun 15,41200,312,3.1,188',
	'24,Jun 19,48600,427,2.4,205',
].join('\n');

// A clean-file Living Document: bind links authored at the week-23 values; resolving against the CSV
// (latest = week 24) should reconcile the visible cache to the week-24 values.
const WEEKLY_MD = [
	'---',
	'title: Weekly Operating Summary',
	'subtitle: Week 23',
	'sources:',
	'  - metrics.csv',
	'context:',
	'  - market-research.md',
	'---',
	'',
	'## Highlights',
	'',
	'Revenue grew [12%](bind:metrics.mrr.delta) week-on-week to [$41.2k](bind:metrics.mrr) MRR, on [312](bind:metrics.signups) new signups.',
	'',
	'## Commentary',
	'',
	'Growth remained steady this week.',
	'',
	'## What to watch',
	'',
	'Activation rate on the new onboarding flow.',
].join('\n') + '\n';

// A second bound document - its KPI table is a clean Markdown table whose cells are bind links.
const BOARD_MD = [
	'---',
	'title: Board Note',
	'sources:',
	'  - metrics.csv',
	'---',
	'',
	'## Numbers',
	'',
	'| Metric | Current |',
	'| --- | --- |',
	'| MRR | [$41.2k](bind:metrics.mrr) |',
	'| Signups | [312](bind:metrics.signups) |',
	'',
	'## Note to the board',
	'',
	'Momentum is steady this week.',
].join('\n') + '\n';

const PLAIN_MD = [
	'# Team Notes',
	'',
	'A plain Markdown file with **no** frontmatter and no bindings.',
	'',
	'- first item',
	'- second item',
].join('\n') + '\n';

// The influence (context) source for the Weekly Summary - plain Markdown, not itself a living doc.
const MARKET_MD = [
	'# Market research',
	'',
	'Steady competitive landscape; no major moves this week.',
].join('\n') + '\n';

const API_MD = [
	'---',
	'title: Ecosystem Signal',
	'sources:',
	'  - https://api.example.com/repo',
	'---',
	'',
	'## Ecosystem',
	'',
	'The repository has [0](bind:repo.stargazers_count) stars and [0](bind:repo.open_issues_count) open issues.',
].join('\n') + '\n';

// A document whose figure block mixes a resolvable bind with one the source can't provide; the
// Financial grader must block the run because metrics.unknown does not reconcile.
const BADBIND_MD = [
	'---', 'title: Ratio Doc', 'sources:', '  - metrics.csv', '---', '',
	'## Ratio', '', 'MRR is [$41.2k](bind:metrics.mrr) at a ratio of [0.0](bind:metrics.unknown).',
].join('\n') + '\n';

// A template file (plan 28, D28-A): `template: true` frontmatter, a declared source, two `{{slot}}`
// placeholders and a bind link in the body. Discovered by listTemplates, excluded from listDocuments.
const WEEKLY_TEMPLATE_MD = [
	'---',
	'template: true',
	'name: Weekly report',
	'description: A weekly operating summary bound to metrics.csv.',
	'sources:',
	'  - metrics.csv',
	'---',
	'',
	'# {{slot:report title}}',
	'',
	'Week {{slot:week number}}',
	'',
	'Revenue is [pending](bind:metrics.mrr) MRR.',
].join('\n') + '\n';

const API_PAYLOAD = { stargazers_count: 12345, open_issues_count: 678, full_name: 'microsoft/vscode' };
// The canned proxy /mcp/resolve response (plan 29, iter 4): the extracted field value + the raw MCP payload.
const MCP_RESOLVE_RESPONSE = { value: '128,000', raw: JSON.stringify({ period: '2026-W24', total: 128000, won: 47 }) };
// The canned proxy /proxy/fetch response for an authenticated api source (the payload the proxy returns
// AFTER injecting the secret server-side - the renderer never sees the credential).
const API_AUTH_PAYLOAD = { arr: 480000, seats: 1200 };

// An inline mcp binding (D29-B): bind:key@mcp:server.tool/field, resolved through the proxy.
const MCP_MD = [
	'---',
	'title: Pipeline Brief',
	'---',
	'',
	'## Pipeline',
	'',
	'Total open pipeline is [pending](bind:pipeline@mcp:demo.query/total) this week.',
].join('\n') + '\n';

// An authenticated api source naming a proxy-side secret (D29-C): `<url> auth=<secret-name>`.
const API_AUTH_MD = [
	'---',
	'title: Revenue Signal',
	'sources:',
	'  - https://crm.example.com/metrics auth=crm-token',
	'---',
	'',
	'## Revenue',
	'',
	'ARR is [pending](bind:metrics.arr) across [pending](bind:metrics.seats) seats.',
].join('\n') + '\n';

const WEEKLY = URI.file('/ws/Weekly Summary.md');
const BOARD = URI.file('/ws/Board Note.md');
const README = URI.file('/ws/Team Notes.md');
const API = URI.file('/ws/Ecosystem.md');
const MCP = URI.file('/ws/Pipeline Brief.md');
const APIAUTH = URI.file('/ws/Revenue Signal.md');
const BADBIND = URI.file('/ws/Ratio Doc.md');
const TEMPLATE = URI.file('/ws/templates/Weekly report.template.md');

suite('LivingDocsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface IOpenedEditor { resource?: URI; options?: { selection?: { startLineNumber: number } } }

	let lastFiles: Map<string, string> | undefined;
	let lastModelBody: string | undefined;
	let lastModelCalls = 0;
	let lastOpenedFolder: URI | undefined;
	// Plan 29 iter 4: capture what the renderer sent to the proxy's /mcp/resolve + /proxy/fetch routes, so a
	// test can prove the credential (the secret VALUE) never leaves the proxy - the renderer only names it.
	let lastMcpBody: string | undefined;
	let lastProxyFetchBody: string | undefined;

	function createService(opened: IOpenedEditor[] = [], opts: { boardNote?: boolean; api?: boolean; mcp?: boolean; mcpResponse?: object; apiAuth?: boolean; badBind?: boolean; template?: boolean; agents?: IAgentDef[]; model?: object; pickFolder?: URI; noFolder?: boolean } = {}): LivingDocsService {
		const files = new Map<string, string>();
		lastFiles = files;
		files.set(URI.file('/ws/metrics.csv').toString(), METRICS_CSV);
		files.set(URI.file('/ws/market-research.md').toString(), MARKET_MD);
		files.set(WEEKLY.toString(), WEEKLY_MD);
		files.set(README.toString(), PLAIN_MD);
		// Seed the agent registry before construction so the orchestrator loads it instead of defaults.
		if (opts.agents) { files.set(URI.file('/ws/agents.json').toString(), JSON.stringify(opts.agents)); }
		if (opts.boardNote) { files.set(BOARD.toString(), BOARD_MD); }
		if (opts.api) { files.set(API.toString(), API_MD); }
		if (opts.mcp) { files.set(MCP.toString(), MCP_MD); }
		if (opts.apiAuth) { files.set(APIAUTH.toString(), API_AUTH_MD); }
		if (opts.badBind) { files.set(BADBIND.toString(), BADBIND_MD); }
		// A template lives under a `templates/` subfolder to prove discovery walks into subdirectories (plan 28).
		if (opts.template) { files.set(TEMPLATE.toString(), WEEKLY_TEMPLATE_MD); }

		const fileService = {
			readFile: async (resource: URI) => {
				const content = files.get(resource.toString());
				if (content === undefined) { throw new Error(`not found: ${resource.toString()}`); }
				return { value: VSBuffer.fromString(content) };
			},
			writeFile: async (resource: URI, buffer: VSBuffer) => {
				files.set(resource.toString(), buffer.toString());
			},
			// List the direct children of a directory, so document discovery can fan out. Direct file children
			// are the keys with no further slash; an immediate subdirectory is synthesised (as an isDirectory
			// entry) from any key that has a deeper path, so the recursive template/document walk can descend.
			resolve: async (resource: URI) => {
				const prefix = resource.toString().replace(/\/+$/, '') + '/';
				const children: { resource: URI; isDirectory: boolean }[] = [];
				const dirs = new Set<string>();
				for (const key of files.keys()) {
					if (!key.startsWith(prefix)) { continue; }
					const rest = key.slice(prefix.length);
					const slash = rest.indexOf('/');
					if (slash < 0) {
						children.push({ resource: URI.parse(key), isDirectory: false });
					} else {
						dirs.add(prefix + rest.slice(0, slash));
					}
				}
				for (const dir of dirs) { children.push({ resource: URI.parse(dir), isDirectory: true }); }
				return { children };
			},
		} as unknown as IFileService;

		const editorService = { openEditor: async (input: IOpenedEditor) => { opened.push(input); return undefined; } } as unknown as IEditorService;
		const viewsService = { openView: async () => null } as unknown as IViewsService;
		const configurationService = { getValue: () => true } as unknown as IConfigurationService;
		const notificationService = { info: () => undefined } as unknown as INotificationService;
		// Routes the renderer's HTTP calls: when a model proxy response is configured, /healthz reports
		// healthy and /v1/messages returns the canned Claude response; everything else is the api source.
		const requestService = {
			request: async (options: { url?: string; data?: string }) => {
				const url = options.url ?? '';
				let payload: object = API_PAYLOAD;
				// The proxy routes (plan 29 iter 4): /mcp/resolve returns the extracted value + raw payload;
				// /proxy/fetch returns the authenticated api JSON. Both capture the sent body so a test can
				// assert the renderer only ever names the secret, never carries its value.
				if (url.includes('/mcp/resolve')) { lastMcpBody = options.data; payload = opts.mcpResponse ?? MCP_RESOLVE_RESPONSE; }
				else if (url.includes('/proxy/fetch')) { lastProxyFetchBody = options.data; payload = API_AUTH_PAYLOAD; }
				else if (opts.model) {
					if (url.includes('/healthz')) { payload = { ok: true }; }
					else if (url.includes('/v1/messages')) { payload = opts.model; lastModelBody = options.data; lastModelCalls++; }
				}
				return {
					res: { statusCode: 200, headers: {} },
					stream: bufferToStream(VSBuffer.fromString(JSON.stringify(payload))),
				};
			},
		} as unknown as IRequestService;
		const workspaceService = { getWorkspace: () => ({ folders: opts.noFolder ? [] : [{ uri: URI.file('/ws'), name: 'ws' }] }), onDidChangeWorkspaceFolders: Event.None } as unknown as IWorkspaceContextService;
		// Folder open: the picker returns the configured folder (or nothing when cancelled); openWindow records it.
		const fileDialogService = { showOpenDialog: async () => opts.pickFolder ? [opts.pickFolder] : undefined } as unknown as IFileDialogService;
		lastOpenedFolder = undefined;
		lastModelCalls = 0;
		lastMcpBody = undefined;
		lastProxyFetchBody = undefined;
		const hostService = { openWindow: async (toOpen: { folderUri?: URI }[]) => { lastOpenedFolder = toOpen?.[0]?.folderUri; } } as unknown as IHostService;

		const service = new LivingDocsService(fileService, editorService, viewsService, configurationService, notificationService, new NullLogService(), requestService, workspaceService, fileDialogService, hostService);
		store.add(service);
		return service;
	}

	function blockText(service: LivingDocsService, uri: URI, headingId: string): string {
		// The bound paragraph follows its heading; return the first block after the given heading.
		const blocks = service.getDoc(uri)!.blocks;
		const i = blocks.findIndex(b => b.id === headingId);
		return blocks[i + 1].text;
	}

	test('loading a bound document resolves its bind keys to the latest source values', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);

		// Authored at the week-23 cache ($41.2k / 312 / 12%); resolved to week-24 ($48.6k / 427 / +18%).
		const resolved = service.getResolved(WEEKLY);
		assert.deepStrictEqual(
			{ mrr: resolved.get('metrics.mrr'), signups: resolved.get('metrics.signups'), delta: resolved.get('metrics.mrr.delta') },
			{ mrr: '$48.6k', signups: '427', delta: '+18%' },
		);
		// Load is read-only: the on-disk cache is untouched until an explicit refresh/save.
		assert.ok(blockText(service, WEEKLY, 'h-highlights').includes('[$41.2k](bind:metrics.mrr)'), 'on-disk cache unchanged on load');
	});

	test('refreshFromSources reconciles the visible cache (figures auto-apply), persists, and audits', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);

		await service.refreshFromSources();

		const highlights = blockText(service, WEEKLY, 'h-highlights');
		assert.ok(highlights.includes('[$48.6k](bind:metrics.mrr)') && highlights.includes('[427](bind:metrics.signups)') && highlights.includes('[+18%](bind:metrics.mrr.delta)'), `reconciled in memory: ${highlights}`);
		const onDisk = lastFiles!.get(WEEKLY.toString()) ?? '';
		assert.ok(onDisk.includes('[$48.6k](bind:metrics.mrr)'), `persisted resolved value: ${onDisk}`);
		assert.ok(service.getAudit().some(e => e.action === 'auto-applied'), 'figure auto-apply audited');
	});

	test('first open bootstraps a lock sidecar from the sources (resolved value, hash, syncedAt, kind)', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);

		const lockText = lastFiles!.get(URI.file('/ws/Weekly Summary.lock.json').toString());
		assert.ok(lockText, 'a lock sidecar was written on first open');
		const lock = JSON.parse(lockText!);
		const mrr = lock.bindings['metrics.mrr'];
		assert.strictEqual(mrr.resolved, '$48.6k', 'resolved value bootstrapped from the source');
		assert.ok(mrr.sourceHash && mrr.syncedAt, 'binding carries a source hash and sync time');
		assert.deepStrictEqual({ appliedBy: mrr.appliedBy, kind: mrr.kind }, { appliedBy: 'agent', kind: 'figure' });
	});

	test('the lock is the source of truth for resolved values: load does not re-read sources (lock wins)', async () => {
		const service = createService();
		// Seed a lock whose resolved value is NOT derivable from the CSV; load must honour it.
		lastFiles!.set(URI.file('/ws/Weekly Summary.lock.json').toString(), JSON.stringify({
			version: 1,
			bindings: { 'metrics.mrr': { resolved: '$99.9k', source: 'metrics.csv#mrr', sourceHash: 'stale', syncedAt: 't', appliedBy: 'agent', kind: 'figure' } },
			context: {}, claims: {}, pins: [], audit: [],
		}));

		await service.loadDocument(WEEKLY);
		assert.strictEqual(service.getResolved(WEEKLY).get('metrics.mrr'), '$99.9k', 'load shows the lock value, not a fresh source read');
	});

	test('re-syncing a changed source updates the lock binding resolved + sourceHash and reconciles the .md', async () => {
		const service = createService();
		lastFiles!.set(URI.file('/ws/Weekly Summary.lock.json').toString(), JSON.stringify({
			version: 1,
			bindings: { 'metrics.mrr': { resolved: '$99.9k', source: 'metrics.csv#mrr', sourceHash: 'stale', syncedAt: 't', appliedBy: 'agent', kind: 'figure' } },
			context: {}, claims: {}, pins: [], audit: [],
		}));
		await service.loadDocument(WEEKLY);

		await service.refreshFromSources();

		const mrr = service.getLock(WEEKLY)!.bindings['metrics.mrr'];
		assert.strictEqual(mrr.resolved, '$48.6k', 're-sync pulls the current source value into the lock');
		assert.notStrictEqual(mrr.sourceHash, 'stale', 'source hash refreshed at sync');
		const lockOnDisk = JSON.parse(lastFiles!.get(URI.file('/ws/Weekly Summary.lock.json').toString())!);
		assert.strictEqual(lockOnDisk.bindings['metrics.mrr'].resolved, '$48.6k', 'lock persisted to its sidecar');
	});

	test('changing a value source flips the binding dirty bit (hash mismatch), with no model calls', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);
		assert.strictEqual(service.getFreshness(WEEKLY).dirty, false, 'fresh immediately after load');

		// A new week lands in the CSV - the bound document may be affected.
		lastFiles!.set(URI.file('/ws/metrics.csv').toString(), METRICS_CSV + '\n25,Jun 26,52000,470,2.2,210');
		await service.checkSources(WEEKLY);

		const fresh = service.getFreshness(WEEKLY);
		assert.ok(fresh.dirty && fresh.staleBindings.includes('metrics.mrr'), `binding dirty on source change: ${JSON.stringify(fresh)}`);
	});

	test('changing a context source flips its freshness to stale (the influence path)', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);
		assert.deepStrictEqual(service.getFreshness(WEEKLY).staleContext, [], 'context current after load');

		lastFiles!.set(URI.file('/ws/market-research.md').toString(), MARKET_MD + '\nA new competitor entered the market.\n');
		await service.checkSources(WEEKLY);

		assert.deepStrictEqual(service.getFreshness(WEEKLY).staleContext, ['market-research.md'], 'context flagged changed-since-review');
	});

	test('the Context panel groups the document\'s linked sources and referenced files, fresh by default', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);

		const groups = buildContextGroups(service.getDoc(WEEKLY)!, service.getFreshness(WEEKLY));
		// metrics.csv feeds the one bound block (Highlights); market-research.md is influence-only.
		assert.deepStrictEqual(groups, [
			{ label: 'Linked sources', items: [{ name: 'metrics.csv', kind: 'file', detail: 'live · feeds 1 block', changed: false }] },
			{ label: 'Referenced files', items: [{ name: 'market-research.md', kind: 'reference', detail: 'current', changed: false }] },
		]);
	});

	test('a changed value source flips its linked-source row to changed; a changed context source flips its referenced row', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);

		lastFiles!.set(URI.file('/ws/metrics.csv').toString(), METRICS_CSV + '\n25,Jun 26,52000,470,2.2,210');
		lastFiles!.set(URI.file('/ws/market-research.md').toString(), MARKET_MD + '\nA new competitor entered the market.\n');
		await service.checkSources(WEEKLY);

		const groups = buildContextGroups(service.getDoc(WEEKLY)!, service.getFreshness(WEEKLY));
		assert.deepStrictEqual(groups, [
			{ label: 'Linked sources', items: [{ name: 'metrics.csv', kind: 'file', detail: 'changed · feeds 1 block', changed: true }] },
			{ label: 'Referenced files', items: [{ name: 'market-research.md', kind: 'reference', detail: 'changed since review', changed: true }] },
		]);
	});

	test('the doc subtitle tracks the resolved week from its source (on load and on sync)', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY); // fixture subtitle "Week 23"; CSV latest week is 24
		assert.strictEqual(service.getDoc(WEEKLY)!.subtitle, 'Week 24', 'subtitle resolves to the latest source week on load');

		lastFiles!.set(URI.file('/ws/metrics.csv').toString(), METRICS_CSV + '\n25,Jun 26,52000,470,2.2,210');
		await service.syncFromSources(WEEKLY);
		assert.strictEqual(service.getDoc(WEEKLY)!.subtitle, 'Week 25', 'syncing advances the subtitle to the new week');
	});

	test('buildContextGroups splits image references into Images and surfaces added pasted/knowledge groups', () => {
		const doc: ILivingDoc = { title: 't', subtitle: '', sources: [], context: ['market-research.md', 'chart.png'], blocks: [], isLiving: true, body: '' };
		const fresh: IFreshness = { staleBindings: [], staleContext: [], dirty: false };
		const groups = buildContextGroups(doc, fresh, [
			{ kind: 'pasted', label: 'Q3 plan notes', detail: 'pasted note' },
			{ kind: 'knowledge', label: 'North Star metric', detail: 'company knowledge' },
		]);
		assert.deepStrictEqual(groups.map(g => [g.label, g.items.map(i => `${i.kind}:${i.name}`)]), [
			['Referenced files', ['reference:market-research.md']],
			['Images', ['image:chart.png']],
			['Pasted text', ['pasted:Q3 plan notes']],
			['Company knowledge', ['knowledge:North Star metric']],
		]);
	});

	test('addContext persists a typed context item to the lock; getAddedContext + the Context panel surface it', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);

		await service.addContext(WEEKLY, 'pasted', 'Customer interview: pricing is the blocker.');

		assert.deepStrictEqual(
			service.getAddedContext(WEEKLY).map(a => ({ kind: a.kind, label: a.label, detail: a.detail })),
			[{ kind: 'pasted', label: 'Customer interview: pricing is the blocker.', detail: 'pasted note' }],
		);
		const groups = buildContextGroups(service.getDoc(WEEKLY)!, service.getFreshness(WEEKLY), service.getAddedContext(WEEKLY));
		assert.ok(groups.some(g => g.label === 'Pasted text'), 'the Pasted text group now renders');
		const lockOnDisk = JSON.parse(lastFiles!.get(URI.file('/ws/Weekly Summary.lock.json').toString())!);
		assert.strictEqual(lockOnDisk.contextItems[0].kind, 'pasted', 'persisted to the lock sidecar');
	});

	test('an api source is grouped as a linked source with its kind', async () => {
		const service = createService([], { api: true });
		await service.loadDocument(API);

		const groups = buildContextGroups(service.getDoc(API)!, service.getFreshness(API));
		assert.deepStrictEqual(groups, [
			{ label: 'Linked sources', items: [{ name: 'https://api.example.com/repo', kind: 'api', detail: 'live · polled', changed: false }] },
		]);
	});

	test('the Skills report grades the document: Financial reconciles, Formatting flags sentence-case headings, Strategy needs a model', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);

		const report = service.getSkillReport(WEEKLY).map(s => ({ id: s.id, status: s.status, detail: s.detail, canRun: s.canRun }));
		assert.deepStrictEqual(report, [
			{ id: 'strategy', status: 'needs-model', detail: 'Connect a model to test claims against the decision stack.', canRun: false },
			{ id: 'financial', status: 'pass', detail: 'All 3 linked figures reconcile with sources.', canRun: true },
			{ id: 'formatting', status: 'flag', detail: '1 heading-case fix suggested.', canRun: true },
		]);
	});

	test('syncFromSources re-derives the figures, returns the old->new diff, and records the last sync diff', async () => {
		const service = createService();
		// Seed a stale MRR in the lock so a sync produces a visible figure change.
		lastFiles!.set(URI.file('/ws/Weekly Summary.lock.json').toString(), JSON.stringify({
			version: 1,
			bindings: { 'metrics.mrr': { resolved: '$99.9k', source: 'metrics.csv#mrr', sourceHash: 'stale', syncedAt: 't', appliedBy: 'agent', kind: 'figure' } },
			context: {}, claims: {}, pins: [], audit: [],
		}));
		await service.loadDocument(WEEKLY);

		const diff = await service.syncFromSources(WEEKLY);

		assert.ok(diff.some(c => c.key === 'metrics.mrr' && c.old === '$99.9k' && c.next === '$48.6k'), `mrr diff present: ${JSON.stringify(diff)}`);
		assert.deepStrictEqual(service.getLastSyncDiff(WEEKLY), diff, 'the last sync diff is recorded for the editor banner');
		assert.strictEqual(service.getLock(WEEKLY)!.bindings['metrics.mrr'].resolved, '$48.6k', 'the figure is applied to the lock');
	});

	test('syncFromSources records no diff when the figures already match their source', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY); // the seeded lock already resolves to the latest week
		await service.syncFromSources(WEEKLY);
		assert.deepStrictEqual(service.getLastSyncDiff(WEEKLY), [], 'a no-op sync reports an empty diff');
	});

	test('the Formatting flag is fixable; applySkillFix title-cases the headings in place and the grader then passes', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);

		const before = service.getSkillReport(WEEKLY).find(s => s.id === 'formatting')!;
		const financial = service.getSkillReport(WEEKLY).find(s => s.id === 'financial')!;
		assert.deepStrictEqual(
			{ formattingFlag: before.status, formattingFixable: before.fixable, financialFixable: !!financial.fixable },
			{ formattingFlag: 'flag', formattingFixable: true, financialFixable: false },
		);

		await service.applySkillFix(WEEKLY, 'formatting');

		const heading = service.getDoc(WEEKLY)!.blocks.find(b => b.type === 'heading' && /watch/i.test(b.text))!;
		assert.strictEqual(heading.text, 'What to Watch', 'the flagged heading is title-cased in place (minor word stays lower)');
		assert.strictEqual(service.getSkillReport(WEEKLY).find(s => s.id === 'formatting')!.status, 'pass', 'the grader now passes');
		assert.ok((lastFiles!.get(WEEKLY.toString()) ?? '').includes('## What to Watch'), 'the fix is persisted to disk');
		assert.ok(service.getAudit().some(e => e.newText === 'What to Watch'), 'the fix is audited');
	});

	test('the Financial skill flags a bound figure that does not reconcile to its source', async () => {
		const service = createService([], { badBind: true });
		await service.loadDocument(BADBIND);

		const financial = service.getSkillReport(BADBIND).find(s => s.id === 'financial')!;
		assert.deepStrictEqual(
			{ status: financial.status, detail: financial.detail },
			{ status: 'flag', detail: '1 of 2 figures do not reconcile: metrics.unknown.' },
		);
	});

	test('refreshing re-syncs the value bindings and clears their dirty bits', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);
		lastFiles!.set(URI.file('/ws/metrics.csv').toString(), METRICS_CSV + '\n25,Jun 26,52000,470,2.2,210');
		await service.checkSources(WEEKLY);
		assert.ok(service.getFreshness(WEEKLY).dirty, 'dirty before refresh');

		await service.refreshFromSources();

		assert.deepStrictEqual(service.getFreshness(WEEKLY).staleBindings, [], 'binding dirty bits cleared after re-sync');
		assert.strictEqual(service.getResolved(WEEKLY).get('metrics.mrr'), '$52.0k', 'lock now holds the new value');
	});

	function seedLock(uri: URI, lock: object): void {
		const stem = uri.path.split('/').pop()!.replace(/\.md$/, '');
		lastFiles!.set(URI.file(`/ws/${stem}.lock.json`).toString(), JSON.stringify(lock));
	}

	test('Review impact on a changed context queues a candidate; approve applies it, updates the lock, and clears the flag', async () => {
		const service = createService();
		// Authored claim bound to the context, anchored to the Commentary sentence.
		seedLock(WEEKLY, {
			version: 1, bindings: {}, context: {},
			claims: { 'commentary-tone': { anchor: 'Growth remained steady this week.', boundTo: ['market-research.md'], kind: 'meaning', state: 'applied' } },
			pins: [], audit: [],
		});
		await service.loadDocument(WEEKLY);

		// The context source changes -> the document is flagged, then the user runs Review impact.
		lastFiles!.set(URI.file('/ws/market-research.md').toString(), MARKET_MD + '\nA new competitor entered the market.\n');
		await service.checkSources(WEEKLY);
		await service.reviewImpact(WEEKLY);

		const pending = service.getPendingForDoc(WEEKLY);
		assert.strictEqual(pending.length, 1, 'one impact candidate queued');
		assert.deepStrictEqual(
			{ kind: pending[0].kind, via: pending[0].via, context: pending[0].contextReviewed, claim: pending[0].claimId, relink: !!pending[0].relink },
			{ kind: 'meaning', via: 'heuristic', context: ['market-research.md'], claim: 'commentary-tone', relink: false },
		);
		const commentaryBlockId = pending[0].blockId;
		assert.notStrictEqual(pending[0].newText, pending[0].oldText, 'a real edit is proposed');

		await service.approve(pending[0].id);

		assert.strictEqual(service.getPendingForDoc(WEEKLY).length, 0, 'cleared from the rail');
		assert.deepStrictEqual(service.getFreshness(WEEKLY).staleContext, [], 'context flag cleared after approve');
		const lock = service.getLock(WEEKLY)!;
		assert.strictEqual(lock.claims['commentary-tone'].state, 'applied', 'claim re-anchored + applied');
		assert.ok(lock.audit.some(e => e.action === 'approved' && e.blockId === commentaryBlockId), 'approval audited in the lock');
	});

	test('a claim whose anchor no longer matches surfaces a re-link prompt instead of mis-attaching', async () => {
		const service = createService();
		seedLock(WEEKLY, {
			version: 1, bindings: {}, context: {},
			claims: { 'orphan': { anchor: 'A sentence that does not appear anywhere in this document.', boundTo: ['market-research.md'], kind: 'meaning', state: 'applied' } },
			pins: [], audit: [],
		});
		await service.loadDocument(WEEKLY);
		const before = service.getDoc(WEEKLY)!.blocks.map(b => b.text).join('\n');

		lastFiles!.set(URI.file('/ws/market-research.md').toString(), MARKET_MD + '\nA new competitor entered the market.\n');
		await service.checkSources(WEEKLY);
		await service.reviewImpact(WEEKLY);

		const pending = service.getPendingForDoc(WEEKLY);
		assert.strictEqual(pending.length, 1, 'one prompt queued');
		assert.ok(pending[0].relink, 'it is a loud re-link prompt, not a silent re-attach');
		assert.ok(/re-link/i.test(pending[0].rationale), `prompt explains the re-link: ${pending[0].rationale}`);
		assert.strictEqual(service.getDoc(WEEKLY)!.blocks.map(b => b.text).join('\n'), before, 'no prose was changed');
	});

	test('with no model available, Review impact is a visible heuristic state (not a silent degrade)', async () => {
		const service = createService();
		seedLock(WEEKLY, {
			version: 1, bindings: {}, context: {},
			claims: { 'commentary-tone': { anchor: 'Growth remained steady this week.', boundTo: ['market-research.md'], kind: 'meaning', state: 'applied' } },
			pins: [], audit: [],
		});
		await service.loadDocument(WEEKLY);
		lastFiles!.set(URI.file('/ws/market-research.md').toString(), MARKET_MD + '\nA new competitor entered the market.\n');
		await service.checkSources(WEEKLY);

		await service.reviewImpact(WEEKLY);

		assert.ok(/no model/i.test(service.getStatus(WEEKLY)), `surfaces the no-model state: ${service.getStatus(WEEKLY)}`);
		assert.strictEqual(service.getPendingForDoc(WEEKLY)[0].via, 'heuristic', 'candidate marked as the heuristic fallback');
	});

	// Shape one Claude /v1/messages reply carrying a single JSON text block (what the proxy returns).
	function modelMessage(json: object): object {
		return { content: [{ type: 'text', text: JSON.stringify(json) }], stop_reason: 'end_turn' };
	}

	test('Review impact with the model proxy reachable produces a real model rewrite (via: model)', async () => {
		const rewrite = 'Growth held steady, though a new competitor now warrants watching.';
		const service = createService([], { model: modelMessage({ newText: rewrite, kind: 'meaning', confidence: 0.9, rationale: 'A new competitor entered the market.' }) });
		seedLock(WEEKLY, {
			version: 1, bindings: {}, context: {},
			claims: { 'commentary-tone': { anchor: 'Growth remained steady this week.', boundTo: ['market-research.md'], kind: 'meaning', state: 'applied' } },
			pins: [], audit: [],
		});
		await service.loadDocument(WEEKLY);
		lastFiles!.set(URI.file('/ws/market-research.md').toString(), MARKET_MD + '\nA new competitor entered the market.\n');
		await service.checkSources(WEEKLY);

		await service.reviewImpact(WEEKLY);

		const pending = service.getPendingForDoc(WEEKLY);
		assert.strictEqual(pending.length, 1, 'one impact candidate queued');
		assert.deepStrictEqual({ via: pending[0].via, newText: pending[0].newText }, { via: 'model', newText: rewrite });
	});

	test('Review impact falls back to the heuristic when the model refuses', async () => {
		const service = createService([], { model: { stop_reason: 'refusal', content: [] } });
		seedLock(WEEKLY, {
			version: 1, bindings: {}, context: {},
			claims: { 'commentary-tone': { anchor: 'Growth remained steady this week.', boundTo: ['market-research.md'], kind: 'meaning', state: 'applied' } },
			pins: [], audit: [],
		});
		await service.loadDocument(WEEKLY);
		lastFiles!.set(URI.file('/ws/market-research.md').toString(), MARKET_MD + '\nA new competitor entered the market.\n');
		await service.checkSources(WEEKLY);

		await service.reviewImpact(WEEKLY);

		assert.strictEqual(service.getPendingForDoc(WEEKLY)[0].via, 'heuristic', 'a refusal degrades to the heuristic candidate');
	});

	// --- Chat agent (criterion 2): a real model-backed conversation over the document + sources ---

	// One Claude reply carrying the Chat agent's JSON contract: a prose reply plus optional edits.
	function chatReply(reply: string, edits: object[] = []): object {
		return modelMessage({ reply, edits });
	}

	test('sendChatMessage records the user turn (with parsed @mentions) and a model-backed assistant reply', async () => {
		const service = createService([], { model: chatReply('metrics.csv shows MRR up 18% to $48.6k this week.') });
		await service.loadDocument(WEEKLY);

		await service.sendChatMessage(WEEKLY, 'Summarise this week @metrics.csv');

		const msgs = service.getChatMessages(WEEKLY);
		assert.deepStrictEqual(
			msgs.map(m => ({ role: m.role, via: m.via, content: m.content, mentions: m.mentions })),
			[
				{ role: 'user', via: undefined, content: 'Summarise this week @metrics.csv', mentions: ['metrics.csv'] },
				{ role: 'assistant', via: 'model', content: 'metrics.csv shows MRR up 18% to $48.6k this week.', mentions: undefined },
			],
		);
		assert.strictEqual(service.isChatBusy(WEEKLY), false, 'no longer busy once the reply lands');
	});

	test('cancelChat stops an in-flight reply: no pending changes, busy cleared, a muted stopped turn (plan 27)', async () => {
		const service = createService([], { model: chatReply('should never be applied', [{ heading: 'Commentary', oldText: 'Growth accelerated sharply this week.', newText: 'x', rationale: 'y' }]) });
		await service.loadDocument(WEEKLY);

		// The cancellation source is registered synchronously (before the first await inside sendChatMessage),
		// so cancelling here aborts the streaming model call before it runs - a partial reply is never committed.
		const inFlight = service.sendChatMessage(WEEKLY, 'Rewrite the commentary');
		service.cancelChat(WEEKLY);
		await inFlight;

		const msgs = service.getChatMessages(WEEKLY);
		const last = msgs[msgs.length - 1];
		assert.deepStrictEqual(
			{ role: last.role, stopped: last.stopped, busy: service.isChatBusy(WEEKLY), pending: service.getPendingForDoc(WEEKLY).length },
			{ role: 'assistant', stopped: true, busy: false, pending: 0 },
		);
	});

	test('a genuine model error records a failed turn, and retryChat replaces it by re-running the same user message (plan 27 iter 3)', async () => {
		// Both the streaming fetch (no proxy in the test) and the buffered call error, so the ladder ends in an
		// honest failed turn. retryChat drops that failed turn and re-runs the SAME user message (no duplicate).
		const service = createService([], { model: { error: { message: 'boom' } } });
		await service.loadDocument(WEEKLY);

		await service.sendChatMessage(WEEKLY, 'Rewrite the commentary');
		const afterSend = service.getChatMessages(WEEKLY);
		assert.deepStrictEqual(
			afterSend.map(m => ({ role: m.role, failed: m.failed })),
			[{ role: 'user', failed: undefined }, { role: 'assistant', failed: true }],
			'a failed model call records a user turn + a failed assistant turn',
		);
		assert.strictEqual(afterSend[afterSend.length - 1].content, 'The model call failed.', 'the failed turn carries the honest error copy');

		service.retryChat(WEEKLY);
		await Promise.resolve();
		// Drain the re-run (it fails again against the same error payload).
		while (service.isChatBusy(WEEKLY)) { await new Promise(r => setTimeout(r, 0)); }

		const afterRetry = service.getChatMessages(WEEKLY);
		assert.deepStrictEqual(
			afterRetry.map(m => ({ role: m.role, failed: m.failed })),
			[{ role: 'user', failed: undefined }, { role: 'assistant', failed: true }],
			'retry replaced the failed turn in place - still exactly one user turn and one failed assistant turn',
		);
	});

	test('retryChat is a no-op after a successful reply (nothing to retry)', async () => {
		const service = createService([], { model: chatReply('All good.') });
		await service.loadDocument(WEEKLY);
		await service.sendChatMessage(WEEKLY, 'Summarise this week');
		const before = service.getChatMessages(WEEKLY).length;

		service.retryChat(WEEKLY);
		await Promise.resolve();

		assert.strictEqual(service.getChatMessages(WEEKLY).length, before, 'a successful assistant turn is left untouched');
		assert.strictEqual(service.isChatBusy(WEEKLY), false, 'no new reply is kicked off');
	});

	test('the chat prompt carries the document, its resolved figures, and the @mentioned source', async () => {
		const service = createService([], { model: chatReply('Done.') });
		await service.loadDocument(WEEKLY);
		lastModelBody = undefined;

		await service.sendChatMessage(WEEKLY, 'Check the numbers @metrics.csv');

		const body = lastModelBody ?? '';
		assert.ok(body.includes('Weekly Operating Summary'), 'prompt includes the document title');
		assert.ok(body.includes('$48.6k'), 'prompt includes the resolved figure value');
		assert.ok(body.includes('week,mrr') || body.includes('metrics.csv'), `prompt includes the mentioned source: ${body.slice(0, 120)}`);
	});

	test('a chat reply that proposes an edit queues it to the Review rail; approve applies it to the prose', async () => {
		const newText = 'Growth accelerated this week.';
		const service = createService([], {
			model: chatReply('I drafted a sharper commentary line for your approval.', [
				{ heading: 'Commentary', oldText: 'Growth remained steady this week.', newText, rationale: 'The +18% MRR delta crosses the accelerating threshold.' },
			]),
		});
		await service.loadDocument(WEEKLY);

		await service.sendChatMessage(WEEKLY, 'Tighten the commentary');

		const pending = service.getPendingForDoc(WEEKLY);
		assert.strictEqual(pending.length, 1, 'one proposed edit queued from chat');
		assert.deepStrictEqual(
			{ via: pending[0].via, kind: pending[0].kind, newText: pending[0].newText },
			{ via: 'model', kind: 'meaning', newText },
		);
		const assistant = service.getChatMessages(WEEKLY).at(-1)!;
		assert.ok((assistant.steps ?? []).some(s => s.status === 'queued'), 'the assistant turn renders a queued tool-step');

		await service.approve(pending[0].id);
		assert.strictEqual(blockText(service, WEEKLY, 'h-commentary'), newText, 'approving the chat-proposed edit rewrites the block');
	});

	// --- Tweak: amend-before-approve (plan 31 iter 3, D31-B) ---

	test('amendChange then approve applies the human-edited text and audits it via tweaked', async () => {
		const service = createService([], {
			model: chatReply('Drafted a sharper commentary line.', [
				{ heading: 'Commentary', oldText: 'Growth remained steady this week.', newText: 'Growth accelerated this week.', rationale: 'r' },
			]),
		});
		await service.loadDocument(WEEKLY);
		await service.sendChatMessage(WEEKLY, 'Tighten the commentary');
		const change = service.getPendingForDoc(WEEKLY)[0];

		service.amendChange(change.id, 'Growth accelerated sharply this week.');
		// The proposal re-renders as still-pending with the amended text (not approved yet).
		const amended = service.getPendingForDoc(WEEKLY)[0];
		assert.strictEqual(amended.newText, 'Growth accelerated sharply this week.', 'pending change carries the human amendment');
		assert.strictEqual(amended.tweaked, true, 'flagged tweaked');

		await service.approve(change.id);
		assert.strictEqual(blockText(service, WEEKLY, 'h-commentary'), 'Growth accelerated sharply this week.', 'the amended text is what lands in the prose');
		const entry = service.getLock(WEEKLY)!.audit.find(e => e.action === 'approved')!;
		assert.strictEqual(entry.via, 'tweaked', 'the audit records the human tweak');
		assert.strictEqual(entry.newText, 'Growth accelerated sharply this week.', 'the audit records the amended text');
	});

	test('amendChange then reject discards cleanly, applying nothing', async () => {
		const service = createService([], {
			model: chatReply('Drafted a sharper commentary line.', [
				{ heading: 'Commentary', oldText: 'Growth remained steady this week.', newText: 'Growth accelerated this week.', rationale: 'r' },
			]),
		});
		await service.loadDocument(WEEKLY);
		await service.sendChatMessage(WEEKLY, 'Tighten the commentary');
		const change = service.getPendingForDoc(WEEKLY)[0];

		service.amendChange(change.id, 'Growth accelerated sharply this week.');
		service.reject(change.id);

		assert.strictEqual(service.getPendingForDoc(WEEKLY).length, 0, 'the change is cleared from the rail');
		assert.strictEqual(blockText(service, WEEKLY, 'h-commentary'), 'Growth remained steady this week.', 'the prose is untouched by a rejected tweak');
		assert.ok(!service.getLock(WEEKLY)!.audit.some(e => e.action === 'approved'), 'no approval audited');
	});

	test('amendChange is a no-op for an unknown id, an empty amendment, or a no-op amendment', async () => {
		const service = createService([], {
			model: chatReply('Drafted a sharper commentary line.', [
				{ heading: 'Commentary', oldText: 'Growth remained steady this week.', newText: 'Growth accelerated this week.', rationale: 'r' },
			]),
		});
		await service.loadDocument(WEEKLY);
		await service.sendChatMessage(WEEKLY, 'Tighten the commentary');
		const change = service.getPendingForDoc(WEEKLY)[0];

		service.amendChange('no-such-id', 'x');
		service.amendChange(change.id, '   ');
		service.amendChange(change.id, 'Growth accelerated this week.');
		const after = service.getPendingForDoc(WEEKLY)[0];
		assert.strictEqual(after.newText, 'Growth accelerated this week.', 'text unchanged by the no-op amendments');
		assert.ok(!after.tweaked, 'not flagged tweaked by a no-op amendment');
	});

	// --- decision-68: a chat edit to one list item must not destroy its siblings on approve (plan 31 iter 1)

	test('a chat edit to ONE list item preserves its sibling items on approve (decision-68 data loss)', async () => {
		const LIST = URI.file('/ws/Growth Levers.md');
		// A four-item list is a SINGLE block (parse splits on blank lines). The model targets item 2 only.
		const LIST_MD = [
			'# Growth Levers', '', 'Our priorities this quarter:', '',
			'- Increase revenue this quarter',
			'- Increase revenue next quarter',
			'- Increase revenue this year',
			'- Increase revenue next year',
		].join('\n') + '\n';
		const service = createService([], {
			model: chatReply('Sharpened the second lever.', [
				{ heading: 'Growth Levers', oldText: '- Increase revenue next quarter', newText: '- Increase revenue substantially next quarter', rationale: 'r' },
			]),
		});
		lastFiles!.set(LIST.toString(), LIST_MD);
		await service.loadDocument(LIST);

		await service.sendChatMessage(LIST, 'Sharpen the second lever');

		const pending = service.getPendingForDoc(LIST);
		assert.strictEqual(pending.length, 1, 'the list-item edit is queued');
		// The proposal is anchored at the single <li>, not the whole list block (pre-fix it was best.text).
		assert.strictEqual(pending[0].oldText, '- Increase revenue next quarter', 'oldText scoped to the targeted item');

		await service.approve(pending[0].id);

		const listBlock = service.getDoc(LIST)!.blocks.find(b => b.text.includes('Increase revenue'))!;
		assert.strictEqual(listBlock.text, [
			'- Increase revenue this quarter',
			'- Increase revenue substantially next quarter',
			'- Increase revenue this year',
			'- Increase revenue next year',
		].join('\n'), 'only item 2 changed; items 1/3/4 survive byte-identical');
		const onDisk = lastFiles!.get(LIST.toString()) ?? '';
		assert.ok(
			onDisk.includes('- Increase revenue this quarter') && onDisk.includes('- Increase revenue this year') && onDisk.includes('- Increase revenue next year'),
			`all sibling items persisted to disk: ${onDisk}`,
		);
	});

	test('a chat edit to a plain list item keeps a bound-figure sibling intact', async () => {
		const KPIS = URI.file('/ws/KPIs.md');
		const KPIS_MD = [
			'---', 'title: KPIs', 'sources:', '  - metrics.csv', '---', '',
			'## Highlights', '', 'This quarter:', '',
			'- Revenue grew steadily',
			'- Costs stayed flat',
			'- Cash balance is [$41.2k](bind:metrics.mrr)',
		].join('\n') + '\n';
		const service = createService([], {
			model: chatReply('Tightened the costs line.', [
				{ heading: 'Highlights', oldText: '- Costs stayed flat', newText: '- Costs fell sharply', rationale: 'r' },
			]),
		});
		lastFiles!.set(KPIS.toString(), KPIS_MD);
		await service.loadDocument(KPIS);

		await service.sendChatMessage(KPIS, 'Tighten the costs line');
		const pending = service.getPendingForDoc(KPIS);
		assert.strictEqual(pending.length, 1, 'the plain-item edit is queued even though a sibling item is bound');
		assert.strictEqual(pending[0].oldText, '- Costs stayed flat', 'anchored on the plain item, not the bound one');

		await service.approve(pending[0].id);
		const listBlock = service.getDoc(KPIS)!.blocks.find(b => b.text.includes('Cash balance'))!;
		assert.ok(listBlock.text.includes('- Costs fell sharply'), 'the plain item was rewritten');
		assert.ok(/- Cash balance is \[[^\]]+\]\(bind:metrics\.mrr\)/.test(listBlock.text), 'the bound-figure sibling survives with its bind link intact');
		assert.ok(listBlock.text.includes('- Revenue grew steadily'), 'the other plain sibling survives too');
	});

	test('a chat edit that targets a BOUND list item is skipped (never touch a figure)', async () => {
		const KPIS = URI.file('/ws/KPIs.md');
		const KPIS_MD = [
			'---', 'title: KPIs', 'sources:', '  - metrics.csv', '---', '',
			'## Highlights', '', 'This quarter:', '',
			'- Revenue grew steadily',
			'- Cash balance is [$41.2k](bind:metrics.mrr)',
		].join('\n') + '\n';
		const service = createService([], {
			model: chatReply('Rewrote the cash line.', [
				{ heading: 'Highlights', oldText: '- Cash balance is $41.2k', newText: '- Cash balance is now much higher', rationale: 'r' },
			]),
		});
		lastFiles!.set(KPIS.toString(), KPIS_MD);
		await service.loadDocument(KPIS);

		await service.sendChatMessage(KPIS, 'Rewrite the cash line');
		assert.strictEqual(service.getPendingForDoc(KPIS).length, 0, 'an edit whose target item carries a bind is not queued');
	});

	test('chat is multi-turn: a follow-up carries the prior turns to the model (F3 over current state)', async () => {
		const service = createService([], { model: chatReply('Done.') });
		await service.loadDocument(WEEKLY);
		await service.sendChatMessage(WEEKLY, 'Give me three growth levers');
		lastModelBody = undefined;

		await service.sendChatMessage(WEEKLY, 'Change a couple of them');

		const body = lastModelBody ?? '';
		assert.ok(body.includes('Conversation so far'), 'the follow-up prompt includes the transcript');
		assert.ok(body.includes('Give me three growth levers'), 'the follow-up prompt carries the earlier user turn');
	});

	test('a chat reply that GENERATES content queues an insertion; approve splices a new block into the doc (F3)', async () => {
		const newText = '1. Expand the trial\n2. Win back churned accounts\n3. Add an annual plan';
		const service = createService([], {
			model: modelMessage({
				reply: 'Here is a starting top-3 list.', edits: [], inserts: [
					{ afterHeading: 'Commentary', newText, rationale: 'Drafted the list you asked for.' },
				]
			}),
		});
		await service.loadDocument(WEEKLY);

		await service.sendChatMessage(WEEKLY, 'Generate me a top-3 list of growth levers');

		const pending = service.getPendingForDoc(WEEKLY);
		assert.strictEqual(pending.length, 1, 'one insertion queued');
		assert.deepStrictEqual(
			{ insert: pending[0].insert, oldText: pending[0].oldText, newText: pending[0].newText },
			{ insert: true, oldText: '', newText },
		);

		await service.approve(pending[0].id);
		const blocks = service.getDoc(WEEKLY)!.blocks;
		assert.ok(blocks.some(b => b.text === newText), 'approving the insertion adds the new content as a block');
		assert.strictEqual(service.getPendingForDoc(WEEKLY).length, 0, 'cleared from the rail after approve');
	});

	test('approveAll accepts every pending change for a document at once (F6 accept-all)', async () => {
		const service = createService([], {
			model: modelMessage({
				reply: 'Edited and added.', edits: [
					{ heading: 'Commentary', oldText: 'Growth remained steady this week.', newText: 'Growth accelerated this week.', rationale: 'r' },
				], inserts: [
					{ afterHeading: 'Commentary', newText: 'A new closing note.', rationale: 'r' },
				]
			}),
		});
		await service.loadDocument(WEEKLY);

		await service.sendChatMessage(WEEKLY, 'Tighten the commentary and add a closing note');
		assert.strictEqual(service.getPendingForDoc(WEEKLY).length, 2, 'an edit and an insertion are queued');

		await service.approveAll(WEEKLY.toString());
		assert.strictEqual(service.getPendingForDoc(WEEKLY).length, 0, 'accept-all clears the whole rail');
		const blocks = service.getDoc(WEEKLY)!.blocks;
		assert.ok(blocks.some(b => b.text === 'A new closing note.'), 'the insertion landed');
		assert.ok(blocks.some(b => b.text === 'Growth accelerated this week.'), 'the edit landed');
	});

	// --- multi-document review (plan 18): reject-all mirrors of approveAll ---

	// Queue one end-of-document insertion into each of two docs by chatting on each in turn. The single
	// canned model reply (an insert with an empty afterHeading) lands in whichever doc is active, so this
	// builds genuine cross-document pending state without depending on the iter-3 fan-out.
	async function queuePendingInTwoDocs(): Promise<LivingDocsService> {
		const service = createService([], {
			boardNote: true,
			model: modelMessage({ reply: 'Added.', edits: [], inserts: [{ afterHeading: '', newText: 'A shared closing note.', rationale: 'r' }] }),
		});
		await service.loadDocument(WEEKLY);
		await service.sendChatMessage(WEEKLY, 'Add a closing note');
		await service.loadDocument(BOARD);
		await service.sendChatMessage(BOARD, 'Add a closing note');
		return service;
	}

	test('rejectAll(docId) discards one document\'s pending changes and leaves the others untouched', async () => {
		const service = await queuePendingInTwoDocs();
		assert.strictEqual(service.getAllPending().length, 2, 'precondition: one pending change in each of two docs');

		await service.rejectAll(WEEKLY.toString());

		assert.deepStrictEqual(
			{ weekly: service.getPendingForDoc(WEEKLY).length, board: service.getPendingForDoc(BOARD).length },
			{ weekly: 0, board: 1 },
			'rejectAll clears the named doc only',
		);
		assert.ok(service.getAudit().some(e => e.action === 'rejected' && e.docTitle === 'Board Note') === false
			&& service.getAudit().some(e => e.action === 'rejected'), 'the rejection is audited for the cleared doc');
	});

	test('rejectAllPending() discards every pending change across all documents in one action', async () => {
		const service = await queuePendingInTwoDocs();
		assert.strictEqual(service.getAllPending().length, 2, 'precondition: pending across two docs');

		await service.rejectAllPending();

		assert.strictEqual(service.getAllPending().length, 0, 'reject-all clears every doc');
	});

	test('approveAllPending() applies every pending change across all documents in one action (chat-level accept-all)', async () => {
		const service = await queuePendingInTwoDocs();
		assert.strictEqual(service.getAllPending().length, 2, 'precondition: pending across two docs');

		await service.approveAllPending();

		assert.strictEqual(service.getAllPending().length, 0, 'accept-all clears every doc');
		assert.ok(
			service.getDoc(WEEKLY)!.blocks.some(b => b.text === 'A shared closing note.')
			&& service.getDoc(BOARD)!.blocks.some(b => b.text === 'A shared closing note.'),
			'the change landed in both documents',
		);
	});

	// --- working set (plan 18 iter 2): the documents a chat instruction edits across (D-A/D-B) ---

	test('addFolderToWorkingSet puts every folder document into the chat working set as titled chips', async () => {
		const service = createService([], { boardNote: true });
		await service.loadDocument(WEEKLY);

		await service.addFolderToWorkingSet(WEEKLY);

		assert.deepStrictEqual(
			service.getWorkingSet(WEEKLY).map(d => d.title).sort(),
			['Board Note', 'Market research', 'Team Notes', 'Weekly Operating Summary'],
			'a folder expands to all its Markdown documents',
		);
	});

	test('addToWorkingSet de-duplicates by resource and removeFromWorkingSet drops one document', async () => {
		const service = createService([], { boardNote: true });
		await service.loadDocument(WEEKLY);

		await service.addToWorkingSet(WEEKLY, [BOARD, README]);
		await service.addToWorkingSet(WEEKLY, [BOARD]);
		assert.strictEqual(service.getWorkingSet(WEEKLY).length, 2, 'adding the same document twice does not duplicate it');

		service.removeFromWorkingSet(WEEKLY, BOARD);
		assert.deepStrictEqual(
			service.getWorkingSet(WEEKLY).map(d => d.resource.toString()),
			[README.toString()],
			'removeFromWorkingSet drops only the named document',
		);
	});

	test('the working set is per chat (active document): adding to one does not leak into another', async () => {
		const service = createService([], { boardNote: true });
		await service.loadDocument(WEEKLY);
		await service.loadDocument(BOARD);

		await service.addToWorkingSet(WEEKLY, [README]);

		assert.deepStrictEqual(
			{ weekly: service.getWorkingSet(WEEKLY).length, board: service.getWorkingSet(BOARD).length },
			{ weekly: 1, board: 0 },
			'the working set is scoped to the chat it was added from',
		);
	});

	test('getWorkingSetCandidates lists folder documents not already in the working set', async () => {
		const service = createService([], { boardNote: true });
		await service.loadDocument(WEEKLY);
		await service.addToWorkingSet(WEEKLY, [BOARD]);

		const candidates = (await service.getWorkingSetCandidates(WEEKLY)).map(d => d.title).sort();
		assert.deepStrictEqual(
			candidates,
			['Market research', 'Team Notes', 'Weekly Operating Summary'],
			'the picker offers every folder doc except those already added',
		);
	});

	// --- multi-document fan-out (plan 18 iter 3): one instruction edits the whole working set (D-C) ---

	// One model reply carrying the per-document edit map for the working set.
	function multiReply(reply: string, docs: object[]): object {
		return modelMessage({ reply, docs });
	}

	test('with a working set, one chat instruction fans out edits to every document via a single model call (D-C)', async () => {
		const service = createService([], {
			boardNote: true,
			model: multiReply('Changed blue to red across all three.', [
				{ doc: 'Weekly Operating Summary', edits: [{ oldText: 'Growth remained steady this week.', newText: 'Growth is now red-themed.', rationale: 'r' }] },
				{ doc: 'Board Note', edits: [{ oldText: 'Momentum is steady this week.', newText: 'Momentum is now red-themed.', rationale: 'r' }] },
				{ doc: 'Team Notes', inserts: [{ afterHeading: '', newText: 'Primary colour is now red.', rationale: 'r' }] },
			]),
		});
		await service.loadDocument(WEEKLY);
		await service.addToWorkingSet(WEEKLY, [WEEKLY, BOARD, README]);
		lastModelCalls = 0;

		await service.sendChatMessage(WEEKLY, 'change the primary colour from blue to red');

		assert.strictEqual(lastModelCalls, 1, 'D-C: the working set is edited with ONE model call, not one per doc');
		const docIds = new Set(service.getAllPending().map(c => c.docId));
		assert.deepStrictEqual(
			[...docIds].sort(),
			[BOARD.toString(), README.toString(), WEEKLY.toString()].sort(),
			'proposals are queued across all three working-set documents',
		);
	});

	test('with NO working set, chat still edits only the active document (backwards compatible, D-B)', async () => {
		const service = createService([], {
			boardNote: true,
			// A single-doc reply shape; were the fan-out wrongly triggered it would look for a `docs` array.
			model: chatReply('Tightened it.', [{ heading: 'Commentary', oldText: 'Growth remained steady this week.', newText: 'Growth accelerated.', rationale: 'r' }]),
		});
		await service.loadDocument(WEEKLY);

		await service.sendChatMessage(WEEKLY, 'tighten the commentary');

		const docIds = new Set(service.getAllPending().map(c => c.docId));
		assert.deepStrictEqual([...docIds], [WEEKLY.toString()], 'with no set, only the active doc is edited');
	});

	test('chat works on a PLAIN doc (decision 48): a generated insert queues + approve splices it, and the doc stays plain', async () => {
		const newText = '1. First lever\n2. Second lever\n3. Third lever';
		const service = createService([], {
			model: modelMessage({
				reply: 'Here is a starting list.', edits: [], inserts: [
					{ afterHeading: 'Team Notes', newText, rationale: 'Drafted the list you asked for.' },
				]
			}),
		});
		await service.loadDocument(README);
		assert.strictEqual(service.getDoc(README)!.isLiving, false, 'precondition: README is a plain doc');

		await service.sendChatMessage(README, 'Generate me a top-3 list');

		const assistant = service.getChatMessages(README).at(-1)!;
		assert.strictEqual(assistant.via, 'model', 'chat is model-backed on a plain doc, not the living-doc fallback');
		const pending = service.getPendingForDoc(README);
		assert.strictEqual(pending.length, 1, 'the generated insertion is queued for a plain doc');

		await service.approve(pending[0].id);
		const doc = service.getDoc(README)!;
		assert.ok(doc.blocks.some(b => b.text === newText), 'approving the insertion adds the new content as a block');
		assert.strictEqual(doc.isLiving, false, 'accepting chat content does NOT turn a plain doc into a living one (affordances stay tied to real bindings)');
	});

	test('with no model reachable, chat is honest (fallback turn, no faked reply, nothing queued)', async () => {
		const service = createService(); // no opts.model -> /healthz is unhealthy -> no model
		await service.loadDocument(WEEKLY);

		await service.sendChatMessage(WEEKLY, 'Summarise this week');

		const assistant = service.getChatMessages(WEEKLY).at(-1)!;
		assert.strictEqual(assistant.via, 'fallback', 'the no-model turn is marked as a fallback');
		assert.ok(/proxy|model/i.test(assistant.content), `the fallback names the missing model: ${assistant.content}`);
		assert.strictEqual(service.getPendingForDoc(WEEKLY).length, 0, 'no edits queued without a model');
	});

	test('getMentionableFiles resolves real folder files (md/csv/json), not just frontmatter-declared ones', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);
		// Team Notes.md is a real folder file but NOT a declared source/context of WEEKLY - it must still be
		// mentionable (R6). Lock sidecars are excluded.
		assert.deepStrictEqual(
			[...service.getMentionableFiles(WEEKLY)].sort(),
			['Team Notes.md', 'market-research.md', 'metrics.csv'],
			'declared sources/context PLUS the other real folder documents',
		);
	});

	test('addContextFile references a real folder file in the context frontmatter (prose + sources untouched), and removeContextFile clears it', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);

		await service.addContextFile(WEEKLY, 'Team Notes.md');
		assert.ok(service.getDoc(WEEKLY)!.context.includes('Team Notes.md'), 'reference added to the in-memory doc');
		const onDisk = lastFiles!.get(WEEKLY.toString()) ?? '';
		assert.ok(/context:[\s\S]*Team Notes\.md/.test(onDisk), 'persisted into the context frontmatter on disk');
		assert.deepStrictEqual(service.getDoc(WEEKLY)!.sources, ['metrics.csv'], 'sources list untouched');
		assert.ok(onDisk.includes('Growth remained steady this week.'), 'prose untouched');

		await service.removeContextFile(WEEKLY, 'market-research.md');
		assert.ok(!service.getDoc(WEEKLY)!.context.includes('market-research.md'), 'reference removed');
	});

	test('getContextCandidates lists folder files not already referenced or bound (and excludes the doc + system files)', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY); // sources: metrics.csv, context: market-research.md; bootstraps a lock
		// Team Notes.md is the only other real document not already bound/referenced.
		assert.deepStrictEqual([...await service.getContextCandidates(WEEKLY)].sort(), ['Team Notes.md'], 'folder files minus self, bound source, referenced context, and lock sidecars');
	});

	test('runSkillCheck strategy surfaces a model verdict against the decision stack', async () => {
		const flag = 'Strategy: the "steady growth" framing ignores the new competitor noted in market-research.md.';
		const service = createService([], { model: modelMessage({ pass: false, flag }) });
		await service.loadDocument(WEEKLY);

		await service.runSkillCheck(WEEKLY, 'strategy');

		const strategy = service.getSkillReport(WEEKLY).find(s => s.id === 'strategy')!;
		assert.deepStrictEqual(
			{ status: strategy.status, detail: strategy.detail, canRun: strategy.canRun },
			{ status: 'flag', detail: flag, canRun: true },
		);
	});

	test('a clean Markdown table with bind links in cells resolves each cell on refresh', async () => {
		const service = createService([], { boardNote: true });
		await service.loadDocument(BOARD);
		await service.refreshFromSources();

		const table = service.getDoc(BOARD)!.blocks.find(b => b.type === 'table')!;
		assert.ok(table.text.includes('[$48.6k](bind:metrics.mrr)') && table.text.includes('[427](bind:metrics.signups)'), `table cells resolved: ${table.text}`);
	});

	test('plain Markdown is not a Living Document and reports a Markdown status', async () => {
		const service = createService();
		await service.loadDocument(README);
		assert.strictEqual(service.getDoc(README)?.isLiving, false);
		assert.strictEqual(service.getStatus(README), 'Markdown');
	});

	test('saveRawText persists verbatim and reparses the document', async () => {
		const service = createService();
		await service.loadDocument(README);

		const edited = PLAIN_MD.replace('Team Notes', 'Renamed Notes');
		await service.saveRawText(README, edited);

		assert.strictEqual(service.getRawText(README), edited, 'raw text updated');
		assert.strictEqual(service.getDoc(README)?.title, 'Renamed Notes', 'reparsed after save');
	});

	test('an api source resolves live values into its bind links on refresh', async () => {
		const service = createService([], { api: true });
		await service.loadDocument(API);
		await service.refreshFromSources();

		const eco = service.getDoc(API)!.blocks.find(b => b.type === 'paragraph' && b.binds.length > 0)!;
		assert.ok(eco.text.includes('[12,345](bind:repo.stargazers_count)'), `live stars resolved: ${eco.text}`);
		assert.ok(eco.text.includes('[678](bind:repo.open_issues_count)'), `live issues resolved: ${eco.text}`);
	});

	// --- plan 29 iter 4: mcp resolution + api auth (credentials stay in the proxy) ---

	test('an inline mcp binding resolves through the proxy and lands its extracted value', async () => {
		const service = createService([], { mcp: true });
		await service.loadDocument(MCP);
		await service.refreshFromSources();

		const block = service.getDoc(MCP)!.blocks.find(b => b.type === 'paragraph' && b.binds.length > 0)!;
		assert.ok(block.text.includes('[128,000](bind:pipeline@mcp:demo.query/total)'), `mcp value resolved into the bind link: ${block.text}`);
		// The renderer asked the proxy to resolve the parsed server/tool/field - never spawning a process itself.
		assert.ok(lastMcpBody, 'the renderer POSTed to the proxy /mcp/resolve route');
		const sent = JSON.parse(lastMcpBody!) as { server: string; tool: string; field: string };
		assert.deepStrictEqual({ server: sent.server, tool: sent.tool, field: sent.field }, { server: 'demo', tool: 'query', field: 'total' });
		// The lock records the mcp origin (server.tool#field) for provenance, not a pretend file path.
		assert.strictEqual(service.getLock(MCP)!.bindings['pipeline@mcp:demo.query/total'].source, 'demo.query#total');
	});

	test('a down mcp server leaves the binding unresolved (flagged stale) and the document still renders', async () => {
		// The proxy returns a structured error (server down) instead of a value.
		const service = createService([], { mcp: true, mcpResponse: { error: { type: 'mcp_error', message: 'mcp server exited' } } });
		await service.loadDocument(MCP);
		await service.refreshFromSources();

		// No value landed: the visible cache keeps its authored placeholder, and no lock binding was written -
		// the document renders fine rather than throwing or showing an error toast.
		const block = service.getDoc(MCP)!.blocks.find(b => b.type === 'paragraph' && b.binds.length > 0)!;
		assert.ok(block.text.includes('[pending](bind:pipeline@mcp:demo.query/total)'), `unresolved binding keeps its placeholder: ${block.text}`);
		assert.strictEqual(service.getLock(MCP)!.bindings['pipeline@mcp:demo.query/total'], undefined, 'no lock binding written for the unresolved mcp key');
	});

	test('source-peek for an mcp value shows the real payload with the field, not a CSV', async () => {
		const service = createService([], { mcp: true });
		await service.loadDocument(MCP);
		await service.refreshFromSources();

		const peek = service.getSourcePeek(MCP, ['pipeline@mcp:demo.query/total']);
		assert.ok(peek?.payload, 'an mcp cell yields a raw-payload view');
		assert.strictEqual(peek!.payload!.kind, 'mcp');
		assert.strictEqual(peek!.payload!.field, 'total');
		assert.ok(peek!.payload!.raw.includes('"total":128000'), 'the raw MCP tool payload is surfaced');
		assert.strictEqual(peek!.grid, undefined, 'no pretend CSV grid for an mcp source');
	});

	test('an authenticated api source resolves via the proxy and the secret VALUE never leaves the proxy', async () => {
		const service = createService([], { apiAuth: true });
		await service.loadDocument(APIAUTH);
		await service.refreshFromSources();

		const block = service.getDoc(APIAUTH)!.blocks.find(b => b.type === 'paragraph' && b.binds.length > 0)!;
		assert.ok(block.text.includes('[480,000](bind:metrics.arr)'), `authenticated api value resolved: ${block.text}`);
		// The renderer routed the fetch through the proxy, naming the secret - and carried NO secret value.
		assert.ok(lastProxyFetchBody, 'the renderer POSTed to the proxy /proxy/fetch route');
		const sent = JSON.parse(lastProxyFetchBody!) as { url: string; auth: string };
		assert.strictEqual(sent.url, 'https://crm.example.com/metrics', 'the clean URL (auth marker stripped) is sent');
		assert.strictEqual(sent.auth, 'crm-token', 'only the secret NAME is sent to the proxy');
		// The lock/source identity is the clean URL, not the ` auth=...` spec, so provenance stays clean.
		assert.strictEqual(service.getLock(APIAUTH)!.bindings['metrics.arr'].source, 'https://crm.example.com/metrics#arr');
	});

	test('editBlock edits non-bound prose and persists it, but ignores bound blocks', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);

		const watch = service.getDoc(WEEKLY)!.blocks.find(b => b.type === 'paragraph' && b.binds.length === 0)!;
		await service.editBlock(WEEKLY, watch.id, 'Edited prose.');
		assert.strictEqual(service.getDoc(WEEKLY)!.blocks.find(b => b.id === watch.id)!.text, 'Edited prose.', 'non-bound prose updated');
		assert.ok(service.getRawText(WEEKLY).includes('Edited prose.'), 'edit persisted to the Markdown source');

		const bound = service.getDoc(WEEKLY)!.blocks.find(b => b.binds.length > 0)!;
		const before = bound.text;
		await service.editBlock(WEEKLY, bound.id, 'Should be ignored.');
		assert.strictEqual(service.getDoc(WEEKLY)!.blocks.find(b => b.id === bound.id)!.text, before, 'bound block left unchanged');
	});

	test('listDocuments lists every Markdown document in the folder, flags living vs plain, and sorts by title', async () => {
		const service = createService([], { boardNote: true, api: true });

		const docs = await service.listDocuments();
		// All `.md` are listed now (the folder is the project), with an isLiving flag for the badge - plain
		// docs (Team Notes, the market-research reference note) included, generated `.export`/`.source` views excluded.
		assert.deepStrictEqual(
			docs.map(d => ({ title: d.title, isLiving: d.isLiving })),
			[
				{ title: 'Board Note', isLiving: true },
				{ title: 'Ecosystem Signal', isLiving: true },
				{ title: 'Market research', isLiving: false },
				{ title: 'Team Notes', isLiving: false },
				{ title: 'Weekly Operating Summary', isLiving: true },
			],
			'all .md listed with a living/plain flag, sorted by title',
		);
		assert.deepStrictEqual(docs.find(d => d.title === 'Ecosystem Signal')!.sourceKinds, ['api'], 'api source kind still surfaced for the chip');
	});

	// Plan 28, iter 1: a `*.template.md` is discovered by listTemplates but NEVER appears in listDocuments
	// (so it is absent from the Reports tree-rail and the Home documents grid), even though it stays on disk.
	test('listDocuments excludes *.template.md; listTemplates discovers it (parsed, from a subfolder)', async () => {
		const service = createService([], { template: true });

		const docs = await service.listDocuments();
		assert.ok(!docs.some(d => d.resource.path.endsWith('.template.md')), 'no template file in the documents list');
		assert.ok(!docs.some(d => d.title === 'Weekly report'), 'the template is not listed as a report');

		const templates = await service.listTemplates();
		assert.deepStrictEqual(
			templates.map(t => ({ name: t.name, description: t.description, sources: t.sources })),
			[{ name: 'Weekly report', description: 'A weekly operating summary bound to metrics.csv.', sources: ['metrics.csv'] }],
			'the template is discovered (from the templates/ subfolder), parsed via the shared frontmatter parser',
		);
		assert.ok(templates[0].body.includes('[pending](bind:metrics.mrr)'), 'the template body (bind links + slots) is carried for generation');
		assert.strictEqual(templates[0].uri.toString(), TEMPLATE.toString(), 'the template uri is the on-disk file');
	});

	test('listTemplates returns nothing when the folder ships no templates', async () => {
		const templates = await createService().listTemplates();
		assert.deepStrictEqual(templates, [], 'no templates -> empty list (the screen shows the calm empty state)');
	});

	// Plan 29, iter 1: the source registry folds every document's declared sources by identity. Two documents
	// binding the same CSV must produce ONE metrics.csv row whose fan-in lists both, each with its own keys.
	test('listSources folds a shared CSV into one row with the two-doc dependency fan-in; api source carries kind api', async () => {
		const service = createService([], { boardNote: true, api: true });

		const sources = await service.listSources();
		const metrics = sources.find(s => s.id === 'metrics.csv');
		assert.ok(metrics, 'the shared CSV is one registry row');
		assert.strictEqual(metrics!.kind, 'file', 'a sibling file is a file source');
		assert.strictEqual(metrics!.usedBy.length, 2, 'both documents that bind metrics.csv appear in the fan-in');
		const byTitle = new Map(metrics!.usedBy.map(u => [u.title, u.keys]));
		assert.deepStrictEqual(byTitle.get('Weekly Operating Summary'), ['metrics.mrr', 'metrics.mrr.delta', 'metrics.signups'], 'the Weekly summary keys are the bind keys it authors');
		assert.deepStrictEqual(byTitle.get('Board Note'), ['metrics.mrr', 'metrics.signups'], 'the Board note keys are its own bind keys');

		const api = sources.find(s => s.kind === 'api');
		assert.ok(api, 'an api source is projected with kind api');
		assert.strictEqual(api!.id, 'https://api.example.com/repo', 'the api source id is the frontmatter URL');
		assert.strictEqual(api!.label, 'api.example.com', 'the api source label is its host');
		assert.deepStrictEqual(api!.usedBy.map(u => u.title), ['Ecosystem Signal'], 'the api source fan-in is the one document that binds it');

		// A context (influence) source is registered too, with no bind keys.
		const market = sources.find(s => s.id === 'market-research.md');
		assert.ok(market && market.usedBy.every(u => u.context && u.keys.length === 0), 'a context source is registered as a keyless influence edge');
	});

	// Plan 29, iter 1: freshness + last-sync come from the lock. A loaded, synced document reports its source
	// fresh with a real syncedAt; editing the underlying CSV flips the same source stale in the registry.
	test('listSources reports real freshness + syncedAt from the lock and flips stale when the source changes', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);

		let metrics = (await service.listSources()).find(s => s.id === 'metrics.csv')!;
		assert.strictEqual(metrics.fresh, true, 'a just-synced source is fresh');
		assert.ok(metrics.syncedAt && !Number.isNaN(Date.parse(metrics.syncedAt)), 'syncedAt is a real timestamp from the lock');

		// Change the CSV under the document and recompute the always-on dirty bits.
		lastFiles!.set(URI.file('/ws/metrics.csv').toString(), METRICS_CSV + '\n25,Jun 26,52000,455,2.2,214');
		await service.checkSources(WEEKLY);

		metrics = (await service.listSources()).find(s => s.id === 'metrics.csv')!;
		assert.strictEqual(metrics.fresh, false, 'the registry flips the source stale when its value changes');
	});

	test('listSources returns an empty list for a project with no bound documents', async () => {
		// Only the plain README is a document here (no sources/context/binds) -> the honest empty registry.
		const service = createService();
		const sources = await service.listSources();
		assert.deepStrictEqual(sources.map(s => s.id), ['market-research.md', 'metrics.csv'], 'the sample Weekly summary contributes its two sources');
		const empty = await createService([], { noFolder: true }).listSources();
		assert.deepStrictEqual(empty, [], 'no folder -> the honest empty state');
	});

	test('createTemplate writes an untitled.template.md seeded with a commented example and opens it', async () => {
		const opened: IOpenedEditor[] = [];
		const service = createService(opened);
		const uri = await service.createTemplate();
		assert.ok(uri && uri.path.endsWith('untitled.template.md'), 'a new untitled.template.md is created');
		const raw = lastFiles!.get(uri!.toString()) ?? '';
		assert.ok(/^---\r?\ntemplate: true/.test(raw), 'seeded with template: true frontmatter');
		assert.ok(/\{\{slot:/.test(raw) && /\(bind:/.test(raw), 'seeded with a slot and a bind link example');
		assert.ok(parseLivingDoc(raw).isTemplate, 'the seed parses back as a template');
		assert.deepStrictEqual(opened[opened.length - 1]?.resource?.toString(), uri!.toString(), 'the new template is opened in the editor');
		// A second create does not collide with the first.
		const uri2 = await service.createTemplate();
		assert.ok(uri2 && uri2.toString() !== uri!.toString(), 'a second createTemplate picks a non-colliding name');
	});

	// Plan 28, iter 3: generate a draft from a template. With a model reachable the prose arrives as
	// insertion proposals through the EXISTING chat path (review engine), the skeleton is born bound to the
	// template's source, and the frontmatter records `template:` provenance. No new approve/apply path.
	test('generateFromTemplate writes a bound skeleton with provenance and drafts through the review engine', async () => {
		const opened: IOpenedEditor[] = [];
		const service = createService(opened, {
			template: true,
			model: modelMessage({ reply: 'Drafted your weekly report.', edits: [], inserts: [{ afterHeading: 'Commentary', newText: 'MRR grew steadily this week.', rationale: 'From the metrics.' }] }),
		});

		const uri = await service.generateFromTemplate(TEMPLATE, 'Week 24 report', 'Focus on churn.');
		assert.ok(uri && uri.path.endsWith('Week 24 report.md'), 'a titled document is created from the doc name');

		// The skeleton on disk: provenance + declared source, the H1 named after the document, the bind link
		// copied verbatim (born bound), and no slots left behind.
		const raw = lastFiles!.get(uri!.toString()) ?? '';
		const doc = parseLivingDoc(raw);
		assert.strictEqual(doc.fromTemplate, 'Weekly report', 'template provenance recorded (History reads "Created from Weekly report template")');
		assert.deepStrictEqual(doc.sources, ['metrics.csv'], 'the template source is carried so the copied binds resolve');
		assert.ok(raw.includes('# Week 24 report'), 'the H1 is the document name');
		assert.ok(raw.includes('[pending](bind:metrics.mrr)'), 'the bind link is copied through verbatim');
		assert.ok(!/\{\{/.test(raw), 'no slots survive into the generated document');

		// The prose arrived as a reviewable insertion proposal (not written directly): it is in the pending set.
		const pending = service.getPendingForDoc(uri!);
		assert.strictEqual(pending.length, 1, 'the model draft landed as one insertion proposal in the review rail');
		assert.strictEqual(pending[0].newText, 'MRR grew steadily this week.', 'the proposal carries the generated prose');
		assert.strictEqual(pending[0].oldText, '', 'an insertion has no old text (all-additions inline diff)');

		// The composed brief was actually sent to the model (the existing chat path, not a bespoke one).
		assert.ok(lastModelCalls >= 1 && (lastModelBody ?? '').includes('Generate the first draft of'), 'the composed template brief drove the model call');
		assert.deepStrictEqual(opened[opened.length - 1]?.resource?.toString(), uri!.toString(), 'the generated document is opened in the editor');
	});

	// The honest no-model state (plan 28, iter 3): the skeleton is still created and bound, but no prose is
	// fabricated - the status explains the draft needs the model, and nothing is queued.
	test('generateFromTemplate with no model still writes the bound skeleton and explains the draft needs a model', async () => {
		const service = createService([], { template: true }); // no opts.model -> /healthz unhealthy
		const uri = await service.generateFromTemplate(TEMPLATE, 'Week 24 report', '');
		assert.ok(uri, 'the skeleton is created even without a model');
		const raw = lastFiles!.get(uri!.toString()) ?? '';
		assert.ok(raw.includes('[pending](bind:metrics.mrr)') && raw.includes('# Week 24 report'), 'the bound skeleton is on disk');
		assert.strictEqual(service.getPendingForDoc(uri!).length, 0, 'no fabricated prose is queued without a model');
		assert.ok(/model/i.test(service.getStatus(uri!)), `the status explains the draft needs the model: ${service.getStatus(uri!)}`);
	});

	// Plan 28, iter 4: a named blank create is born titled; an empty name keeps decision 56's Untitled path.
	test('createDocument(name) writes a titled <name>.md; an empty name keeps the Untitled escape hatch', async () => {
		const service = createService();
		const named = await service.createDocument('Quarterly plan');
		assert.ok(named && named.path.endsWith('Quarterly plan.md'), 'a provided name is born titled');
		const blank = await service.createDocument();
		assert.ok(blank && blank.path.endsWith('Untitled.md'), 'no name keeps the Untitled name-on-first-save path');
	});

	test('getWorkspaceFolderName returns the open folder name, or undefined when no folder is open', async () => {
		assert.strictEqual(createService().getWorkspaceFolderName(), 'ws', 'reports the open folder name');
		assert.strictEqual(createService([], { noFolder: true }).getWorkspaceFolderName(), undefined, 'undefined when no folder is open');
	});

	test('openFolder opens the picked folder in the same window; cancelling opens nothing', async () => {
		const picked = URI.file('/picked-folder');
		const service = createService([], { pickFolder: picked });
		await service.openFolder();
		assert.deepStrictEqual(lastOpenedFolder?.toString(), picked.toString(), 'the picked folder is opened as the workspace');

		const cancelled = createService(); // no pickFolder -> the picker returns nothing
		await cancelled.openFolder();
		assert.strictEqual(lastOpenedFolder, undefined, 'cancelling the picker opens no window');
	});

	test('addSource adds a source to the doc frontmatter (no prose touched), persists to disk, and resolves it', async () => {
		const service = createService();
		lastFiles!.set(URI.file('/ws/forecast.csv').toString(), 'week,arr\n24,500000\n');
		await service.loadDocument(WEEKLY);

		await service.addSource(WEEKLY, 'forecast.csv');

		assert.ok(service.getDoc(WEEKLY)!.sources.includes('forecast.csv'), 'source added to the in-memory doc');
		const onDisk = lastFiles!.get(WEEKLY.toString()) ?? '';
		assert.ok(/sources:[\s\S]*forecast\.csv/.test(onDisk), `persisted into the frontmatter on disk: ${onDisk.slice(0, 80)}`);
		assert.ok(onDisk.includes('Growth remained steady this week.'), 'prose left untouched');
	});

	test('removeSource drops a source from the doc frontmatter and persists', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);

		await service.removeSource(WEEKLY, 'metrics.csv');

		assert.deepStrictEqual(service.getDoc(WEEKLY)!.sources, [], 'source removed from the in-memory doc');
		assert.ok(!(lastFiles!.get(WEEKLY.toString()) ?? '').includes('metrics.csv'), 'removed from the on-disk frontmatter');
	});

	test('getSourceCandidates lists the folder data files not already bound (excludes lock sidecars + the bound source)', async () => {
		const service = createService();
		lastFiles!.set(URI.file('/ws/forecast.csv').toString(), 'week,arr\n');
		lastFiles!.set(URI.file('/ws/crm.json').toString(), '{}');
		await service.loadDocument(WEEKLY); // bootstraps Weekly Summary.lock.json, which must NOT be offered

		const candidates = await service.getSourceCandidates(WEEKLY);
		assert.deepStrictEqual([...candidates].sort(), ['crm.json', 'forecast.csv'], 'folder csv/json minus the bound metrics.csv and the lock sidecar');
	});

	test('exportMarkdown writes a clean static .md with resolved values and no bind syntax', async () => {
		const opened: IOpenedEditor[] = [];
		const service = createService(opened);
		await service.loadDocument(WEEKLY);
		await service.refreshFromSources();

		const target = await service.exportMarkdown(WEEKLY);
		assert.ok(target && target.path.endsWith('Weekly Summary.export.md'), `target name: ${target?.path}`);
		const md = lastFiles!.get(target!.toString()) ?? '';
		assert.ok(md.startsWith('# Weekly Operating Summary'), 'starts with the H1 title');
		assert.ok(md.includes('$48.6k') && md.includes('427'), 'resolved values inlined');
		assert.ok(!md.includes('bind:') && !md.includes(']('), 'no bind-link syntax in the export');
	});

	function manualAgent(policy: AgentPolicy): IAgentDef {
		return { id: 'agent', name: 'Agent', trigger: { kind: 'manual' }, flow: { sources: [], docs: [WEEKLY.toString()] }, policy, status: 'idle' };
	}

	test('policy auto-figures applies the figure silently and audits it, with nothing queued', async () => {
		const service = createService([], { agents: [manualAgent('auto-figures')] });
		await service.loadDocument(WEEKLY);

		await service.runAgent('agent');

		const highlights = blockText(service, WEEKLY, 'h-highlights');
		assert.ok(highlights.includes('[$48.6k](bind:metrics.mrr)'), `figure auto-applied to the doc: ${highlights}`);
		assert.strictEqual(service.getPendingForDoc(WEEKLY).length, 0, 'nothing queued for review');
		assert.ok(service.getAudit().some(e => e.action === 'auto-applied'), 'auto-apply audited in the lock');
	});

	test('policy ask-before-apply queues a pending figure change and leaves the doc untouched', async () => {
		const service = createService([], { agents: [manualAgent('ask-before-apply')] });
		await service.loadDocument(WEEKLY);

		await service.runAgent('agent');

		assert.ok(blockText(service, WEEKLY, 'h-highlights').includes('[$41.2k](bind:metrics.mrr)'), 'doc cache untouched');
		const pending = service.getPendingForDoc(WEEKLY);
		assert.deepStrictEqual({ count: pending.length, kind: pending[0]?.kind, draft: !!pending[0]?.draft }, { count: 1, kind: 'figure', draft: false });
	});

	test('policy draft-only prepares a draft in the rail and never lands it', async () => {
		const service = createService([], { agents: [manualAgent('draft-only')] });
		await service.loadDocument(WEEKLY);

		await service.runAgent('agent');

		assert.ok(blockText(service, WEEKLY, 'h-highlights').includes('[$41.2k](bind:metrics.mrr)'), 'doc untouched by a draft-only run');
		const pending = service.getPendingForDoc(WEEKLY);
		assert.deepStrictEqual({ count: pending.length, draft: !!pending[0]?.draft }, { count: 1, draft: true });
	});

	test('the verify gate blocks a run whose figures do not reconcile (Financial flag), applying nothing', async () => {
		const agent: IAgentDef = { id: 'agent', name: 'Agent', trigger: { kind: 'manual' }, flow: { sources: [], docs: [BADBIND.toString()] }, policy: 'auto-figures', status: 'idle' };
		const service = createService([], { badBind: true, agents: [agent] });
		await service.loadDocument(BADBIND);

		await service.runAgent('agent');

		const ratio = service.getDoc(BADBIND)!.blocks.find(b => b.type === 'paragraph' && b.binds.length > 0)!;
		assert.ok(ratio.text.includes('[$41.2k](bind:metrics.mrr)'), 'no figure applied - the run was blocked at the gate');
		assert.strictEqual(service.getAgents().find(a => a.id === 'agent')!.status, 'blocked', 'agent surfaces the blocked state');
		assert.strictEqual(service.getPendingForDoc(BADBIND).length, 0, 'nothing queued either');
	});

	test('a clean run passes the verify gate and lands the figure', async () => {
		const service = createService([], { agents: [manualAgent('auto-figures')] });
		await service.loadDocument(WEEKLY);

		await service.runAgent('agent');

		assert.ok(blockText(service, WEEKLY, 'h-highlights').includes('[$48.6k](bind:metrics.mrr)'), 'clean figures land');
		assert.strictEqual(service.getAgents().find(a => a.id === 'agent')!.status, 'idle', 'agent is not blocked');
	});

	test('before-export gate blocks export when the document figures do not reconcile', async () => {
		const service = createService([], { badBind: true });
		await service.loadDocument(BADBIND);

		const target = await service.exportMarkdown(BADBIND);

		assert.strictEqual(target, undefined, 'export blocked at the gate');
		assert.strictEqual(lastFiles!.get(URI.file('/ws/Ratio Doc.export.md').toString()), undefined, 'no export file written');
	});

	test('on-publish writes a pin snapshotting the current source versions', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);

		await service.publishDocument(WEEKLY);

		const pins = service.getLock(WEEKLY)!.pins;
		assert.ok(pins.some(p => p.source === 'metrics.csv' && !!p.version), `pinned to the source version: ${JSON.stringify(pins)}`);
	});

	test('on-open freshness shows a changed source as stale without a manual refresh', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);
		assert.strictEqual(service.getFreshness(WEEKLY).dirty, false, 'current on first open');

		// A source moves on while the doc is closed; re-opening must surface the staleness.
		lastFiles!.set(URI.file('/ws/metrics.csv').toString(), METRICS_CSV + '\n25,Jun 26,52000,470,2.2,210');
		await service.loadDocument(WEEKLY);

		assert.ok(service.getFreshness(WEEKLY).dirty, 'on-open recompute flags the changed source');
	});

	test('getSourcePeek returns in-surface source data (no side editor): bound keys, selected cells, referencing docs', async () => {
		const opened: IOpenedEditor[] = [];
		const service = createService(opened, { boardNote: true });
		await service.loadDocument(WEEKLY);
		await service.loadDocument(BOARD); // a second living doc that shares metrics.csv
		opened.length = 0;

		const peek = service.getSourcePeek(WEEKLY, ['metrics.mrr']);

		assert.ok(peek, 'returns in-surface peek data for a living doc');
		const projection = {
			openedEditors: opened.length, // the abrasion: source-peek must NOT open a 2nd editor group
			source: peek!.source,
			selectedKeys: peek!.rows.filter(r => r.selected).map(r => r.key),
			hasOtherBoundKeys: peek!.rows.some(r => !r.selected),
			referencesBoard: peek!.referencedBy.includes('Board Note'),
		};
		assert.deepStrictEqual(projection, {
			openedEditors: 0,
			source: 'metrics.csv',
			selectedKeys: ['metrics.mrr'],
			hasOtherBoundKeys: true,
			referencesBoard: true,
		});
	});

	// --- snapshots / versions (plan 26 iter 2: the trust spine) -------------------

	// One chat reply that queues an edit + an insert, so a bulk approve has two real changes to land.
	function chatEditAndInsert(): object {
		return modelMessage({
			reply: 'Edited and added.',
			edits: [{ heading: 'Commentary', oldText: 'Growth remained steady this week.', newText: 'Growth accelerated this week.', rationale: 'r' }],
			inserts: [{ afterHeading: 'Commentary', newText: 'A new closing note.', rationale: 'r' }],
		});
	}

	test('refreshFromSources creates one snapshot labelled "Before refresh" when figures change', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);
		const bodyBeforeRefresh = service.getRawText(WEEKLY);
		lastFiles!.set(URI.file('/ws/metrics.csv').toString(), METRICS_CSV + '\n25,Jun 26,52000,470,2.2,210');

		await service.refreshFromSources();

		const snapshots = service.getSnapshots(WEEKLY);
		assert.deepStrictEqual(
			{ count: snapshots.length, label: snapshots[0]?.label, via: snapshots[0]?.via, body: snapshots[0]?.body },
			{ count: 1, label: 'Before refresh', via: 'refresh', body: bodyBeforeRefresh },
		);
	});

	test('a bulk approve creates one snapshot labelled "Before bulk approve" (via: bulk-approve)', async () => {
		const service = createService([], { model: chatEditAndInsert() });
		await service.loadDocument(WEEKLY);
		await service.sendChatMessage(WEEKLY, 'Tighten the commentary and add a note');
		assert.strictEqual(service.getPendingForDoc(WEEKLY).length, 2, 'two changes queued');
		const bodyBeforeApprove = service.getRawText(WEEKLY);

		await service.approveAll(WEEKLY.toString());

		const snapshots = service.getSnapshots(WEEKLY);
		assert.deepStrictEqual(
			{ count: snapshots.length, label: snapshots[0]?.label, via: snapshots[0]?.via, body: snapshots[0]?.body },
			{ count: 1, label: 'Before bulk approve', via: 'bulk-approve', body: bodyBeforeApprove },
		);
	});

	test('snapshots cap at 50 with oldest-eviction, keeping the newest', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);
		for (let i = 0; i < 55; i++) {
			await service.saveSnapshot(WEEKLY, `Version ${i}`, 'manual');
		}

		const snapshots = service.getSnapshots(WEEKLY); // newest first
		assert.deepStrictEqual(
			{ count: snapshots.length, newest: snapshots[0].label, oldestKept: snapshots[snapshots.length - 1].label },
			{ count: 50, newest: 'Version 54', oldestKept: 'Version 5' },
		);
	});

	test('restoreSnapshot writes the body back, audits it (via: restore), and re-flags stale bindings', async () => {
		const service = createService();
		await service.loadDocument(WEEKLY);
		const originalBody = service.getRawText(WEEKLY); // week-23 authored figures

		// Version the original, then refresh so the on-disk body moves to the current source values and
		// the lock's binding hashes catch up (freshness clears).
		await service.saveSnapshot(WEEKLY, 'Original', 'manual');
		await service.refreshFromSources();
		assert.notStrictEqual(service.getRawText(WEEKLY), originalBody, 'the body moved on after refresh');
		assert.deepStrictEqual(service.getFreshness(WEEKLY).staleBindings, [], 'freshness clear after refresh');

		// The source moves on again (a new week). Nothing has re-synced the lock, so restoring the older
		// version and recomputing freshness must surface the bindings as stale again (correct + visible).
		lastFiles!.set(URI.file('/ws/metrics.csv').toString(), METRICS_CSV + '\n25,Jun 26,52000,510,2.1,220');

		const original = service.getSnapshots(WEEKLY).find(s => s.label === 'Original')!;
		await service.restoreSnapshot(WEEKLY, original.id);

		const lock = service.getLock(WEEKLY)!;
		const restoreEntry = lock.audit.find(e => e.via === 'restore');
		assert.deepStrictEqual(
			{
				body: service.getRawText(WEEKLY),
				pending: service.getPendingForDoc(WEEKLY).length,
				auditVia: restoreEntry?.via,
				auditAction: restoreEntry?.action,
				staleReflagged: service.getFreshness(WEEKLY).staleBindings.length > 0,
			},
			{ body: originalBody, pending: 0, auditVia: 'restore', auditAction: 'approved', staleReflagged: true },
		);
	});

	test('restoreSnapshot rejects pending changes for the document first', async () => {
		const service = createService([], { model: chatEditAndInsert() });
		await service.loadDocument(WEEKLY);
		// Version the original, then refresh so the current body differs from that version (so restoring
		// it is a real body change, not a no-op).
		await service.saveSnapshot(WEEKLY, 'Original', 'manual');
		await service.refreshFromSources();
		// Queue changes WITHOUT approving them, then restore: the pending set must be rejected first.
		await service.sendChatMessage(WEEKLY, 'Tighten the commentary and add a note');
		assert.ok(service.getPendingForDoc(WEEKLY).length > 0, 'changes are pending before restore');

		const original = service.getSnapshots(WEEKLY).find(s => s.label === 'Original')!;
		await service.restoreSnapshot(WEEKLY, original.id);

		assert.strictEqual(service.getPendingForDoc(WEEKLY).length, 0, 'pending changes were rejected by the restore');
	});
});
