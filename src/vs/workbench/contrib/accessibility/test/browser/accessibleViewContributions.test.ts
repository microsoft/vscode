/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType, IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, type IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { AccessibilityHelpAction, AccessibleViewAction } from '../../browser/accessibleViewActions.js';
import { AccesibleViewContributions } from '../../browser/accessibleViewContributions.js';

suite('Accessible View contribution registration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const [type, command] of [[AccessibleViewType.Help, AccessibilityHelpAction], [AccessibleViewType.View, AccessibleViewAction]] as const) {
		test(`${type} follows late registration, removal and contribution disposal`, async () => {
			const shown: string[] = [];
			const instantiationService = workbenchInstantiationService({}, store);
			instantiationService.stub(IAccessibleViewService, new class extends mock<IAccessibleViewService>() {
				override show(): void { shown.push('late'); }
			});
			store.add(command.addImplementation(Number.MAX_SAFE_INTEGER - 1, 'test-fallback', () => {
				shown.push('fallback');
				return true;
			}));
			const contribution = store.add(new AccesibleViewContributions());
			const implementation: IAccessibleViewImplementation = {
				type, name: 'test-late', priority: Number.MAX_SAFE_INTEGER,
				getProvider: () => store.add(new AccessibleContentProvider(
					AccessibleViewProviderId.SessionCanvas, { type }, () => 'Canvas content', () => { }, 'test.verbosity',
				)),
			};
			const invoke = () => instantiationService.invokeFunction(accessor => command.runCommand(accessor, undefined));

			await invoke();
			const registration = store.add(AccessibleViewRegistry.register(implementation));
			await invoke();
			registration.dispose();
			await invoke();
			store.add(AccessibleViewRegistry.register(implementation));
			await invoke();
			contribution.dispose();
			await invoke();

			assert.deepStrictEqual(shown, ['fallback', 'late', 'fallback', 'late', 'fallback']);
		});
	}
});
