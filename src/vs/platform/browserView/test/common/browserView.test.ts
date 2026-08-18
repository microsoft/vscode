/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isBrowserViewAssociatedResourceNavigation, matchesBrowserViewAudience } from '../../common/browserView.js';

suite('BrowserView', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('allows navigation within an associated resource', () => {
		const associatedResource = URI.file('/workspace/index.html');

		assert.deepStrictEqual({
			sameResource: isBrowserViewAssociatedResourceNavigation(associatedResource, associatedResource.toString()),
			query: isBrowserViewAssociatedResourceNavigation(associatedResource, associatedResource.with({ query: 'theme=dark' }).toString()),
			fragment: isBrowserViewAssociatedResourceNavigation(associatedResource, associatedResource.with({ fragment: 'section' }).toString()),
			otherFile: isBrowserViewAssociatedResourceNavigation(associatedResource, URI.file('/workspace/other.html').toString()),
			otherScheme: isBrowserViewAssociatedResourceNavigation(associatedResource, 'https://example.com/')
		}, {
			sameResource: true,
			query: true,
			fragment: true,
			otherFile: false,
			otherScheme: false
		});
	});

	test('matches audiences against patterns', () => {
		const candidate = { type: 'agent', sessionId: 'session' } as const;

		assert.deepStrictEqual({
			allAgents: matchesBrowserViewAudience(candidate, { type: 'agent' }),
			session: matchesBrowserViewAudience(candidate, { type: 'agent', sessionId: 'session' }),
			otherSession: matchesBrowserViewAudience(candidate, { type: 'agent', sessionId: 'other' }),
		}, {
			allAgents: true,
			session: true,
			otherSession: false,
		});
	});

	test('matches audiences for filtered removal', () => {
		assert.deepStrictEqual({
			generic: matchesBrowserViewAudience({ type: 'agent', sessionId: 'session' }, { type: 'agent' }),
			session: matchesBrowserViewAudience({ type: 'agent', sessionId: 'session' }, { type: 'agent', sessionId: 'session' }),
			otherSession: matchesBrowserViewAudience({ type: 'agent', sessionId: 'session' }, { type: 'agent', sessionId: 'other' }),
		}, {
			generic: true,
			session: true,
			otherSession: false
		});
	});
});
