/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { MainThreadDecorationsShape } from '../../common/extHost.protocol.js';
import { ExtHostDecorations } from '../../common/extHostDecorations.js';
import { IExtHostRpcService } from '../../common/extHostRpcService.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';

suite('ExtHostDecorations', function () {

	let mainThreadShape: MainThreadDecorationsShape;
	let extHostDecorations: ExtHostDecorations;
	const providers = new Set<number>();

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(function () {

		providers.clear();

		mainThreadShape = new class extends mock<MainThreadDecorationsShape>() {
			override $registerDecorationProvider(handle: number) {
				providers.add(handle);
			}
		};

		extHostDecorations = new ExtHostDecorations(
			new class extends mock<IExtHostRpcService>() {
				override getProxy(): any {
					return mainThreadShape;
				}
			},
			new NullLogService()
		);
	});

	test('SCM Decorations missing #100524', async function () {

		let calledA = false;
		let calledB = false;

		// never returns
		extHostDecorations.registerFileDecorationProvider({

			provideFileDecoration() {
				calledA = true;
				return new Promise(() => { });
			}
		}, nullExtensionDescription);

		// always returns
		extHostDecorations.registerFileDecorationProvider({

			provideFileDecoration() {
				calledB = true;
				return new Promise(resolve => resolve({ badge: 'H', tooltip: 'Hello' }));
			}
		}, nullExtensionDescription);


		const requests = [...providers.values()].map((handle, idx) => {
			return extHostDecorations.$provideDecorations(handle, [{ id: idx, uri: URI.parse('test:///file') }], CancellationToken.None);
		});

		assert.strictEqual(calledA, true);
		assert.strictEqual(calledB, true);

		assert.strictEqual(requests.length, 2);
		const [first, second] = requests;

		const firstResult = await Promise.race([first, timeout(30).then(() => false)]);
		assert.strictEqual(typeof firstResult, 'boolean'); // never finishes...

		const secondResult = await Promise.race([second, timeout(30).then(() => false)]);
		assert.strictEqual(typeof secondResult, 'object');


		await timeout(30);
	});

});
