/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The forward-migration matrix: an older build seeds a profile, the current
 * build inherits it.
 *
 * This is the scenario the whole live-compat apparatus exists for. The
 * same-build restart baseline established that each checkpoint round-trips its
 * *own* profile; that result is what makes a failure here attributable. If a
 * build can reopen what it wrote, but the current build cannot reopen what that
 * build wrote, the difference is a forward-migration defect and nothing else.
 *
 * Shape of a run, all of it over AHP against real forked server processes:
 *
 * ```text
 *   phase 1 — source build           phase 2 — current build      phase 3 — current build
 *   (legacy | predecessor |          (same home + user-data)      (same home + user-data)
 *    intermediate)
 *   initialize                       initialize                   initialize
 *   list (empty)                     list  ─┐                     list  ─┐
 *   create session(s) + cwd          subscribe ├ restored          subscribe ├ identical
 *   rename session(s)                assert  ─┘                    assert  ─┘
 *   stop cleanly                                                  (idempotent)
 * ```
 *
 * Four properties are load-bearing, and each is a rule rather than an
 * implementation detail:
 *
 * - **One profile, three launches.** The home, user-data and workspace
 *   directories are created once and handed unchanged to every phase. The
 *   inheritance *is* the subject; a fresh profile in phase 2 would make every
 *   assertion vacuous.
 * - **Clean handover.** The source build is stopped and awaited before the
 *   current build is launched, so phase 2 reads a profile that was closed
 *   rather than one still being written.
 * - **External only.** Nothing here reads the host database, imports host
 *   internals, or inspects logs for assertions. Every claim is a readback over
 *   AHP, which is the only surface a real client has.
 * - **Contract differences come from the wire.** The source builds negotiate
 *   older protocol versions (0.8 and 1.0 are both in the matrix today) and may
 *   not carry every field. Those differences are resolved through the
 *   capability adapter and through what the *source build itself was observed
 *   to report* — never from the checkpoint id. A field the source never
 *   reported is not asserted after migration, because its absence would be a
 *   property of the seed, not of the migration. Where a field turns out to be
 *   unstable for reasons unrelated to migration, it is recorded as an explicit
 *   skip with evidence (see {@link WORKING_DIRECTORY_SKIP_REASON}) rather than
 *   asserted or quietly dropped.
 *
 * The scenario runs against the scripted mock provider and never contacts a
 * model: the subject is the host's own persistence and migration, so a
 * provider that needs replay fixtures recorded per checkpoint would only add a
 * second, unrelated way to fail.
 */

import { mkdirSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { timeout } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { LiveCompatAhpClient } from './agentHostLiveCompatClient.js';
import type { IPreparedAgentHostBuild } from '../harness/crossVersionAgentHostTarget.js';
import {
	createAgentHostCapabilityAdapter,
	LIVE_COMPAT_OFFERED_PROTOCOL_VERSIONS,
	type IAgentHostCapabilityAdapter,
} from './agentHostLiveCompatCapabilities.js';
import { startLiveCompatServer, stopLiveCompatServer, type ILiveCompatLaunchOptions, type ILiveCompatServerHandle } from './agentHostLiveCompatServer.js';
import type {
	AgentProviderCapabilities,
	ILiveCompatInitializeResult,
	ILiveCompatSessionList,
	ILiveCompatSessionListItem,
	ILiveCompatSubscribeResult,
} from './agentHostLiveCompatProtocol.js';
import type { ILiveCompatScenarioResult, ILiveCompatStepResult } from './sameBuildRestartBaseline.js';

/** Root channel URI. A constant of the protocol, stable across every build. */
const ROOT_CHANNEL = 'ahp-root://';
/** Provider the matrix drives; see the file header for why it is the mock. */
const PROVIDER = 'mock';
const PER_CALL_TIMEOUT_MS = 30_000;

/**
 * A restored session is not necessarily describable the instant the host is
 * accepting connections: the provider is re-registered and the catalogue
 * re-read concurrently with the socket opening. Retrying is part of the
 * contract a client implements, not a workaround — but the budget is bounded
 * so a genuinely lost session still fails.
 */
const RESTORE_ATTEMPTS = 20;
const RESTORE_RETRY_DELAY_MS = 500;

/**
 * Time allowed for the seed's catalogue writes to reach disk before the source
 * build is stopped.
 *
 * The host exposes no durability acknowledgment for the catalogue write, and
 * does not await it during shutdown, so a bounded settle window is currently
 * the only way to distinguish "the migration lost it" from "it was never
 * written". Making this unnecessary is a host-side change (an observable
 * durability ack), not a scenario change.
 */
const SEED_SETTLE_MS = 1_000;

/**
 * Extra narrowing of the wire shapes, on top of the shared protocol module.
 *
 * `workingDirectories` is asserted only by this matrix — the restart baseline
 * has no reason to look at it — so it is declared here rather than widened in
 * the shared module. Widening that module is a statement that *every* scenario
 * depends on the field; this is the narrower, truer statement.
 */
interface IForwardMigrationSessionItem extends ILiveCompatSessionListItem {
	readonly workingDirectories?: readonly string[];
}

interface IForwardMigrationSessionList extends ILiveCompatSessionList {
	readonly items?: readonly IForwardMigrationSessionItem[];
}

interface IForwardMigrationChannelState {
	readonly title?: string;
	readonly workingDirectories?: readonly string[];
}

interface IForwardMigrationSubscribeResult extends ILiveCompatSubscribeResult {
	readonly snapshot?: { readonly state?: IForwardMigrationChannelState };
}

/**
 * Why working directories are seeded but not asserted after the handover.
 *
 * A session is created here *with* a working directory, and the source build
 * reports it back — so the seed is real. But the scripted mock provider only
 * ever reports `workingDirectories` from its creation path; its re-description
 * paths (`listSessions`, `getSessionMetadata`) omit the field entirely. Once a
 * restarted host re-describes a session from the provider, the field is
 * therefore absent at the source, and the host's catalogue follows.
 *
 * This was measured rather than assumed. Running this same scenario with the
 * working tree as *both* source and target — an upgrade that migrates nothing —
 * reproduces it exactly: the first reopen still carries the directories, and
 * the second, after the provider has re-described the session, does not. A
 * defect that reproduces with migration removed is not a migration defect.
 *
 * So asserting on it here would report a property of the reference provider as
 * a forward-compatibility failure on every pair in the matrix, which is worse
 * than not covering it: it would make the matrix loud and wrong. The step is
 * recorded as an explicit skip carrying this reason instead, keeping the
 * coverage honest rather than silently narrower than it looks. Closing it needs
 * a provider that re-describes working directories (a change to shared
 * `mockAgent.ts`, out of scope here) or a bundled provider, not a change to
 * this scenario.
 */
const WORKING_DIRECTORY_SKIP_REASON =
	'the mock provider reports workingDirectories only on creation, never on re-description; '
	+ 'reproduced with current->current, so it is a provider limitation rather than a migration defect';

/**
 * What phase 1 durably established about one session, as *observed over AHP
 * from the source build itself*.
 *
 * Recording the observation rather than the intent is what keeps the matrix
 * honest across contract evolution. If a source build never reported a title,
 * phase 2 does not assert one: the absence would say something about the seed,
 * not about the migration under test.
 */
interface ISeededSession {
	readonly resource: string;
	/** Title the source build reported back, if it reported one at all. */
	readonly title: string | undefined;
	/**
	 * Working directories the source build reported back, if any. Recorded for
	 * the diagnostics record only; see {@link WORKING_DIRECTORY_SKIP_REASON}.
	 */
	readonly workingDirectories: readonly string[] | undefined;
}

export interface IForwardMigrationOptions {
	/** Root under which the per-scenario diagnostics directory is created. */
	readonly diagnosticsRoot?: string;
	/** Extra environment for every launch. */
	readonly env?: Readonly<Record<string, string>>;
	/**
	 * How many sessions to seed. One is the canonical case; a multi-session run
	 * additionally exercises that migration preserves a *set* rather than
	 * merely a single row, and that identities are not conflated.
	 */
	readonly sessionCount?: number;
	/** Distinguishes result rows when a pair is run at several session counts. */
	readonly scenarioSuffix?: string;
}

/** Aggregate outcome of one forward-migration run. */
export interface IForwardMigrationSummary {
	readonly suite: string;
	readonly startedAt: string;
	readonly durationMs: number;
	readonly outcome: 'passed' | 'failed';
	readonly results: readonly ILiveCompatScenarioResult[];
}

/** Records step outcomes and their durations in performance order. */
class StepRecorder {
	private readonly _steps: ILiveCompatStepResult[] = [];

	get steps(): readonly ILiveCompatStepResult[] {
		return this._steps;
	}

	async run<T>(name: string, body: () => Promise<T>): Promise<T> {
		const startedAt = Date.now();
		try {
			const result = await body();
			this._steps.push({ name, outcome: 'passed', durationMs: Date.now() - startedAt });
			return result;
		} catch (error) {
			this._steps.push({ name, outcome: 'failed', durationMs: Date.now() - startedAt, detail: messageOf(error) });
			throw error;
		}
	}

	skip(name: string, reason: string): void {
		this._steps.push({ name, outcome: 'skipped', durationMs: 0, detail: reason });
	}
}

/**
 * Run one forward-migration scenario: `source` seeds a profile, `target`
 * inherits it, and `target` is then restarted to show the result is stable.
 *
 * Never throws for a scenario failure. A failed pair is data the caller needs
 * alongside the pairs that passed, so the failure is reported in the returned
 * result; only a defect in the runner itself propagates.
 */
export async function runForwardMigrationScenario(
	source: IPreparedAgentHostBuild,
	target: IPreparedAgentHostBuild,
	options: IForwardMigrationOptions = {},
): Promise<ILiveCompatScenarioResult> {
	const sessionCount = options.sessionCount ?? 1;
	const scenario = `forward-migration${options.scenarioSuffix ? `/${options.scenarioSuffix}` : ''}`;
	const startedAt = Date.now();
	const diagnosticsPath = mkdtempSync(join(options.diagnosticsRoot ?? tmpdir(), `agent-host-forward-${source.id}-to-${target.id}-`));
	const dirs = createSharedProfile(diagnosticsPath);
	const recorder = new StepRecorder();
	let server: ILiveCompatServerHandle | undefined;
	let client: LiveCompatAhpClient | undefined;
	/** The negotiated version of the *target*: the build the claim is about. */
	let protocolVersion: string | undefined;

	const launchOn = (build: IPreparedAgentHostBuild, env?: Readonly<Record<string, string>>): ILiveCompatLaunchOptions => ({
		serverEntry: build.serverEntry,
		homeDir: dirs.homeDir,
		userDataDir: dirs.userDataDir,
		env: { ...options.env, ...env },
	});

	try {
		// ── phase 1: the source build seeds the profile ──────────────────────
		server = await recorder.run('launch-source', () => startLiveCompatServer(launchOn(source)));
		client = await connect(server);

		const sourceAdapter = await recorder.run('initialize-source', async () => {
			const initialize = await client!.call<ILiveCompatInitializeResult>('initialize', {
				channel: ROOT_CHANNEL,
				protocolVersions: [...LIVE_COMPAT_OFFERED_PROTOCOL_VERSIONS],
				clientId: `forward-${source.id}-seed`,
			}, PER_CALL_TIMEOUT_MS);
			return createAgentHostCapabilityAdapter({
				protocolVersion: initialize.protocolVersion,
				providerCapabilities: await readProviderCapabilities(client!),
			});
		});

		await recorder.run('list-empty-source', async () => {
			const listed = await client!.call<IForwardMigrationSessionList>('listSessions', { channel: ROOT_CHANNEL }, PER_CALL_TIMEOUT_MS);
			assertEqual(listed.items?.length ?? 0, 0, 'a fresh profile must list no sessions');
		});

		const seeded = await seedSessions(recorder, client, sourceAdapter, source, dirs.workspaceDir, sessionCount);

		await recorder.run('stop-source', async () => {
			client!.close();
			client = undefined;
			await stopLiveCompatServer(server);
			server = undefined;
		});

		// ── phase 2: the target build inherits the profile ───────────────────
		// The mock provider keeps its session index in memory, so the new
		// process is told which sessions the *provider* side already knows
		// about — mirroring what a real provider recovers from its own on-disk
		// state. The host's persistence, which is what is under test, is not
		// seeded and must be reconstructed from the retained user-data
		// directory alone.
		const mockSeed = { VSCODE_AGENT_HOST_MOCK_SEED_SESSIONS: seeded.map(session => session.resource).join(',') };

		protocolVersion = await recorder.run('launch-target', async () => {
			server = await startLiveCompatServer(launchOn(target, mockSeed));
			client = await connect(server);
			const initialize = await client.call<ILiveCompatInitializeResult>('initialize', {
				channel: ROOT_CHANNEL,
				protocolVersions: [...LIVE_COMPAT_OFFERED_PROTOCOL_VERSIONS],
				clientId: `forward-${source.id}-to-${target.id}-verify`,
			}, PER_CALL_TIMEOUT_MS);
			return initialize.protocolVersion;
		});

		const migrated = await recorder.run('list-migrated', () => assertListMatchesSeed(client!, seeded));
		await recorder.run('subscribe-migrated', () => assertSubscribeMatchesSeed(client!, seeded));
		recorder.skip('working-directories-preserved', WORKING_DIRECTORY_SKIP_REASON);

		// ── phase 3: the same target build, restarted ────────────────────────
		// Migration must be a fixed point. A run that converts on first open
		// but keeps converting — or worse, converges to something different —
		// would pass phase 2 and still be broken in the only way users meet it:
		// the second launch.
		await recorder.run('restart-target', async () => {
			client!.close();
			client = undefined;
			await stopLiveCompatServer(server);
			server = undefined;
			server = await startLiveCompatServer(launchOn(target, mockSeed));
			client = await connect(server);
			await client.call<ILiveCompatInitializeResult>('initialize', {
				channel: ROOT_CHANNEL,
				protocolVersions: [...LIVE_COMPAT_OFFERED_PROTOCOL_VERSIONS],
				clientId: `forward-${source.id}-to-${target.id}-idempotent`,
			}, PER_CALL_TIMEOUT_MS);
		});

		await recorder.run('list-idempotent', async () => {
			const again = await assertListMatchesSeed(client!, seeded);
			// Compared against phase 2's readback rather than against the seed
			// alone: that is what makes this an idempotence claim instead of a
			// second, weaker restore claim.
			assertEqual(
				JSON.stringify(again),
				JSON.stringify(migrated),
				'a second launch of the migrated profile must produce an identical listing',
			);
		});
		await recorder.run('subscribe-idempotent', () => assertSubscribeMatchesSeed(client!, seeded));

		return result(scenario, source, target, recorder, diagnosticsPath, startedAt, protocolVersion, undefined);
	} catch (error) {
		return result(scenario, source, target, recorder, diagnosticsPath, startedAt, protocolVersion, messageOf(error));
	} finally {
		client?.close();
		await stopLiveCompatServer(server).catch(() => undefined);
	}
}

/**
 * Run the forward-migration matrix: every requested source build, upgraded to
 * the same target, in order.
 *
 * Builds run sequentially. Each scenario forks two real Agent Hosts from
 * different compiled trees sharing this machine's temp space; serializing keeps
 * a failure attributable to one pair rather than to contention between them.
 */
export async function runForwardMigrationMatrix(
	pairs: readonly { readonly source: IPreparedAgentHostBuild; readonly target: IPreparedAgentHostBuild; readonly options?: IForwardMigrationOptions }[],
): Promise<IForwardMigrationSummary> {
	const startedAt = Date.now();
	const results: ILiveCompatScenarioResult[] = [];
	for (const pair of pairs) {
		results.push(await runForwardMigrationScenario(pair.source, pair.target, pair.options));
	}
	return {
		suite: 'agent-host-live-compat/forward-migration',
		startedAt: new Date(startedAt).toISOString(),
		durationMs: Date.now() - startedAt,
		outcome: results.every(entry => entry.outcome === 'passed') ? 'passed' : 'failed',
		results,
	};
}

/**
 * Create sessions on the source build and record what that build reports back.
 *
 * The readback is the point. Everything phase 2 asserts is drawn from what the
 * source build itself was seen to hold, so the matrix tests migration rather
 * than the union of migration and whatever the seeding build happened to
 * support.
 */
async function seedSessions(
	recorder: StepRecorder,
	client: LiveCompatAhpClient | undefined,
	adapter: IAgentHostCapabilityAdapter,
	source: IPreparedAgentHostBuild,
	workspaceDir: string,
	sessionCount: number,
): Promise<readonly ISeededSession[]> {
	const created = await recorder.run('create-sessions', async () => {
		const uris: string[] = [];
		for (let index = 0; index < sessionCount; index++) {
			const uri = `${PROVIDER}:/forward-${source.id}-${Date.now()}-${index}`;
			await client!.call('createSession', {
				channel: uri,
				provider: PROVIDER,
				workingDirectories: [uriForDirectory(workspaceDir)],
			}, PER_CALL_TIMEOUT_MS);
			await client!.call<IForwardMigrationSubscribeResult>('subscribe', { channel: uri }, PER_CALL_TIMEOUT_MS);
			uris.push(uri);
		}
		return uris;
	});

	if (!adapter.supportsSessionRename) {
		recorder.skip('rename-sessions', `negotiated protocol ${adapter.protocolVersion} predates client-dispatchable session/titleChanged`);
	} else {
		await recorder.run('rename-sessions', async () => {
			for (const [index, uri] of created.entries()) {
				// `dispatchAction` is a write-ahead notification, so the
				// readback below is what confirms the host accepted it.
				client!.notify('dispatchAction', {
					channel: uri,
					clientSeq: index + 1,
					action: { type: 'session/titleChanged', title: titleFor(source, index) },
				});
			}
			for (const [index, uri] of created.entries()) {
				const state = await pollForTitle(client!, uri, titleFor(source, index));
				assertEqual(state.title, titleFor(source, index), `the dispatched title for ${uri} must be observable before the handover`);
			}
		});
	}

	// Give the catalogue writes a chance to land before the process is stopped;
	// see the note on SEED_SETTLE_MS for why an explicit window is the honest
	// instrument here rather than a retry that would hide the distinction.
	await recorder.run('settle-seed', () => timeout(SEED_SETTLE_MS));

	return recorder.run('read-seed', async () => {
		const listed = await client!.call<IForwardMigrationSessionList>('listSessions', { channel: ROOT_CHANNEL }, PER_CALL_TIMEOUT_MS);
		assertEqual(listed.items?.length ?? 0, created.length, 'the source build must list exactly the sessions it just created');
		return created.map(resource => {
			const item = listed.items?.find(candidate => candidate.resource === resource);
			assertEqual(item?.resource, resource, `the source build must list the session it created at ${resource}`);
			return {
				resource,
				title: item?.title,
				workingDirectories: item?.workingDirectories === undefined ? undefined : [...item.workingDirectories].sort(),
			} satisfies ISeededSession;
		});
	});
}

/**
 * The durable facts a listing is compared on across launches.
 *
 * Working directories are excluded deliberately, and this is the one place
 * where that exclusion is load-bearing rather than merely unasserted: per
 * {@link WORKING_DIRECTORY_SKIP_REASON} the field is present on the first
 * reopen and absent on the second, so including it would make the idempotence
 * comparison fail on a provider artifact and hide any real instability in the
 * fields that do carry a migration claim.
 */
interface IObservedSession {
	readonly resource: string;
	readonly title: string | undefined;
}

/**
 * Assert the migrated profile lists exactly the seeded sessions, and return
 * the normalized listing so a later launch can be compared against it.
 */
async function assertListMatchesSeed(client: LiveCompatAhpClient, seeded: readonly ISeededSession[]): Promise<readonly IObservedSession[]> {
	let last: readonly IForwardMigrationSessionItem[] = [];
	for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt++) {
		const listed = await client.call<IForwardMigrationSessionList>('listSessions', { channel: ROOT_CHANNEL }, PER_CALL_TIMEOUT_MS);
		last = listed.items ?? [];
		if (last.length === seeded.length) {
			break;
		}
		// The catalogue is re-read concurrently with the socket opening, so a
		// short listing is transient early and only meaningful once the budget
		// is spent.
		await timeout(RESTORE_RETRY_DELAY_MS);
	}

	assertEqual(last.length, seeded.length, 'the migrated profile must list exactly the seeded sessions, and no others');
	const observed: IObservedSession[] = [];
	for (const session of seeded) {
		const item = last.find(candidate => candidate.resource === session.resource);
		assertEqual(item?.resource, session.resource, `the session ${session.resource} must survive the upgrade with its identity intact`);
		assertEqual(item?.provider ?? PROVIDER, PROVIDER, `the session ${session.resource} must keep its provider`);
		if (session.title !== undefined) {
			assertEqual(item?.title, session.title, `the session ${session.resource} must keep the title the source build held`);
		}
		observed.push({ resource: session.resource, title: item?.title });
	}
	return observed;
}

