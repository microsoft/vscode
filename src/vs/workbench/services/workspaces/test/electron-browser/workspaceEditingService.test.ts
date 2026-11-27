/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IEnterWorkspaceResult } from '../../../../../platform/workspaces/common/workspaces.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestContextService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IAgentsModeService } from '../../../agentsMode/common/agentsMode.js';
import { INativeWorkbenchEnvironmentService } from '../../../environment/electron-browser/environmentService.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
import { HistoryService } from '../../../history/browser/historyService.js';
import { IHistoryService } from '../../../history/common/history.js';
import { IHostService } from '../../../host/browser/host.js';
import { WorkingCopyBackupService } from '../../../workingCopy/common/workingCopyBackupService.js';
import { NativeWorkspaceEditingService } from '../../electron-browser/workspaceEditingService.js';

class TestBackupService extends WorkingCopyBackupService {
	failure: Error | undefined;
	reinitialized: URI | undefined;

	override reinitialize(backupWorkspaceHome: URI | undefined): void {
		this.reinitialized = backupWorkspaceHome;
		super.reinitialize(backupWorkspaceHome);
	}

	override async withBackupPathTransition<T>(transition: () => Promise<T>): Promise<T> {
		if (this.failure) {
			throw this.failure;
		}
		return super.withBackupPathTransition(transition);
	}
}

class TestWorkspaceEditingService extends NativeWorkspaceEditingService {
	entered = false;
	failure: Error | undefined;
	onEnter: (() => void) | undefined;
	result: IEnterWorkspaceResult | undefined;

	protected override async doEnterWorkspace() {
		this.entered = true;
		this.onEnter?.();
		if (this.failure) {
			throw this.failure;
		}
		return this.result;
	}
}

