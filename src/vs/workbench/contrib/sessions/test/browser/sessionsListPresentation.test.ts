/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISessionsListPresentation, SessionNameKind } from '../../browser/sessionsListPresentation.js';
import { DefaultSessionsListPresentation } from '../../browser/defaultSessionsListPresentation.js';
import { IPinnedCanvasService } from '../../browser/pinnedCanvases.js';

suite('Sessions list presentation defaults', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('leaves shared list DOM and sizing unchanged', () => {
		const presentation: ISessionsListPresentation = new DefaultSessionsListPresentation(upcastPartial<IPinnedCanvasService>({}));
		const container = dom.$('div');
		const before = dom.append(container, dom.$('span'));
		store.add(presentation.renderHeader(container));
		store.add(presentation.decorateList(container, () => assert.fail('Must not refresh'), () => assert.fail('Must not observe scrolling')));
		assert.deepStrictEqual({
			children: Array.from(container.children),
			height: presentation.sectionRowHeight,
		}, {
			children: [before], height: undefined,
		});
	});

	for (const kind of ['newGroup', 'group', 'session', 'chat'] satisfies SessionNameKind[]) {
		test(`${kind} retains synchronous inline editing and its return value`, () => {
			const presentation: ISessionsListPresentation = new DefaultSessionsListPresentation(upcastPartial<IPinnedCanvasService>({}));
			let inlineCalls = 0;
			const accepted = presentation.editName(kind, 'Original', () => { inlineCalls++; return false; }, () => assert.fail('Must not open a prompt'));
			assert.deepStrictEqual({ accepted, inlineCalls }, { accepted: false, inlineCalls: 1 });
		});
	}
});
