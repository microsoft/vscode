/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from '../../../../../base/common/path.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import type { ITelemetryService } from '../../../../telemetry/common/telemetry.js';
import { IDLE_UNLOAD_MS, SYSTEM_DRAIN_TIMEOUT_MS } from '../../../node/copilot/localModelBridge/shim/constants.js';
import { acquireProcessLock, type IProcessLockOptions } from '../../../node/copilot/localModelBridge/shim/processLock.js';
import { getWindowsTerminateCommand, NodeLongLivedProcessSpawner, NodeProcessControl, parseLinuxProcessStartTime, parseWindowsProcessInfo, type IProcessInfo, type IProcessRunner, type IProcessRunResult } from '../../../node/copilot/localModelBridge/shim/processRunner.js';
import { buildLlamaServerArgs, buildServerEnvironment, ServerSupervisor, SERVER_LOCK_TYPE, SERVER_RECORD_FILE_NAME, type ILocalModelServerEvent, type IServerLaunchPlan, type IServerRecord, type IServerSupervisorTimings } from '../../../node/copilot/localModelBridge/shim/serverSupervisor.js';
import type { LocalModelServingError } from '../../../node/copilot/localModelBridge/shim/servingAccess.js';
import type { IServerStartConfig } from '../../../node/copilot/localModelBridge/shim/servingProfile.js';
import { createFakeLlamaFetch, FakeLlamaSpawner, FakeProcessControl, settle, waitFor, type IFakeLlamaServerOptions } from './fakeLlamaServer.js';
import { FakeClock } from './fakeServingAccess.js';

interface ITestPlan extends IServerLaunchPlan {
	readonly built: IServerStartConfig[];
	readonly admitted: IServerStartConfig[];
}

/** mai-coder-llamacpp 0.4.1-dev (build 4, commit 9a3ad6c) serving MAI-Code-1.1-Flash v5 with DFlash: healthy, then this on the first completion, and exit. */
const DFLASH_ASSERT_STDERR = 'C:\\src\\t\\mai-coder-llamacpp\\src\\llama-graph.cpp:1379: GGML_ASSERT(t_layer_inp[il] != nullptr && "layer input tensor is null") failed\n';

