/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live process-recovery scenarios: what survives when the Agent Host is not
 * asked to shut down, but simply stops existing.
 *
 * The same-build restart baseline establishes that a build can reopen its own
 * profile after a **graceful** shutdown — stdin closed, flush awaited, process
 * exited. That is the easy half. This file covers the half a user actually
 * meets: the machine slept and the socket died, the process was OOM-killed, a
 * container was reaped, or someone hit the power button mid-rename.
 *
 * Every scenario here therefore ends its first phase with `SIGKILL`. There is
 * no shutdown handshake, no flush, no chance for the host to tidy up; whatever
 * reached disk before the signal is the entire inheritance of the next process.
 *
 * ## Externality is preserved, and it constrains what can be claimed
 *
 * These scenarios obey the same rule as the rest of the E2E suite: the host is
 * reached **only** over AHP on a WebSocket. Nothing here opens the host's
 * database, reads its catalogue file, parses its logs for assertions, or
 * imports host internals. That rule is what makes a passing result mean
 * something — but it also bounds what can honestly be tested, and the bound is
 * stated rather than papered over:
 *
 * - A black-box client can kill the process at an **AHP-observable** boundary
 *   (a request that has returned, a mutation a readback already reflects). It
 *   cannot kill it at an *internal* boundary — mid-write, between a receipt
 *   being queued and being fsynced, or with a deliberately truncated file —
 *   because it cannot see or create those states from outside.
 * - Consequently the exact corruption and pending-receipt boundaries are
 *   **not** claimed by this file. {@link RECOVERY_BOUNDARIES} records them as
 *   explicitly out of black-box reach, and they are routed to a separately
 *   scoped integration test rather than faked with a plausible-looking E2E.
 *
 * ## Durability is measured, not assumed
 *
 * The host exposes no durability acknowledgment. `subscribe` and `listSessions`
 * are served from memory, so a rename is *readable* long before it is
 * *durable*, and the catalogue write is queued fire-and-forget behind them —
 * and is not covered by the shutdown flush even when there is one, which after
 * `SIGKILL` there is not.
 *
 * So a scenario that kills at the readback boundary cannot assert "the rename
 * survived": that would encode a guarantee the host does not make, and would
 * flake as a function of disk speed. What it asserts instead is the property
 * that genuinely must hold — **convergence**:
 *
 * ```text
 *   admissible after an unclean kill      inadmissible, and asserted against
 *   ────────────────────────────────      ──────────────────────────────────
 *   session present, new title            session missing entirely
 *   session present, previous title       session duplicated
 *                                         session present but undescribable
 * ```
 *
 * Losing the *rename* is a known durability gap. Losing the *session*, or
 * growing a second copy of it, is a recovery defect. {@link classifyRecovery}
 * draws exactly that line, and the observed side of it is reported in the JSON
 * so the durability gap stays visible as data instead of being hidden by a
 * tolerant assertion.
 *
 * ## The scenarios
 *
 * ```text
 *  A unclean-kill-restart          create ▸ rename ▸ settle ▸ KILL ▸ restart ▸ list+subscribe
 *  B repeated-unclean-restart      (KILL ▸ restart) × N, asserting no duplicates accumulate
 *  C kill-at-mutation-boundary     rename ▸ readback returns ▸ KILL immediately ▸ converge
 *  D unclean-predecessor-upgrade   historical build ▸ KILL ▸ current build on the same profile
 * ```
 *
 * Scenario D is the one that matters for a migration: it proves the current
 * build's upgrade path is entered from state a previous build abandoned
 * mid-flight, which is the realistic input to a migration and the one a clean
 * hand-off never produces.
 *
 * All of it runs against the scripted mock provider — tokenless, networkless,
 * fixture-free — so the subject is the *host's* recovery rather than a
 * provider's replay state.
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
import { startLiveCompatServer, type ILiveCompatLaunchOptions, type ILiveCompatServerHandle } from './agentHostLiveCompatServer.js';
import type {
	AgentProviderCapabilities,
	ILiveCompatInitializeResult,
	ILiveCompatSessionList,
	ILiveCompatSubscribeResult,
} from './agentHostLiveCompatProtocol.js';
import type { ILiveCompatStepResult } from './sameBuildRestartBaseline.js';

/** Root channel URI. A constant of the protocol, stable across every build. */
const ROOT_CHANNEL = 'ahp-root://';
/** Provider the scenarios drive; see the file header for why it is the mock. */
const PROVIDER = 'mock';
const PER_CALL_TIMEOUT_MS = 30_000;

