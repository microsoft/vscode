/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The same-build restart baseline.
 *
 * Before any cross-version claim can mean anything, each checkpoint has to be
 * shown to seed and reopen **its own** persistent profile. Otherwise a failure
 * in a later upgrade or downgrade matrix is ambiguous: it could be a migration
 * defect, or it could be that the build never round-tripped its own state.
 * This scenario removes that ambiguity, one build at a time.
 *
 * Shape of a run, all of it over AHP against a real forked server process:
 *
 * ```text
 *  phase 1 (seed)         restart, same build      phase 2 (verify)
 *  initialize ─▶ list ─▶ create ─▶ rename            list ─▶ subscribe
 *      (empty)                                    (session + title survive)
 * ```
 *
 * Two properties are load-bearing:
 *
 * - **Same directories.** Both phases receive the identical home, user-data and
 *   workspace directories. The restart is the whole point; a fresh profile
 *   would make every assertion vacuous.
 * - **External.** Nothing here imports host internals, reads the host database,
 *   or inspects logs for assertions. Contract evolution between builds is
 *   resolved through {@link IAgentHostCapabilityAdapter}, from what the build
 *   advertises — never from the checkpoint id.
 *
 * The scenario runs against the scripted mock provider. That is a deliberate
 * choice, not a convenience: a bundled provider (Copilot/Claude/Codex) cannot
 * re-describe a session after a restart until it has been materialized by a
 * real model-backed turn, which would make an otherwise host-only baseline
 * depend on replay fixtures recorded per build. The mock provider makes the
 * baseline about the *host's* persistence, which is what is under test — and
 * keeps the run tokenless, networkless and fixture-free.
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
	ILiveCompatSubscribeResult,
} from './agentHostLiveCompatProtocol.js';

/** Root channel URI. A constant of the protocol, stable across every build. */
const ROOT_CHANNEL = 'ahp-root://';
/** Provider the baseline drives; see the file header for why it is the mock. */
const PROVIDER = 'mock';
/** Title dispatched in phase 1 and expected back in phase 2. */
const BASELINE_TITLE = 'Live Compat Baseline';
const PER_CALL_TIMEOUT_MS = 30_000;

/**
 * A restored session is not necessarily describable the instant the host is
 * accepting connections: the provider is re-registered and the catalogue
 * re-read concurrently with the socket opening, and until that settles
 * `subscribe` answers with a transient "could not describe … yet". Retrying is
 * therefore part of the contract a client must implement, not a workaround —
 * but the budget is bounded so a genuinely lost session still fails.
 */
const RESTORE_ATTEMPTS = 20;
const RESTORE_RETRY_DELAY_MS = 500;

/**
 * Time allowed for a rename's catalogue write to reach disk before the host is
 * restarted. See the note at its use site: the host exposes no acknowledgment
 * for this write and does not await it on shutdown, so a bounded wait is
 * currently the only way to distinguish "lost on restart" from "restarted
 * before it was ever written". Measured to complete in well under 100ms on
 * every checkpoint in the matrix; the margin is for slower CI disks.
 */
const RENAME_SETTLE_MS = 1_000;

/** Outcome of one step, in the order the scenario performed them. */
export interface ILiveCompatStepResult {
	readonly name: string;
	readonly outcome: 'passed' | 'failed' | 'skipped';
	readonly durationMs: number;
	/** Why a step was skipped, or how it failed. Absent when it passed. */
	readonly detail?: string;
}

/** Machine-readable result of one build's baseline. */
export interface ILiveCompatScenarioResult {
	readonly scenario: string;
	readonly build: string;
	/** Provenance of the launched build (commit sha, or working-tree marker). */
	readonly buildDescription?: string;
	readonly outcome: 'passed' | 'failed';
	readonly durationMs: number;
	readonly protocolVersion?: string;
	readonly steps: readonly ILiveCompatStepResult[];
	/**
	 * Directory retained for post-mortem: holds the home, the user-data
	 * directory (and therefore the host's own logs) and the workspace, for both
	 * phases. Never deleted — a baseline exists to be diagnosed when it fails,
	 * and its state is the diagnosis.
	 */
	readonly diagnosticsPath: string;
	/** Present when the scenario failed. */
	readonly error?: string;
}

export interface ILiveCompatScenarioOptions {
	/** Root under which the per-build diagnostics directory is created. */
	readonly diagnosticsRoot?: string;
	/** Extra environment for both launches, e.g. mock-provider seeding. */
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