suite('localModel server supervisor (§5.8)', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let dir: string;
	let modelsDir: string;
	setup(async () => {
		dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-local-model-supervisor-'));
		modelsDir = path.join(dir, 'azureml-models');
	});
	teardown(async () => {
		await fs.promises.rm(dir, { recursive: true, force: true });
	});

	function createPlan(overrides: Partial<IServerLaunchPlan> = {}): ITestPlan {
		const built: IServerStartConfig[] = [];
		const admitted: IServerStartConfig[] = [];
		const familyDir = path.join(dir, 'azureml-models', 'azureml', 'Qwen2.5-0.5B-Instruct');
		return {
			familyId: 'qwen2.5-0.5b-instruct-local',
			contentId: 'content-1',
			capiId: 'qwen2.5-0.5b-instruct-local',
			alias: 'Qwen2.5-0.5B-Instruct',
			displayName: 'Qwen 0.5B',
			binaryPath: path.join(dir, 'winget', 'llama-server.exe'),
			versionDir: path.join(familyDir, '1'),
			familyDir,
			modelPath: path.join(familyDir, '1', 'qwen.gguf'),
			hasDraft: false,
			parallel: 1,
			profile: 'full-gpu',
			ctxReduced: false,
			backend: 'vulkan',
			initialConfig: { flashAttn: 'on', speculative: false, ctxSize: 32768 },
			buildArgs: config => {
				built.push(config);
				return ['--flash-attn', config.flashAttn ?? 'auto', '--jinja'];
			},
			admit: async config => {
				admitted.push(config);
				return { admitted: true, device: 'Vulkan0' };
			},
			built,
			admitted,
			...overrides,
		};
	}

	function createSupervisor(options: { readonly server?: Partial<IFakeLlamaServerOptions>; readonly platform?: NodeJS.Platform; readonly writeRecord?: (file: string, text: string) => Promise<void>; readonly lockOptions?: IProcessLockOptions; readonly timings?: Partial<IServerSupervisorTimings> } = {}) {
		const clock = new FakeClock();
		const spawner = new FakeLlamaSpawner(clock);
		const control = new FakeProcessControl(spawner);
		const server: IFakeLlamaServerOptions = { nCtx: 32768, totalSlots: 1, decodeTps: 42.5, ttftMs: 120, loading: false, ...options.server };
		const events: ILocalModelServerEvent[] = [];
		const telemetry: Pick<ITelemetryService, 'publicLog2'> = { publicLog2: (_name: string, data?: unknown) => { events.push(data as ILocalModelServerEvent); } };
		let port = 41000;
		const supervisor = store.add(new ServerSupervisor({
			spawner,
			processControl: control,
			fetch: createFakeLlamaFetch(spawner, clock, server),
			clock,
			log: new NullLogService(),
			telemetry,
			modelsDir,
			platform: options.platform ?? 'win32',
			target: 'win32-arm64',
			homeDir: dir,
			env: { PATH: 'C:\\Windows\\System32', GITHUB_TOKEN: 'gho_secret', LLAMA_ARG_HOST: '0.0.0.0', COPILOT_AGENT_TOKEN: 'x', VK_ICD_FILENAMES: 'icd.json' },
			allocatePort: async () => port++,
			randomHex: bytes => 'ab'.repeat(bytes),
			timings: { recordRetryDelaysMs: [1, 1, 1], exitWaitMs: 20, ...options.timings },
			...(options.writeRecord ? { writeRecord: options.writeRecord } : {}),
			...(options.lockOptions ? { lockOptions: options.lockOptions } : {}),
		}));
		return { clock, spawner, control, server, events, supervisor };
	}

	/** The server record, parsed; its raw text when it is not JSON; `undefined` when there is none. */
	async function readRecord(): Promise<unknown> {
		try {
			const raw = await fs.promises.readFile(path.join(modelsDir, SERVER_RECORD_FILE_NAME), 'utf8');
			try {
				return JSON.parse(raw);
			} catch {
				return raw;
			}
		} catch {
			return undefined;
		}
	}

	/** Leaves a server record behind, as an Agent Host that died would have. */
	async function writeRecord(record: IServerRecord | string): Promise<void> {
		await fs.promises.mkdir(modelsDir, { recursive: true });
		await fs.promises.writeFile(path.join(modelsDir, SERVER_RECORD_FILE_NAME), typeof record === 'string' ? record : JSON.stringify(record));
	}

	/** Whether nothing holds the server lock. */
	async function lockIsFree(): Promise<boolean> {
		const lock = await acquireProcessLock(modelsDir, SERVER_LOCK_TYPE);
		if (typeof lock === 'string') {
			return false;
		}
		lock.dispose();
		return true;
	}

	const outcomeOf = (attempt: Promise<unknown>) => attempt.then(() => 'started', (e: LocalModelServingError) => e.code);

	test('spawns the §5.8 command line, waits for /health, reads /props and passes the Auto gate after warm-up', async () => {
		const { supervisor, spawner, events } = createSupervisor();
		const plan = createPlan();
		const identity = await supervisor.start(plan);
		const child = spawner.processes[0];
		const state = supervisor.state.get();

		assert.deepStrictEqual({
			identity,
			file: child.file,
			args: child.args,
			cwd: child.options.cwd,
			env: child.options.env,
			detached: child.options.detached,
			state: { server: state.server, endpoint: state.endpoint, props: state.props, autoEligible: state.autoEligible, warmup: state.warmup, device: state.device },
			record: await readRecord(),
			events: events.map(event => event.event),
		}, {
			identity: { familyId: plan.familyId, contentId: 'content-1', capiId: plan.capiId, alias: plan.alias, servingGeneration: 1 },
			file: plan.binaryPath,
			args: ['--host', '127.0.0.1', '--port', '41000', '--model', plan.modelPath, '--alias', 'Qwen2.5-0.5B-Instruct', '--device', 'Vulkan0', '--split-mode', 'none', '--ctx-size', '32768', '--parallel', '1', '--flash-attn', 'on', '--jinja'],
			cwd: plan.versionDir,
			env: { PATH: 'C:\\Windows\\System32', VK_ICD_FILENAMES: 'icd.json', LLAMA_API_KEY: 'ab'.repeat(32) },
			detached: false,
			state: { server: 'ready', endpoint: { baseUrl: 'http://127.0.0.1:41000', apiKey: 'ab'.repeat(32) }, props: { nCtx: 32768, totalSlots: 1 }, autoEligible: true, warmup: { decodeTps: 42.5, ttftMs: 120, outputTokens: 3 }, device: 'Vulkan0' },
			record: { pid: 4000, processStartTime: 1_000_000, imagePath: plan.binaryPath, port: 41000 },
			events: ['ready'],
		});
	});

	test('a slow warm-up still serves direct selection but is not declared to Auto', async () => {
		const { supervisor } = createSupervisor({ server: { decodeTps: 3, ttftMs: 12_000 } });
		await supervisor.start(createPlan());
		const state = supervisor.state.get();
		assert.deepStrictEqual({ server: state.server, autoEligible: state.autoEligible, warmup: state.warmup }, { server: 'ready', autoEligible: false, warmup: { decodeTps: 3, ttftMs: 12_000, outputTokens: 3 } });
	});

	test('admission rejection reports memoryBusy, spawns nothing and releases the lock', async () => {
		const { supervisor, spawner, events } = createSupervisor();
		const plan = createPlan({ admit: async () => ({ admitted: false, error: { code: 'memoryBusy', message: 'Not enough free GPU memory right now (1 GB free, 2 GB needed).', actions: ['retry'] } }) });
		const error = await supervisor.start(plan).then(() => undefined, (e: LocalModelServingError) => e);
		const state = supervisor.state.get();
		assert.deepStrictEqual({ code: error?.code, spawns: spawner.processes.length, server: state.server, stateError: state.error?.code, actions: state.error?.actions, lockFree: await lockIsFree(), events: events.map(event => event.event) }, {
			code: 'memoryBusy', spawns: 0, server: 'error', stateError: 'memoryBusy', actions: ['retry'], lockFree: true, events: ['memoryBusy'],
		});
	});

	test('one server owner per machine: a second supervisor is ownedElsewhere while the first holds the lock, and starts once it is released', async () => {
		const first = createSupervisor();
		const second = createSupervisor();
		await first.supervisor.start(createPlan());
		const other = createPlan({ familyId: 'other-local', contentId: 'content-2', capiId: 'other-local', alias: 'Other', displayName: 'Other' });
		const whileHeld = await outcomeOf(second.supervisor.start(other));
		const error = second.supervisor.state.get().error;
		const check = await second.supervisor.checkPreviousServer();
		await first.supervisor.stop('user');
		const afterRelease = await outcomeOf(second.supervisor.start(other));
		assert.deepStrictEqual({ whileHeld, error, check, terminated: second.control.terminated, afterRelease, spawns: second.spawner.processes.length, events: second.events.map(event => event.event) }, {
			whileHeld: 'ownedElsewhere',
			error: { code: 'ownedElsewhere', message: 'Other can\'t start while another VS Code instance is running an on-device model.', actions: [] },
			check: 'ownedElsewhere',
			terminated: [],
			afterRelease: 'started',
			spawns: 1,
			events: ['ownedElsewhere', 'ready'],
		});
	});

	test('orphan recovery stops a recorded server only when pid, start time and image all match; a gone or reused pid only deletes the record', async () => {
		const binary = createPlan().binaryPath;
		const recover = async (info: IProcessInfo | undefined) => {
			const { supervisor, control, events } = createSupervisor();
			await writeRecord({ pid: 5000, processStartTime: 900_000, imagePath: binary, port: 1 });
			if (info) {
				control.others.set(5000, info);
			}
			const check = await supervisor.checkPreviousServer();
			return { check, terminated: control.terminated, record: await readRecord(), events: events.map(event => event.event) };
		};
		assert.deepStrictEqual({
			matching: await recover({ startTime: 900_800, imagePath: binary.toUpperCase() }),
			gone: await recover(undefined),
			reusedPid: await recover({ startTime: 950_000, imagePath: binary }),
			otherImage: await recover({ startTime: 900_000, imagePath: 'C:\\Windows\\notepad.exe' }),
		}, {
			matching: { check: 'none', terminated: [5000], record: undefined, events: ['orphanRecovered'] },
			gone: { check: 'none', terminated: [], record: undefined, events: [] },
			reusedPid: { check: 'none', terminated: [], record: undefined, events: [] },
			otherImage: { check: 'none', terminated: [], record: undefined, events: [] },
		});
	});

	test('an orphan that is not confirmed stopped, or cannot be verified, blocks the start with Stop Previous Server and keeps its record', async () => {
		const plan = createPlan();
		const record: IServerRecord = { pid: 5000, processStartTime: 900_000, imagePath: plan.binaryPath, port: 1 };
		const attempt = async (info: IProcessInfo, terminationFails: boolean) => {
			const { supervisor, spawner, control } = createSupervisor();
			await writeRecord(record);
			control.others.set(5000, info);
			if (terminationFails) {
				control.failing.add(5000);
			}
			const error = await outcomeOf(supervisor.start(plan));
			return { error, state: supervisor.state.get().error, terminated: control.terminated, spawns: spawner.processes.length, record: await readRecord(), lockFree: await lockIsFree() };
		};
		const orphan = { code: 'orphan', message: 'A previous on-device model server may still be running. Select Stop Previous Server to stop it.', actions: ['stopPrevious'] };
		assert.deepStrictEqual({
			notStopped: await attempt({ startTime: 900_000, imagePath: plan.binaryPath }, true),
			unverifiable: await attempt({ startTime: undefined, imagePath: undefined }, false),
		}, {
			notStopped: { error: 'orphan', state: orphan, terminated: [5000], spawns: 0, record, lockFree: true },
			unverifiable: { error: 'orphan', state: orphan, terminated: [], spawns: 0, record, lockFree: true },
		});
	});

	test('a garbled record blocks with the orphan error; only Stop Previous Server deletes it', async () => {
		const { supervisor, spawner } = createSupervisor();
		const plan = createPlan();
		await writeRecord('{"pid":40');
		const start = await outcomeOf(supervisor.start(plan));
		const check = await supervisor.checkPreviousServer();
		const kept = await readRecord();
		const stopPrevious = await supervisor.checkPreviousServer({ stopPrevious: true });
		const afterStopPrevious = await readRecord();
		await supervisor.start(plan);
		assert.deepStrictEqual({ start, check, kept, stopPrevious, afterStopPrevious, server: supervisor.state.get().server, spawns: spawner.processes.length }, {
			start: 'orphan', check: 'orphan', kept: '{"pid":40', stopPrevious: 'none', afterStopPrevious: undefined, server: 'ready', spawns: 1,
		});
	});

	test('a server lock left behind by a holder that died (macOS) blocks with the orphan error; only Stop Previous Server clears it, then recovers as usual', async () => {
		const steps: string[] = [];
		let stale = true;
		const { supervisor, spawner, control } = createSupervisor({
			lockOptions: {
				platform: 'darwin',
				listen: async () => {
					steps.push('listen');
					return stale ? undefined : { dispose: () => steps.push('release') };
				},
				probe: async () => {
					steps.push('probe');
					return stale ? 'ECONNREFUSED' : undefined;
				},
				unlink: async () => {
					steps.push('unlink');
					stale = false;
				},
			},
		});
		const plan = createPlan();
		await writeRecord({ pid: 5000, processStartTime: 900_000, imagePath: plan.binaryPath, port: 1 });
		control.others.set(5000, { startTime: 900_000, imagePath: plan.binaryPath });
		const start = await outcomeOf(supervisor.start(plan));
		const error = supervisor.state.get().error;
		const check = await supervisor.checkPreviousServer();
		const stopPrevious = await supervisor.checkPreviousServer({ stopPrevious: true });
		await supervisor.start(plan);
		assert.deepStrictEqual({ start, error, check, stopPrevious, terminated: control.terminated, server: supervisor.state.get().server, spawns: spawner.processes.length, steps }, {
			start: 'orphan',
			error: { code: 'orphan', message: 'A previous on-device model server may still be running. Select Stop Previous Server to stop it.', actions: ['stopPrevious'] },
			check: 'orphan',
			stopPrevious: 'none',
			terminated: [5000],
			server: 'ready',
			spawns: 1,
			steps: ['listen', 'probe', 'listen', 'probe', 'probe', 'unlink', 'listen', 'release', 'listen'],
		});
	});

	test('a start time the OS cannot report is recorded as the spawn time, which recovery later matches; after a slow spawn nothing is recorded or kept running', async () => {
		const plan = createPlan();
		const unreadable = async (): Promise<IProcessInfo> => ({ startTime: undefined, imagePath: undefined });

		const slow = createSupervisor();
		slow.control.inspect = unreadable;
		slow.spawner.spawnMs = 1_500;
		const slowSpawn = await outcomeOf(slow.supervisor.start(plan));
		const afterSlowSpawn = { exited: slow.spawner.processes.map(child => child.hasExited), record: await readRecord() };

		const first = createSupervisor();
		first.control.inspect = async () => {
			// The start time query fails, late.
			first.clock.advance(15_000);
			return unreadable();
		};
		await first.supervisor.start(plan);
		const record = await readRecord() as IServerRecord;
		const spawnedAt = first.spawner.processes[0].spawnedAt;
		await first.supervisor.stop('user');

		// Its Agent Host died with the server still running: the OS reports its start in whole seconds, and terminating it fails.
		const next = createSupervisor();
		await writeRecord(record);
		next.control.others.set(record.pid, { startTime: spawnedAt - 400, imagePath: plan.binaryPath });
		next.control.failing.add(record.pid);
		const replacement = await outcomeOf(next.supervisor.start(plan));
		assert.deepStrictEqual({ slowSpawn, afterSlowSpawn, recordedStart: record.processStartTime - spawnedAt, replacement, terminated: next.control.terminated, kept: await readRecord(), spawns: next.spawner.processes.length }, {
			slowSpawn: 'startFailed',
			afterSlowSpawn: { exited: [true], record: undefined },
			recordedStart: 0,
			replacement: 'orphan',
			terminated: [4000],
			kept: record,
			spawns: 0,
		});
	});

	test('idle unload stops the server after IDLE_UNLOAD_MS only when nothing is in flight', async () => {
		const { supervisor, clock, control, events } = createSupervisor();
		const identity = await supervisor.start(createPlan());
		const lease = supervisor.acquireLease(identity)!;
		clock.advance(IDLE_UNLOAD_MS * 2);
		const whileLeased = supervisor.state.get().server;
		lease.dispose();
		clock.advance(IDLE_UNLOAD_MS - 1);
		const beforeTimeout = supervisor.state.get().server;
		clock.advance(1);
		await waitFor(() => supervisor.state.get().server === 'stopped');
		assert.deepStrictEqual({ whileLeased, beforeTimeout, terminated: control.terminated, events: events.map(event => event.event) }, {
			whileLeased: 'ready', beforeTimeout: 'ready', terminated: [4000], events: ['ready', 'idleUnload'],
		});
	});

	test('crashes restart after 5 s and 30 s with new generations, then report crashed with Retry', async () => {
		const { supervisor, spawner, clock, events } = createSupervisor();
		const plan = createPlan();
		await supervisor.start(plan);
		const generations: (number | undefined)[] = [];
		for (const backoff of [5_000, 30_000]) {
			spawner.running!.writeStderr(`ggml_vulkan: device lost while loading ${plan.modelPath}\n`);
			spawner.running!.exit(0xC0000005);
			await waitFor(() => supervisor.state.get().server === 'starting');
			const declared = supervisor.state.get().autoEligible;
			clock.advance(backoff - 1);
			const before = spawner.processes.length;
			clock.advance(1);
			await waitFor(() => supervisor.state.get().server === 'ready');
			generations.push(supervisor.state.get().identity?.servingGeneration);
			assert.deepStrictEqual({ declared, spawnedBeforeBackoff: before === spawner.processes.length - 1 }, { declared: false, spawnedBeforeBackoff: true });
		}
		spawner.running!.exit(1);
		await waitFor(() => supervisor.state.get().server === 'error');
		assert.deepStrictEqual({ generations, spawns: spawner.processes.length, error: supervisor.state.get().error, events: events.map(event => event.event) }, {
			generations: [2, 3],
			spawns: 3,
			error: { code: 'crashed', message: 'Qwen 0.5B stopped unexpectedly. Auto is using cloud models. Select Retry to restart it.', actions: ['retry'] },
			events: ['ready', 'crash', 'restart', 'crash', 'restart', 'crash'],
		});
	});

	test('a user stop drains with no timeout; Stop Now ends the drain and terminates the server', async () => {
		const { supervisor, clock, control, events } = createSupervisor();
		const identity = await supervisor.start(createPlan());
		const lease = supervisor.acquireLease(identity)!;
		const stopping = supervisor.stop('user');
		await waitFor(() => !!supervisor.state.get().drain);
		clock.advance(60 * 60_000);
		await waitFor(() => true);
		const afterAnHour = { server: supervisor.state.get().server, drain: supervisor.state.get().drain, newLease: supervisor.acquireLease(identity), terminated: [...control.terminated] };
		const cancelled = supervisor.stopNow();
		const result = await stopping;
		lease.dispose();
		assert.deepStrictEqual({ afterAnHour, cancelled, result: { drainedStreams: result.drainedStreams, stopNow: result.stopNow }, server: supervisor.state.get().server, terminated: control.terminated, events: events.map(event => event.event) }, {
			afterAnHour: { server: 'stopping', drain: { runningStreams: 1, kind: 'user' }, newLease: undefined, terminated: [] },
			cancelled: 1,
			result: { drainedStreams: 1, stopNow: true },
			server: 'stopped',
			terminated: [4000],
			events: ['ready', 'stopNow'],
		});
	});

	test('a cancelled user stop leaves the server serving: queued, nothing happens; while it drains, new work is admitted again and holds still apply; not once a system stop escalated it', async () => {
		const { supervisor, control, events } = createSupervisor();
		const identity = await supervisor.start(createPlan());
		const queued = new AbortController();
		queued.abort();
		const beforeRun = await supervisor.stop('user', queued.signal);

		const hold = supervisor.acquireHold(identity)!;
		const cancellation = new AbortController();
		const stopping = supervisor.stop('user', cancellation.signal);
		await waitFor(() => !!supervisor.state.get().drain);
		const draining = { server: supervisor.state.get().server, newLease: !!supervisor.acquireLease(identity), holdAdmitted: supervisor.admitsHold(hold) };
		cancellation.abort();
		const cancelled = await stopping;
		const lease = supervisor.acquireLease(identity);
		const { server, drain, autoEligible } = supervisor.state.get();
		const resumed = { server, drain, autoEligible, newLease: !!lease, holdAdmitted: supervisor.admitsHold(hold), responses: supervisor.responseCount(identity.servingGeneration) };
		lease?.dispose();

		// A system stop pending behind it makes the drain a system drain, which a cancel doesn't take back.
		const escalation = new AbortController();
		const userStop = supervisor.stop('user', escalation.signal);
		await waitFor(() => !!supervisor.state.get().drain);
		const systemStop = supervisor.stop('system');
		escalation.abort();
		const escalated = await userStop;
		await systemStop;
		hold.dispose();
		assert.deepStrictEqual({ beforeRun, draining, cancelled: { drainedStreams: cancelled.drainedStreams, stopNow: cancelled.stopNow, cancelled: cancelled.cancelled }, resumed, escalated: escalated.cancelled ?? false, server: supervisor.state.get().server, terminated: control.terminated, events: events.map(event => event.event) }, {
			beforeRun: { drainedStreams: 0, drainMs: 0, stopNow: false, cancelled: true },
			draining: { server: 'stopping', newLease: false, holdAdmitted: true },
			cancelled: { drainedStreams: 1, stopNow: false, cancelled: true },
			resumed: { server: 'ready', drain: undefined, autoEligible: true, newLease: true, holdAdmitted: true, responses: 2 },
			escalated: false,
			server: 'stopped',
			terminated: [4000],
			events: ['ready'],
		});
	});

	test('a user stop completes when the last running response ends; a system stop waits at most 10 s', async () => {
		const { supervisor, clock, control } = createSupervisor();
		const plan = createPlan();
		let identity = await supervisor.start(plan);
		let lease = supervisor.acquireLease(identity)!;
		const userStop = supervisor.stop('user');
		await waitFor(() => !!supervisor.state.get().drain);
		lease.dispose();
		const user = await userStop;

		identity = await supervisor.start(plan);
		lease = supervisor.acquireLease(identity)!;
		const systemStop = supervisor.stop('system');
		await waitFor(() => !!supervisor.state.get().drain);
		clock.advance(SYSTEM_DRAIN_TIMEOUT_MS);
		const system = await systemStop;
		lease.dispose();
		assert.deepStrictEqual({ user, system: { drainedStreams: system.drainedStreams, stopNow: system.stopNow, drainMs: system.drainMs }, terminated: control.terminated, record: await readRecord() }, {
			user: { drainedStreams: 1, drainMs: 0, stopNow: false },
			system: { drainedStreams: 1, stopNow: false, drainMs: SYSTEM_DRAIN_TIMEOUT_MS },
			terminated: [4000, 4001],
			record: undefined,
		});
	});

	test('start failures walk the downgrade sequence once per step, then report insufficientMemory', async () => {
		const { supervisor, spawner, events } = createSupervisor({ server: { loading: true } });
		spawner.behavior = child => {
			child.writeStderr('ggml_vulkan: Device memory allocation of size 4096 failed.\nllama_model_load: error: out of device memory\n');
			child.exit(1);
		};
		const plan = createPlan({ hasDraft: true, initialConfig: { flashAttn: 'on', speculative: true, ctxSize: 262144 } });
		const error = await supervisor.start(plan).then(() => undefined, (e: LocalModelServingError) => e);
		assert.deepStrictEqual({
			code: error?.code,
			configs: plan.built,
			draftDevice: spawner.processes.map(child => child.arg('--device-draft') ?? null),
			ctx: spawner.processes.map(child => child.arg('--ctx-size')),
			events: events.map(event => event.event === 'profileDowngraded' ? `${event.event}:${event.errorCode}` : event.event),
		}, {
			code: 'insufficientMemory',
			configs: [
				{ flashAttn: 'on', speculative: true, ctxSize: 262144 },
				{ flashAttn: 'auto', speculative: true, ctxSize: 262144 },
				{ flashAttn: 'auto', speculative: false, ctxSize: 262144 },
				{ flashAttn: 'auto', speculative: false, ctxSize: 131072 },
				{ flashAttn: 'auto', speculative: false, ctxSize: 65536 },
			],
			draftDevice: ['Vulkan0', 'Vulkan0', null, null, null],
			ctx: ['262144', '262144', '262144', '131072', '65536'],
			events: ['profileDowngraded:flashAttnAuto', 'profileDowngraded:dropSpeculative', 'profileDowngraded:reduceContext', 'profileDowngraded:reduceContext', 'startFailed'],
		});
	});

	test('load time: a build that doesn\'t know the model\'s architecture fails with runtimeUnsupportedModel at once, without downgrade retries, with directions to get one that can, naming the first llama.cpp release that runs MAI\'s architecture (maion-coder, b11658)', async () => {
		const run = async (architecture: string) => {
			const { supervisor, spawner, events } = createSupervisor({ server: { loading: true } });
			spawner.behavior = child => {
				// winget b11459 loading MAI-Code-1.1-Flash v5 (paths shortened).
				child.writeStderr(`0.00.102.227 I srv    load_model: loading model 'C:\\models\\MAI-Code-1.1-Flash-Q2-XS.gguf'\n0.00.252.163 E llama_model_load: error loading model: unknown model architecture: '${architecture}'\n0.00.397.148 E srv  llama_server: exiting due to model loading error\n`);
				child.exit(1);
			};
			const error = await supervisor.start(createPlan({ hasDraft: true, displayName: 'MAI Code 1.1 Flash', runtimeVersion: '0.6.0-dev (b11459)', architecture, initialConfig: { flashAttn: 'on', speculative: true, ctxSize: 262144 } })).then(() => undefined, (e: LocalModelServingError) => e);
			const result = { error: { code: error?.code, message: error?.message, actions: error?.actions }, state: supervisor.state.get().error, spawns: spawner.processes.length, events: events.map(event => `${event.event}:${event.errorCode}`) };
			supervisor.dispose();
			return result;
		};
		const expected = (directions: string) => {
			const error = { code: 'runtimeUnsupportedModel', message: `This llama.cpp build (0.6.0-dev (b11459)) can't run MAI Code 1.1 Flash. ${directions}, then set Chat \u203a Copilot \u203a Local Model: Llama Server Path (chat.copilot.localModel.llamaServerPath) to its llama-server and select Retry.`, actions: ['getLlamaCpp', 'openSettings', 'retry'] };
			return { error, state: error, spawns: 1, events: ['startFailed:runtimeUnsupportedModel'] };
		};
		assert.deepStrictEqual({ mai: await run('maion-coder'), other: await run('qwen9') }, {
			mai: expected('Install llama.cpp b11658 or later'),
			other: expected('Install a llama.cpp build that supports it'),
		});
	});

	test('an address already in use retries with another ephemeral port', async () => {
		const { supervisor, spawner } = createSupervisor({ server: { loading: child => child.port === 41000 } });
		spawner.behavior = (child, index) => {
			if (index === 0) {
				child.writeStderr('main: couldn\'t bind HTTP server socket, hostname: 127.0.0.1, port: 41000\n');
				child.exit(1);
			}
		};
		await supervisor.start(createPlan());
		assert.deepStrictEqual({ ports: spawner.processes.map(child => child.port), server: supervisor.state.get().server }, { ports: [41000, 41001], server: 'ready' });
	});

	test('concurrent starts of the same plan share one start', async () => {
		const { supervisor, spawner } = createSupervisor();
		const plan = createPlan();
		const [first, second] = await Promise.all([supervisor.start(plan), supervisor.start(plan)]);
		const third = await supervisor.start(plan);
		assert.deepStrictEqual({ first, sameAsSecond: first === second || first.servingGeneration === second.servingGeneration, third: third.servingGeneration, spawns: spawner.processes.length }, { first, sameAsSecond: true, third: 1, spawns: 1 });
	});

	test('a child that exits during the warm-up is a failed start: never ready, no lease, lock released', async () => {
		const { supervisor, spawner, events } = createSupervisor({ server: { onChatCompletion: process => process.exit(1) } });
		const plan = createPlan();
		const error = await supervisor.start(plan).then(() => undefined, (e: LocalModelServingError) => e.code);
		const state = supervisor.state.get();
		assert.deepStrictEqual({
			error,
			server: state.server,
			stateError: state.error?.code,
			lease: supervisor.acquireLease({ familyId: plan.familyId, contentId: plan.contentId, capiId: plan.capiId, alias: plan.alias, servingGeneration: 1 }),
			generation: supervisor.servingGeneration,
			spawns: spawner.processes.length,
			record: await readRecord(),
			events: events.map(event => event.event),
		}, {
			error: 'startFailed',
			server: 'error',
			stateError: 'startFailed',
			lease: undefined,
			generation: 0,
			spawns: 1,
			record: undefined,
			events: ['startFailed'],
		});
	});

	test('a crash on the first completion without speculative decoding is a generic crash: no second downgrade, no loop', async () => {
		const { supervisor, spawner, events } = createSupervisor({ server: { onChatCompletion: process => { process.writeStderr(DFLASH_ASSERT_STDERR); process.exit(3); } } });
		let recorded = 0;
		const plan = createPlan({ hasDraft: true, initialConfig: { flashAttn: 'on', speculative: true, ctxSize: 262144 }, onSpeculativeUnsupported: () => recorded++ });
		const error = await supervisor.start(plan).then(() => undefined, (e: LocalModelServingError) => e.code);
		assert.deepStrictEqual({ error, spawns: spawner.processes.length, recorded, events: events.map(event => `${event.event}:${event.errorCode}`) }, {
			error: 'startFailed',
			spawns: 2,
			recorded: 1,
			events: ['profileDowngraded:specUnsupported', 'startFailed:startFailed'],
		});
	});

	test('an assertion on the first request after ready, with DFlash on, restarts without speculative decoding; a later crash restarts unchanged', async () => {
		const run = async (requestsBeforeCrash: number) => {
			const { supervisor, spawner, clock, events } = createSupervisor();
			let recorded = 0;
			const plan = createPlan({ hasDraft: true, initialConfig: { flashAttn: 'on', speculative: true, ctxSize: 262144 }, onSpeculativeUnsupported: () => recorded++ });
			const identity = await supervisor.start(plan);
			const leases = Array.from({ length: requestsBeforeCrash }, () => supervisor.acquireLease(identity));
			spawner.running!.writeStderr(DFLASH_ASSERT_STDERR);
			spawner.running!.exit(3);
			await waitFor(() => supervisor.state.get().server === 'starting');
			clock.advance(5_000);
			await waitFor(() => supervisor.state.get().server === 'ready');
			leases.forEach(lease => lease?.dispose());
			const result = { draftDevice: spawner.processes.map(child => child.arg('--device-draft') ?? null), recorded, events: events.map(event => `${event.event}:${event.errorCode}`) };
			// Free the machine-wide server lock for the next scenario.
			await supervisor.stop('system');
			return result;
		};
		assert.deepStrictEqual({ firstRequest: await run(1), secondRequest: await run(2) }, {
			firstRequest: { draftDevice: ['Vulkan0', null], recorded: 1, events: ['ready:', 'crash:3', 'profileDowngraded:specUnsupported', 'restart:'] },
			secondRequest: { draftDevice: ['Vulkan0', 'Vulkan0'], recorded: 0, events: ['ready:', 'crash:3', 'restart:'] },
		});
	});

	test('marks the load of the retry without speculative decoding after it crashed this build (in the warm-up or on the first request); later starts that skip it are normal loads', async () => {
		const trace = (supervisor: ServerSupervisor, withStart: boolean) => {
			const loads: string[] = [];
			store.add(autorun(reader => {
				const { server, load } = supervisor.state.read(reader);
				const entry = `${server}:${load ? `${load.step}${withStart ? `@${load.startedAt}` : ''}/${load.config.speculative}/${load.retry ?? '-'}` : '-'}`;
				if (loads.at(-1) !== entry) {
					loads.push(entry);
				}
			}));
			return loads;
		};
		const createDflashPlan = () => createPlan({ hasDraft: true, initialConfig: { flashAttn: 'on', speculative: true, ctxSize: 262144 } });

		// In the warm-up: the same start retries, from its own spawn.
		const warmUp = createSupervisor();
		warmUp.server.onChatCompletion = process => {
			if (process.arg('--device-draft')) {
				warmUp.clock.advance(1_000);
				process.writeStderr(DFLASH_ASSERT_STDERR);
				process.exit(3);
			}
		};
		const warmUpLoads = trace(warmUp.supervisor, true);
		let recorded = 0;
		const warmUpPlan = createPlan({ hasDraft: true, initialConfig: { flashAttn: 'on', speculative: true, ctxSize: 262144 }, onSpeculativeUnsupported: () => recorded++ });
		const warmUpIdentity = await warmUp.supervisor.start(warmUpPlan);
		const warmUpTrace = [...warmUpLoads];
		const warmUpRetry = {
			generation: warmUpIdentity.servingGeneration,
			configs: warmUpPlan.built,
			draftDevice: warmUp.spawner.processes.map(child => child.arg('--device-draft') ?? null),
			config: warmUp.supervisor.state.get().config,
			recorded,
			events: warmUp.events.map(event => `${event.event}:${event.errorCode}`),
		};
		// Free the machine-wide server lock for the next scenario.
		await warmUp.supervisor.stop('system');

		// On the first request after ready: the restart retries; a later crash restarts as a normal load.
		const firstRequest = createSupervisor({ timings: { restartBackoffMs: [5_000, 5_000] } });
		const firstRequestLoads = trace(firstRequest.supervisor, false);
		const identity = await firstRequest.supervisor.start(createDflashPlan());
		const lease = firstRequest.supervisor.acquireLease(identity);
		firstRequest.spawner.running!.writeStderr(DFLASH_ASSERT_STDERR);
		firstRequest.spawner.running!.exit(3);
		await waitFor(() => firstRequest.supervisor.state.get().server === 'starting');
		firstRequest.clock.advance(5_000);
		await waitFor(() => firstRequest.supervisor.state.get().server === 'ready');
		lease?.dispose();
		firstRequest.spawner.running!.exit(3);
		await waitFor(() => firstRequest.supervisor.state.get().server === 'starting');
		firstRequest.clock.advance(5_000);
		await waitFor(() => firstRequest.supervisor.state.get().server === 'ready');
		const firstRequestTrace = [...firstRequestLoads];
		await firstRequest.supervisor.stop('system');

		assert.deepStrictEqual({ warmUpRetry, warmUpTrace, firstRequestTrace }, {
			// Retried once without speculative decoding, recorded and served.
			warmUpRetry: {
				generation: 1,
				configs: [{ flashAttn: 'on', speculative: true, ctxSize: 262144 }, { flashAttn: 'on', speculative: false, ctxSize: 262144 }],
				draftDevice: ['Vulkan0', null],
				config: { flashAttn: 'on', speculative: false, ctxSize: 262144 },
				recorded: 1,
				events: ['profileDowngraded:specUnsupported', 'ready:'],
			},
			warmUpTrace: [
				'stopped:-', 'starting:-',
				'starting:loading@1000000/true/-', 'starting:warmingUp@1000000/true/-',
				'starting:loading@1001000/false/withoutSpeculativeDecoding', 'starting:warmingUp@1001000/false/withoutSpeculativeDecoding',
				'ready:-',
			],
			firstRequestTrace: [
				'stopped:-', 'starting:-', 'starting:loading/true/-', 'starting:warmingUp/true/-', 'ready:-',
				'starting:-', 'starting:loading/false/withoutSpeculativeDecoding', 'starting:warmingUp/false/withoutSpeculativeDecoding', 'ready:-',
				'starting:-', 'starting:loading/false/-', 'starting:warmingUp/false/-', 'ready:-',
			],
		});
	});

	test('a start never replaces a server that has running responses; once drained it does', async () => {
		const { supervisor, spawner } = createSupervisor();
		const identity = await supervisor.start(createPlan());
		const response = supervisor.acquireLease(identity)!;
		const other = createPlan({ familyId: 'other-local', contentId: 'content-2', capiId: 'other-local', alias: 'Other', displayName: 'Other' });
		const refused = await supervisor.start(other).then(() => 'started', (e: LocalModelServingError) => e.code);
		const whileRunning = { server: supervisor.state.get().server, loaded: supervisor.state.get().plan?.familyId, kills: spawner.processes[0].kills.length, exited: spawner.processes[0].hasExited, leases: supervisor.leaseCount(identity.servingGeneration) };
		response.dispose();
		const replaced = await supervisor.start(other);
		assert.deepStrictEqual({ refused, whileRunning, replaced: { familyId: replaced.familyId, generation: replaced.servingGeneration }, spawns: spawner.processes.length }, {
			refused: 'modelNotActive',
			whileRunning: { server: 'ready', loaded: 'qwen2.5-0.5b-instruct-local', kills: 0, exited: false, leases: 1 },
			replaced: { familyId: 'other-local', generation: 2 },
			spawns: 2,
		});
	});

	test('a plan whose activation was superseded is never spawned', async () => {
		const { supervisor, spawner } = createSupervisor();
		const superseded = new AbortController();
		superseded.abort();
		const before = await supervisor.start(createPlan({ signal: superseded.signal })).then(() => 'started', (e: LocalModelServingError) => e.code);
		const during = new AbortController();
		const plan = createPlan({ signal: during.signal, admit: async () => { during.abort(); return { admitted: true, device: 'Vulkan0' }; } });
		const atAdmission = await supervisor.start(plan).then(() => 'started', (e: LocalModelServingError) => e.code);
		assert.deepStrictEqual({ before, atAdmission, spawns: spawner.processes.length, server: supervisor.state.get().server, record: await readRecord() }, {
			before: 'modelNotActive', atAdmission: 'modelNotActive', spawns: 0, server: 'stopped', record: undefined,
		});
	});

	test('the server record is written right after the spawn (transient refusals retried) and deleted once the exit is observed', async () => {
		let refusals = 2;
		const writes: string[] = [];
		const { supervisor } = createSupervisor({
			writeRecord: async (file, text) => {
				writes.push(path.basename(file));
				if (refusals-- > 0) {
					throw Object.assign(new Error('busy'), { code: 'EPERM' });
				}
				await fs.promises.writeFile(file, text);
			},
		});
		const plan = createPlan();
		await supervisor.start(plan);
		const whileRunning = await readRecord();
		await supervisor.stop('user');
		assert.deepStrictEqual({ writes, whileRunning, afterStop: await readRecord(), lockFree: await lockIsFree() }, {
			writes: [SERVER_RECORD_FILE_NAME, SERVER_RECORD_FILE_NAME, SERVER_RECORD_FILE_NAME],
			whileRunning: { pid: 4000, processStartTime: 1_000_000, imagePath: plan.binaryPath, port: 41000 },
			afterStop: undefined,
			lockFree: true,
		});
	});

	test('a server whose record cannot be written is stopped and the start fails: nothing runs unrecorded', async () => {
		const { supervisor, spawner, events } = createSupervisor({ writeRecord: async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); } });
		const plan = createPlan();
		const error = await outcomeOf(supervisor.start(plan));
		const state = supervisor.state.get();
		assert.deepStrictEqual({ error, state: { server: state.server, error: state.error }, spawned: spawner.processes.map(child => ({ pid: child.pid, exited: child.hasExited })), record: await readRecord(), lockFree: await lockIsFree(), events: events.map(event => event.event) }, {
			error: 'startFailed',
			state: { server: 'error', error: { code: 'startFailed', message: 'Qwen 0.5B was stopped because VS Code couldn\'t record its server process on disk. Select Retry to try again.', actions: ['retry'] } },
			spawned: [{ pid: 4000, exited: true }],
			record: undefined,
			lockFree: true,
			events: ['startFailed'],
		});
	});

	test('exits must be confirmed: a server that survives termination keeps its record and the lock until its exit is observed, and Stop Previous Server retries it', async () => {
		const { supervisor, spawner } = createSupervisor();
		const plan = createPlan();
		await supervisor.start(plan);
		spawner.processes[0].survivesKill = true;
		await supervisor.stop('user');
		const afterStop = { state: supervisor.state.get().error?.code, record: await readRecord() !== undefined, lockFree: await lockIsFree() };
		const replacement = await outcomeOf(supervisor.start(createPlan({ familyId: 'other-local', contentId: 'content-2', capiId: 'other-local', alias: 'Other', displayName: 'Other' })));
		const stillRunning = await supervisor.checkPreviousServer({ stopPrevious: true });
		spawner.processes[0].survivesKill = false;
		const stopPrevious = await supervisor.checkPreviousServer({ stopPrevious: true });
		await supervisor.start(plan);
		assert.deepStrictEqual({ afterStop, replacement, stillRunning, stopPrevious, server: supervisor.state.get().server, spawns: spawner.processes.length }, {
			afterStop: { state: 'orphan', record: true, lockFree: false },
			replacement: 'orphan',
			stillRunning: 'orphan',
			stopPrevious: 'none',
			server: 'ready',
			spawns: 2,
		});
	});

	test('publishes the step and spawn time of the attempt being loaded, and how long the attempt that became ready took', async () => {
		const { supervisor, clock, server } = createSupervisor({ server: { loading: true } });
		const loads: string[] = [];
		store.add(autorun(reader => {
			const state = supervisor.state.read(reader);
			const entry = `${state.server}:${state.load ? `${state.load.step}@${state.load.startedAt}/${state.load.device}/${state.load.config.ctxSize}/${state.load.config.speculative}` : '-'}`;
			if (loads.at(-1) !== entry) {
				loads.push(entry);
			}
		}));
		const started = supervisor.start(createPlan());
		await waitFor(() => supervisor.state.get().load?.step === 'loading');
		// Loading takes 9.5 s on the clock, then the warm-up 120 ms.
		clock.advance(9_500);
		server.loading = false;
		clock.advance(500);
		await started;
		assert.deepStrictEqual({ loads, loaded: supervisor.state.get().loaded }, {
			loads: ['stopped:-', 'starting:-', 'starting:loading@1000000/Vulkan0/32768/false', 'starting:warmingUp@1000000/Vulkan0/32768/false', 'ready:-'],
			loaded: { durationMs: 10_120, device: 'Vulkan0', config: { flashAttn: 'on', speculative: false, ctxSize: 32768 } },
		});
	});

	test('a turn hold counts as one running response: a user drain waits for it and still admits its requests, an idle unload waits, a system drain does not, and Stop Now or a crash ends it', async () => {
		const { supervisor, clock, spawner } = createSupervisor();
		const counts = (generation: number) => `${supervisor.responseCount(generation)} response(s), ${supervisor.leaseCount(generation)} request(s)`;

		// The turn's request, another session's request, then the turn between requests (running a tool).
		const first = await supervisor.start(createPlan());
		const hold = supervisor.acquireHold(first)!;
		const request = supervisor.acquireLease(first, hold)!;
		const unheld = supervisor.acquireLease(first)!;
		const busy = counts(first.servingGeneration);
		request.dispose();
		unheld.dispose();
		const betweenRequests = counts(first.servingGeneration);
		clock.advance(IDLE_UNLOAD_MS);
		await settle();
		const afterIdleTimeout = supervisor.state.get().server;

		const userStop = supervisor.stop('user');
		await waitFor(() => !!supervisor.state.get().drain);
		const next = supervisor.acquireLease(first, hold);
		const draining = {
			drain: supervisor.state.get().drain,
			holderAdmitted: !!next,
			othersAdmitted: !!supervisor.acquireLease(first),
			newHold: !!supervisor.acquireHold(first),
			counts: counts(first.servingGeneration),
		};
		next?.dispose();
		const stillDraining = supervisor.state.get().server;
		hold.dispose();
		const userStopped = { result: await userStop, server: supervisor.state.get().server };

		// Stop Now ends a drain that waits for a turn; the hold ends with the generation.
		const second = await supervisor.start(createPlan());
		const stopNowHold = supervisor.acquireHold(second)!;
		const stopNowStop = supervisor.stop('user');
		await waitFor(() => !!supervisor.state.get().drain);
		const stopNowRunning = supervisor.stopNow();
		const stopNow = { running: stopNowRunning, result: await stopNowStop, admits: supervisor.admitsHold(stopNowHold), counts: counts(second.servingGeneration) };

		// A system drain waits only for in-flight requests.
		const third = await supervisor.start(createPlan());
		const systemHold = supervisor.acquireHold(third)!;
		const system = { result: await supervisor.stop('system'), admits: supervisor.admitsHold(systemHold), counts: counts(third.servingGeneration) };

		// A crash ends the holds of the generation that crashed.
		const fourth = await supervisor.start(createPlan());
		const crashHold = supervisor.acquireHold(fourth)!;
		spawner.running!.exit(3);
		await waitFor(() => supervisor.state.get().server !== 'ready');
		const crash = { admits: supervisor.admitsHold(crashHold), counts: counts(fourth.servingGeneration) };
		await supervisor.stop('system');

		assert.deepStrictEqual({ busy, betweenRequests, afterIdleTimeout, draining, stillDraining, userStopped, stopNow, system, crash }, {
			busy: '2 response(s), 2 request(s)',
			betweenRequests: '1 response(s), 0 request(s)',
			afterIdleTimeout: 'ready',
			draining: { drain: { runningStreams: 1, kind: 'user' }, holderAdmitted: true, othersAdmitted: false, newHold: false, counts: '1 response(s), 1 request(s)' },
			stillDraining: 'stopping',
			userStopped: { result: { drainedStreams: 1, drainMs: 0, stopNow: false }, server: 'stopped' },
			stopNow: { running: 1, result: { drainedStreams: 1, drainMs: 0, stopNow: true }, admits: false, counts: '0 response(s), 0 request(s)' },
			system: { result: { drainedStreams: 0, drainMs: 0, stopNow: false }, admits: false, counts: '0 response(s), 0 request(s)' },
			crash: { admits: false, counts: '0 response(s), 0 request(s)' },
		});
	});

	/** Whether `stop` settled within a short real-time wait, and its result without the timing. */
	async function stopOutcome(stop: Promise<{ readonly drainedStreams: number; readonly stopNow: boolean }>): Promise<{ readonly drainedStreams: number; readonly stopNow: boolean } | 'pending'> {
		let outcome: { readonly drainedStreams: number; readonly stopNow: boolean } | 'pending' = 'pending';
		void stop.then(result => outcome = { drainedStreams: result.drainedStreams, stopNow: result.stopNow });
		await waitFor(() => outcome !== 'pending', 2_000).catch(() => undefined);
		return outcome;
	}

	test('a crash while a user drain waits for a turn ends its hold and the drain: the stop completes, with no restart', async () => {
		const { supervisor, clock, spawner, events } = createSupervisor();
		const identity = await supervisor.start(createPlan());
		const hold = supervisor.acquireHold(identity)!;
		const stop = supervisor.stop('user');
		await waitFor(() => !!supervisor.state.get().drain);
		spawner.running!.exit(3);
		await settle();
		clock.advance(60_000);
		const outcome = await stopOutcome(stop);
		const snapshot = {
			outcome,
			server: supervisor.state.get().server,
			responses: supervisor.responseCount(identity.servingGeneration),
			holderAdmitted: supervisor.admitsHold(hold),
			spawns: spawner.processes.length,
			events: events.map(event => event.event),
		};
		supervisor.stopNow();
		await stop;
		assert.deepStrictEqual(snapshot, {
			outcome: { drainedStreams: 1, stopNow: false },
			server: 'stopped',
			responses: 0,
			holderAdmitted: false,
			spawns: 1,
			events: ['ready', 'crash'],
		});
	});

	test('disabling (a system stop) turns a user drain that waits for a turn into a bounded system drain: held requests are refused, in-flight ones get the system timeout', async () => {
		const { supervisor, clock, spawner } = createSupervisor();
		const identity = await supervisor.start(createPlan());
		const hold = supervisor.acquireHold(identity)!;
		// The turn has a request in flight.
		const inFlight = supervisor.acquireLease(identity, hold)!;
		const userStop = supervisor.stop('user');
		await waitFor(() => !!supervisor.state.get().drain);
		const userDrain = supervisor.state.get().drain;
		const systemStop = supervisor.stop('system');
		const refused = supervisor.acquireLease(identity, hold);
		const escalated = { drain: supervisor.state.get().drain, holderAdmitted: !!refused, admitsHold: supervisor.admitsHold(hold) };
		refused?.dispose();
		clock.advance(SYSTEM_DRAIN_TIMEOUT_MS);
		const user = await stopOutcome(userStop);
		const system = await stopOutcome(systemStop);
		const snapshot = { userDrain, escalated, user, system, server: supervisor.state.get().server, exited: spawner.processes[0].hasExited };
		inFlight.dispose();
		supervisor.stopNow();
		await Promise.all([userStop, systemStop]);
		assert.deepStrictEqual(snapshot, {
			userDrain: { runningStreams: 1, kind: 'user' },
			escalated: { drain: { runningStreams: 1, kind: 'system' }, holderAdmitted: false, admitsHold: false },
			user: { drainedStreams: 1, stopNow: false },
			system: { drainedStreams: 0, stopNow: false },
			server: 'stopped',
			exited: true,
		});
	});

	test('Stop Now issued right after a user stop is queued forces it: a turn\'s hold is not waited for; a later stop drains as usual', async () => {
		const { supervisor, clock, spawner, events } = createSupervisor();
		const first = await supervisor.start(createPlan());
		const hold = supervisor.acquireHold(first)!;
		// The provider's Stop Now without a drain in progress: a user stop, then Stop Now, before the stop begins.
		const stop = supervisor.stop('user');
		const running = supervisor.stopNow();
		const admitsHold = supervisor.admitsHold(hold);
		clock.advance(60_000);
		const outcome = await stopOutcome(stop);
		const forced = { running, admitsHold, outcome, server: supervisor.state.get().server, exited: spawner.processes[0].hasExited };
		supervisor.stopNow();
		await stop;

		const second = await supervisor.start(createPlan());
		const laterHold = supervisor.acquireHold(second)!;
		const laterStop = supervisor.stop('user');
		await waitFor(() => !!supervisor.state.get().drain);
		const later = { drain: supervisor.state.get().drain, admitsHold: supervisor.admitsHold(laterHold) };
		laterHold.dispose();
		await laterStop;
		assert.deepStrictEqual({ forced, later, events: events.map(event => event.event) }, {
			forced: { running: 1, admitsHold: false, outcome: { drainedStreams: 1, stopNow: true }, server: 'stopped', exited: true },
			later: { drain: { runningStreams: 1, kind: 'user' }, admitsHold: true },
			events: ['ready', 'stopNow', 'ready'],
		});
	});

	test('a start that is stopped or superseded publishes stopping at once, before its process is gone', async () => {
		const { supervisor, spawner } = createSupervisor({ server: { loading: true } });
		const stopped = supervisor.start(createPlan());
		await waitFor(() => supervisor.state.get().load?.step === 'loading');
		spawner.processes[0].exitDelayMs = 50;
		const stopping = supervisor.stop('system');
		const atOnce = { server: supervisor.state.get().server, load: supervisor.state.get().load, exited: spawner.processes[0].hasExited };
		const outcome = await outcomeOf(stopped);
		await stopping;

		const activation = new AbortController();
		const superseded = supervisor.start(createPlan({ signal: activation.signal }));
		await waitFor(() => supervisor.state.get().load?.step === 'loading' && spawner.processes.length === 2);
		activation.abort();
		const onAbort = supervisor.state.get().server;
		const supersededOutcome = await outcomeOf(superseded);
		assert.deepStrictEqual({ atOnce, outcome, after: supervisor.state.get().server, onAbort, supersededOutcome, final: supervisor.state.get().server, lockFree: await lockIsFree() }, {
			atOnce: { server: 'stopping', load: undefined, exited: false },
			outcome: 'modelNotActive',
			after: 'stopped',
			onAbort: 'stopping',
			supersededOutcome: 'modelNotActive',
			final: 'stopped',
			lockFree: true,
		});
	});

	test('Windows: a server that taskkill terminated but that is slow to exit (a large model releasing memory) is waited for, never sent SIGKILL', async () => {
		const { supervisor, spawner } = createSupervisor({ timings: { terminatedExitWaitMs: 5_000 } });
		await supervisor.start(createPlan());
		// Exits well after the first wait (20 ms in these tests).
		spawner.processes[0].exitDelayMs = 300;
		await supervisor.stop('user');
		assert.deepStrictEqual({ server: supervisor.state.get().server, error: supervisor.state.get().error, kills: spawner.processes[0].kills, exited: spawner.processes[0].hasExited, record: await readRecord(), lockFree: await lockIsFree() }, {
			server: 'stopped', error: undefined, kills: [], exited: true, record: undefined, lockFree: true,
		});
	});

	test('a start that replaces a loaded model admits it only once the previous server has exited, so its memory counts as free', async () => {
		const { supervisor, spawner } = createSupervisor();
		await supervisor.start(createPlan());
		const previousExitedAtAdmission: boolean[] = [];
		await supervisor.start(createPlan({
			familyId: 'other-local', contentId: 'content-2', capiId: 'other-local', alias: 'Other', displayName: 'Other',
			admit: async () => {
				previousExitedAtAdmission.push(spawner.processes[0].hasExited);
				return { admitted: true, device: 'Vulkan0' };
			},
		}));
		assert.deepStrictEqual({ previousExitedAtAdmission, server: supervisor.state.get().server, spawns: spawner.processes.length }, { previousExitedAtAdmission: [true], server: 'ready', spawns: 2 });
	});

	test('dispose never deletes the record or releases the lock before the child\'s exit is observed', async () => {
		const { supervisor, spawner } = createSupervisor();
		await supervisor.start(createPlan());
		spawner.processes[0].survivesKill = true;
		supervisor.dispose();
		await settle();
		const afterDispose = { record: await readRecord() !== undefined, lockFree: await lockIsFree(), exited: spawner.processes[0].hasExited };
		spawner.processes[0].survivesKill = false;
		spawner.processes[0].exit(undefined, 'SIGKILL');
		const deadline = Date.now() + 10_000;
		while ((await readRecord() !== undefined || !await lockIsFree()) && Date.now() < deadline) {
			await settle();
		}
		assert.deepStrictEqual({ afterDispose, afterExit: { record: await readRecord(), lockFree: await lockIsFree() } }, {
			afterDispose: { record: true, lockFree: false, exited: false },
			afterExit: { record: undefined, lockFree: true },
		});
	});

	test('pure helpers: spawn line with a draft device, the API key in a credential-free environment, and on the command line only as a fallback', () => {
		const input = { modelPath: '/m/p.gguf', alias: 'MAI', device: 'Vulkan1', draftDevice: true, ctxSize: 262144, parallel: 1, port: 5, presetArgs: ['--jinja'] };
		assert.deepStrictEqual({
			args: buildLlamaServerArgs(input),
			fallbackArgs: buildLlamaServerArgs({ ...input, commandLineApiKey: 'k' }),
			env: buildServerEnvironment({ HOME: '/home/u', GH_TOKEN: 'x', AZURE_CLIENT_SECRET: 'y', LLAMA_API_KEY: 'z', LLAMA_ARG_HOST: '0.0.0.0', VSCODE_IPC_HOOK: 'h', LANG: 'C' }, 'k'),
		}, {
			args: ['--host', '127.0.0.1', '--port', '5', '--model', '/m/p.gguf', '--alias', 'MAI', '--device', 'Vulkan1', '--split-mode', 'none', '--device-draft', 'Vulkan1', '--ctx-size', '262144', '--parallel', '1', '--jinja'],
			fallbackArgs: ['--host', '127.0.0.1', '--port', '5', '--model', '/m/p.gguf', '--alias', 'MAI', '--device', 'Vulkan1', '--split-mode', 'none', '--device-draft', 'Vulkan1', '--ctx-size', '262144', '--parallel', '1', '--api-key', 'k', '--jinja'],
			env: { HOME: '/home/u', LANG: 'C', LLAMA_API_KEY: 'k' },
		});
	});

	test('a build that ignores LLAMA_API_KEY is replaced by one that takes the key on its command line, and later starts keep it there', async () => {
		const { supervisor, spawner } = createSupervisor();
		spawner.ignoresApiKeyEnv = true;
		const plan = createPlan();
		await supervisor.start(plan);
		await supervisor.stop('user');
		await supervisor.start(plan);
		assert.deepStrictEqual({
			spawns: spawner.processes.map(child => ({ keyOnCommandLine: child.args.includes('--api-key'), keyInEnvironment: child.options.env.LLAMA_API_KEY !== undefined, exited: child.hasExited })),
			server: supervisor.state.get().server,
		}, {
			spawns: [
				{ keyOnCommandLine: false, keyInEnvironment: true, exited: true },
				{ keyOnCommandLine: true, keyInEnvironment: true, exited: true },
				{ keyOnCommandLine: true, keyInEnvironment: true, exited: false },
			],
			server: 'ready',
		});
	});

	/** Lets each health-poll pause elapse until `attempt` settles: the probe retries wait on the fake clock. */
	async function driveProbeRetries<T>(clock: FakeClock, attempt: Promise<T>): Promise<T> {
		let done = false;
		const tracked = attempt.finally(() => done = true);
		while (!done) {
			await settle();
			clock.advance(100);
		}
		return tracked;
	}

	test('an inconclusive check that the server requires the key is retried; a build that then turns out to ignore LLAMA_API_KEY is replaced by one with --api-key', async () => {
		let anonymousProbes = 0;
		const { supervisor, spawner, clock } = createSupervisor({ server: { failAnonymousProps: () => ++anonymousProbes === 1 }, timings: { healthPollMs: 100 } });
		spawner.ignoresApiKeyEnv = true;
		const start = await driveProbeRetries(clock, outcomeOf(supervisor.start(createPlan())));
		assert.deepStrictEqual({
			start,
			anonymousProbes,
			spawns: spawner.processes.map(child => ({ keyOnCommandLine: child.args.includes('--api-key'), exited: child.hasExited })),
			server: supervisor.state.get().server,
		}, {
			start: 'started',
			// The dropped probe, the env-only build serving without the key, then the --api-key build refusing it.
			anonymousProbes: 3,
			spawns: [
				{ keyOnCommandLine: false, exited: true },
				{ keyOnCommandLine: true, exited: false },
			],
			server: 'ready',
		});
	});

	test('a server that never confirms it requires the key is never published: after the --api-key restart is also inconclusive, the start fails with nothing running', async () => {
		let anonymousProbes = 0;
		const { supervisor, spawner, clock } = createSupervisor({ server: { failAnonymousProps: () => { anonymousProbes++; return true; } }, timings: { healthPollMs: 100 } });
		const states: string[] = [];
		store.add(autorun(reader => {
			const server = supervisor.state.read(reader).server;
			if (states.at(-1) !== server) {
				states.push(server);
			}
		}));
		const start = await driveProbeRetries(clock, outcomeOf(supervisor.start(createPlan())));
		assert.deepStrictEqual({
			start,
			anonymousProbes,
			spawns: spawner.processes.map(child => ({ keyOnCommandLine: child.args.includes('--api-key'), exited: child.hasExited })),
			everReady: states.includes('ready'),
			lockFree: await lockIsFree(),
		}, {
			start: 'startFailed',
			anonymousProbes: 6,
			spawns: [
				{ keyOnCommandLine: false, exited: true },
				{ keyOnCommandLine: true, exited: true },
			],
			everReady: false,
			lockFree: true,
		});
	});
});