/** Title dispatched before the kill, and looked for after it. */
const TITLE_BEFORE_KILL = 'Recovery Matrix Renamed';
/** Title used by scenario C, dispatched at the boundary the kill races. */
const BOUNDARY_TITLE = 'Recovery Matrix Boundary';

/**
 * A restored session is not describable the instant the host accepts
 * connections: the provider is re-registered and the catalogue re-read
 * concurrently with the socket opening. Retrying is part of the client
 * contract, but the budget is bounded so a genuinely lost session still fails.
 */
const RESTORE_ATTEMPTS = 20;
const RESTORE_RETRY_DELAY_MS = 500;

/**
 * Settle window used **only** by scenario A, which is the scenario asking
 * "does a rename that had time to persist survive an unclean kill?". Scenario C
 * deliberately has no settle window — racing that write is its entire subject.
 */
const PERSIST_SETTLE_MS = 1_000;

/** How many kill/restart cycles scenario B performs. */
const CONVERGENCE_CYCLES = 3;

/**
 * Where a recovered session landed, relative to the mutation the kill raced.
 *
 * The first two are admissible outcomes of an unclean kill; the last two are
 * recovery defects. Keeping them as one enumeration is what lets a scenario
 * both *assert* (no defect) and *report* (which admissible outcome occurred)
 * from a single observation.
 */
export const enum RecoveryClassification {
	/** The mutation was durable: it survived the kill. */
	ConvergedMutated = 'converged-mutated',
	/** The session survived, the mutation did not. A known durability gap. */
	ConvergedPreMutation = 'converged-pre-mutation',
	/** The session is gone. A recovery defect. */
	Lost = 'lost',
	/** The session came back more than once. A recovery defect. */
	Duplicated = 'duplicated',
	/** Listed but not describable within the restore budget. A defect. */
	Undescribable = 'undescribable',
}

/** What the client observed about one session after a restart. */
export interface IRecoveryObservation {
	/** How many list entries carried the session's resource. */
	readonly listedCount: number;
	/** Title on the list entry, when listed. */
	readonly listedTitle?: string;
	/** Title from a successful `subscribe`, when it succeeded. */
	readonly describedTitle?: string;
	/** Why `subscribe` never succeeded, when it did not. */
	readonly describeError?: string;
}

/**
 * Decide whether a recovery was admissible, and which admissible shape it took.
 *
 * Pure so it can be tested against every observation shape without launching a
 * process — including the shapes a live run is not guaranteed to produce, which
 * are precisely the ones whose handling must not be assumed.
 */
export function classifyRecovery(
	observation: IRecoveryObservation,
	titles: { readonly beforeMutation?: string; readonly afterMutation: string },
): RecoveryClassification {
	if (observation.listedCount > 1) {
		return RecoveryClassification.Duplicated;
	}
	if (observation.listedCount === 0) {
		return RecoveryClassification.Lost;
	}
	if (observation.describedTitle === undefined) {
		return RecoveryClassification.Undescribable;
	}
	// The list entry and the description are two different surfaces over the
	// same durable state; the mutation counts as durable when either surface
	// reports it, since a build may restore a title to one before the other.
	if (observation.describedTitle === titles.afterMutation || observation.listedTitle === titles.afterMutation) {
		return RecoveryClassification.ConvergedMutated;
	}
	return RecoveryClassification.ConvergedPreMutation;
}

/** Whether a classification is a recovery defect (as opposed to a durability gap). */
export function isRecoveryDefect(classification: RecoveryClassification): boolean {
	return classification === RecoveryClassification.Lost
		|| classification === RecoveryClassification.Duplicated
		|| classification === RecoveryClassification.Undescribable;
}

/**
 * A boundary this matrix either covers or explicitly does not.
 *
 * Recorded as data, and emitted into the run's JSON, so that "what was not
 * tested" is a first-class output rather than something a reader has to infer
 * from the absence of a scenario.
 */
export interface IRecoveryBoundary {
	readonly id: string;
	readonly description: string;
	readonly covered: boolean;
	/** Scenario covering it, or why it is out of black-box reach. */
	readonly detail: string;
}