	skip(name: string, reason: string): void {
		this._steps.push({ name, outcome: 'skipped', durationMs: 0, detail: reason });
	}
}

/**
 * Run the same-build restart baseline for one prepared build.
 *
 * Never throws for a scenario failure: a failed build is data the caller needs
 * alongside the builds that passed, so the failure is reported in the returned
 * result. Only a defect in the runner itself propagates.
 */
export async function runSameBuildRestartBaseline(
	build: IPreparedAgentHostBuild,
	options: ILiveCompatScenarioOptions = {},
): Promise<ILiveCompatScenarioResult> {
	const startedAt = Date.now();
	const diagnosticsPath = mkdtempSync(join(options.diagnosticsRoot ?? tmpdir(), `agent-host-live-compat-${build.id}-`));
	const dirs = createPersistentDirectories(diagnosticsPath);
	const recorder = new StepRecorder();
	let server: ILiveCompatServerHandle | undefined;
	let client: LiveCompatAhpClient | undefined;
	let protocolVersion: string | undefined;

	const launch: ILiveCompatLaunchOptions = {
		serverEntry: build.serverEntry,
		homeDir: dirs.homeDir,
		userDataDir: dirs.userDataDir,
		env: options.env,
	};

	try {
		server = await recorder.run('launch', () => startLiveCompatServer(launch));
		client = await connect(server);

		const adapter = await recorder.run('initialize', async () => {
			const initialize = await client!.call<ILiveCompatInitializeResult>('initialize', {
				channel: ROOT_CHANNEL,
				protocolVersions: [...LIVE_COMPAT_OFFERED_PROTOCOL_VERSIONS],
				clientId: `live-compat-${build.id}-seed`,
			}, PER_CALL_TIMEOUT_MS);
			protocolVersion = initialize.protocolVersion;
			return createAgentHostCapabilityAdapter({
				protocolVersion: initialize.protocolVersion,
				providerCapabilities: await readProviderCapabilities(client!),
			});
		});

		await recorder.run('list-empty', async () => {
			const listed = await client!.call<ILiveCompatSessionList>('listSessions', { channel: ROOT_CHANNEL }, PER_CALL_TIMEOUT_MS);
			assertEqual(listed.items?.length ?? 0, 0, 'a fresh profile must list no sessions');
		});

		const sessionUri = await recorder.run('create-session', async () => {
			const uri = `${PROVIDER}:/live-compat-${build.id}-${Date.now()}`;
			await client!.call('createSession', { channel: uri, provider: PROVIDER }, PER_CALL_TIMEOUT_MS);
			await client!.call<ILiveCompatSubscribeResult>('subscribe', { channel: uri }, PER_CALL_TIMEOUT_MS);
			return uri;
		});

		await renameStep(recorder, client, adapter, sessionUri);
		await peerChatStep(recorder, adapter);

		// The restart is only meaningful once the first process has fully exited
		// and released the profile it was holding.
		await recorder.run('restart', async () => {
			client!.close();
			client = undefined;
			await stopLiveCompatServer(server);
			server = undefined;
			server = await startLiveCompatServer({
				...launch,
				// The mock provider keeps its session index in memory, so a
				// restarted process must be told which sessions the *provider*
				// side already knows about. This mirrors what a real provider
				// recovers from its own on-disk state; the host's persistence —
				// which is what is under test — is not seeded and must be
				// reconstructed from the retained user-data directory alone.
				env: { ...options.env, VSCODE_AGENT_HOST_MOCK_SEED_SESSIONS: sessionUri },
			});
			client = await connect(server);
			await client.call<ILiveCompatInitializeResult>('initialize', {
				channel: ROOT_CHANNEL,
				protocolVersions: [...LIVE_COMPAT_OFFERED_PROTOCOL_VERSIONS],
				clientId: `live-compat-${build.id}-verify`,
			}, PER_CALL_TIMEOUT_MS);
		});

		await recorder.run('list-restored', async () => {
			const listed = await client!.call<ILiveCompatSessionList>('listSessions', { channel: ROOT_CHANNEL }, PER_CALL_TIMEOUT_MS);
			const restored = listed.items?.find(item => item.resource === sessionUri);
			assertEqual(restored?.resource, sessionUri, 'the seeded session must be listed after a restart');
			if (adapter.supportsSessionRename) {
				assertEqual(restored?.title, BASELINE_TITLE, 'the listed session must retain its custom title');
			}
		});

		await recorder.run('subscribe-restored', async () => {
			const state = await subscribeWithRestoreRetry(client!, sessionUri);
			if (adapter.supportsSessionRename) {
				assertEqual(state.title, BASELINE_TITLE, 'the resubscribed session must retain its custom title');
			}
		});

		return result(build, recorder, diagnosticsPath, startedAt, protocolVersion, undefined);
	} catch (error) {
		return result(build, recorder, diagnosticsPath, startedAt, protocolVersion, messageOf(error));
	} finally {
		client?.close();
		await stopLiveCompatServer(server).catch(() => undefined);
	}
}