suite('localModel process control (§5.8 stop sequence)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function ok(stdout: string): IProcessRunResult {
		return { exitCode: 0, signal: undefined, stdout, stderr: '', timedOut: false, truncated: false, aborted: false };
	}

	test('Windows terminates the tree with taskkill /T /F and checks its exit code; POSIX signals the process group, then SIGKILL after 5 s; success only once the process is gone', async () => {
		const runs: string[][] = [];
		let taskkillExit = 0;
		const runner: IProcessRunner = { run: async (file, args) => { runs.push([file, ...args]); return { ...ok(''), exitCode: taskkillExit }; } };
		const missing = Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
		const windowsGone = await new NodeProcessControl(runner, 'win32', { SystemRoot: 'C:\\Windows' }, () => { throw missing; }).terminateTree(1234);
		const stillThere = new NodeProcessControl(runner, 'win32', { SystemRoot: 'C:\\Windows' }, () => { });
		taskkillExit = 128;
		const windowsNotFound = await stillThere.terminateTree(1234);
		taskkillExit = 1;
		const windowsRefused = await stillThere.terminateTree(1234);

		// The leader and the rest of its process group die separately: a surviving descendant keeps the group alive.
		const run = async (leaderDiesOn: 'SIGTERM' | 'SIGKILL' | 'never', groupDiesOn: 'SIGTERM' | 'SIGKILL' | 'never') => {
			const signals: [number, string][] = [];
			const probes = new Set<number>();
			let now = 0;
			let leader = true;
			let descendants = true;
			const control = new NodeProcessControl(runner, 'linux', {}, (pid, signal) => {
				if (signal !== 0) {
					signals.push([pid, signal]);
					leader &&= signal !== leaderDiesOn;
					descendants &&= signal !== groupDiesOn;
					return;
				}
				probes.add(pid);
				if (!(pid < 0 ? leader || descendants : leader)) {
					throw missing;
				}
			}, async ms => { now += ms; }, () => now);
			const gone = await control.terminateTree(1234);
			return { signals, waitedMs: now, gone, probedGroup: probes.has(-1234) };
		};

		assert.deepStrictEqual({ windows: { first: runs[0], runs: runs.length, gone: windowsGone, notFound: windowsNotFound, refused: windowsRefused }, cooperative: await run('SIGTERM', 'SIGTERM'), descendantSurvivesSigterm: await run('SIGTERM', 'SIGKILL'), unkillableDescendant: await run('SIGTERM', 'never'), command: getWindowsTerminateCommand(9, {}) }, {
			windows: { first: ['C:\\Windows\\System32\\taskkill.exe', '/T', '/F', '/PID', '1234'], runs: 3, gone: true, notFound: true, refused: false },
			cooperative: { signals: [[-1234, 'SIGTERM']], waitedMs: 0, gone: true, probedGroup: true },
			// The leader is gone after SIGTERM, but the group is not: it is escalated to SIGKILL and only then gone.
			descendantSurvivesSigterm: { signals: [[-1234, 'SIGTERM'], [-1234, 'SIGKILL']], waitedMs: 5_000, gone: true, probedGroup: true },
			unkillableDescendant: { signals: [[-1234, 'SIGTERM'], [-1234, 'SIGKILL']], waitedMs: 6_000, gone: false, probedGroup: true },
			command: { file: 'C:\\Windows\\System32\\taskkill.exe', args: ['/T', '/F', '/PID', '9'] },
		});
	});

	test('a kill that fails (EPERM) on a spawned child never reads as its exit; only a spawn that produced no process does', async () => {
		const failingKill = new NodeLongLivedProcessSpawner(process.platform, (file, args, options) => {
			const child = spawn(file, [...args], options);
			// What Node does when kill(2) fails: emit `error` and return false.
			child.kill = () => {
				child.emit('error', Object.assign(new Error('kill EPERM'), { code: 'EPERM' }));
				return false;
			};
			return child;
		});
		const env = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), ELECTRON_RUN_AS_NODE: '1' };
		const child = failingKill.spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { cwd: os.tmpdir(), env, detached: false });
		const delivered = child.kill('SIGKILL');
		const exitedAfterFailedKill = await Promise.race([child.exited.then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 300))]);
		process.kill(child.pid!, 'SIGKILL');
		const realExit = await child.exited;
		const missing = await new NodeLongLivedProcessSpawner().spawn(path.join(os.tmpdir(), `no-such-llama-server-${process.pid}.exe`), [], { cwd: os.tmpdir(), env, detached: false }).exited;
		assert.deepStrictEqual({ delivered, exitedAfterFailedKill, realExit: realExit.spawnErrorCode ?? 'exit', missing: missing.spawnErrorCode }, {
			delivered: false, exitedAfterFailedKill: false, realExit: 'exit', missing: 'ENOENT',
		});
	});
	test('reads process start times per platform: Windows CIM CreationDate, Linux /proc stat field 22', () => {
		const stat = '4242 (llama-server) S 1 4242 4242 0 -1 4194560 100 0 0 0 5 1 0 0 20 0 8 0 123456 1000 10 18446744073709551615';
		assert.deepStrictEqual({
			windows: parseWindowsProcessInfo('1791391680980|C:\\Users\\u\\AppData\\Local\\Microsoft\\WinGet\\Packages\\ggml.llamacpp\\llama-server.exe'),
			windowsUnknown: parseWindowsProcessInfo(''),
			linux: parseLinuxProcessStartTime(stat, '5000.25 9000.00', 10_000_000),
		}, {
			windows: { startTime: 1791391680980, imagePath: 'C:\\Users\\u\\AppData\\Local\\Microsoft\\WinGet\\Packages\\ggml.llamacpp\\llama-server.exe' },
			windowsUnknown: undefined,
			linux: 10_000_000 - 5_000_250 + 1_234_560,
		});
	});
});