export const RECOVERY_BOUNDARIES: readonly IRecoveryBoundary[] = Object.freeze([
	{
		id: 'unclean-exit-after-graceful-quiescence',
		description: 'Process killed with no shutdown handshake after its writes had time to settle.',
		covered: true,
		detail: 'scenario unclean-kill-restart',
	},
	{
		id: 'repeated-unclean-exit',
		description: 'Repeated kill/restart cycles converge without accumulating duplicate sessions.',
		covered: true,
		detail: 'scenario repeated-unclean-restart',
	},
	{
		id: 'unclean-exit-at-mutation-readback',
		description: 'Process killed immediately after a metadata mutation became AHP-observable.',
		covered: true,
		detail: 'scenario kill-at-mutation-boundary, killed at the readback response boundary with no intervening sleep',
	},
	{
		id: 'unclean-predecessor-handoff',
		description: 'A newer build opens a profile a previous build abandoned without shutting down.',
		covered: true,
		detail: 'scenario unclean-predecessor-upgrade',
	},
	{
		id: 'torn-write-corruption',
		description: 'Recovery from a partially-written or truncated persistence file.',
		covered: false,
		detail: 'not reachable over AHP: a black-box client cannot truncate host-owned files, and doing so would violate the suite externality rule. Routed to a scoped integration test — see RECOVERY_INTEGRATION_PROPOSALS.',
	},
	{
		id: 'pending-receipt-at-kill',
		description: 'A write queued but not yet flushed when the process dies.',
		covered: false,
		detail: 'not reachable over AHP: the queue is internal and the host advertises no durability acknowledgment, so the boundary cannot be observed or targeted from outside. Routed to a scoped integration test — see RECOVERY_INTEGRATION_PROPOSALS.',
	},
]);

/**
 * Boundaries that need host internals, described precisely enough to be
 * implemented as integration tests without re-deriving the analysis.
 *
 * Deliberately data in this file rather than prose in a document: it is
 * emitted with the run, so the proposal travels with the evidence that
 * motivated it.
 */
export interface IRecoveryIntegrationProposal {
	readonly boundaryId: string;
	/** Where such a test belongs, given it may import internals. */
	readonly suggestedLocation: string;
	/** How to reach the boundary once internals are in scope. */
	readonly approach: string;
	/** What the test would assert. */
	readonly assertion: string;
	/**
	 * Coverage that already exists nearby, so the proposal is scoped to the
	 * genuine gap rather than duplicating a test that is already green.
	 */
	readonly existingCoverage: readonly string[];
}

export const RECOVERY_INTEGRATION_PROPOSALS: readonly IRecoveryIntegrationProposal[] = Object.freeze([
	{
		boundaryId: 'torn-write-corruption',
		suggestedLocation: 'src/vs/platform/agentHost/test/node/sessionDatabase.test.ts and agentHostDatabase.test.ts — they already own these stores and may import them directly, which an E2E must not.',
		approach: 'Open the SQLite database against a temp directory, write a session, close it, then damage the file in place before reopening on the same path: truncate mid-page, zero the header, leave an orphaned -wal/-shm pair with no main database, and set an unknown (future) schema version. Reopen and drive the normal read path.',
		assertion: 'Reopening resolves rather than rejecting, undamaged rows are still returned, and a database that cannot be salvaged is quarantined rather than deleted alongside adjacent good state. Each damage shape is its own case so a regression names the shape it broke. The unknown-schema-version case should assert a refusal to downgrade, not a silent reformat.',
		existingCoverage: [
			'sessionDatabase.test.ts:33 — transient initialization failure is retried.',
			'sessionDatabase.test.ts:112-170 — migrations apply, reopen, and roll back on failure.',
			'agentHostDatabase.test.ts:178-870 — schema creation and v4→v6→v8 upgrades, including legacy migration.',
			'agentHostCatalogListReader.test.ts:167 — unusable catalogue rows fall back rather than throwing.',
			'sessionArtifacts.test.ts:87 — malformed JSON input is handled.',
			'Gap: none of these damage the SQLite file itself; all corruption coverage today is at the row/JSON level.',
		],
	},
	{
		boundaryId: 'pending-receipt-at-kill',
		suggestedLocation: 'src/vs/platform/agentHost/test/node/sessionDatabase.test.ts (write tracking) and agentHostCatalogSyncService.test.ts (pending receipts) — both already instantiate the machinery this boundary lives in.',
		approach: 'Issue a mutation and, deliberately **without** awaiting `SessionDatabase.whenIdle()`, open a second database over the same path — modelling the process dying between a fire-and-forget write being tracked in `_pendingWrites` and the query completing. For the catalogue, hold a pending payload unflushed and reopen. The existing `_track` seam makes this deterministic without a sleep, which is exactly what a black-box client cannot achieve.',
		assertion: 'The second reader observes either the pre-mutation or the post-mutation state and never a partial or duplicated one — the same convergence contract this E2E matrix asserts from outside, pinned here at the boundary the E2E cannot target. Pair it with a test asserting that skipping `whenIdle()` is the *only* way to lose the write, which turns the current comment at sessionDatabase.ts:358 into an executable claim.',
		existingCoverage: [
			'sessionDatabase.test.ts:583-609 — fire-and-forget writes and truncation, usage tracking.',
			'sessionDatabase.test.ts:669-719 — dispose behaviour, including dispose-during-open.',
			'sessionDatabase.ts:1065-1069 — `whenIdle()` drains `_pendingWrites`; :1083-1089 — `_track()` wraps public mutators.',
			'agentHostCatalogSyncService.test.ts:172,180,253,361 — local/central write failure, concurrent conflict, and queued mutations retaining caller payloads.',
			'Gap: every case above exercises the graceful path where `whenIdle()` is awaited; none models the process disappearing while `_pendingWrites` is non-empty.',
		],
	},
]);

