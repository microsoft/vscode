/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Backward-compatibility ("downgrade") and round-trip scenarios.
 *
 * The same-build restart baseline establishes that each checkpoint can reopen
 * *its own* profile. This file asks the harder question that a real user asks
 * by accident: what happens when a profile written by the **newest** build is
 * then opened by an **older** one, and afterwards handed back?
 *
 * ```text
 *  phase 1: current          phase 2: older build        phase 3: current returns
 *  create A ─▶ rename A  ─▶  list A ─▶ rename A     ─▶   list {A, B} exactly once
 *                            create B                    A keeps the OLD build's title
 *                                                        subscribe A and B
 *                                                        ─▶ restart ─▶ still stable
 * ```
 *
 * Three properties make the result meaningful:
 *
 * - **One profile throughout.** Every phase receives the identical home and
 *   user-data directory. A fresh profile anywhere would make the whole scenario
 *   vacuous, so the directories are created once, up front, and only passed
 *   around afterwards.
 * - **Exactly-once identity.** The interesting downgrade failure is not a lost
 *   session but a *duplicated* one: an older build that cannot parse the newer
 *   catalogue may re-adopt the same underlying chat under a second identity,
 *   which then reappears as a phantom row when the newer build returns. The
 *   assertion is therefore on the exact multiset of resources, never on
 *   "contains".
 * - **The older build's writes are authoritative.** Phase 3 requires the title
 *   the *older* build set, not the one the newer build seeded. A newer build
 *   that silently reverts to its own last-known value would still pass a naive
 *   "the session survived" check while destroying user edits.
 *
 * As with the baseline, everything is reached over AHP against real forked
 * processes running the scripted mock provider: no host internals, no database
 * reads, no log scraping, no model traffic.
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
import type { ILiveCompatStepResult } from './sameBuildRestartBaseline.js';

/** Root channel URI. A constant of the protocol, stable across every build. */
const ROOT_CHANNEL = 'ahp-root://';
/** Provider driven by every phase; see the baseline's header for why it is the mock. */
const PROVIDER = 'mock';
/** Title the newest build seeds in phase 1. */
const CURRENT_SEED_TITLE = 'Backward Compat Seed';
/** Title the *older* build overwrites it with in phase 2; phase 3 must see this one. */
const OLDER_BUILD_TITLE = 'Renamed By Older Build';
/** Title the older build gives the session it creates in phase 2. */
const OLDER_BUILD_SECOND_TITLE = 'Created By Older Build';

const PER_CALL_TIMEOUT_MS = 30_000;

/** See the baseline: a restored session is not describable the instant the socket opens. */
const RESTORE_ATTEMPTS = 20;
const RESTORE_RETRY_DELAY_MS = 500;

/**
 * Budget for the returning build to converge on the older build's writes.
 *
 * Larger than the restore budget because convergence waits on a background
 * reconciliation pass rather than on catalogue restore alone.
 */
const CONVERGENCE_ATTEMPTS = 60;

/**
 * Time allowed for catalogue writes to reach disk before a host is stopped.
 *
 * Identical in purpose to the baseline's window and load-bearing for the same
 * reason: `listSessions` and `subscribe` are both served from memory, and the
 * catalogue write that makes a create or rename durable is queued behind them
 * with no AHP acknowledgment and no shutdown flush. Without this window a
 * cross-build handover cannot distinguish "the older build could not read it"
 * from "it was never written before the process stopped" — which is precisely
 * the confusion this suite exists to eliminate.
 */
const HANDOVER_SETTLE_MS = 1_000;

/** A session identity the matrix expects to observe, and the title it must carry. */
export interface IExpectedSessionIdentity {
	readonly resource: string;
	/** Expected title, or `undefined` when titles are not asserted on this build. */
	readonly title?: string;
}

