/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationEnablementKind } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { getRemotePluginDisabledLabel, getToggledPluginEnablementState } from '../../../browser/aiCustomization/pluginListWidget.js';
import { ContributionEnablementState } from '../../../common/enablement.js';

suite('pluginListWidget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('renders host-published disabled reasons', () => {
		assert.deepStrictEqual([
			getRemotePluginDisabledLabel({ disabledReason: { source: 'scope', scope: CustomizationEnablementKind.Global } }),
			getRemotePluginDisabledLabel({ disabledReason: { source: 'scope', scope: CustomizationEnablementKind.Workspace } }),
			getRemotePluginDisabledLabel({ disabledReason: { source: 'scope', scope: CustomizationEnablementKind.Session } }),
		], [
			'Disabled',
			'Disabled (Workspace)',
			'Disabled (Session)',
		]);
	});

	test('toggles plugin enablement without changing scope', () => {
		assert.deepStrictEqual([
			getToggledPluginEnablementState(ContributionEnablementState.EnabledProfile),
			getToggledPluginEnablementState(ContributionEnablementState.DisabledProfile),
			getToggledPluginEnablementState(ContributionEnablementState.EnabledWorkspace),
			getToggledPluginEnablementState(ContributionEnablementState.DisabledWorkspace),
		], [
			ContributionEnablementState.DisabledProfile,
			ContributionEnablementState.EnabledProfile,
			ContributionEnablementState.DisabledWorkspace,
			ContributionEnablementState.EnabledWorkspace,
		]);
	});
});