/** Machine-readable result of one recovery scenario. */
export interface IRecoveryScenarioResult {
	readonly scenario: string;
	readonly build: string;
	readonly buildDescription?: string;
	/** Second build, for scenarios that hand a profile between builds. */
	readonly secondBuild?: string;
	readonly outcome: 'passed' | 'failed';
	readonly durationMs: number;
	readonly protocolVersion?: string;
	readonly steps: readonly ILiveCompatStepResult[];
	/** How each restart classified; the durability gap is visible here. */
	readonly classifications: readonly RecoveryClassification[];
	/** Retained directory holding home, user-data (host logs) and workspace. */
	readonly diagnosticsPath: string;
	readonly error?: string;
}

export interface IRecoveryScenarioOptions {
	readonly diagnosticsRoot?: string;
	readonly env?: Readonly<Record<string, string>>;
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

	note(name: string, detail: string): void {
		this._steps.push({ name, outcome: 'passed', durationMs: 0, detail });
	}

	skip(name: string, reason: string): void {
		this._steps.push({ name, outcome: 'skipped', durationMs: 0, detail: reason });
	}
}

/**
 * The scenario driver: one profile, a client that can be reconnected, and a
 * process that can be killed rather than asked to leave.
 *
 * Exists so the four scenarios differ only in *when* they kill and *what* they
 * assert afterwards, instead of each re-deriving launch/connect/kill.
 */
class RecoverySession {
	private _server: ILiveCompatServerHandle | undefined;
	private _client: LiveCompatAhpClient | undefined;
	private _clientSeq = 0;
	protocolVersion: string | undefined;

	constructor(
		private readonly _launch: ILiveCompatLaunchOptions,
		private readonly _clientIdPrefix: string,
	) { }

	get client(): LiveCompatAhpClient {
		if (!this._client) {
			throw new Error('[agent-host-recovery] no live connection; the host is not running');
		}
		return this._client;
	}

	/** Launch a build on this profile and complete the AHP handshake. */
	async start(phase: string, overrides?: Partial<ILiveCompatLaunchOptions>): Promise<IAgentHostCapabilityAdapter> {
		this._server = await startLiveCompatServer({ ...this._launch, ...overrides });
		const client = new LiveCompatAhpClient(this._server.port);
		await client.connect();
		this._client = client;
		const initialize = await client.call<ILiveCompatInitializeResult>('initialize', {
			channel: ROOT_CHANNEL,
			protocolVersions: [...LIVE_COMPAT_OFFERED_PROTOCOL_VERSIONS],
			clientId: `${this._clientIdPrefix}-${phase}`,
		}, PER_CALL_TIMEOUT_MS);
		this.protocolVersion = initialize.protocolVersion;
		return createAgentHostCapabilityAdapter({
			protocolVersion: initialize.protocolVersion,
			providerCapabilities: await this._readProviderCapabilities(client),
		});
	}

	/**
	 * Kill the host outright and wait for the process to be reaped.
	 *
	 * `SIGKILL` rather than `SIGTERM` or closing stdin, and that choice is the
	 * point of this file: the host gets no handler, no flush and no chance to
	 * write a clean marker, which is exactly the state a crash leaves behind.
	 *
	 * Awaiting the exit is load-bearing for a different reason — the next phase
	 * reopens the same user-data directory, and a not-yet-reaped predecessor
	 * would still hold it, turning a recovery result into a race.
	 */
	async kill(): Promise<void> {
		const child = this._server?.process;
		this._client?.close();
		this._client = undefined;
		this._server = undefined;
		if (!child || child.exitCode !== null || child.signalCode !== null) {
			return;
		}
		const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
		child.kill('SIGKILL');
		await exited;
	}