/** Machine-readable result of one downgrade round trip. */
export interface IBackwardCompatScenarioResult {
	readonly scenario: string;
	/** Build that seeds and later re-reads the profile. */
	readonly currentBuild: string;
	/** Older build the profile is handed down to. */
	readonly olderBuild: string;
	readonly olderBuildDescription?: string;
	readonly outcome: 'passed' | 'failed';
	readonly durationMs: number;
	/** Protocol version negotiated by the newest build. */
	readonly currentProtocolVersion?: string;
	/** Protocol version negotiated by the older build. */
	readonly olderProtocolVersion?: string;
	readonly steps: readonly ILiveCompatStepResult[];
	/** Retained profile + host logs for both builds. Never deleted. */
	readonly diagnosticsPath: string;
	readonly error?: string;
}

/** Aggregate outcome of a backward-compatibility run. */
export interface IBackwardCompatMatrixSummary {
	readonly suite: string;
	readonly startedAt: string;
	readonly durationMs: number;
	readonly outcome: 'passed' | 'failed';
	readonly results: readonly IBackwardCompatScenarioResult[];
}

export interface IBackwardCompatScenarioOptions {
	readonly diagnosticsRoot?: string;
	readonly env?: Readonly<Record<string, string>>;
}

/**
 * Verify that `listed` is *exactly* `expected` — same identities, each once.
 *
 * Pure and exported so the exactly-once rule can be unit tested without
 * launching four builds. Returns a human-readable explanation of the first
 * discrepancy, or `undefined` when the listing matches.
 *
 * Duplicates are reported before missing/unexpected entries because a
 * duplicated identity is the specific downgrade failure this suite is built to
 * catch, and reporting it as "one unexpected extra" would understate it.
 */
