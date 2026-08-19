/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../base/common/codicons.js';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestAccessibilityService } from '../../../platform/accessibility/test/common/testAccessibilityService.js';
import { SessionStatusIcon } from '../../browser/sessionStatusIcon.js';
import { ISessionsListModelService } from '../../services/sessions/browser/sessionsListModelService.js';
import { SessionStatus } from '../../services/sessions/common/session.js';

interface IRenderedIcon {
	readonly className: string;
	readonly fadingOut: string | undefined;
	readonly opacity: string;
	readonly transition: string;
}

function getRenderedIcons(container: HTMLElement): IRenderedIcon[] {
	return Array.from(container.children, child => {
		if (!(child instanceof HTMLElement)) {
			throw new Error('Expected an HTML status icon');
		}
		return {
			className: child.className,
			fadingOut: child.dataset.iconFadingOut,
			opacity: child.style.opacity,
			transition: child.style.transition,
		};
	});
}

suite('Sessions - SessionStatusIcon', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('snaps on session rebind and cross-fades same-session status changes', () => {
		const container = document.createElement('div');
		const modelService = new class extends mock<ISessionsListModelService>() {
			override getStatusIcon(status: SessionStatus) {
				return status === SessionStatus.Error ? Codicon.error : Codicon.check;
			}
		}();
		const icon = store.add(new SessionStatusIcon(container, new TestAccessibilityService(), modelService));
		const firstSession = URI.parse('session:first');
		const secondSession = URI.parse('session:second');

		icon.setStatus(SessionStatus.Completed, true, false, undefined, firstSession);
		const initial = getRenderedIcons(container);

		icon.setStatus(SessionStatus.Error, true, false, undefined, secondSession);
		const rebound = getRenderedIcons(container);

		icon.setStatus(SessionStatus.Completed, true, false, undefined, secondSession);
		const transitioned = getRenderedIcons(container);

		assert.deepStrictEqual({ initial, rebound, transitioned }, {
			initial: [{
				className: 'codicon codicon-check',
				fadingOut: undefined,
				opacity: '',
				transition: '',
			}],
			rebound: [{
				className: 'codicon codicon-error',
				fadingOut: undefined,
				opacity: '',
				transition: '',
			}],
			transitioned: [{
				className: 'codicon codicon-error',
				fadingOut: '1',
				opacity: '',
				transition: 'opacity 180ms',
			}, {
				className: 'codicon codicon-check',
				fadingOut: undefined,
				opacity: '0',
				transition: 'opacity 180ms',
			}],
		});
	});
});