	/** Best-effort teardown for the failure path. */
	async dispose(): Promise<void> {
		await this.kill().catch(() => undefined);
	}

	/** Create a session and confirm it is subscribable before returning. */
	async createSession(uri: string): Promise<void> {
		await this.client.call('createSession', { channel: uri, provider: PROVIDER }, PER_CALL_TIMEOUT_MS);
		await this.client.call<ILiveCompatSubscribeResult>('subscribe', { channel: uri }, PER_CALL_TIMEOUT_MS);
	}

	/**
	 * Dispatch a rename and return once a readback reflects it.
	 *
	 * The returned promise settling **is** the boundary scenario C kills at: a
	 * response the host has already produced, not an elapsed duration. That is
	 * what makes the race deterministic in the only sense available from
	 * outside — the kill provably lands after the reducer ran, and provably
	 * without waiting for anything else.
	 */
	async renameAndAwaitReadback(uri: string, title: string): Promise<void> {
		this.client.notify('dispatchAction', {
			channel: uri,
			clientSeq: ++this._clientSeq,
			action: { type: 'session/titleChanged', title },
		});
		for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt++) {
			const subscribed = await this.client.call<ILiveCompatSubscribeResult>('subscribe', { channel: uri }, PER_CALL_TIMEOUT_MS);
			if (subscribed.snapshot?.state?.title === title) {
				return;
			}
			await timeout(RESTORE_RETRY_DELAY_MS);
		}
		throw new Error(`[agent-host-recovery] '${title}' was never observable on ${uri} before the kill`);
	}

	/** Observe a session across both surfaces, tolerating the describe window. */
	async observe(uri: string): Promise<IRecoveryObservation> {
		const listed = await this.client.call<ILiveCompatSessionList>('listSessions', { channel: ROOT_CHANNEL }, PER_CALL_TIMEOUT_MS);
		const matches = (listed.items ?? []).filter(item => item.resource === uri);
		if (matches.length === 0) {
			return { listedCount: 0 };
		}
		let describedTitle: string | undefined;
		let describeError: string | undefined;
		for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt++) {
			try {
				const subscribed = await this.client.call<ILiveCompatSubscribeResult>('subscribe', { channel: uri }, PER_CALL_TIMEOUT_MS);
				describedTitle = subscribed.snapshot?.state?.title ?? '';
				describeError = undefined;
				break;
			} catch (error) {
				describeError = messageOf(error);
				await timeout(RESTORE_RETRY_DELAY_MS);
			}
		}
		return { listedCount: matches.length, listedTitle: matches[0].title, describedTitle, describeError };
	}

	/** Read provider capabilities off the root snapshot, as any client would. */
	private async _readProviderCapabilities(client: LiveCompatAhpClient): Promise<ReadonlyMap<string, AgentProviderCapabilities>> {
		const root = await client.call<ILiveCompatSubscribeResult>('subscribe', { channel: ROOT_CHANNEL }, PER_CALL_TIMEOUT_MS);
		const capabilities = new Map<string, AgentProviderCapabilities>();
		for (const agent of root.snapshot?.state?.agents ?? []) {
			capabilities.set(agent.provider, agent.capabilities ?? {});
		}
		return capabilities;
	}
}

/**
 * Scenario A — a crash after the host had reached quiescence.
 *
 * The mildest unclean exit there is, and therefore the one whose failure is
 * least ambiguous: the rename was given time to reach disk, so anything missing
 * afterwards was lost by recovery rather than by the race.
 */