export function describeIdentityMismatch(
	listed: readonly ILiveCompatSessionListItem[],
	expected: readonly IExpectedSessionIdentity[],
): string | undefined {
	const counts = new Map<string, number>();
	for (const item of listed) {
		counts.set(item.resource, (counts.get(item.resource) ?? 0) + 1);
	}

	const duplicated = [...counts].filter(([, count]) => count > 1).map(([resource, count]) => `${resource} x${count}`);
	if (duplicated.length > 0) {
		return `listed the same session identity more than once: ${duplicated.join(', ')}`;
	}

	const expectedResources = expected.map(entry => entry.resource);
	const missing = expectedResources.filter(resource => !counts.has(resource));
	const unexpected = [...counts.keys()].filter(resource => !expectedResources.includes(resource));
	if (missing.length > 0 || unexpected.length > 0) {
		return `listed sessions do not match: missing [${missing.join(', ')}], unexpected [${unexpected.join(', ')}]`;
	}

	for (const entry of expected) {
		if (entry.title === undefined) {
			continue;
		}
		const actual = listed.find(item => item.resource === entry.resource)?.title;
		if (actual !== entry.title) {
			return `session ${entry.resource} should carry title ${JSON.stringify(entry.title)} but carries ${JSON.stringify(actual)}`;
		}
	}
	return undefined;
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
 * One phase: a launched build with a connected client and its capabilities.
 *
 * Phases are opened and closed explicitly rather than wrapped in a callback so
 * that the scenario body reads in the order the steps actually happen, and so
 * that a failure mid-phase still leaves the recorder holding every step that
 * ran before it.
 */
interface IPhase {
	readonly server: ILiveCompatServerHandle;
	readonly client: LiveCompatAhpClient;
	readonly adapter: IAgentHostCapabilityAdapter;
	readonly protocolVersion: string;
}

/**
 * Run one downgrade round trip: current → older → current → restart.
 *
 * Never throws for a scenario failure; the failure is reported in the returned
 * result so that a matrix run always covers every requested pairing.
 */
export async function runBackwardCompatibilityRoundTrip(
	current: IPreparedAgentHostBuild,
	older: IPreparedAgentHostBuild,
	options: IBackwardCompatScenarioOptions = {},
): Promise<IBackwardCompatScenarioResult> {
	const startedAt = Date.now();
	const diagnosticsPath = mkdtempSync(join(options.diagnosticsRoot ?? tmpdir(), `agent-host-backward-compat-${older.id}-`));
	const dirs = createPersistentDirectories(diagnosticsPath);
	const recorder = new StepRecorder();

	let phase: IPhase | undefined;
	let currentProtocolVersion: string | undefined;
	let olderProtocolVersion: string | undefined;

	/** Sessions the *provider* must be told about on every subsequent launch. */
	const seededSessions: string[] = [];
	const launchFor = (build: IPreparedAgentHostBuild): ILiveCompatLaunchOptions => ({
		serverEntry: build.serverEntry,
		homeDir: dirs.homeDir,
		userDataDir: dirs.userDataDir,
		// The mock provider keeps its session index in memory, so each process
		// is told which sessions the *provider* side already knows about — the
		// same recovery a real provider performs from its own on-disk state.
		// The host's catalogue, which is what is under test, is never seeded and
		// must be reconstructed from the shared user-data directory alone.
		env: seededSessions.length === 0
			? options.env
			: { ...options.env, VSCODE_AGENT_HOST_MOCK_SEED_SESSIONS: seededSessions.join(',') },
	});

	const openPhase = async (build: IPreparedAgentHostBuild, clientSuffix: string): Promise<IPhase> => {
		const server = await startLiveCompatServer(launchFor(build));
		const client = new LiveCompatAhpClient(server.port);
		await client.connect();
		const initialize = await client.call<ILiveCompatInitializeResult>('initialize', {
			channel: ROOT_CHANNEL,
			protocolVersions: [...LIVE_COMPAT_OFFERED_PROTOCOL_VERSIONS],
			clientId: `backward-compat-${build.id}-${clientSuffix}`,
		}, PER_CALL_TIMEOUT_MS);
		return {
			server,
			client,
			protocolVersion: initialize.protocolVersion,
			adapter: createAgentHostCapabilityAdapter({
				protocolVersion: initialize.protocolVersion,
				providerCapabilities: await readProviderCapabilities(client),
			}),
		};
	};

	/**
	 * Close a phase and wait for its process to exit.
	 *
	 * Awaiting the exit is what makes the handover a handover: the next build
	 * reuses the same user-data directory, and a predecessor still holding it
	 * would turn a compatibility result into a race between two processes.
	 */
	const closePhase = async (): Promise<void> => {
		phase?.client.close();
		const server = phase?.server;
		phase = undefined;
		await stopLiveCompatServer(server);
	};

	try {
		// ── phase 1 ── the newest build seeds the profile ────────────────────
		phase = await recorder.run('current-seed:launch', () => openPhase(current, 'seed'));
		currentProtocolVersion = phase.protocolVersion;
		const currentAdapter = phase.adapter;

		await recorder.run('current-seed:list-empty', async () => {
			const listed = await phase!.client.call<ILiveCompatSessionList>('listSessions', { channel: ROOT_CHANNEL }, PER_CALL_TIMEOUT_MS);
			assertOk(describeIdentityMismatch(listed.items ?? [], []), 'a fresh profile must list no sessions');
		});

		const sessionA = `${PROVIDER}:/backward-compat-a-${Date.now()}`;
		await recorder.run('current-seed:create-session-a', async () => {
			await phase!.client.call('createSession', { channel: sessionA, provider: PROVIDER }, PER_CALL_TIMEOUT_MS);
			await phase!.client.call<ILiveCompatSubscribeResult>('subscribe', { channel: sessionA }, PER_CALL_TIMEOUT_MS);
			seededSessions.push(sessionA);
		});

		if (currentAdapter.supportsSessionRename) {
			await recorder.run('current-seed:rename-session-a', async () => {
				await dispatchTitle(phase!.client, sessionA, CURRENT_SEED_TITLE, 1);
			});
		} else {
			recorder.skip('current-seed:rename-session-a', `negotiated protocol ${currentAdapter.protocolVersion} predates client-dispatchable session/titleChanged`);
		}

		await recorder.run('current-seed:handover', async () => {
			await timeout(HANDOVER_SETTLE_MS);
			await closePhase();
		});

		// ── phase 2 ── the older build opens the newer build's profile ───────
		phase = await recorder.run('older:launch', () => openPhase(older, 'downgrade'));
		olderProtocolVersion = phase.protocolVersion;
		const olderAdapter = phase.adapter;
		/** Titles are only asserted where *both* participating builds can set them. */
		const titlesComparable = currentAdapter.supportsSessionRename && olderAdapter.supportsSessionRename;

		await recorder.run('older:list-sees-seeded-session', async () => {
			const listed = await listWithRestoreRetry(phase!.client, [sessionA]);
			assertOk(
				describeIdentityMismatch(listed, [{ resource: sessionA, title: titlesComparable ? CURRENT_SEED_TITLE : undefined }]),
				'the older build must list the newer build\'s session exactly once, with its title',
			);
		});

		await recorder.run('older:subscribe-seeded-session', async () => {
			const state = await subscribeWithRestoreRetry(phase!.client, sessionA);
			if (titlesComparable) {
				assertEqual(state.title, CURRENT_SEED_TITLE, 'the older build must describe the seeded session with its title');
			}
		});

		if (olderAdapter.supportsSessionRename) {
			await recorder.run('older:rename-seeded-session', async () => {
				await dispatchTitle(phase!.client, sessionA, OLDER_BUILD_TITLE, 2);
			});
		} else {
			recorder.skip('older:rename-seeded-session', `negotiated protocol ${olderAdapter.protocolVersion} predates client-dispatchable session/titleChanged`);
		}

		const sessionB = `${PROVIDER}:/backward-compat-b-${Date.now()}`;
		await recorder.run('older:create-session-b', async () => {
			await phase!.client.call('createSession', { channel: sessionB, provider: PROVIDER }, PER_CALL_TIMEOUT_MS);
			await phase!.client.call<ILiveCompatSubscribeResult>('subscribe', { channel: sessionB }, PER_CALL_TIMEOUT_MS);
			seededSessions.push(sessionB);
			if (olderAdapter.supportsSessionRename) {
				await dispatchTitle(phase!.client, sessionB, OLDER_BUILD_SECOND_TITLE, 3);
			}
		});

		await recorder.run('older:handover', async () => {
			await timeout(HANDOVER_SETTLE_MS);
			await closePhase();
		});

		// ── phase 3 ── the newest build takes the profile back ───────────────
		const expected: readonly IExpectedSessionIdentity[] = [
			{ resource: sessionA, title: titlesComparable ? OLDER_BUILD_TITLE : undefined },
			{ resource: sessionB, title: titlesComparable ? OLDER_BUILD_SECOND_TITLE : undefined },
		];

		phase = await recorder.run('current-return:launch', () => openPhase(current, 'return'));

		await recorder.run('current-return:list-exactly-expected', async () => {
			const listed = await listUntilExpected(phase!.client, expected);
			assertOk(
				describeIdentityMismatch(listed, expected),
				'the returning build must list both sessions exactly once and preserve the older build\'s titles',
			);
		});

		await recorder.run('current-return:subscribe-both', async () => {
			await subscribeBoth(phase!.client, expected, titlesComparable);
		});

		// ── phase 4 ── the newest build restarts on the round-tripped profile ─
		await recorder.run('current-return:restart', async () => {
			await timeout(HANDOVER_SETTLE_MS);
			await closePhase();
			phase = await openPhase(current, 'restart');
		});

		await recorder.run('current-restart:list-exactly-expected', async () => {
			const listed = await listUntilExpected(phase!.client, expected);
			assertOk(describeIdentityMismatch(listed, expected), 'a round-tripped profile must remain stable across a further restart');
		});

		await recorder.run('current-restart:subscribe-both', async () => {
			await subscribeBoth(phase!.client, expected, titlesComparable);
		});

		// Permanent deletion is deliberately not exercised: AHP's `disposeSession`
		// releases a channel, it does not delete durable session state, and no
		// command in the shared protocol surface removes a session from the
		// catalogue. Asserting on delete/recreate would therefore require
		// reaching past the protocol into the host's storage, which this suite
		// does not do. Recorded as a skip so the coverage gap is visible in the
		// result rather than implied by its absence.
		recorder.skip('delete-recreate', 'AHP exposes no permanent session delete (disposeSession only releases a channel); needs a protocol affordance before it can be covered externally');

		return result(current, older, recorder, diagnosticsPath, startedAt, currentProtocolVersion, olderProtocolVersion, undefined);
	} catch (error) {
		return result(current, older, recorder, diagnosticsPath, startedAt, currentProtocolVersion, olderProtocolVersion, messageOf(error));
	} finally {
		phase?.client.close();
		await stopLiveCompatServer(phase?.server).catch(() => undefined);
	}
}

/**
 * Run the round trip for each older checkpoint, in order.
 *
 * Sequential by construction: every scenario forks real Agent Host processes
 * that share this machine's temp space, and serializing keeps a failure
 * attributable to one pairing rather than to contention between them.
 */
export async function runBackwardCompatibilityMatrix(
	current: IPreparedAgentHostBuild,
	olderBuilds: readonly IPreparedAgentHostBuild[],
	options: IBackwardCompatScenarioOptions = {},
): Promise<IBackwardCompatMatrixSummary> {
	const startedAt = Date.now();
	const results: IBackwardCompatScenarioResult[] = [];
	for (const older of olderBuilds) {
		results.push(await runBackwardCompatibilityRoundTrip(current, older, options));
	}
	return {
		suite: 'agent-host-live-compat/backward-compatibility-round-trip',
		startedAt: new Date(startedAt).toISOString(),
		durationMs: Date.now() - startedAt,
		outcome: results.every(entry => entry.outcome === 'passed') ? 'passed' : 'failed',
		results,
	};
}

/** Build a failed result for a checkpoint that could not even be resolved. */
export function unresolvedBackwardCompatResult(currentBuildId: string, olderBuildId: string, reason: string): IBackwardCompatScenarioResult {
	return {
		scenario: 'backward-compatibility-round-trip',
		currentBuild: currentBuildId,
		olderBuild: olderBuildId,
		outcome: 'failed',
		durationMs: 0,
		steps: [{ name: 'resolve-build', outcome: 'failed', durationMs: 0, detail: reason }],
		diagnosticsPath: '',
		error: reason,
	};
}

async function subscribeBoth(
	client: LiveCompatAhpClient,
	expected: readonly IExpectedSessionIdentity[],
	assertTitles: boolean,
): Promise<void> {
	for (const entry of expected) {
		const state = await subscribeWithRestoreRetry(client, entry.resource);
		if (assertTitles && entry.title !== undefined) {
			assertEqual(state.title, entry.title, `the resubscribed session ${entry.resource} must retain its title`);
		}
	}
}

/**
 * Dispatch a rename and wait until it is observable.
 *
 * `dispatchAction` is a write-ahead notification with no response, so the
 * readback is the only confirmation that the host accepted and reduced it.
 */
async function dispatchTitle(client: LiveCompatAhpClient, sessionUri: string, title: string, clientSeq: number): Promise<void> {
	client.notify('dispatchAction', {
		channel: sessionUri,
		clientSeq,
		action: { type: 'session/titleChanged', title },
	});
	for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt++) {
		const subscribed = await client.call<ILiveCompatSubscribeResult>('subscribe', { channel: sessionUri }, PER_CALL_TIMEOUT_MS);
		if (subscribed.snapshot?.state?.title === title) {
			return;
		}
		await timeout(RESTORE_RETRY_DELAY_MS);
	}
	throw new Error(`the dispatched title ${JSON.stringify(title)} never became observable on ${sessionUri}`);
}

