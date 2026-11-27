/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IEnterWorkspaceResult } from '../../../../../platform/workspaces/common/workspaces.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
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
		instantiationService.stub(INativeWorkbenchEnvironmentService, { remoteAuthority });
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
		const storageService = instantiationService.get(IStorageService);
		let historyService: HistoryService | undefined;
		if (withHistory) {
			// A real history on the window's storage, with the given history from before
			storageService.store('history.entries', JSON.stringify(withHistory.map(path => ({ editor: { resource: URI.file(path).toString() } }))), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			historyService = store.add(instantiationService.createInstance(HistoryService));
			instantiationService.stub(IHistoryService, historyService);
		} else {
			instantiationService.stub(IHistoryService, 'restoreRecentlyOpened', () => { calls.push('restoreHistory'); });
		}
		if (storageFailure) {
			instantiationService.stub(IStorageService, 'switch', async () => { throw storageFailure; });
		} else {
			// The in-memory storage keeps its data on a switch, like a switch that preserves the data copies it into the new workspace
			instantiationService.stub(IStorageService, 'switch', async (_to: unknown, preserveData: boolean) => {
				calls.push(`switchStorage:${preserveData}`);
				if (withHistory) {
					contextService.setWorkspace(testWorkspace(URI.file('/new')));
				}
			});
		}
		const service = store.add(instantiationService.createInstance(TestWorkspaceEditingService));
		return { service, backups, calls, errors, contextService, storageService, historyService };
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
		assert.deepStrictEqual(calls, ['stop', 'agentsMode:false', 'start']);
	});

	test('brings back the editor history from before Agents mode when the workspace was entered, and only then', async () => {
		const { service, calls } = setupServices(undefined, true, undefined, true);
		service.result = { workspace: { id: 'new', configPath: URI.file('/new.code-workspace') } };
		await service.enterWorkspace(URI.file('/new.code-workspace'));
		const enteredFromMode = calls.splice(0);

		await service.enterWorkspace(URI.file('/other.code-workspace'));
		const enteredOutsideMode = calls.splice(0);

		assert.deepStrictEqual({ enteredFromMode, enteredOutsideMode }, {
			// The history is restored after the storage moved, so it is restored in the storage of the new workspace
			enteredFromMode: ['stop', 'agentsMode:false', 'switchStorage:true', 'restoreHistory', 'start'],
			enteredOutsideMode: ['stop', 'switchStorage:true', 'start'],
		});
	});

	test('leaves the new workspace with the history from before Agents mode, like entering it outside the mode, and without the saved history', async () => {
		const enter = async (inAgentsMode: boolean) => {
			const { service, storageService, historyService } = setupServices(undefined, true, undefined, inAgentsMode, undefined, ['/old/a.txt']);
			const savedKeys = () => ['history.entries.saved', 'history.entries.saved.cleared'].filter(key => storageService.get(key, StorageScope.WORKSPACE) !== undefined);
			historyService!.getHistory(); // load
			if (inAgentsMode) {
				// Entering the mode saved the history, and switching sessions in it cleared it
				historyService!.saveRecentlyOpened();
				historyService!.clearRecentlyOpened();
			}
			const savedKeysBefore = savedKeys();
			service.result = { workspace: { id: 'new', configPath: URI.file('/new.code-workspace') } };
			await service.enterWorkspace(URI.file('/new.code-workspace'));

			return { savedKeysBefore, history: historyService!.getHistory().map(editor => editor.resource?.path), savedKeysAfter: savedKeys() };
		};

		assert.deepStrictEqual({ fromMode: await enter(true), outsideMode: await enter(false) }, {
			fromMode: { savedKeysBefore: ['history.entries.saved', 'history.entries.saved.cleared'], history: ['/old/a.txt'], savedKeysAfter: [] },
			outsideMode: { savedKeysBefore: [], history: ['/old/a.txt'], savedKeysAfter: [] },
		});
	});
});