/** Assert each seeded session is individually describable after migration. */
async function assertSubscribeMatchesSeed(client: LiveCompatAhpClient, seeded: readonly ISeededSession[]): Promise<void> {
	for (const session of seeded) {
		const state = await subscribeWithRestoreRetry(client, session.resource);
		if (session.title !== undefined) {
			assertEqual(state.title, session.title, `the resubscribed session ${session.resource} must keep its title`);
		}
	}
}

/**
 * Create the profile every phase shares.
 *
 * Created once, deliberately: the inheritance across launches is the subject of
 * the scenario, so these paths are computed here and never re-derived per
 * phase, where a divergence would silently turn the run into three unrelated
 * fresh-profile runs that all pass.
 */
function createSharedProfile(root: string): { homeDir: string; userDataDir: string; workspaceDir: string } {
	const homeDir = join(root, 'home');
	const userDataDir = join(root, 'user-data');
	const workspaceDir = join(root, 'workspace');
	mkdirSync(homeDir, { recursive: true });
	mkdirSync(join(homeDir, '.codex'), { recursive: true });
	mkdirSync(userDataDir, { recursive: true });
	mkdirSync(workspaceDir, { recursive: true });
	return { homeDir, userDataDir, workspaceDir };
}

/**
 * A `file:` URI for an absolute directory path.
 *
 * Hand-built rather than taken from `URI.file`: this module is loaded by a
 * plain `node` runner as well as by Mocha, and the paths involved are temp
 * directories the scenario created itself, so the general-purpose encoder's
 * behavior is not needed. Encoding is still applied so a temp root containing
 * spaces cannot produce a malformed URI.
 */
