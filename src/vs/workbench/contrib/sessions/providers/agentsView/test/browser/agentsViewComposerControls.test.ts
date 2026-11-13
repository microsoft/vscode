/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { AgentHostSessionConfigPickerContribution } from '../../../agentHost/browser/agentHostSessionConfigPicker.js';
import { createAgentsViewComposerContributions, EditorWindowAgentHostSessionConfigPickerContribution } from '../../browser/agentsViewComposerControls.js';

suite('AgentsViewComposerControls', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('an editor window creates the agent host session config pickers without the new session isolation control', () => {
		const created: unknown[] = [];
		const instantiationService = {
			createInstance: (ctor: unknown): IDisposable => {
				created.push(ctor);
				return Disposable.None;
			}
		} as Pick<IInstantiationService, 'createInstance'> as IInstantiationService;

		createAgentsViewComposerContributions(instantiationService).dispose();

		assert.deepStrictEqual({
			editorWindow: created.includes(EditorWindowAgentHostSessionConfigPickerContribution),
			base: created.includes(AgentHostSessionConfigPickerContribution),
		}, { editorWindow: true, base: false });
	});
});