export async function runUncleanKillRestart(
	build: IPreparedAgentHostBuild,
	options: IRecoveryScenarioOptions = {},
): Promise<IRecoveryScenarioResult> {
	return runScenario('unclean-kill-restart', build, options, async (session, recorder, context) => {
		const adapter = await recorder.run('launch-and-initialize', () => session.start('seed'));
		const uri = context.sessionUri;

		await recorder.run('create-session', () => session.createSession(uri));
		await renameStep(recorder, session, adapter, uri, TITLE_BEFORE_KILL);

		await recorder.run('settle-writes', async () => {
			// Scenario A's question is about recovery, not about racing the
			// catalogue write, so the write is deliberately given time. The
			// race itself is scenario C's subject.
			await timeout(PERSIST_SETTLE_MS);
		});

		await recorder.run('sigkill', () => session.kill());
		await recorder.run('relaunch', () => session.start('verify', { env: { ...options.env, VSCODE_AGENT_HOST_MOCK_SEED_SESSIONS: uri } }));

		const observation = await recorder.run('observe-recovered', () => session.observe(uri));
		const classification = classifyRecovery(observation, { afterMutation: TITLE_BEFORE_KILL });
		recorder.note('classify', `${classification} (${describeObservation(observation)})`);
		assertNoDefect(classification, observation, 'after an unclean kill that followed a settled rename');
		if (adapter.supportsSessionRename && classification === RecoveryClassification.ConvergedPreMutation) {
			// Reported, not failed: durability of the catalogue write is a
			// host-side gap this suite measures rather than legislates.
			recorder.note('durability-gap', `the rename was readable before the kill but did not survive it; observed title '${observation.describedTitle ?? ''}'`);
		}
		return [classification];
	});
}

/**
 * Scenario B — repeated crashes must converge, not accumulate.
 *
 * One kill/restart proves recovery works once. The failure mode this scenario
 * exists for is the one that only appears when recovery runs against state a
 * previous recovery produced: a restored session written back as a *new* entry,
 * so each crash leaves the profile with one more copy of the same session.
 * Nothing in a single-cycle test can see that.
 */
export async function runRepeatedUncleanRestart(
	build: IPreparedAgentHostBuild,
	options: IRecoveryScenarioOptions = {},
): Promise<IRecoveryScenarioResult> {
	return runScenario('repeated-unclean-restart', build, options, async (session, recorder, context) => {
		const adapter = await recorder.run('launch-and-initialize', () => session.start('seed'));
		const uri = context.sessionUri;
		await recorder.run('create-session', () => session.createSession(uri));
		// Renamed before the first kill so each cycle's classification is a real
		// verdict. Without a mutation to compare against, every cycle would
		// trivially report "pre-mutation" and the tally would look like a
		// durability failure that never happened.
		await renameStep(recorder, session, adapter, uri, TITLE_BEFORE_KILL);
		await recorder.run('settle-writes', () => timeout(PERSIST_SETTLE_MS));

		const classifications: RecoveryClassification[] = [];
		for (let cycle = 1; cycle <= CONVERGENCE_CYCLES; cycle++) {
			await recorder.run(`sigkill-${cycle}`, () => session.kill());
			await recorder.run(`relaunch-${cycle}`, () => session.start(`cycle-${cycle}`, {
				env: { ...options.env, VSCODE_AGENT_HOST_MOCK_SEED_SESSIONS: uri },
			}));
			const observation = await recorder.run(`observe-${cycle}`, () => session.observe(uri));
			const classification = classifyRecovery(observation, { afterMutation: TITLE_BEFORE_KILL });
			recorder.note(`classify-${cycle}`, `${classification} (${describeObservation(observation)})`);
			// The duplicate check is the load-bearing assertion: it is why the
			// scenario loops instead of killing once.
			assertNoDefect(classification, observation, `on unclean restart cycle ${cycle} of ${CONVERGENCE_CYCLES}`);
			classifications.push(classification);
		}
		return classifications;
	});
}

/**
 * Scenario C — kill at the moment a mutation becomes observable.
 *
 * The kill is issued as the next statement after the readback resolves: no
 * sleep, no polling interval, nothing that makes the timing a function of the
 * machine. The host has demonstrably reduced the action (the readback proves
 * it) and has demonstrably not been given time to do anything else.
 *
 * Both outcomes are admissible and both are recorded. What is asserted is only
 * that the *session* survives the race intact — the property that must hold
 * regardless of where the write landed.
 */