async function renameStep(
	recorder: StepRecorder,
	client: LiveCompatAhpClient | undefined,
	adapter: IAgentHostCapabilityAdapter,
	sessionUri: string,
): Promise<void> {
	if (!adapter.supportsSessionRename) {
		recorder.skip('rename-session', `negotiated protocol ${adapter.protocolVersion} predates client-dispatchable session/titleChanged`);
		return;
	}
	await recorder.run('rename-session', async () => {
		// `dispatchAction` is a write-ahead notification, so the readback is what
		// confirms the host accepted and reduced it.
		client!.notify('dispatchAction', {
			channel: sessionUri,
			clientSeq: 1,
			action: { type: 'session/titleChanged', title: BASELINE_TITLE },
		});
		const state = await pollForTitle(client!, sessionUri, BASELINE_TITLE);
		assertEqual(state.title, BASELINE_TITLE, 'the dispatched title must be observable before the restart');
		// Reducing the action and persisting it are distinct steps, and only the
		// second is what a restart can recover.
		//
		// There is no AHP signal for the second one. `subscribe` and
		// `listSessions` are both served from in-memory state, so they answer as
		// soon as the reducer has run, and the catalogue write that actually
		// makes the rename durable is queued fire-and-forget behind them. It is
		// also not covered by the host's shutdown flush, which awaits the
		// session-data and customization stores but not the catalogue store, so
		// an immediate restart can genuinely lose a rename that every readable
		// surface already reports as applied.
		//
		// A settle window is therefore the honest instrument here, and it is
		// deliberately explicit rather than hidden inside a retry: the baseline
		// is not asserting "renames are durable instantly", it is asserting
		// "a rename that has been given time to persist survives a restart".
		// Narrowing this window is a host-side change (an observable durability
		// ack), not a scenario change.
		await timeout(RENAME_SETTLE_MS);
	});
}

/**
 * Peer chats are recorded as an explicitly skipped step rather than omitted.
 *
 * The mock provider does not advertise `multipleChats`, so no build in the
 * matrix can create one here — but that is a property of the *provider*, and
 * stating it in the result keeps the baseline's coverage honest instead of
 * silently narrower than it looks.
 */
async function peerChatStep(recorder: StepRecorder, adapter: IAgentHostCapabilityAdapter): Promise<void> {
	if (!adapter.supportsPeerChats(PROVIDER)) {
		recorder.skip('peer-chat', `provider '${PROVIDER}' does not advertise multipleChats on this build`);
		return;
	}
	// Reached only if the reference provider gains the capability; until then
	// the baseline deliberately makes no peer-chat claim.
	recorder.skip('peer-chat', 'peer-chat baseline coverage is owned by the cross-version matrices');
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

async function pollForTitle(client: LiveCompatAhpClient, sessionUri: string, expected: string): Promise<{ title?: string }> {
	let state: { title?: string } = {};
	for (let attempt = 0; attempt < RESTORE_ATTEMPTS; attempt++) {
		const subscribed = await client.call<ILiveCompatSubscribeResult>('subscribe', { channel: sessionUri }, PER_CALL_TIMEOUT_MS);
		state = subscribed.snapshot?.state ?? {};
		if (state.title === expected) {
			return state;
		}
		await timeout(RESTORE_RETRY_DELAY_MS);
	}
	return state;
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

function result(
	build: IPreparedAgentHostBuild,
	recorder: StepRecorder,
	diagnosticsPath: string,
	startedAt: number,
	protocolVersion: string | undefined,
	error: string | undefined,
): ILiveCompatScenarioResult {
	return {
		scenario: 'same-build-restart-baseline',
		build: build.id,
		buildDescription: build.description,
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