/**
 * List sessions, retrying until every awaited identity has appeared.
 *
 * A build restoring a profile populates its catalogue concurrently with
 * accepting connections, so an immediate `listSessions` can legitimately answer
 * with a partial set. Retrying is part of the contract a client must implement;
 * the budget is bounded so a genuinely lost session still fails, and the last
 * observed listing is returned so the caller's assertion reports what was
 * actually there rather than a timeout.
 */
async function listWithRestoreRetry(client: LiveCompatAhpClient, awaited: readonly string[]): Promise<readonly ILiveCompatSessionListItem[]> {
	let items: readonly ILiveCompatSessionListItem[] = [];
	for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt++) {
		const listed = await client.call<ILiveCompatSessionList>('listSessions', { channel: ROOT_CHANNEL }, PER_CALL_TIMEOUT_MS);
		items = listed.items ?? [];
		if (awaited.every(resource => items.some(item => item.resource === resource))) {
			return items;
		}
		await timeout(RESTORE_RETRY_DELAY_MS);
	}
	return items;
}

/**
 * List until the whole expectation holds, not merely until the identities exist.
 *
 * A returning build serves `listSessions` from its central catalogue, which an
 * older build cannot write; the newer build repairs those rows in a background
 * reconciliation pass that is *scheduled*, not awaited by the protocol. The
 * contract a client sees is therefore eventual, so the assertion polls the
 * observable AHP surface until it converges instead of sleeping for a fixed
 * period. The budget is bounded, and the last listing is returned so a genuine
 * failure is reported as the mismatch it is rather than as a timeout.
 */
