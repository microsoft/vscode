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
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { INativeWorkbenchEnvironmentService } from '../../../environment/electron-browser/environmentService.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
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

	protected override async doEnterWorkspace() {
		this.entered = true;
		if (this.failure) {
			throw this.failure;
		}
		return undefined;
	}
}

suite('NativeWorkspaceEditingService - extension host recovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setupServices(remoteAuthority?: string, stopped = true, restartFailure?: Error) {
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
		const service = store.add(instantiationService.createInstance(TestWorkspaceEditingService));
		return { service, backups, calls, errors };
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
});
