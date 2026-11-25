/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { isEditorInputWithOptionsAndGroup } from '../../../../common/editor.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService } from '../../../../services/editor/common/editorResolverService.js';
import { IPreferencesService, ISettingsEditorOptions } from '../../../../services/preferences/common/preferences.js';
import { SplitSettingsEditorInput } from '../../../../services/preferences/common/preferencesEditorInput.js';
import { TestFileEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { PreferencesContribution } from '../../common/preferencesContribution.js';

suite('PreferencesContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('split settings editor uses the configuration target from the editor options', async () => {
		const configurationService = new TestConfigurationService({ workbench: { settings: { useSplitJSON: true } } });
		const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, disposables);

		const requests: { target: ConfigurationTarget; resource: string }[] = [];
		instantiationService.stub(IPreferencesService, {
			onDidDefaultSettingsContentChanged: Event.None,
			createSplitJsonEditorInput: (target: ConfigurationTarget, resource: URI) => {
				requests.push({ target, resource: resource.toString() });
				return disposables.add(new TestFileEditorInput(resource, 'testSplitSettingsEditorInput'));
			}
		});
		disposables.add(instantiationService.createInstance(PreferencesContribution));

		// A workspace configuration file does not match the `**/settings.json` pattern
		// of the split settings editor, so it can only be resolved via an explicit override
		const workspaceConfiguration = URI.file('/workspace/test.code-workspace');
		const options: ISettingsEditorOptions = { override: SplitSettingsEditorInput.EDITOR_ID, target: ConfigurationTarget.WORKSPACE };
		const resolved = await instantiationService.get(IEditorResolverService).resolveEditor({ resource: workspaceConfiguration, options }, instantiationService.get(IEditorGroupsService).activeGroup);

		assert.deepStrictEqual({
			resolved: isEditorInputWithOptionsAndGroup(resolved),
			requests
		}, {
			resolved: true,
			requests: [{ target: ConfigurationTarget.WORKSPACE, resource: workspaceConfiguration.toString() }]
		});
	});
});