function uriForDirectory(path: string): string {
	const normalized = path.replace(/\\/g, '/');
	const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
	return `file://${withLeadingSlash.split('/').map(encodeURIComponent).join('/')}`;
}

function titleFor(source: IPreparedAgentHostBuild, index: number): string {
	return `Forward Migration ${source.id} #${index + 1}`;
}

async function connect(server: ILiveCompatServerHandle): Promise<LiveCompatAhpClient> {
	const client = new LiveCompatAhpClient(server.port);
	await client.connect();
	return client;
}

/** Read provider capabilities off the root snapshot, as any client would. */
async function readProviderCapabilities(client: LiveCompatAhpClient): Promise<ReadonlyMap<string, AgentProviderCapabilities>> {
	const root = await client.call<ILiveCompatSubscribeResult>('subscribe', { channel: ROOT_CHANNEL }, PER_CALL_TIMEOUT_MS);
	const capabilities = new Map<string, AgentProviderCapabilities>();
	for (const agent of root.snapshot?.state?.agents ?? []) {
		capabilities.set(agent.provider, agent.capabilities ?? {});
	}
	return capabilities;
}

async function pollForTitle(client: LiveCompatAhpClient, sessionUri: string, expected: string): Promise<IForwardMigrationChannelState> {
	let state: IForwardMigrationChannelState = {};
	for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt++) {
		const subscribed = await client.call<IForwardMigrationSubscribeResult>('subscribe', { channel: sessionUri }, PER_CALL_TIMEOUT_MS);
		state = subscribed.snapshot?.state ?? {};
		if (state.title === expected) {
			return state;
		}
		await timeout(RESTORE_RETRY_DELAY_MS);
	}
	return state;
}