async function listUntilExpected(
	client: LiveCompatAhpClient,
	expected: readonly IExpectedSessionIdentity[],
): Promise<readonly ILiveCompatSessionListItem[]> {
	let items: readonly ILiveCompatSessionListItem[] = [];
	for (let attempt = 0; attempt < CONVERGENCE_ATTEMPTS; attempt++) {
		const listed = await client.call<ILiveCompatSessionList>('listSessions', { channel: ROOT_CHANNEL }, PER_CALL_TIMEOUT_MS);
		items = listed.items ?? [];
		if (describeIdentityMismatch(items, expected) === undefined) {
			return items;
		}
		await timeout(RESTORE_RETRY_DELAY_MS);
	}
	return items;
}

/** Subscribe to a restored session, tolerating the transient describe window. */
async function subscribeWithRestoreRetry(client: LiveCompatAhpClient, sessionUri: string): Promise<{ title?: string }> {
	let lastError: unknown;
	for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt++) {
		try {
			const subscribed = await client.call<ILiveCompatSubscribeResult>('subscribe', { channel: sessionUri }, PER_CALL_TIMEOUT_MS);
			return subscribed.snapshot?.state ?? {};
		} catch (error) {
			lastError = error;
			await timeout(RESTORE_RETRY_DELAY_MS);
		}
	}
	throw new Error(`could not resubscribe to ${sessionUri} within ${RESTORE_ATTEMPTS} attempts: ${messageOf(lastError)}`);
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

