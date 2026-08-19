/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { IRequestContext } from '../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IMeteredConnectionService } from '../../../../../platform/meteredConnection/common/meteredConnection.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { PostUpdateWidgetContribution } from '../../browser/postUpdateWidget.js';

class TestRequestService extends mock<IRequestService>() {
	requestCount = 0;

	override async request(): Promise<IRequestContext> {
		this.requestCount++;
		return {
			res: { statusCode: 200, headers: {} },
			stream: bufferToStream(VSBuffer.fromString('')),
		};
	}
}

suite('PostUpdateWidgetContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('skips the automatic request while metered but preserves the explicit command', async () => {
		const requestService = new TestRequestService();
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		store.add(new PostUpdateWidgetContribution(
			new class extends mock<ICommandService>() { },
			configurationService,
			new class extends mock<IHostService>() {
				override hadLastFocus(): Promise<boolean> {
					return Promise.resolve(true);
				}
			},
			new class extends mock<IHoverService>() { },
			new class extends mock<ILayoutService>() { },
			new class extends mock<IMarkdownRendererService>() { },
			new class extends mock<IMeteredConnectionService>() {
				override readonly isConnectionMetered = true;
			},
			new class extends mock<IOpenerService>() { },
			new class extends mock<IProductService>() {
				override readonly version = '1.135.0';
				override readonly commit = 'current';
			},
			requestService,
			new class extends mock<IStorageService>() { },
			new class extends mock<ITelemetryService>() { },
		));

		await timeout(0);
		assert.strictEqual(requestService.requestCount, 0);

		const command = CommandsRegistry.getCommand('_update.showUpdateInfo');
		assert.ok(command);
		await command.handler(undefined as never);
		assert.strictEqual(requestService.requestCount, 1);
	});
});