suite('NativeWorkspaceEditingService - extension host recovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setupServices(remoteAuthority?: string, stopped = true, restartFailure?: Error, inAgentsMode = false, storageFailure?: Error, withHistory?: string[]) {
		const calls: string[] = [];
		const errors: (string | Error)[] = [];
		const fileService = store.add(new FileService(new NullLogService()));
		const backups = store.add(new TestBackupService(undefined, fileService, new NullLogService()));
		const instantiationService = workbenchInstantiationService({
			fileService: () => fileService,
			workingCopyBackupService: () => backups,
		}, store);
		instantiationService.stub(INativeHostService, {});
		instantiationService.stub(ILogService, new class extends NullLogService {
			override error(message: string | Error): void { errors.push(message); }
		}());
		instantiationService.stub(INativeWorkbenchEnvironmentService, { remoteAuthority, userRoamingDataHome: URI.file('/user') });
		instantiationService.stub(IExtensionService, {
			stopExtensionHosts: async () => { calls.push('stop'); return stopped; },
			startExtensionHosts: async () => {
				calls.push('start');
				if (restartFailure) {
					throw restartFailure;
				}
			},
		});
		instantiationService.stub(IHostService, { reload: async () => { calls.push('reload'); } });
		instantiationService.stub(IAgentsModeService, {
			get isActive() { return inAgentsMode; },
			setActive: async (active: boolean, workspaceId?: string) => { calls.push(workspaceId ? `agentsMode:${active}:${workspaceId}` : `agentsMode:${active}`); inAgentsMode = active; },
		});
		const contextService = instantiationService.get(IWorkspaceContextService) as TestContextService;
		contextService.setWorkspace(testWorkspace(URI.file('/old')));
		const storageService = instantiationService.get(IStorageService) as TestStorageService;
		const leftWorkspaceStorage = new Map<string, string>();
		const restoreHistory: { failure?: Error } = {};
		let historyService: HistoryService | undefined;
		if (withHistory) {
			// A real history on the window's storage, with the given history from before
			storageService.store('history.entries', JSON.stringify(withHistory.map(path => ({ editor: { resource: URI.file(path).toString() } }))), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			historyService = store.add(instantiationService.createInstance(HistoryService));
			instantiationService.stub(IHistoryService, historyService);
		} else {
			instantiationService.stub(IHistoryService, 'restoreRecentlyOpened', () => {
				calls.push('restoreHistory');
				if (restoreHistory.failure) {
					throw restoreHistory.failure;
				}
			});
		}
		if (storageFailure) {
			instantiationService.stub(IStorageService, 'switch', async () => { throw storageFailure; });
		} else {
			// Like the real storage, a switch saves the state, keeps the data of the left workspace in its own storage
			// and opens the empty storage of the new workspace: preserving the data does not copy it
			instantiationService.stub(IStorageService, 'switch', async (_to: unknown, preserveData: boolean) => {
				calls.push(`switchStorage:${preserveData}`);
				if (withHistory) {
					storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
					for (const target of [StorageTarget.USER, StorageTarget.MACHINE]) {
						for (const key of storageService.keys(StorageScope.WORKSPACE, target)) {
							leftWorkspaceStorage.set(key, storageService.get(key, StorageScope.WORKSPACE)!);
							storageService.remove(key, StorageScope.WORKSPACE);
						}
					}
					contextService.setWorkspace(testWorkspace(URI.file('/new')));
				}
			});
		}
		const service = store.add(instantiationService.createInstance(TestWorkspaceEditingService));
		return { service, backups, calls, errors, contextService, storageService, leftWorkspaceStorage, historyService, restoreHistory };
	}

	for (const remoteAuthority of [undefined, 'test-remote']) {
		test(`restarts stopped hosts after a backup drain failure (${remoteAuthority ?? 'local'})`, async () => {
			const { service, backups, calls } = setupServices(remoteAuthority);
			const failure = backups.failure = new Error('backup failed');
			await assert.rejects(service.enterWorkspace(URI.file('/new.code-workspace')), error => error === failure);
			assert.deepStrictEqual({ calls, entered: service.entered }, { calls: ['stop', 'start'], entered: false });
		});
	}

	test('restarts stopped hosts after workspace entry fails', async () => {
		const { service, calls } = setupServices();
		const failure = service.failure = new Error('entry failed');
		await assert.rejects(service.enterWorkspace(URI.file('/new.code-workspace')), error => error === failure);
		assert.deepStrictEqual({ calls, entered: service.entered }, { calls: ['stop', 'start'], entered: true });
	});

	test('preserves the original error if restarting hosts also fails', async () => {
		const restartFailure = new Error('restart failed');
		const { service, backups, calls, errors } = setupServices(undefined, true, restartFailure);
		const failure = backups.failure = new Error('backup failed');
		await assert.rejects(service.enterWorkspace(URI.file('/new.code-workspace')), error => error === failure);
		assert.deepStrictEqual({ calls, errors }, { calls: ['stop', 'start'], errors: [restartFailure] });
	});

	test('does not restart hosts if stopping was vetoed', async () => {
		const { service, calls } = setupServices(undefined, false);
		await service.enterWorkspace(URI.file('/new.code-workspace'));
		assert.deepStrictEqual({ calls, entered: service.entered }, { calls: ['stop'], entered: false });
	});

	for (const remoteAuthority of [undefined, 'test-remote']) {
		test(`preserves successful restart behavior (${remoteAuthority ?? 'local'})`, async () => {
			const { service, calls } = setupServices(remoteAuthority);
			await service.enterWorkspace(URI.file('/new.code-workspace'));
			assert.deepStrictEqual(calls, ['stop', remoteAuthority ? 'reload' : 'start']);
		});
	}

	test('leaves Agents mode after stopping hosts and before entering the workspace, and goes back into it when the workspace is not entered', async () => {
		const { service, calls } = setupServices(undefined, true, undefined, true);
		await service.enterWorkspace(URI.file('/new.code-workspace'));
		assert.deepStrictEqual({ calls, entered: service.entered }, { calls: ['stop', 'agentsMode:false', `agentsMode:true:${testWorkspace(URI.file('/old')).id}`, 'start'], entered: true });
	});

	test('goes back into Agents mode with the left workspace\'s id when the configuration was already initialized with the new workspace', async () => {
		const { service, calls, contextService } = setupServices(undefined, true, undefined, true);
		const oldId = contextService.getWorkspace().id;
		service.onEnter = () => contextService.setWorkspace(testWorkspace(URI.file('/new')));
		await service.enterWorkspace(URI.file('/new.code-workspace'));
		assert.deepStrictEqual(calls, ['stop', 'agentsMode:false', `agentsMode:true:${oldId}`, 'start']);
	});

	test('goes back into Agents mode when entering the workspace fails', async () => {
		const { service, calls } = setupServices(undefined, true, undefined, true);
		const failure = service.failure = new Error('entry failed');
		await assert.rejects(service.enterWorkspace(URI.file('/new.code-workspace')), error => error === failure);
		assert.deepStrictEqual(calls, ['stop', 'agentsMode:false', `agentsMode:true:${testWorkspace(URI.file('/old')).id}`, 'start']);
	});

	test('stays out of Agents mode when the workspace was entered and a later step fails', async () => {
		const failure = new Error('storage switch failed');
		const { service, calls } = setupServices(undefined, true, undefined, true, failure);
		service.result = { workspace: { id: 'new', configPath: URI.file('/new.code-workspace') } };
		await assert.rejects(service.enterWorkspace(URI.file('/new.code-workspace')), error => error === failure);
		// The window left the mode for good once the main process entered the workspace, so its history comes back
		assert.deepStrictEqual(calls, ['stop', 'agentsMode:false', 'restoreHistory', 'start']);
	});

	test('brings back the editor history from before Agents mode when the workspace was entered, and only then', async () => {
		const { service, calls } = setupServices(undefined, true, undefined, true);
		service.result = { workspace: { id: 'new', configPath: URI.file('/new.code-workspace') } };
		await service.enterWorkspace(URI.file('/new.code-workspace'));
		const enteredFromMode = calls.splice(0);

		await service.enterWorkspace(URI.file('/other.code-workspace'));
		const enteredOutsideMode = calls.splice(0);

		assert.deepStrictEqual({ enteredFromMode, enteredOutsideMode }, {
			// The saved history is in the storage of the left workspace, so it is restored before the storage switches
			enteredFromMode: ['stop', 'agentsMode:false', 'restoreHistory', 'switchStorage:true', 'start'],
			enteredOutsideMode: ['stop', 'switchStorage:true', 'start'],
		});
	});

	test('still switches the storage and the backups to the entered workspace when bringing back the history fails', async () => {
		const { service, calls, backups, restoreHistory } = setupServices(undefined, true, undefined, true);
		const failure = restoreHistory.failure = new Error('restore failed');
		const unexpectedErrors: unknown[] = [];
		const previousHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => unexpectedErrors.push(error));
		store.add(toDisposable(() => setUnexpectedErrorHandler(previousHandler)));
		service.result = { workspace: { id: 'new', configPath: URI.file('/new.code-workspace') }, backupPath: '/backups/new' };
		await service.enterWorkspace(URI.file('/new.code-workspace'));
		assert.deepStrictEqual({ calls, unexpectedErrors, backupHome: backups.reinitialized?.path }, {
			calls: ['stop', 'agentsMode:false', 'restoreHistory', 'switchStorage:true', 'start'],
			unexpectedErrors: [failure],
			backupHome: '/backups/new',
		});
	});

	test('leaves the new workspace with the history from before Agents mode, like entering it outside the mode, and without the saved history', async () => {
		const enter = async (inAgentsMode: boolean) => {
			const { service, storageService, leftWorkspaceStorage, historyService } = setupServices(undefined, true, undefined, inAgentsMode, undefined, ['/old/a.txt']);
			const savedKeysIn = (get: (key: string) => string | undefined) => ['history.entries.saved', 'history.entries.saved.cleared'].filter(key => get(key) !== undefined);
			const savedKeys = () => savedKeysIn(key => storageService.get(key, StorageScope.WORKSPACE));
			historyService!.getHistory(); // load
			if (inAgentsMode) {
				// Entering the mode saved the history, and switching sessions in it cleared it
				historyService!.saveRecentlyOpened();
				historyService!.clearRecentlyOpened({ keepSaved: true });
			}
			const savedKeysBefore = savedKeys();
			service.result = { workspace: { id: 'new', configPath: URI.file('/new.code-workspace') } };
			await service.enterWorkspace(URI.file('/new.code-workspace'));

			storageService.testEmitWillSaveState(WillSaveStateReason.NONE);
			const newWorkspaceHistory = (JSON.parse(storageService.get('history.entries', StorageScope.WORKSPACE) ?? '[]') as { editor: { resource: string } }[]).map(entry => URI.parse(entry.editor.resource).path);

			return {
				savedKeysBefore,
				history: historyService!.getHistory().map(editor => editor.resource?.path),
				newWorkspaceHistory,
				savedKeysAfter: savedKeys(),
				savedKeysLeft: savedKeysIn(key => leftWorkspaceStorage.get(key)),
			};
		};

		assert.deepStrictEqual({ fromMode: await enter(true), outsideMode: await enter(false) }, {
			fromMode: { savedKeysBefore: ['history.entries.saved', 'history.entries.saved.cleared'], history: ['/old/a.txt'], newWorkspaceHistory: ['/old/a.txt'], savedKeysAfter: [], savedKeysLeft: [] },
			outsideMode: { savedKeysBefore: [], history: ['/old/a.txt'], newWorkspaceHistory: ['/old/a.txt'], savedKeysAfter: [], savedKeysLeft: [] },
		});
	});
});
