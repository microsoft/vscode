/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IPager } from '../../../../../base/common/paging.js';
import { ExtensionBlockingOrigin, ExtensionBlockingScope } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IToolInvocation } from '../../../chat/common/tools/languageModelToolsService.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../common/extensions.js';
import { SearchExtensionsTool } from '../../common/searchExtensionsTool.js';

suite('SearchExtensionsTool', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('excludes blocked extensions', async () => {
		const blocked = anExtension('pub.blocked', { origin: ExtensionBlockingOrigin.Policy, scope: ExtensionBlockingScope.Extension });
		const allowed = anExtension('pub.allowed');
		const extensionWorkbenchService = <IExtensionsWorkbenchService>Object.create({
			queryGallery: async (): Promise<IPager<IExtension>> => aPage(),
			getExtensions: async (): Promise<IExtension[]> => [blocked, allowed],
		});
		const tool = new SearchExtensionsTool(extensionWorkbenchService);
		const invocation: IToolInvocation = {
			callId: 'call',
			toolId: 'extensions',
			parameters: { ids: [blocked.identifier.id, allowed.identifier.id] },
			context: undefined,
		};

		const result = await tool.invoke(invocation, null!, null!, CancellationToken.None);

		assert.deepStrictEqual(result.toolResultDetails, {
			input: '{"ids":["pub.blocked","pub.allowed"]}',
			output: [{ type: 'embed', isText: true, value: '["pub.allowed"]' }],
		});
	});
});

function anExtension(id: string, blockingInfo?: IExtension['blockingInfo']): IExtension {
	return <IExtension>Object.create({
		identifier: { id },
		displayName: id,
		description: '',
		state: ExtensionState.Uninstalled,
		installCount: 0,
		rating: 0,
		categories: [],
		gallery: { tags: [] },
		deprecationInfo: undefined,
		isMalicious: false,
		blockingInfo,
	});
}

function aPage(...extensions: IExtension[]): IPager<IExtension> {
	return {
		firstPage: extensions,
		total: extensions.length,
		pageSize: extensions.length,
		getPage: async () => [],
	};
}
