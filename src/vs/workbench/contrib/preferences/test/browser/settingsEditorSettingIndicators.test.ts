/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SettingsTreeIndicatorsLabel } from '../../browser/settingsEditorSettingIndicators.js';
import { SettingsTreeSettingElement } from '../../browser/settingsTreeModels.js';

suite('SettingsTreeIndicatorsLabel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('replaces the preview hover when updated', () => {
		const hoverDisposables: { disposed: boolean }[] = [];
		const hoverService = {
			setupDelayedHover: () => {
				const entry = { disposed: false };
				hoverDisposables.push(entry);
				return toDisposable(() => entry.disposed = true);
			}
		};
		const label = new SettingsTreeIndicatorsLabel(
			document.createElement('div'),
			undefined!,
			hoverService as never,
			undefined!,
			undefined!,
			undefined!,
		);

		label.updatePreviewIndicator({ tags: new Set(['preview']) } as unknown as SettingsTreeSettingElement);
		const firstHover = hoverDisposables.at(-1)!;
		label.updatePreviewIndicator({ tags: new Set(['experimental']) } as unknown as SettingsTreeSettingElement);
		const secondHover = hoverDisposables.at(-1)!;

		assert.strictEqual(firstHover.disposed, true);
		assert.strictEqual(secondHover.disposed, false);

		label.dispose();
		assert.strictEqual(secondHover.disposed, true);
	});
});
