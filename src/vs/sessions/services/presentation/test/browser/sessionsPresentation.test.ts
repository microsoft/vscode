/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DefaultSessionsPresentation, ISessionsPresentation } from '../../browser/sessionsPresentation.js';

suite('Sessions presentation defaults', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('leaves shared DOM, selection and file reading unchanged', () => {
		const presentation: ISessionsPresentation = new DefaultSessionsPresentation();
		const container = dom.$('div');
		const before = dom.append(container, dom.$('span'));
		store.add(presentation.renderNewSessionHeader(container, before));
		store.add(presentation.renderSessionsHeader(container));
		store.add(presentation.decorateSessionsList(container, () => assert.fail('Must not refresh'), () => assert.fail('Must not observe scrolling')));
		assert.deepStrictEqual({
			children: Array.from(container.children),
			prompt: presentation.promptForName,
			repository: presentation.pickRepository,
			height: presentation.sectionRowHeight,
			omitIcon: presentation.omitEmptyStateIcon,
			readDiff: presentation.readDiffText,
		}, {
			children: [before], prompt: undefined, repository: undefined, height: undefined, omitIcon: undefined, readDiff: undefined,
		});
	});
});
