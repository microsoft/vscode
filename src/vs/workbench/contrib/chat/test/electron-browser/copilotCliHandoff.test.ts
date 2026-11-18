/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { env } from '../../../../../base/common/process.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { AhpErrorCodes, ProtocolError } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IExternalTerminalService } from '../../../../../platform/externalTerminal/electron-browser/externalTerminalService.js';
import { ExternalTerminalNotStartedError } from '../../../../../platform/externalTerminal/common/externalTerminal.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { InMemoryStorageService, IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING } from '../../../../../platform/window/common/window.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../services/chat/common/chatEntitlementService.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { IChatInputNotificationService } from '../../browser/widget/input/chatInputNotificationService.js';
import { IChatModel, IChatRequestModel } from '../../common/model/chatModel.js';
import { IChatViewModel } from '../../common/model/chatViewModel.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { SessionType } from '../../common/chatSessionsService.js';
import { getCopilotCliHandoffRequestUri, getCopilotCliOwnerRecordUri, ICopilotCliHandoffHistoryEntry, ICopilotCliHandoffRequest, ICopilotCliOwnerRecord, observeCopilotCliHandoffHistory, observeCopilotCliHandoffInputPaused, readCopilotCliHandoffRequest, readCopilotCliOwnerRecord, writeCopilotCliHandoffRequest } from '../../common/copilotCliHandoff.js';
import { CopilotCliHandoffService } from '../../electron-browser/copilotCliHandoff.contribution.js';

