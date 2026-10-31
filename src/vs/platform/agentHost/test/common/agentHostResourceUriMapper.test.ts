/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createEditorRemoteAgentHostResourceUriMapper, toAgentHostUri } from '../../common/agentHostUri.js';
import { agentHostConnectionKinds, createStrictAgentHostResourceUriMapper } from './testAgentHostResourceUriMappers.js';

suite('Agent Host resource URI mappers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const host = URI.from({ scheme: Schemas.file, path: '/workspace/a file.ts', query: 'revision=1', fragment: 'L3' });

	for (const kind of agentHostConnectionKinds) {
		test(`client to host to client round trip (${kind.name})`, () => {
			const client = kind.toClient(host);
			const mapped = kind.resourceUris.toAgentHost(client);
			assert.deepStrictEqual([mapped.toString(), kind.resourceUris.fromAgentHost(mapped).toString()], [host.toString(), client.toString()]);
		});

		test(`host to client to host round trip (${kind.name})`, () => {
			const client = kind.resourceUris.fromAgentHost(host);
			assert.deepStrictEqual([client.toString(), kind.resourceUris.toAgentHost(client).toString()], [kind.toClient(host).toString(), host.toString()]);
		});

		test(`preserves unrelated client schemes (${kind.name})`, () => {
			const resources = [URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' }), URI.parse('opaque-test:resource?query#fragment')];
			assert.deepStrictEqual(resources.map(uri => kind.resourceUris.toAgentHost(uri)), resources);
		});

		test(`preserves another connection's wrapper (${kind.name})`, () => {
			const foreign = toAgentHostUri(host, 'foreign-authority');
			assert.deepStrictEqual(kind.resourceUris.toAgentHost(foreign), foreign);
		});
	}

	test('editor remote accepts mixed-case own authority and preserves other authorities', () => {
		const mapper = createEditorRemoteAgentHostResourceUriMapper('ssh-remote+test', 'editor-remote-test');
		const own = host.with({ scheme: Schemas.vscodeRemote, authority: 'SSH-REMOTE+TEST' });
		const other = own.with({ authority: 'ssh-remote+other' });
		assert.deepStrictEqual([mapper.toAgentHost(own).toString(), mapper.toAgentHost(other).toString()], [host.toString(), other.toString()]);
	});

	test('strict mapper rejects wrong-space inputs in both directions', () => {
		const mapper = createStrictAgentHostResourceUriMapper();
		const client = mapper.fromAgentHost(host);
		const errors = [() => mapper.toAgentHost(host), () => mapper.fromAgentHost(client)].map(map => {
			try {
				map();
				return undefined;
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
		});
		assert.deepStrictEqual(errors, [
			'toAgentHost received a file URI already in host space; resource must cross the boundary exactly once',
			'fromAgentHost received a client URI already in client space; resource must cross the boundary exactly once',
		]);
	});
});
