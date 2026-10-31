/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, test } from 'vitest';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { CopilotToken, createTestExtendedTokenInfo } from '../../common/copilotToken';
import { CopilotTokenStore } from '../../common/copilotTokenStore';

describe('CopilotTokenStore', () => {
	const disposables = new DisposableStore();
	afterEach(() => disposables.clear());

	test('enterprise URI changes are distinct and do not publish token updates', () => {
		const store = disposables.add(new CopilotTokenStore());
		const uris: (string | undefined)[] = [];
		const tokens: (string | undefined)[] = [];
		disposables.add(store.onDidChangeGitHubEnterpriseUri(() => uris.push(store.githubEnterpriseUri?.toString())));
		disposables.add(store.onDidStoreUpdate(() => tokens.push(store.copilotToken?.token)));

		store.githubEnterpriseUri = undefined;
		store.githubEnterpriseUri = URI.parse('https://second.ghe.com');
		store.githubEnterpriseUri = URI.parse('https://second.ghe.com');
		store.copilotToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'copilot-test' }));
		store.githubEnterpriseUri = URI.parse('https://first.ghe.com');
		store.githubEnterpriseUri = undefined;
		store.githubEnterpriseUri = undefined;

		expect({ uris, tokens, token: store.copilotToken?.token }).toEqual({
			uris: ['https://second.ghe.com/', 'https://first.ghe.com/', undefined],
			tokens: ['copilot-test'],
			token: 'copilot-test',
		});
	});
});
