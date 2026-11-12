/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { PolicyCategory } from '../../../../../base/common/policy.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextEditorModel } from '../../../../../editor/common/services/resolverService.js';
import { createTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ConfigurationTarget, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IMarkerService, MarkerSeverity, MarkerTag } from '../../../../../platform/markers/common/markers.js';
import { MarkerService } from '../../../../../platform/markers/common/markerService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { SettingsEditorModel } from '../../../../services/preferences/common/preferencesModels.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { getDefaultModelPolicyDescription } from '../../../chat/common/modelSelection.js';
import { UserSettingsRenderer } from '../../browser/preferencesRenderers.js';

suite('Settings JSON policy descriptions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const customDescription of [true, false]) {
		test(`explains overridden JSON values with ${customDescription ? 'setting-specific' : 'generic'} policy text`, async () => {
			const key = 'test.policyDescription';
			const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
			const configurationNode: IConfigurationNode = {
				id: 'policyDescriptionTest',
				properties: {
					[key]: {
						type: 'string',
						default: '',
						policyValueDescription: customDescription ? getDefaultModelPolicyDescription : undefined,
						policy: {
							name: 'TestPolicyDescription',
							category: PolicyCategory.InteractiveSession,
							minimumVersion: '1.0',
							localization: { description: { key: 'test.policyDescription', value: 'Test policy description' } },
						},
					},
				},
			};
			registry.registerConfiguration(configurationNode);
			store.add(toDisposable(() => registry.deregisterConfigurations([configurationNode])));
			const policy = new TestConfigurationService({ [key]: 'opus' });
			const configuration = new class extends TestConfigurationService {
				isSettingAppliedForAllProfiles(): boolean { return false; }
				override inspect<T>(setting: string): IConfigurationValue<T> {
					const result = super.inspect<T>(setting);
					const policyValue = policy.getValue<T>(setting);
					return { ...result, policyValue, value: policyValue ?? result.value };
				}
			}({ [key]: 'gemini' });
			store.add(policy.onDidChangeConfigurationEmitter);
			store.add(configuration.onDidChangeConfigurationEmitter);
			const instantiationService = workbenchInstantiationService({ configurationService: () => configuration }, store);
			const markers = store.add(new MarkerService());
			instantiationService.stub(IMarkerService, markers);
			const text = `{\n\t"${key}": "gemini"\n}`;
			const textModel = store.add(createTextModel(text, 'jsonc'));
			const editor = store.add(createTestCodeEditor(textModel));
			const settings = store.add(new SettingsEditorModel({
				object: upcastPartial<ITextEditorModel>({ textEditorModel: textModel }),
				dispose() { },
			}, ConfigurationTarget.USER_LOCAL));
			const renderer = store.add(instantiationService.createInstance(UserSettingsRenderer, editor, settings));
			renderer.render();
			const managed = markers.read({ resource: textModel.uri, owner: 'UnsupportedSettingsRenderer' }).map(({ message, severity, tags }) => ({ message, severity, tags }));
			await policy.setUserConfiguration(key, undefined);
			renderer.render();
			assert.deepStrictEqual({ managed, removed: markers.read({ resource: textModel.uri, owner: 'UnsupportedSettingsRenderer' }), saved: textModel.getValue() }, {
				managed: [{
					message: customDescription ? getDefaultModelPolicyDescription('opus', 'gemini') : 'This setting cannot be applied because it is configured in the system policy.',
					severity: MarkerSeverity.Hint,
					tags: [MarkerTag.Unnecessary],
				}],
				removed: [],
				saved: text,
			});
		});
	}
});