function createPersistentDirectories(root: string): { homeDir: string; userDataDir: string } {
	const homeDir = join(root, 'home');
	const userDataDir = join(root, 'user-data');
	mkdirSync(homeDir, { recursive: true });
	mkdirSync(join(homeDir, '.codex'), { recursive: true });
	mkdirSync(userDataDir, { recursive: true });
	mkdirSync(join(root, 'workspace'), { recursive: true });
	return { homeDir, userDataDir };
}

function result(
	current: IPreparedAgentHostBuild,
	older: IPreparedAgentHostBuild,
	recorder: StepRecorder,
	diagnosticsPath: string,
	startedAt: number,
	currentProtocolVersion: string | undefined,
	olderProtocolVersion: string | undefined,
	error: string | undefined,
): IBackwardCompatScenarioResult {
	return {
		scenario: 'backward-compatibility-round-trip',
		currentBuild: current.id,
		olderBuild: older.id,
		olderBuildDescription: older.description,
		outcome: error === undefined ? 'passed' : 'failed',
		durationMs: Date.now() - startedAt,
		currentProtocolVersion,
		olderProtocolVersion,
		steps: recorder.steps,
		diagnosticsPath,
		...(error === undefined ? {} : { error }),
	};
}

function assertOk(mismatch: string | undefined, what: string): void {
	if (mismatch !== undefined) {
		throw new Error(`${what}: ${mismatch}`);
	}
}

function assertEqual<T>(actual: T, expected: T, what: string): void {
	if (actual !== expected) {
		throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
	}
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
