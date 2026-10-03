/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { ICodeMapperRequestDto, MainThreadCodeMapperShape } from '../../common/extHost.protocol.js';
import { ExtHostCodeMapper } from '../../common/extHostCodeMapper.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('ExtHostCodeMapper provider lifetime', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	function createMapper(unregistration?: Promise<void>) {
		const handles: number[] = [];
		const unregistered: number[] = [];
		const proxy = new class extends mock<MainThreadCodeMapperShape>() {
			override $registerCodeMapperProvider(handle: number): void { handles.push(handle); }
			override async $unregisterCodeMapperProvider(handle: number): Promise<void> { unregistered.push(handle); await unregistration; }
		};
		const mapper = new ExtHostCodeMapper(SingleProxyRPCProtocol(proxy));
		return {
			mapper,
			unregistered,
			register(provider: vscode.MappedEditsProvider2) {
				const registration = disposables.add(mapper.registerMappedEditsProvider(nullExtensionDescription, provider));
				return { registration, handle: handles[handles.length - 1] };
			}
		};
	}

	const request: ICodeMapperRequestDto = {
		requestId: 'request',
		codeBlocks: [{ code: 'const value = 1;', resource: URI.file('/file.ts') }],
	};

	test('maps with a registered provider and preserves its result', async () => {
		const { mapper, register } = createMapper();
		let received: vscode.MappedEditsRequest | undefined;
		const result = { errorMessage: 'Provider result' };
		const { handle } = register({ provideMappedEdits(value) { received = value; return result; } });
		assert.deepStrictEqual({ result: await mapper.$mapCode(handle, request, CancellationToken.None), code: received?.codeBlocks[0].code }, {
			result, code: 'const value = 1;'
		});
	});

	test('removes a disposed provider and stops invoking it', async () => {
		const { mapper, register, unregistered } = createMapper();
		let calls = 0;
		const { registration, handle } = register({ provideMappedEdits() { calls++; return {}; } });
		await mapper.$mapCode(handle, request, CancellationToken.None);
		await registration.dispose();
		await assert.rejects(mapper.$mapCode(handle, request, CancellationToken.None), /unknown provider handle/);
		assert.deepStrictEqual({ calls, unregistered }, { calls: 1, unregistered: [handle] });
	});

	test('disposes registrations independently even for the same provider', async () => {
		const { mapper, register } = createMapper();
		const result = { errorMessage: 'Still registered' };
		const provider: vscode.MappedEditsProvider2 = { provideMappedEdits: () => result };
		const first = register(provider);
		const second = register(provider);
		await first.registration.dispose();
		await assert.rejects(mapper.$mapCode(first.handle, request, CancellationToken.None), /unknown provider handle/);
		assert.deepStrictEqual(await mapper.$mapCode(second.handle, request, CancellationToken.None), result);
		await second.registration.dispose();
		await assert.rejects(mapper.$mapCode(second.handle, request, CancellationToken.None), /unknown provider handle/);
	});

	test('serves requests arriving before unregistration is acknowledged', async () => {
		const acknowledged = new DeferredPromise<void>();
		const { mapper, register } = createMapper(acknowledged.p);
		const result = { errorMessage: 'Request already in transit' };
		const { registration, handle } = register({ provideMappedEdits: () => result });
		const disposal = registration.dispose();
		try {
			assert.deepStrictEqual(await mapper.$mapCode(handle, request, CancellationToken.None), result);
		} finally {
			await acknowledged.complete();
			await disposal;
		}
		await assert.rejects(mapper.$mapCode(handle, request, CancellationToken.None), /unknown provider handle/);
	});

	test('releases the provider even when unregistration fails', async () => {
		const acknowledged = new DeferredPromise<void>();
		const { mapper, register } = createMapper(acknowledged.p);
		const { registration, handle } = register({ provideMappedEdits: () => ({}) });
		const failure = new Error('Unregistration failed');
		const disposal = registration.dispose();
		const rejected = assert.rejects(Promise.resolve(disposal), error => error === failure);
		await acknowledged.error(failure);
		await rejected;
		await assert.rejects(mapper.$mapCode(handle, request, CancellationToken.None), /unknown provider handle/);
	});

	test('lets an in-flight request finish without restoring a disposed registration', async () => {
		const { mapper, register } = createMapper();
		const pending = new DeferredPromise<vscode.MappedEditsResult>();
		const { registration, handle } = register({ provideMappedEdits: () => pending.p });
		const mapping = mapper.$mapCode(handle, request, CancellationToken.None);
		await registration.dispose();
		const result = { errorMessage: 'Completed in flight' };
		await pending.complete(result);
		assert.deepStrictEqual(await mapping, result);
		await assert.rejects(mapper.$mapCode(handle, request, CancellationToken.None), /unknown provider handle/);
	});
});