export async function runKillAtMutationBoundary(
	build: IPreparedAgentHostBuild,
	options: IRecoveryScenarioOptions = {},
): Promise<IRecoveryScenarioResult> {
	return runScenario('kill-at-mutation-boundary', build, options, async (session, recorder, context) => {
		const adapter = await recorder.run('launch-and-initialize', () => session.start('seed'));
		const uri = context.sessionUri;
		await recorder.run('create-session', () => session.createSession(uri));
		await recorder.run('settle-session-creation', () => timeout(PERSIST_SETTLE_MS));

		if (!adapter.supportsSessionRename) {
			recorder.skip('kill-at-boundary', `negotiated protocol ${adapter.protocolVersion} predates client-dispatchable session/titleChanged`);
			await recorder.run('sigkill', () => session.kill());
			await recorder.run('relaunch', () => session.start('verify', { env: { ...options.env, VSCODE_AGENT_HOST_MOCK_SEED_SESSIONS: uri } }));
			const plain = await recorder.run('observe-recovered', () => session.observe(uri));
			const plainClassification = classifyRecovery(plain, { afterMutation: BOUNDARY_TITLE });
			assertNoDefect(plainClassification, plain, 'after an unclean kill on a build without dispatchable rename');
			return [plainClassification];
		}

		await recorder.run('mutate-and-kill-at-readback', async () => {
			await session.renameAndAwaitReadback(uri, BOUNDARY_TITLE);
			// Immediately, on purpose: this adjacency is the experiment.
			await session.kill();
		});

		await recorder.run('relaunch', () => session.start('verify', { env: { ...options.env, VSCODE_AGENT_HOST_MOCK_SEED_SESSIONS: uri } }));
		const observation = await recorder.run('observe-recovered', () => session.observe(uri));
		const classification = classifyRecovery(observation, { afterMutation: BOUNDARY_TITLE });
		recorder.note('classify', `${classification} (${describeObservation(observation)})`);
		recorder.note('boundary-outcome', classification === RecoveryClassification.ConvergedMutated
			? 'the mutation was already durable when the process died'
			: 'the mutation was readable but not yet durable when the process died — the known catalogue-write gap, observed');
		assertNoDefect(classification, observation, 'after a kill at the mutation readback boundary');
		return [classification];
	});
}

/**
 * Scenario D — a newer build inherits a profile nobody closed.
 *
 * A migration's real input is not a tidy profile handed over by a graceful
 * shutdown; it is whatever a previous build left when it stopped. This scenario
 * produces exactly that input — historical build, `SIGKILL`, current build on
 * the same directories — and asserts the upgrade path survives it.
 *
 * It is the only scenario spanning two builds, so it is also the only one whose
 * failure could mean either "recovery is broken" or "migration is broken"; the
 * per-phase steps and the retained diagnostics directory are what separate the
 * two after the fact.
 */
export async function runUncleanPredecessorUpgrade(
	historical: IPreparedAgentHostBuild,
	current: IPreparedAgentHostBuild,
	options: IRecoveryScenarioOptions = {},
): Promise<IRecoveryScenarioResult> {
	const startedAt = Date.now();
	const diagnosticsPath = mkdtempSync(join(options.diagnosticsRoot ?? tmpdir(), `agent-host-recovery-upgrade-${historical.id}-to-${current.id}-`));
	const dirs = createPersistentDirectories(diagnosticsPath);
	const recorder = new StepRecorder();
	const uri = `${PROVIDER}:/recovery-upgrade-${Date.now()}`;
	const classifications: RecoveryClassification[] = [];

	const base = { homeDir: dirs.homeDir, userDataDir: dirs.userDataDir, env: options.env };
	const predecessor = new RecoverySession({ ...base, serverEntry: historical.serverEntry }, `recovery-${historical.id}`);
	const successor = new RecoverySession({ ...base, serverEntry: current.serverEntry }, `recovery-${current.id}`);
	let protocolVersion: string | undefined;

	try {
		const adapter = await recorder.run('launch-historical', () => predecessor.start('seed'));
		recorder.note('historical-protocol', `${historical.id} negotiated ${adapter.protocolVersion}`);
		await recorder.run('create-session-on-historical', () => predecessor.createSession(uri));
		await renameStep(recorder, predecessor, adapter, uri, TITLE_BEFORE_KILL);
		await recorder.run('settle-writes', () => timeout(PERSIST_SETTLE_MS));
		// No shutdown handshake: the successor must enter migration from state
		// the predecessor abandoned, which is the whole point of the scenario.
		await recorder.run('sigkill-historical', () => predecessor.kill());

		await recorder.run('launch-current-on-abandoned-profile', async () => {
			await successor.start('verify', { env: { ...options.env, VSCODE_AGENT_HOST_MOCK_SEED_SESSIONS: uri } });
		});
		protocolVersion = successor.protocolVersion;

		const observation = await recorder.run('observe-migrated', () => successor.observe(uri));
		const classification = classifyRecovery(observation, { afterMutation: TITLE_BEFORE_KILL });
		recorder.note('classify', `${classification} (${describeObservation(observation)})`);
		assertNoDefect(classification, observation, `after ${current.id} opened a profile ${historical.id} abandoned without shutting down`);
		classifications.push(classification);

		return {
			scenario: 'unclean-predecessor-upgrade',
			build: historical.id,
			buildDescription: historical.description,
			secondBuild: current.id,
			outcome: 'passed',
			durationMs: Date.now() - startedAt,
			protocolVersion,
			steps: recorder.steps,
			classifications,
			diagnosticsPath,
		};
	} catch (error) {
		return {
			scenario: 'unclean-predecessor-upgrade',
			build: historical.id,
			buildDescription: historical.description,
			secondBuild: current.id,
			outcome: 'failed',
			durationMs: Date.now() - startedAt,
			protocolVersion,
			steps: recorder.steps,
			classifications,
			diagnosticsPath,
			error: messageOf(error),
		};
	} finally {
		await predecessor.dispose();
		await successor.dispose();
	}
}

