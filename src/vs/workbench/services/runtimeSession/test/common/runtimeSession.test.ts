/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { formatLanguageRuntimeMetadata, ILanguageRuntimeMetadata, ILanguageRuntimeService, LanguageRuntimeSessionMode, LanguageStartupBehavior, RuntimeState } from '../../../languageRuntime/common/languageRuntimeService.js';
import { ILanguageRuntimeSession, IRuntimeSessionMetadata, IRuntimeSessionService, IRuntimeSessionWillStartEvent, RuntimeClientType, RuntimeStartMode } from '../../common/runtimeSessionService.js';
import { TestLanguageRuntimeSession, waitForRuntimeState } from './testLanguageRuntimeSession.js';
import { createRuntimeServices, createTestLanguageRuntimeMetadata, startTestLanguageRuntimeSession } from './testRuntimeSessionService.js';
import { TestRuntimeSessionManager } from '../../../../test/common/erdosWorkbenchTestServices.js';
import { TestWorkspaceTrustManagementService } from '../../../../test/common/workbenchTestServices.js';
import { IConfigurationResolverService } from '../../../configurationResolver/common/configurationResolver.js';


type IStartSessionTask = (runtime: ILanguageRuntimeMetadata) => Promise<TestLanguageRuntimeSession>;

suite('Erdos - RuntimeSessionService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const startReason = 'Test requested to start a runtime session';
	const notebookUri = URI.file('/path/to/notebook');
	const notebookParent = '/path/to';
	let instantiationService: TestInstantiationService;
	let languageRuntimeService: ILanguageRuntimeService;
	let runtimeSessionService: import('../../common/runtimeSessionTypes.js').IRuntimeSessionService;
	let configService: TestConfigurationService;
	let workspaceTrustManagementService: TestWorkspaceTrustManagementService;
	let configurationResolverService: IConfigurationResolverService;
	let manager: TestRuntimeSessionManager;
	let runtime: ILanguageRuntimeMetadata;
	let anotherRuntime: ILanguageRuntimeMetadata;
	let sessionName: string;
	let unregisteredRuntime: ILanguageRuntimeMetadata;

	setup(() => {
		instantiationService = disposables.add(new TestInstantiationService());
		createRuntimeServices(instantiationService, disposables);
		languageRuntimeService = instantiationService.get(ILanguageRuntimeService);
		runtimeSessionService = instantiationService.get(IRuntimeSessionService);
		configService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		workspaceTrustManagementService = instantiationService.get(IWorkspaceTrustManagementService) as TestWorkspaceTrustManagementService;
		configurationResolverService = instantiationService.get(IConfigurationResolverService);
		manager = TestRuntimeSessionManager.instance;

		disposables.add({
			dispose() {
				runtimeSessionService.activeSessions.forEach(session => session.dispose());
			}
		});

		runtime = createTestLanguageRuntimeMetadata(instantiationService, disposables);
		anotherRuntime = createTestLanguageRuntimeMetadata(instantiationService, disposables);
		sessionName = runtime.runtimeName;
		unregisteredRuntime = { runtimeId: 'unregistered-runtime-id' } as ILanguageRuntimeMetadata;

		configService.setUserConfiguration('interpreters.startupBehavior', LanguageStartupBehavior.Auto);

		workspaceTrustManagementService.setWorkspaceTrust(true);
	});

	function startSession(
		runtime: ILanguageRuntimeMetadata,
		sessionMode: LanguageRuntimeSessionMode,
		notebookUri?: URI,
	) {
		return startTestLanguageRuntimeSession(
			instantiationService,
			disposables,
			{
				runtime,
				sessionName,
				startReason,
				sessionMode,
				notebookUri,
			},
		);
	}

	function startConsole(runtime: ILanguageRuntimeMetadata) {
		return startSession(runtime, LanguageRuntimeSessionMode.Console);
	}

	function startNotebook(runtime: ILanguageRuntimeMetadata, notebookUri_ = notebookUri) {
		return startSession(runtime, LanguageRuntimeSessionMode.Notebook, notebookUri_);
	}

	function assertActiveSessions(expected: ILanguageRuntimeSession[]) {
		const actualSessionIds = runtimeSessionService.activeSessions.map(session => session.sessionId);
		const expectedSessionIds = expected.map(session => session.sessionId);
		assert.deepStrictEqual(actualSessionIds, expectedSessionIds, 'Unexpected active sessions');
	}

	function assertConsoleSessionForLanguage(languageId: string, expected: ILanguageRuntimeSession | undefined) {
		const actual = runtimeSessionService.getConsoleSessionForLanguage(languageId);
		const message = expected ?
			`Unexpected last used console session for language '${languageId}'` :
			`Expected no last used console session for language '${languageId}'`;
		assert.strictEqual(actual?.sessionId, expected?.sessionId, message);
	}

	function assertConsoleSessionForRuntime(
		runtimeId: string,
		expected: ILanguageRuntimeSession | undefined,
	) {
		const actual = runtimeSessionService.getConsoleSessionForRuntime(runtimeId);
		const message = expected ?
			`Unexpected last used console session for runtime '${runtimeId}'` :
			`Expected no last used console session for runtime '${runtimeId}'`;
		assert.strictEqual(actual?.sessionId, expected?.sessionId, message);
	}

	function assertHasStartingOrRunningConsole(expected: boolean) {
		const actual = runtimeSessionService.hasStartingOrRunningConsole(runtime.languageId);
		const message = expected ?
			'Expected a starting or running console session but there was none' :
			'Expected no starting or running console session but there was one';
		assert.strictEqual(actual, expected, message);
	}

	function assertNotebookSessionForNotebookUri(
		notebookUri: URI,
		expected: ILanguageRuntimeSession | undefined,
	) {
		const actual = runtimeSessionService.getNotebookSessionForNotebookUri(notebookUri);
		const message = expected ?
			`Unexpected notebook session for notebook URI '${notebookUri.toString()}'` :
			`Expected no notebook session for notebook URI '${notebookUri.toString()}'`;
		assert.strictEqual(actual?.sessionId, expected?.sessionId, message);
	}

	function assertSessionWillStart(
		runtime: ILanguageRuntimeMetadata,
		sessionMode: LanguageRuntimeSessionMode,
		action: string,
	) {
		assertActiveSessions([]);
		assertConsoleSessionForLanguage(runtime.languageId, undefined);
		assertConsoleSessionForRuntime(runtime.runtimeId, undefined);
		assertHasStartingOrRunningConsole(
			sessionMode === LanguageRuntimeSessionMode.Console && action !== 'restore'
		);
		assertNotebookSessionForNotebookUri(notebookUri, undefined);
	}

	function assertCurrentSession(
		runtime: ILanguageRuntimeMetadata,
		notebookUri: URI,
		session: ILanguageRuntimeSession,
	) {
		if (session.metadata.sessionMode === LanguageRuntimeSessionMode.Console) {
			assertConsoleSessionForLanguage(runtime.languageId, session);
			assertConsoleSessionForRuntime(runtime.runtimeId, session);
			assertHasStartingOrRunningConsole(true);
			assertNotebookSessionForNotebookUri(notebookUri, undefined);
		} else if (session.metadata.sessionMode === LanguageRuntimeSessionMode.Notebook) {
			assertConsoleSessionForLanguage(runtime.languageId, undefined);
			assertConsoleSessionForRuntime(runtime.runtimeId, undefined);
			assertHasStartingOrRunningConsole(false);
			assertNotebookSessionForNotebookUri(notebookUri, session);
		}
	}

	async function restoreSession(
		sessionMetadata: IRuntimeSessionMetadata, runtime: ILanguageRuntimeMetadata,
	) {
		await runtimeSessionService.restoreRuntimeSession(runtime, sessionMetadata, sessionName, true);

		const session = runtimeSessionService.getSession(sessionMetadata.sessionId);
		assert.ok(session instanceof TestLanguageRuntimeSession);
		disposables.add(session);

		return session;
	}

	function restoreConsole(runtime: ILanguageRuntimeMetadata) {
		const sessionMetadata: IRuntimeSessionMetadata = {
			sessionId: 'test-console-session-id',
			sessionMode: LanguageRuntimeSessionMode.Console,
			createdTimestamp: Date.now(),
			notebookUri: undefined,
			startReason,
		};
		return restoreSession(sessionMetadata, runtime);
	}

	function restoreNotebook(runtime: ILanguageRuntimeMetadata) {
		const sessionMetadata: IRuntimeSessionMetadata = {
			sessionId: 'test-notebook-session-id',
			sessionMode: LanguageRuntimeSessionMode.Notebook,
			createdTimestamp: Date.now(),
			notebookUri,
			startReason,
		};
		return restoreSession(sessionMetadata, runtime);
	}

	async function autoStartSession(runtime: ILanguageRuntimeMetadata) {
		const sessionId = await runtimeSessionService.autoStartRuntime(runtime, startReason, true);
		assert.ok(sessionId);
		const session = runtimeSessionService.getSession(sessionId);
		assert.ok(session instanceof TestLanguageRuntimeSession);
		disposables.add(session);
		return session;
	}

	async function selectRuntime(runtime: ILanguageRuntimeMetadata, notebookUri?: URI) {
		await runtimeSessionService.selectRuntime(runtime.runtimeId, startReason, notebookUri);
		let session: ILanguageRuntimeSession | undefined;
		if (notebookUri) {
			session = runtimeSessionService.getNotebookSessionForNotebookUri(notebookUri);
		} else {
			session = runtimeSessionService.getConsoleSessionForRuntime(runtime.runtimeId);
		}
		assert.ok(session instanceof TestLanguageRuntimeSession, 'No session found after selecting runtime');
		disposables.add(session);
		return session;
	}

	const data: { action: string; startConsole: IStartSessionTask; startNotebook?: IStartSessionTask }[] = [
		{ action: 'start', startConsole: startConsole, startNotebook: startNotebook },
		{ action: 'restore', startConsole: restoreConsole, startNotebook: restoreNotebook },
		{ action: 'auto start', startConsole: autoStartSession },
		{ action: 'select', startConsole: selectRuntime },
	];
	for (const { action, startConsole, startNotebook } of data) {

		for (const mode of [LanguageRuntimeSessionMode.Console, LanguageRuntimeSessionMode.Notebook]) {
			const start = mode === LanguageRuntimeSessionMode.Console ? startConsole : startNotebook;
			if (!start) {
				continue;
			}

			test(`${action} ${mode} returns the expected session`, async () => {
				const session = await start(runtime);

				assert.strictEqual(session.getRuntimeState(), RuntimeState.Starting);
				assert.strictEqual(session.dynState.sessionName, sessionName);
				assert.strictEqual(session.metadata.sessionMode, mode);
				assert.strictEqual(session.metadata.startReason, startReason);
				assert.strictEqual(session.runtimeMetadata, runtime);

				if (mode === LanguageRuntimeSessionMode.Console) {
					assert.strictEqual(session.metadata.notebookUri, undefined);
				} else {
					assert.strictEqual(session.metadata.notebookUri, notebookUri);
				}
			});

			test(`${action} ${mode} sets the expected service state`, async () => {
				assertActiveSessions([]);
				assertConsoleSessionForLanguage(runtime.languageId, undefined);
				assertConsoleSessionForRuntime(runtime.runtimeId, undefined);
				assertHasStartingOrRunningConsole(false);
				assertNotebookSessionForNotebookUri(notebookUri, undefined);

				const promise = start(runtime);

				assertSessionWillStart(runtime, mode, action);

				const session = await promise;

				assertActiveSessions([session]);
				assertCurrentSession(runtime, notebookUri, session);
				assert.strictEqual(session.getRuntimeState(), RuntimeState.Starting);
			});

			test(`${action} ${mode} fires onWillStartSession`, async function () {
				let error: Error | undefined;
				const onWillStartSessionSpy = sinon.spy(({ session }: IRuntimeSessionWillStartEvent) => {
					try {
						assert.strictEqual(session.getRuntimeState(), RuntimeState.Uninitialized);

						assertSessionWillStart(runtime, mode, action);
					} catch (e) {
						error = e;
					}
				});
				disposables.add(runtimeSessionService.onWillStartSession(onWillStartSessionSpy));
				const session = await start(runtime);

				sinon.assert.calledOnce(onWillStartSessionSpy);

				const event = onWillStartSessionSpy.getCall(0).args[0];
				if (action === 'restore') {
					assert.strictEqual(event.startMode, RuntimeStartMode.Reconnecting);
				} else {
					assert.strictEqual(event.startMode, RuntimeStartMode.Starting);
				}
				assert.strictEqual(event.session.sessionId, session.sessionId);
				assert.strictEqual(event.activate, true);

				assert.ifError(error);
			});

			test(`${action} ${mode} fires onDidStartRuntime`, async function () {
				let error: Error | undefined;
				const onDidStartRuntimeSpy = sinon.stub<[e: ILanguageRuntimeSession]>().callsFake(session => {
					try {
						assertActiveSessions([session]);
						if (mode === LanguageRuntimeSessionMode.Console) {
							assertConsoleSessionForLanguage(runtime.languageId, undefined);
							assertConsoleSessionForRuntime(runtime.runtimeId, session);
							assertHasStartingOrRunningConsole(true);
							assertNotebookSessionForNotebookUri(notebookUri, undefined);
						} else {
							assertConsoleSessionForLanguage(runtime.languageId, undefined);
							assertConsoleSessionForRuntime(runtime.runtimeId, undefined);
							assertHasStartingOrRunningConsole(false);
							assertNotebookSessionForNotebookUri(notebookUri, session);
						}
						assert.strictEqual(session.getRuntimeState(), RuntimeState.Starting);
					} catch (e) {
						error = e;
					}
				});
				disposables.add(runtimeSessionService.onDidStartRuntime(onDidStartRuntimeSpy));

				const session = await start(runtime);

				sinon.assert.calledOnce(onDidStartRuntimeSpy);

				const actualSession = onDidStartRuntimeSpy.getCall(0).args[0];
				assert.strictEqual(actualSession.sessionId, session.sessionId);

				assert.ifError(error);
			});

			test(`${action} ${mode} fires events in order`, async () => {
				const willStartSession = sinon.spy();
				disposables.add(runtimeSessionService.onWillStartSession(willStartSession));

				const didStartRuntime = sinon.spy();
				disposables.add(runtimeSessionService.onDidStartRuntime(didStartRuntime));

				await start(runtime);

				sinon.assert.callOrder(willStartSession, didStartRuntime);
			});

			if (mode === LanguageRuntimeSessionMode.Console) {
				test(`${action} ${mode} sets foregroundSession`, async () => {
					const onDidChangeForegroundSessionSpy = sinon.spy();
					disposables.add(runtimeSessionService.onDidChangeForegroundSession(onDidChangeForegroundSessionSpy));

					const session = await start(runtime);

					assert.strictEqual(runtimeSessionService.foregroundSession?.sessionId, session.sessionId);

					await waitForRuntimeState(session, RuntimeState.Ready);

					sinon.assert.notCalled(onDidChangeForegroundSessionSpy);
				});
			}

			if (action === 'start' || action === 'select') {
				test(`${action} ${mode} throws for unknown runtime`, async () => {
					const runtimeId = 'unknown-runtime-id';
					await assert.rejects(
						start({ runtimeId } as ILanguageRuntimeMetadata,),
						new Error(`No language runtime with id '${runtimeId}' was found.`),
					);
				});
			}

			const createOrRestoreMethod = action === 'restore' ? 'restoreSession' : 'createSession';
			test(`${action} ${mode} encounters ${createOrRestoreMethod}() error`, async () => {
				const error = new Error('Failed to create session');
				const stub = sinon.stub(manager, createOrRestoreMethod).rejects(error);

				await assert.rejects(start(runtime), error);

				stub.restore();
				const session = await start(runtime);

				assert.strictEqual(session.getRuntimeState(), RuntimeState.Starting);
			});

			test(`${action} ${mode} encounters session.start() error`, async function () {
				if (action === 'select' && mode === LanguageRuntimeSessionMode.Console) {
					this.skip();
				}

				const willStartSession = sinon.spy((e: IRuntimeSessionWillStartEvent) => {
					sinon.stub(e.session, 'start').rejects(new Error('Session failed to start'));
				});
				const willStartSessionDisposable = runtimeSessionService.onWillStartSession(willStartSession);

				const didFailStartRuntime = sinon.spy();
				disposables.add(runtimeSessionService.onDidFailStartRuntime(didFailStartRuntime));

				const didStartRuntime = sinon.spy();
				disposables.add(runtimeSessionService.onDidStartRuntime(didStartRuntime));

				await assert.rejects(start(runtime), new Error('Session failed to start'));

				assert.equal(runtimeSessionService.activeSessions.length, 1);
				const session1 = runtimeSessionService.activeSessions[0];
				disposables.add(session1);

				assert.strictEqual(session1.getRuntimeState(), RuntimeState.Uninitialized);

				assertActiveSessions([session1]);
				assertConsoleSessionForLanguage(runtime.languageId, undefined);
				if (mode === LanguageRuntimeSessionMode.Console) {
					assertConsoleSessionForRuntime(runtime.runtimeId, session1);
				} else if (mode === LanguageRuntimeSessionMode.Notebook) {
					assertConsoleSessionForRuntime(runtime.runtimeId, undefined);
				}
				assertHasStartingOrRunningConsole(false);
				assertNotebookSessionForNotebookUri(notebookUri, undefined);

				sinon.assert.calledOnceWithExactly(didFailStartRuntime, session1);
				sinon.assert.callOrder(willStartSession, didFailStartRuntime);
				sinon.assert.notCalled(didStartRuntime);

				willStartSessionDisposable.dispose();
				const session2 = await start(runtime);

				if (action === 'select' || action === 'restore') {
					assertActiveSessions([session1]);
				} else {
					assertActiveSessions([session1, session2]);
				}

				assertCurrentSession(runtime, notebookUri, session2);
				assert.strictEqual(session2.getRuntimeState(), RuntimeState.Starting);
			});

			test(`${action} ${mode} concurrently encounters session.start() error`, async function () {
				if ((action === 'restore' && mode === LanguageRuntimeSessionMode.Console)) {
					this.skip();
				}
				const willStartSession = sinon.spy((e: IRuntimeSessionWillStartEvent) => {
					sinon.stub(e.session, 'start').rejects(new Error('Session failed to start'));
				});
				disposables.add(runtimeSessionService.onWillStartSession(willStartSession));

				await Promise.all([
					assert.rejects(start(runtime)),
					assert.rejects(start(runtime)),
				]);
			});

			if (mode === LanguageRuntimeSessionMode.Notebook) {
				test(`${action} ${mode} throws if another runtime is starting for the language`, async () => {
					const error = new Error(`Session for language runtime ${formatLanguageRuntimeMetadata(anotherRuntime)} cannot ` +
						`be started because language runtime ${formatLanguageRuntimeMetadata(runtime)} ` +
						`is already starting for the notebook ${notebookUri.toString()}.`
						+ (action !== 'restore' ? ` Request source: ${startReason}` : ''));

					await assert.rejects(
						Promise.all([
							start(runtime),
							start(anotherRuntime),
						]),
						error);
				});

				test(`${action} ${mode} throws if another runtime is running for the language`, async () => {
					const error = new Error(`A notebook for ${formatLanguageRuntimeMetadata(anotherRuntime)} cannot ` +
						`be started because a notebook for ${formatLanguageRuntimeMetadata(runtime)} ` +
						`is already running for the URI ${notebookUri.toString()}.` +
						(action !== 'restore' ? ` Request source: ${startReason}` : ''));

					await start(runtime);
					await assert.rejects(
						start(anotherRuntime),
						error,
					);
				});
			}

			test(`${action} ${mode} successively`, async () => {
				const session1 = await start(runtime);
				const session2 = await start(runtime);
				const session3 = await start(runtime);

				if (mode === LanguageRuntimeSessionMode.Notebook
					|| (mode === LanguageRuntimeSessionMode.Console
						&& (action === 'restore' || action === 'select'))) {
					assert.strictEqual(session1.sessionId, session2.sessionId);
					assert.strictEqual(session2.sessionId, session3.sessionId);

					assertActiveSessions([session1]);
					assertCurrentSession(runtime, notebookUri, session1);
					assert.strictEqual(session1.getRuntimeState(), RuntimeState.Starting);
				} else if (mode === LanguageRuntimeSessionMode.Console) {
					assert.notStrictEqual(session1.sessionId, session2.sessionId);
					assert.notStrictEqual(session2.sessionId, session3.sessionId);

					assertActiveSessions([session1, session2, session3]);
					assertCurrentSession(runtime, notebookUri, session3);
					assert.strictEqual(session1.getRuntimeState(), RuntimeState.Starting);
					assert.strictEqual(session2.getRuntimeState(), RuntimeState.Starting);
					assert.strictEqual(session3.getRuntimeState(), RuntimeState.Starting);
				}
			});

			test(`${action} ${mode} concurrently`, async function () {
				if ((action === 'restore' && mode === LanguageRuntimeSessionMode.Console)) {
					this.skip();
				}
				const [session1, session2, session3] = await Promise.all([start(runtime), start(runtime), start(runtime)]);

				assert.strictEqual(session1.sessionId, session2.sessionId);
				assert.strictEqual(session2.sessionId, session3.sessionId);

				assertActiveSessions([session1]);
				assertCurrentSession(runtime, notebookUri, session1);
				assert.strictEqual(session1.getRuntimeState(), RuntimeState.Starting);
			});

			if (mode === LanguageRuntimeSessionMode.Console) {
				test(`${action} console concurrently with no session manager for runtime`, async () => {
					sinon.stub(manager, 'managesRuntime').resolves(false);

					const promise1 = start(runtime);
					const promise2 = start(runtime);

					await assert.rejects(promise1);
					await assert.rejects(promise2);
				});
			}
		}

		if (startNotebook) {
			test(`${action} console and notebook from the same runtime concurrently`, async () => {
				const [consoleSession, notebookSession] = await Promise.all([
					startConsole(runtime),
					startNotebook(runtime),
				]);

				assert.strictEqual(consoleSession.getRuntimeState(), RuntimeState.Starting);
				assert.strictEqual(notebookSession.getRuntimeState(), RuntimeState.Starting);

				assertActiveSessions([consoleSession, notebookSession]);
				assertConsoleSessionForLanguage(runtime.languageId, consoleSession);
				assertConsoleSessionForRuntime(runtime.runtimeId, consoleSession);
				assertHasStartingOrRunningConsole(true);
				assertNotebookSessionForNotebookUri(notebookUri, notebookSession);
			});
		}
	}

	test(`start notebook without notebook uri`, async () => {
		await assert.rejects(
			startSession(runtime, LanguageRuntimeSessionMode.Notebook, undefined),
			new Error('A notebook URI must be provided when starting a notebook session.'),
		);
	});

	test('restore console registers runtime if unregistered', async () => {
		assert.strictEqual(languageRuntimeService.getRegisteredRuntime(unregisteredRuntime.runtimeId), undefined);

		await restoreConsole(unregisteredRuntime);

		assert.strictEqual(languageRuntimeService.getRegisteredRuntime(unregisteredRuntime.runtimeId), unregisteredRuntime);
	});

	test('auto start validates runtime if unregistered', async () => {
		assert.strictEqual(languageRuntimeService.getRegisteredRuntime(unregisteredRuntime.runtimeId), undefined);

		const validatedMetadata: Partial<ILanguageRuntimeMetadata> = {
			extraRuntimeData: { someNewKey: 'someNewValue' }
		};
		manager.setValidateMetadata(async (metadata: ILanguageRuntimeMetadata) => {
			return { ...metadata, ...validatedMetadata };
		});

		await autoStartSession(unregisteredRuntime);

		assert.deepStrictEqual(
			languageRuntimeService.getRegisteredRuntime(unregisteredRuntime.runtimeId),
			{ ...unregisteredRuntime, ...validatedMetadata }
		);
	});

	test('auto start throws if runtime validation errors', async () => {
		assert.strictEqual(languageRuntimeService.getRegisteredRuntime(unregisteredRuntime.runtimeId), undefined);

		const error = new Error('Failed to validate runtime metadata');
		manager.setValidateMetadata(async (_metadata: ILanguageRuntimeMetadata) => {
			throw error;
		});

		await assert.rejects(autoStartSession(unregisteredRuntime), error);

		assert.strictEqual(languageRuntimeService.getRegisteredRuntime(unregisteredRuntime.runtimeId), undefined);
	});

	test('auto start console does nothing if automatic startup is disabled', async () => {
		configService.setUserConfiguration('interpreters.startupBehavior', LanguageStartupBehavior.Disabled);

		const sessionId = await runtimeSessionService.autoStartRuntime(runtime, startReason, true);

		assert.strictEqual(sessionId, '');

		assertActiveSessions([]);
		assertHasStartingOrRunningConsole(false);
		assertConsoleSessionForLanguage(runtime.languageId, undefined);
		assertConsoleSessionForRuntime(runtime.runtimeId, undefined);
		assertNotebookSessionForNotebookUri(notebookUri, undefined);
	});

	for (const action of ['auto start', 'start']) {
		test(`${action} console in an untrusted workspace defers until trust is granted`, async () => {
			workspaceTrustManagementService.setWorkspaceTrust(false);

			let sessionId: string;
			if (action === 'auto start') {
				sessionId = await runtimeSessionService.autoStartRuntime(runtime, startReason, true);
			} else {
				sessionId = await runtimeSessionService.startNewRuntimeSession(
					runtime.runtimeId, sessionName, LanguageRuntimeSessionMode.Console, undefined, startReason, RuntimeStartMode.Starting, true);
			}

			assert.strictEqual(sessionId, '');

			assertActiveSessions([]);
			assertConsoleSessionForLanguage(runtime.languageId, undefined);
			assertConsoleSessionForRuntime(runtime.runtimeId, undefined);
			assertHasStartingOrRunningConsole(false);
			assertNotebookSessionForNotebookUri(notebookUri, undefined);

			workspaceTrustManagementService.setWorkspaceTrust(true);

			const session = await Event.toPromise(runtimeSessionService.onDidStartRuntime);
			disposables.add(session);

			assertActiveSessions([session]);
			assertCurrentSession(runtime, notebookUri, session);
			assert.strictEqual(session.getRuntimeState(), RuntimeState.Starting);
		});
	}

	test('start notebook in an untrusted workspace throws', async () => {
		workspaceTrustManagementService.setWorkspaceTrust(false);

		await assert.rejects(startNotebook(runtime), new Error('Cannot start a notebook session in an untrusted workspace.'));
	});

	test('select console while another runtime is running for the language', async () => {
		const session1 = await startConsole(anotherRuntime);
		await waitForRuntimeState(session1, RuntimeState.Ready);
		const session2 = await selectRuntime(runtime);

		assert.notStrictEqual(session1.sessionId, session2.sessionId);

		assertActiveSessions([session1, session2]);
		assertConsoleSessionForLanguage(runtime.languageId, session2);
		assertConsoleSessionForRuntime(runtime.runtimeId, session2);
		assertConsoleSessionForRuntime(anotherRuntime.runtimeId, session1);
		assertHasStartingOrRunningConsole(true);
		assert.strictEqual(session1.getRuntimeState(), RuntimeState.Ready);
		assert.strictEqual(session2.getRuntimeState(), RuntimeState.Starting);
	});

	test('select console while another runtime is starting for the language', async () => {
		const [session1, session2] = await Promise.all([
			startConsole(anotherRuntime),
			selectRuntime(runtime),
		]);
		assert.notStrictEqual(session1.sessionId, session2.sessionId);

		assertActiveSessions([session1, session2]);
		assertConsoleSessionForLanguage(runtime.languageId, session2);
		assertConsoleSessionForRuntime(runtime.runtimeId, session2);
		assertConsoleSessionForRuntime(anotherRuntime.runtimeId, session1);
		assertHasStartingOrRunningConsole(true);
		assert.strictEqual(session1.getRuntimeState(), RuntimeState.Starting);
		assert.strictEqual(session2.getRuntimeState(), RuntimeState.Starting);
	});

	test('select console to the same runtime sets the foreground session', async () => {
		const session1 = await startConsole(runtime);

		runtimeSessionService.foregroundSession = undefined;

		const session2 = await selectRuntime(runtime);

		assert.strictEqual(session1, session2);
		assert.strictEqual(runtimeSessionService.foregroundSession, session1);
	});

	function restartSession(sessionId: string) {
		return runtimeSessionService.restartSession(sessionId, startReason, false);
	}

	for (const { mode, start } of [
		{ mode: LanguageRuntimeSessionMode.Console, start: startConsole },
		{ mode: LanguageRuntimeSessionMode.Notebook, start: startNotebook },
	]) {
		test(`restart ${mode} throws if session not found`, async () => {
			const sessionId = 'unknown-session-id';
			assert.rejects(
				restartSession(sessionId),
				new Error(`No session with ID '${sessionId}' was found.`),
			);
		});

		for (const state of [RuntimeState.Busy, RuntimeState.Idle, RuntimeState.Ready, RuntimeState.Exited]) {
			test(`restart ${mode} in '${state}' state`, async () => {
				const session = await start(runtime);
				await waitForRuntimeState(session, RuntimeState.Ready);

				if (session.getRuntimeState() !== state) {
					session.setRuntimeState(state);
				}

				const willStartSession = sinon.spy();
				disposables.add(runtimeSessionService.onWillStartSession(willStartSession));

				await restartSession(session.sessionId);

				assertActiveSessions([session]);
				assertCurrentSession(runtime, notebookUri, session);
				assert.strictEqual(session.getRuntimeState(), RuntimeState.Ready);

				sinon.assert.calledOnceWithExactly(willStartSession, {
					session,
					startMode: RuntimeStartMode.Restarting,
					activate: false
				});
			});
		}
	}

	test(`only one UI comm is created`, async () => {
		const session = await startConsole(runtime);

		await timeout(0);

		const uiCommsBefore = await session.listClients(RuntimeClientType.Ui);
		assert.strictEqual(uiCommsBefore.length, 1);

		session.setRuntimeState(RuntimeState.Ready);

		await timeout(0);

		const uiCommsAfter = await session.listClients(RuntimeClientType.Ui);
		assert.strictEqual(uiCommsAfter.length, 1);
	});

	test(`can set the working directory`, async () => {
		const session = await startConsole(runtime);
		await timeout(0);

		const dir = '/foo/bar/baz';
		session.setWorkingDirectory(dir);

		assert.strictEqual(session.getWorkingDirectory(), dir);
	});

	test(`working directory sticks after a restart`, async () => {
		const session = await startConsole(runtime);
		await timeout(0);

		const dir = '/baz/bar/foo';
		session.setWorkingDirectory(dir);

		session.clearWorkingDirectory();

		await runtimeSessionService.restartSession(session.sessionId, startReason);
		await timeout(0);

		assert.strictEqual(session.getWorkingDirectory(), dir);
	});

	test('updateNotebookSessionUri updates URI mapping correctly', async () => {
		const untitledUri = URI.parse('untitled:notebook.ipynb');

		const savedUri = URI.file('/path/to/saved/notebook.ipynb');

		const session = await startSession(runtime, LanguageRuntimeSessionMode.Notebook, untitledUri);

		const sessionBeforeUpdate = runtimeSessionService.getNotebookSessionForNotebookUri(untitledUri);
		assert.strictEqual(sessionBeforeUpdate, session, 'Session should be accessible via untitled URI before update');

		const returnedSessionId = runtimeSessionService.updateNotebookSessionUri(untitledUri, savedUri);

		assert.strictEqual(returnedSessionId, session.sessionId, 'Function should return the correct session ID');

		const oldUriSession = runtimeSessionService.getNotebookSessionForNotebookUri(untitledUri);
		assert.strictEqual(oldUriSession, undefined, 'Session should no longer be accessible via old URI');

		const newUriSession = runtimeSessionService.getNotebookSessionForNotebookUri(savedUri);
		assert.strictEqual(newUriSession, session, 'Session should be accessible via new URI');
	});

	test('updateNotebookSessionUri returns undefined when session not found', async () => {
		const nonExistentUri = URI.file('/path/to/nonexistent/notebook.ipynb');
		const newUri = URI.file('/path/to/new/notebook.ipynb');

		const returnedSessionId = runtimeSessionService.updateNotebookSessionUri(nonExistentUri, newUri);

		assert.strictEqual(returnedSessionId, undefined,
			'Function should return undefined when no session exists for the old URI');
	});

	test('updateSessionName updates session name correctly', async () => {
		const session = await startConsole(runtime);
		const otherSession = await startConsole(runtime);

		await waitForRuntimeState(session, RuntimeState.Ready);
		await waitForRuntimeState(otherSession, RuntimeState.Ready);

		assert.strictEqual(session.dynState.sessionName, runtime.runtimeName, 'Initial session name should match');
		assert.strictEqual(otherSession.dynState.sessionName, runtime.runtimeName, 'Initial session name should match');

		const newName = 'updated-session-name';
		runtimeSessionService.updateSessionName(session.sessionId, newName);

		assert.strictEqual(session.dynState.sessionName, newName, 'Session name should be updated correctly');
		assert.strictEqual(otherSession.dynState.sessionName, runtime.runtimeName, 'Other session name should remain unchanged');
	});

	suite('Working Directory Configuration', () => {
		test('working directory is applied to notebook sessions when configured', async () => {
			const workingDir = '/custom/working/directory';
			configService.setUserConfiguration('notebook.workingDirectory', workingDir);

			const session = await startNotebook(runtime);

			assert.strictEqual(session.metadata.workingDirectory, workingDir, 'Working directory should be set for notebook sessions');
		});

		test('working directory is default for console sessions even when notebook working directory is configured', async () => {
			const workingDir = '/custom/working/directory';
			configService.setUserConfiguration('notebook.workingDirectory', workingDir);

			const session = await startConsole(runtime);

			assert.strictEqual(session.metadata.workingDirectory, undefined, 'Working directory should be undefined for console sessions');
		});

		test('working directory is default when configuration is empty string', async () => {
			configService.setUserConfiguration('notebook.workingDirectory', '');

			const session = await startNotebook(runtime);

			assert.strictEqual(session.metadata.workingDirectory, notebookParent, 'Working directory should be default for empty string');
		});

		test('working directory is default when configuration is whitespace only', async () => {
			configService.setUserConfiguration('notebook.workingDirectory', '   ');

			const session = await startNotebook(runtime);

			assert.strictEqual(session.metadata.workingDirectory, notebookParent, 'Working directory should be default for whitespace only');
		});

		test('working directory supports variable resolution for notebook sessions', async () => {
			const workingDir = '/workspace/folder';
			configService.setUserConfiguration('notebook.workingDirectory', workingDir);

			const mockConfigResolver = configurationResolverService as any;
			mockConfigResolver.resolveAsync = sinon.stub().resolves('/resolved/workspace/folder');

			const session = await startNotebook(runtime);

			assert.strictEqual(session.metadata.workingDirectory, '/resolved/workspace/folder', 'Working directory should be resolved');
			sinon.assert.calledOnce(mockConfigResolver.resolveAsync);
		});

		test('working directory falls back to default when resolution fails for notebook sessions', async () => {
			const workingDir = '/workspace/folder';
			configService.setUserConfiguration('notebook.workingDirectory', workingDir);

			const mockConfigResolver = configurationResolverService as any;
			mockConfigResolver.resolveAsync = sinon.stub().rejects(new Error('Resolution failed'));

			const session = await startNotebook(runtime);

			assert.strictEqual(session.metadata.workingDirectory, notebookParent, 'Working directory should fall back to default');
			sinon.assert.calledOnce(mockConfigResolver.resolveAsync);
		});

		test('working directory falls back to default when it doesnt exist', async () => {
			const workingDir = '/non/existent/directory';
			configService.setUserConfiguration('notebook.workingDirectory', workingDir);

			const session = await startNotebook(runtime);

			assert.strictEqual(session.metadata.workingDirectory, notebookParent, 'Working directory should fall back to default for non-existent directory');
		});

		test('working directory is resource-scoped for notebook sessions', async () => {
			const workingDir = '/notebook/specific/directory';
			await configService.setUserConfiguration('notebook.workingDirectory', workingDir, notebookUri);

			const session = await startNotebook(runtime);

			assert.strictEqual(session.metadata.workingDirectory, workingDir, 'Working directory should be resource-scoped');
		});

		test('working directory differs between console and notebook sessions', async () => {
			const consoleWorkingDir = '/console/directory';
			const notebookWorkingDir = '/notebook/directory';

			await configService.setUserConfiguration('notebook.workingDirectory', consoleWorkingDir);
			await configService.setUserConfiguration('notebook.workingDirectory', notebookWorkingDir, notebookUri);

			const consoleSession = await startConsole(runtime);
			const notebookSession = await startNotebook(runtime);

			assert.strictEqual(consoleSession.metadata.workingDirectory, undefined, 'Console session should not use working directory configuration');
			assert.strictEqual(notebookSession.metadata.workingDirectory, notebookWorkingDir, 'Notebook session should use resource-scoped configuration');
		});
	});
});