/** Subscribe to a migrated session, tolerating the transient describe window. */
async function subscribeWithRestoreRetry(client: LiveCompatAhpClient, sessionUri: string): Promise<IForwardMigrationChannelState> {
	let lastError: unknown;
	for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt++) {
		try {
			const subscribed = await client.call<IForwardMigrationSubscribeResult>('subscribe', { channel: sessionUri }, PER_CALL_TIMEOUT_MS);
			return subscribed.snapshot?.state ?? {};
		} catch (error) {
			lastError = error;
			await timeout(RESTORE_RETRY_DELAY_MS);
		}
	}
	throw new Error(`could not resubscribe to ${sessionUri} within ${RESTORE_ATTEMPTS} attempts: ${messageOf(lastError)}`);
}

function result(
	scenario: string,
	source: IPreparedAgentHostBuild,
	target: IPreparedAgentHostBuild,
	recorder: StepRecorder,
	diagnosticsPath: string,
	startedAt: number,
	protocolVersion: string | undefined,
	error: string | undefined,
): ILiveCompatScenarioResult {
	return {
		scenario,
		build: `${source.id}->${target.id}`,
		buildDescription: `${source.description ?? source.id} → ${target.description ?? target.id}`,
		outcome: error === undefined ? 'passed' : 'failed',
		durationMs: Date.now() - startedAt,
		protocolVersion,
		steps: recorder.steps,
		diagnosticsPath,
		...(error === undefined ? {} : { error }),
	};
}

function assertEqual<T>(actual: T, expected: T, what: string): void {
	if (actual !== expected) {
		throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
	}
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