interface IScenarioContext {
	readonly sessionUri: string;
}

/**
 * Shared scaffolding for the single-build scenarios.
 *
 * Never throws for a scenario failure: a failed build is data the caller needs
 * alongside the builds that passed, so the failure is reported in the result.
 */
async function runScenario(
	scenario: string,
	build: IPreparedAgentHostBuild,
	options: IRecoveryScenarioOptions,
	body: (session: RecoverySession, recorder: StepRecorder, context: IScenarioContext) => Promise<readonly RecoveryClassification[]>,
): Promise<IRecoveryScenarioResult> {
	const startedAt = Date.now();
	const diagnosticsPath = mkdtempSync(join(options.diagnosticsRoot ?? tmpdir(), `agent-host-recovery-${scenario}-${build.id}-`));
	const dirs = createPersistentDirectories(diagnosticsPath);
	const recorder = new StepRecorder();
	const session = new RecoverySession({
		serverEntry: build.serverEntry,
		homeDir: dirs.homeDir,
		userDataDir: dirs.userDataDir,
		env: options.env,
	}, `recovery-${build.id}`);
	const context: IScenarioContext = { sessionUri: `${PROVIDER}:/recovery-${scenario}-${build.id}-${Date.now()}` };

	try {
		const classifications = await body(session, recorder, context);
		return {
			scenario,
			build: build.id,
			buildDescription: build.description,
			outcome: 'passed',
			durationMs: Date.now() - startedAt,
			protocolVersion: session.protocolVersion,
			steps: recorder.steps,
			classifications,
			diagnosticsPath,
		};
	} catch (error) {
		return {
			scenario,
			build: build.id,
			buildDescription: build.description,
			outcome: 'failed',
			durationMs: Date.now() - startedAt,
			protocolVersion: session.protocolVersion,
			steps: recorder.steps,
			classifications: [],
			diagnosticsPath,
			error: messageOf(error),
		};
	} finally {
		await session.dispose();
	}
}

/**
 * Rename, or record why the build cannot be asked to.
 *
 * Skipped rather than omitted: a build too old to dispatch a rename still runs
 * the recovery scenario, and stating the omission keeps the result's coverage
 * honest instead of silently narrower than it looks.
 */
async function renameStep(
	recorder: StepRecorder,
	session: RecoverySession,
	adapter: IAgentHostCapabilityAdapter,
	uri: string,
	title: string,
): Promise<void> {
	if (!adapter.supportsSessionRename) {
		recorder.skip('rename-session', `negotiated protocol ${adapter.protocolVersion} predates client-dispatchable session/titleChanged`);
		return;
	}
	await recorder.run('rename-session', () => session.renameAndAwaitReadback(uri, title));
}

function assertNoDefect(classification: RecoveryClassification, observation: IRecoveryObservation, context: string): void {
	if (isRecoveryDefect(classification)) {
		throw new Error(`[agent-host-recovery] ${classification} ${context}: ${describeObservation(observation)}`);
	}
}

function describeObservation(observation: IRecoveryObservation): string {
	const parts = [`listed=${observation.listedCount}`];
	if (observation.listedTitle !== undefined) {
		parts.push(`listedTitle='${observation.listedTitle}'`);
	}
	if (observation.describedTitle !== undefined) {
		parts.push(`describedTitle='${observation.describedTitle}'`);
	}
	if (observation.describeError !== undefined) {
		parts.push(`describeError=${observation.describeError}`);
	}
	return parts.join(', ');
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

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
