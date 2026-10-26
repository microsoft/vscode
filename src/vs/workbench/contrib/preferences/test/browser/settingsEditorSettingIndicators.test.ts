/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ISettingOverrideClickEvent, SettingsTreeIndicatorsLabel } from '../../browser/settingsEditorSettingIndicators.js';
import { SettingsTreeSettingElement } from '../../browser/settingsTreeModels.js';

suite('SettingsTreeIndicatorsLabel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses a setting-specific policy explanation with the existing managed indicator', () => {
		const descriptions: string[] = [];
		const hoverService = upcastPartial<IHoverService>({
			setupDelayedHover: (_target, options) => {
				const content = (typeof options === 'function' ? options() : options)?.content;
				if (typeof content === 'string') {
					descriptions.push(content);
				}
				return Disposable.None;
			},
		});
		const container = document.createElement('div');
		const label = store.add(new SettingsTreeIndicatorsLabel(container, undefined!, hoverService, undefined!, undefined!, undefined!));
		const clicks = store.add(new Emitter<ISettingOverrideClickEvent>());
		const filters = store.add(new Emitter<string>());
		const element = upcastPartial<SettingsTreeSettingElement>({ hasPolicyValue: true, policyValueDescription: 'Organization default explanation' });
		label.updateScopeOverrides(element, clicks, filters);
		const specific = descriptions.at(-1);
		element.policyValueDescription = undefined;
		label.updateScopeOverrides(element, clicks, filters);
		assert.deepStrictEqual({ specific, fallback: descriptions.at(-1), indicator: container.textContent?.includes('Managed by organization') }, {
			specific: 'Organization default explanation',
			fallback: 'This setting is managed by your organization and its actual value cannot be changed.',
			indicator: true,
		});
	});

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