suite('CopilotCliHandoffService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionId = '0b6f9a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
	const sessionResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: `/${sessionId}` });
	const backendSession = URI.parse(`ahp-session:/${sessionId}`);
	const userHome = URI.file('/home/user');
	const copilotHome = env.COPILOT_HOME ? URI.file(env.COPILOT_HOME) : joinPath(userHome, '.copilot');

	function record(surface: ICopilotCliOwnerRecord['surface'], via: ICopilotCliOwnerRecord['via']): ICopilotCliOwnerRecord {
		return { version: 1, surface, app: surface === 'cli' ? 'Copilot CLI' : 'Code - OSS', folder: '/home/user/tally', since: '2026-11-17T22:14:00.000Z', via };
	}

	interface IObserveOptions {
		readonly record: ICopilotCliOwnerRecord;
		readonly switchedOn?: boolean;
		/** Whether a response is running in the chat. */
		readonly busy?: boolean;
		readonly activeRequest?: boolean;
		readonly releaseError?: Error;
		readonly arrive?: boolean;
		readonly storageService?: IStorageService;
		readonly beforeFinish?: (service: CopilotCliHandoffService) => Promise<void>;
		readonly releasing?: DeferredPromise<void>;
		readonly releaseGate?: DeferredPromise<void>;
		readonly terminalLaunchError?: Error;
		readonly onIntegratedTerminal?: () => void;
		readonly handoffRequest?: ICopilotCliHandoffRequest;
	}

	/** Shows the session in a chat with its owner record in place, and reports the banners shown and the runtimes released. */
	async function observe(options: IObserveOptions) {
		const disposables = store.add(new DisposableStore());
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		await fileService.writeFile(getCopilotCliOwnerRecordUri(copilotHome, sessionId), VSBuffer.fromString(JSON.stringify(options.record)));
		if (options.handoffRequest) {
			await writeCopilotCliHandoffRequest(fileService, copilotHome, sessionId, options.handoffRequest);
		}
		const banners: string[] = [];
		const released: string[] = [];
		const errors: string[] = [];

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING]: options.switchedOn ?? true }));
		instantiationService.stub(IStorageService, options.storageService ?? disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({ sentimentObs: constObservable(upcastPartial<IChatSentiment>({ hidden: false })) }));
		const ownerRecordRead = new DeferredPromise<void>();
		const handoffSettled = new DeferredPromise<void>();
		instantiationService.stub(IFileService, upcastPartial<IFileService>({
			exists: resource => fileService.exists(resource),
			createWatcher: (resource, watchOptions) => fileService.createWatcher(resource, watchOptions),
			writeFile: (resource, content, writeOptions) => fileService.writeFile(resource, content, writeOptions),
			move: async (source, target, overwrite) => {
				const result = await fileService.move(source, target, overwrite);
				if (target.path === getCopilotCliHandoffRequestUri(copilotHome, sessionId).path) {
					const request = await readCopilotCliHandoffRequest(fileService, copilotHome, sessionId);
					if (request?.status !== 'requested') {
						handoffSettled.complete();
					}
				}
				return result;
			},
			del: (resource, deleteOptions) => fileService.del(resource, deleteOptions),
			readFile: async (resource, readOptions, token) => {
				const content = await fileService.readFile(resource, readOptions, token);
				ownerRecordRead.complete();
				return content;
			},
		}));
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			getWidgetsByLocations: () => [upcastPartial<IChatWidget>({ viewModel: upcastPartial<IChatViewModel>({ sessionResource }), onDidChangeViewModel: Event.None })],
			onDidAddWidget: Event.None,
			onDidRemoveWidget: Event.None,
		}));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			getSession: () => upcastPartial<IChatModel>({
				requestInProgress: constObservable(options.busy ?? false),
				hasActiveRequest: constObservable(options.activeRequest ?? options.busy ?? false),
				getRequests: () => [upcastPartial<IChatRequestModel>({ id: 'existing-request' })],
			}),
		}));
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
			resolveSessionResource: () => upcastPartial<IAgentHostSessionResolution>({
				connection: upcastPartial<IAgentConnection>({
					releaseSession: async session => {
						released.push(session.toString());
						options.releasing?.complete();
						await options.releaseGate?.p;
						if (options.releaseError) {
							throw options.releaseError;
						}
					},
				}),
				backendSession,
			}),
		}));
		instantiationService.stub(IChatInputNotificationService, upcastPartial<IChatInputNotificationService>({
			setNotification: notification => { banners.push(typeof notification.message === 'string' ? notification.message : notification.message.value); },
			deleteNotification: () => { },
		}));
		instantiationService.stub(ITerminalService, upcastPartial<ITerminalService>({
			createTerminal: async () => {
				options.onIntegratedTerminal?.();
				throw new Error('An integrated terminal was not requested');
			},
		}));
		instantiationService.stub(IExternalTerminalService, upcastPartial<IExternalTerminalService>({
			runInTerminal: async () => {
				if (options.terminalLaunchError) {
					throw options.terminalLaunchError;
				}
				return undefined;
			},
		}));
		instantiationService.stub(INativeWorkbenchEnvironmentService, upcastPartial<INativeWorkbenchEnvironmentService>({ userHome, mainPid: 4242, isSessionsWindow: false }));
		instantiationService.stub(IProductService, upcastPartial<IProductService>({ nameLong: 'Code - OSS', urlProtocol: 'code-oss' }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ getWorkspace: () => upcastPartial<IWorkspace>({ folders: [] }) }));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({
			info: message => { errors.push(`info: ${message}`); },
			error: message => { errors.push(`error: ${message}`); },
			warn: message => { errors.push(`warning: ${message}`); },
		}));
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({ withProgress: async (_options, task) => task({ report: () => { } }) }));
		instantiationService.stub(ILogService, new NullLogService());

		const service = disposables.add(instantiationService.createInstance(CopilotCliHandoffService));
		// The service reads the chat's owner record as it starts watching it, unless the prototype is off.
		if (options.switchedOn !== false) {
			await ownerRecordRead.p;
		}
		// What the record decides, such as releasing the runtime, follows the read.
		await timeout(0);
		if (options.handoffRequest) {
			await handoffSettled.p;
			await timeout(0);
		}
		if (options.arrive) {
			await service.didContinueFromCli(sessionId, sessionResource);
		}
		await options.beforeFinish?.(service);
		const history = observeCopilotCliHandoffHistory(sessionResource).get();
		const paused = observeCopilotCliHandoffInputPaused(sessionResource).get();
		const handoff = options.handoffRequest ? {
			response: await readCopilotCliHandoffRequest(fileService, copilotHome, sessionId),
			owner: await readCopilotCliOwnerRecord(fileService, copilotHome, sessionId),
		} : undefined;
		disposables.dispose();
		return { banners, released, history: history.map(entry => ({ kind: entry.kind, afterRequestId: entry.afterRequestId, returnCommand: entry.returnCommand })), paused, ...(errors.length ? { errors } : {}), ...(handoff ? { handoff } : {}) };
	}

	test('lets go of the runtime of a session that Copilot CLI owns now, unless the session is busy', async () => {
		assert.deepStrictEqual({
			takenBack: await observe({ record: record('cli', 'take-back') }),
			continuedInTerminal: await observe({ record: record('cli', 'continue-in-terminal') }),
			busy: await observe({ record: record('cli', 'take-back'), busy: true }),
			refusedByHost: await observe({ record: record('cli', 'take-back'), releaseError: new ProtocolError(AhpErrorCodes.Conflict, 'The session is busy.') }),
			ownedHere: await observe({ record: record('vscode', 'take-back') }),
			switchedOff: await observe({ record: record('cli', 'take-back'), switchedOn: false }),
		}, {
			takenBack: { banners: [], released: [backendSession.toString()], history: [{ kind: 'takenByCli', afterRequestId: 'existing-request', returnCommand: '/code' }], paused: true },
			continuedInTerminal: { banners: [], released: [backendSession.toString()], history: [{ kind: 'departure', afterRequestId: 'existing-request', returnCommand: '/code' }], paused: true },
			busy: { banners: [], released: [], history: [{ kind: 'takenByCli', afterRequestId: 'existing-request', returnCommand: '/code' }], paused: true },
			refusedByHost: { banners: [], released: [backendSession.toString()], history: [{ kind: 'takenByCli', afterRequestId: 'existing-request', returnCommand: '/code' }], paused: true },
			ownedHere: { banners: [], released: [], history: [], paused: false },
			switchedOff: { banners: [], released: [], history: [], paused: false },
		});
	});

	test('arrival history survives reopening without showing an input banner', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = await observe({ record: record('vscode', 'code-command'), storageService, arrive: true });
		const reopened = await observe({ record: record('vscode', 'code-command'), storageService });
		const switchedOff = await observe({ record: record('vscode', 'code-command'), storageService, switchedOn: false });
		assert.deepStrictEqual({ first, reopened, switchedOff }, {
			first: { banners: [], released: [], history: [{ kind: 'arrival', afterRequestId: 'existing-request', returnCommand: '/code' }], paused: false },
			reopened: { banners: [], released: [], history: [{ kind: 'arrival', afterRequestId: 'existing-request', returnCommand: '/code' }], paused: false },
			switchedOff: { banners: [], released: [], history: [], paused: false },
		});
	});

	test('a second window appends its departure without losing arrivals recorded by the first window', async () => {
		const storageService = store.add(new InMemoryStorageService());
		await observe({
			record: record('vscode', 'code-command'), storageService,
			beforeFinish: async firstWindow => {
				await observe({
					record: record('vscode', 'code-command'), storageService,
					beforeFinish: async secondWindow => {
						await firstWindow.didContinueFromCli(sessionId, sessionResource);
						await secondWindow.continueInTerminal(sessionResource);
					},
				});
			},
		});
		const reopened = await observe({ record: record('vscode', 'code-command'), storageService });
		assert.deepStrictEqual(reopened.history, [
			{ kind: 'arrival', afterRequestId: 'existing-request', returnCommand: '/code' },
			{ kind: 'departure', afterRequestId: 'existing-request', returnCommand: '/code' },
		]);
	});

	test('restores persisted events even when concurrent writes lose their target-registration metadata', async () => {
		const storageService = store.add(new class extends InMemoryStorageService {
			receiveUnindexedEvent(entry: ICopilotCliHandoffHistoryEntry): void {
				this.getStorage(StorageScope.PROFILE).set(`copilotCliHandoff.history.${sessionId}.${entry.id}`, JSON.stringify(entry));
			}
		}());
		storageService.receiveUnindexedEvent({ id: 'arrival', kind: 'arrival', timestamp: 1, returnCommand: '/code' });
		storageService.receiveUnindexedEvent({ id: 'departure', kind: 'departure', timestamp: 2, returnCommand: '/code' });
		const reopened = await observe({ record: record('vscode', 'code-command'), storageService });
		assert.deepStrictEqual(reopened.history, [
			{ kind: 'arrival', afterRequestId: undefined, returnCommand: '/code' },
			{ kind: 'departure', afterRequestId: undefined, returnCommand: '/code' },
		]);
	});

	test('a repeated arrow click cannot start a second handoff while the outgoing move is pending', async () => {
		const releasing = new DeferredPromise<void>();
		const releaseGate = new DeferredPromise<void>();
		const result = await observe({
			record: record('vscode', 'code-command'), releasing, releaseGate,
			beforeFinish: async service => {
				const move = service.continueInTerminal(sessionResource);
				const repeatedMove = service.continueInTerminal(sessionResource);
				await releasing.p;
				await service.takeBack(sessionResource);
				releaseGate.complete();
				await Promise.all([move, repeatedMove]);
			},
		});
		assert.deepStrictEqual({ released: result.released, paused: result.paused, errors: result.errors }, {
			released: [backendSession.toString()],
			paused: true,
			errors: [
				'info: A handoff is already in progress. Wait for it to finish.',
				'info: Wait for the move to Terminal to finish, then take the session back.',
			],
		});
	});

	test('an ambiguous external-terminal failure does not start a second CLI in the integrated terminal', async () => {
		let integratedTerminals = 0;
		const result = await observe({
			record: record('vscode', 'code-command'),
			arrive: true,
			terminalLaunchError: new Error('Terminal window no longer exists'),
			onIntegratedTerminal: () => integratedTerminals++,
			beforeFinish: service => service.continueInTerminal(sessionResource),
		});
		assert.deepStrictEqual({ integratedTerminals, paused: result.paused, errors: result.errors }, {
			integratedTerminals: 0,
			paused: true,
			errors: ['error: Couldn\'t confirm the terminal opened: Terminal window no longer exists. Input is paused here. Check your Terminal window before retrying, or select Take It Back to continue here.'],
		});
	});

	test('a definitively failed terminal launch restores the editor instead of waiting for a CLI that never started', async () => {
		const result = await observe({
			record: record('vscode', 'code-command'),
			arrive: true,
			terminalLaunchError: new ExternalTerminalNotStartedError('Terminal automation denied'),
			beforeFinish: service => service.continueInTerminal(sessionResource),
		});
		assert.deepStrictEqual({ paused: result.paused, history: result.history, errors: result.errors }, {
			paused: false,
			history: [{ kind: 'arrival', afterRequestId: 'existing-request', returnCommand: '/code' }],
			errors: ['error: The terminal command did not start: Terminal automation denied. The session remains here. Fix the terminal launch and try again.'],
		});
	});

	test('a running request or tool approval cannot be moved or taken over locally', async () => {
		const result = await observe({
			record: record('vscode', 'code-command'),
			activeRequest: true,
			beforeFinish: async service => {
				await service.continueInTerminal(sessionResource);
				await service.takeBack(sessionResource);
				assert.strictEqual(await service.prepareToOpenFromCli(sessionId), false);
			},
		});
		assert.deepStrictEqual(result, {
			banners: [], released: [], history: [], paused: false,
			errors: Array(3).fill('warning: This session is still running. Wait for its current work to finish before moving it or taking it over.'),
		});
	});

	for (const scenario of ['busy', 'hostBusy', 'hostReleaseFailed', 'idle', 'expired', 'changedOwner'] as const) {
		test(`CLI takeover request is checked by the current owner (${scenario})`, async () => {
			const owner = record('vscode', 'code-command');
			const target = { ...record('cli', 'take-back'), since: '2026-11-17T22:15:00.000Z' };
			const request: ICopilotCliHandoffRequest = {
				version: 1, requestId: '4a04a839-2b9e-4e16-9ca4-c023f725f73a', expectedOwnerSince: scenario === 'changedOwner' ? '2026-11-17T22:13:00.000Z' : owner.since,
				expiresAt: Date.now() + (scenario === 'expired' ? -1 : 10_000), target, status: 'requested',
			};
			const result = await observe({
				record: owner, handoffRequest: request, activeRequest: scenario === 'busy',
				releaseError: scenario === 'hostBusy' ? new ProtocolError(AhpErrorCodes.Conflict, 'The session is busy.') : scenario === 'hostReleaseFailed' ? new Error('SDK disconnection failed') : undefined,
			});
			const accepted = scenario === 'idle';
			const reason = scenario === 'expired' ? 'expired' : scenario === 'changedOwner' ? 'owner-changed' : scenario === 'hostReleaseFailed' ? 'unknown' : 'busy';
			assert.deepStrictEqual({
				response: result.handoff?.response,
				owner: result.handoff?.owner,
				released: result.released,
				paused: result.paused,
			}, {
				response: { ...request, status: accepted ? 'accepted' : 'rejected', ...(accepted ? {} : { reason }) },
				owner: accepted ? target : owner,
				released: accepted || scenario === 'hostBusy' || scenario === 'hostReleaseFailed' ? [backendSession.toString()] : [],
				paused: accepted,
			});
		});
	}
});
