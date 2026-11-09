/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createLocalModelRowMeta } from '../../../common/meta/localModelStatus.js';
import type { IAgentMetadataSource } from '../../../common/meta/metadata.js';
import { refineModelSelectionKindForLocalModels } from '../../../node/agentHostTelemetryReporter.js';

suite('Local model selection kind', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies direct on-device rows from their metadata, and Auto with an active on-device model', () => {
		const direct = { id: 'vscode-on-device/MAI-Code-1.1-Flash', _meta: createLocalModelRowMeta({ familyId: 'mai-code-1.1-flash-local', contentId: 'c1', active: true }) };
		const inactive = { id: 'vscode-on-device/Qwen-Coder', _meta: createLocalModelRowMeta({ familyId: 'qwen-coder-local', contentId: 'q1', active: false }) };
		const cloud: IAgentMetadataSource & { readonly id: string } = { id: 'gpt-5' };
		assert.deepStrictEqual({
			direct: refineModelSelectionKindForLocalModels('explicit', direct, [cloud, direct]),
			inactiveDirect: refineModelSelectionKindForLocalModels('explicit', inactive, [cloud, inactive]),
			cloud: refineModelSelectionKindForLocalModels('explicit', cloud, [cloud, direct]),
			autoWithActive: refineModelSelectionKindForLocalModels('auto', undefined, [cloud, direct]),
			autoWithoutActive: refineModelSelectionKindForLocalModels('auto', undefined, [cloud, inactive]),
			hydrafusion: refineModelSelectionKindForLocalModels('hydrafusion', undefined, [direct]),
		}, {
			direct: 'onDeviceDirect',
			inactiveDirect: 'onDeviceDirect',
			cloud: 'explicit',
			autoWithActive: 'autoOnDevice',
			autoWithoutActive: 'auto',
			hydrafusion: 'hydrafusion',
		});
	});
});
