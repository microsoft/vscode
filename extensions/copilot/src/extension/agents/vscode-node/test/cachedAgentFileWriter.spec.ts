/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from 'chai';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, expect, suite, test } from 'vitest';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { MockExtensionContext } from '../../../../platform/test/node/extensionContext';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { CachedAgentFileWriter } from '../cachedAgentFileWriter';

class CountingFileSystemService extends MockFileSystemService {
	writeCount = 0;
	failNextWrite = false;

	override async writeFile(uri: Parameters<MockFileSystemService['writeFile']>[0], content: Uint8Array): Promise<void> {
		this.writeCount++;
		if (this.failNextWrite) {
			this.failNextWrite = false;
			throw new Error('Test write failure');
		}
		await super.writeFile(uri, content);
	}
}

suite('CachedAgentFileWriter', () => {
	let disposables: DisposableStore;
	let accessor: ITestingServicesAccessor;
	let fileSystemService: CountingFileSystemService;
	let instantiationService: IInstantiationService;

	beforeEach(() => {
		disposables = new DisposableStore();
		const services = createExtensionUnitTestingServices(disposables);
		services.define(IVSCodeExtensionContext, new SyncDescriptor(MockExtensionContext, [path.join(os.tmpdir(), `cached-agent-file-${Date.now()}`)]));
		fileSystemService = new CountingFileSystemService();
		services.define(IFileSystemService, fileSystemService);
		accessor = services.createTestingAccessor();
		disposables.add(accessor);
		instantiationService = accessor.get(IInstantiationService);
	});

	afterEach(() => disposables.dispose());

	test('deduplicates concurrent and completed writes of identical content', async () => {
		const writer = instantiationService.createInstance(CachedAgentFileWriter, 'plan-agent', 'Plan.agent.md', 'TestAgentProvider');

		const first = writer.write('first');
		const concurrent = writer.write('first');
		assert.strictEqual(concurrent, first);
		await Promise.all([first, concurrent]);
		await writer.write('first');
		await writer.write('second');

		assert.strictEqual(fileSystemService.writeCount, 2);
	});

	test('retries identical content after a failed write', async () => {
		const writer = instantiationService.createInstance(CachedAgentFileWriter, 'plan-agent', 'Plan.agent.md', 'TestAgentProvider');
		fileSystemService.failNextWrite = true;

		await expect(writer.write('content')).rejects.toThrow('Test write failure');
		await writer.write('content');

		assert.strictEqual(fileSystemService.writeCount, 2);
	});
});
