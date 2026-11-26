/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILocalExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE_EXTENSIONS, EXTENSIONS_AGENTS_WINDOW_MANAGEMENT, IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../../../workbench/contrib/extensions/common/extensions.js';
import { ExperimentalSettingsService } from '../../../../../workbench/services/configuration/common/experimentalSettings.js';
import { IExtensionManifestPropertiesService } from '../../../../../workbench/services/extensions/common/extensionManifestPropertiesService.js';
import { AgentsWindowExtensionAutoEnablementExperiment } from '../../browser/agentsWindowExtensionAutoEnablementExperiment.js';

/** Assigns experiment values as the default value of the per-extension setting, like the configuration service does. */
class ExperimentConfigurationService extends TestConfigurationService {
	private experimentValues: Record<string, unknown> | undefined;

	override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
		const inspected = super.inspect<T>(key, overrides);
		return key === EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE_EXTENSIONS ? { ...inspected, defaultValue: this.experimentValues as T | undefined } : inspected;
	}

	setExperimentValues(values: Record<string, unknown> | undefined): void {
		this.experimentValues = values;
		this.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (key: string) => key === EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE_EXTENSIONS }));
	}
}

interface ITestExtension {
	readonly name: string;
	readonly eligible?: boolean;
	readonly builtin?: boolean;
}

function anExtension(options: ITestExtension): IExtension {
	const manifest: IExtensionManifest = { name: options.name, publisher: 'pub', version: '1.0.0', engines: { vscode: '*' } };
	return new class extends mock<IExtension>() {
		override readonly identifier = { id: `pub.${options.name}` };
		override readonly isBuiltin = options.builtin ?? false;
		override readonly state = ExtensionState.Installed;
		override readonly local = new class extends mock<ILocalExtension>() {
			override readonly manifest = manifest;
		}();
	}();
}

const TREATMENT = `config.${EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE_EXTENSIONS}.pub.tools`;

suite('AgentsWindowExtensionAutoEnablementExperiment', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface IExperimentContext {
		readonly extensions: readonly ITestExtension[];
		readonly managementEnabled?: boolean;
		readonly experimentValues?: Record<string, unknown>;
	}

	function createExperiment(context: IExperimentContext) {
		const configurationService = new ExperimentConfigurationService({ [EXTENSIONS_AGENTS_WINDOW_MANAGEMENT]: context.managementEnabled ?? true });
		configurationService.setExperimentValues(context.experimentValues);
		const experimentalSettingsService = disposables.add(new ExperimentalSettingsService());
		const telemetryService = new TestExperimentTriggerTelemetryService();
		const eligible = new Set(context.extensions.filter(extension => extension.eligible !== false).map(extension => extension.name));

		disposables.add(new AgentsWindowExtensionAutoEnablementExperiment(
			new class extends mock<IExtensionsWorkbenchService>() {
				override readonly local = context.extensions.map(anExtension);
				override readonly onChange = disposables.add(new Emitter<IExtension | undefined>()).event;
			},
			new class extends mock<IExtensionManifestPropertiesService>() {
				override isEligibleForSessionsWindowAutoEnablement(manifest: IExtensionManifest) { return eligible.has(manifest.name); }
			},
			experimentalSettingsService,
			configurationService,
			telemetryService,
		));

		return {
			requestedKeys: () => [...experimentalSettingsService.getRequestedKeys(EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE_EXTENSIONS)],
			triggers: telemetryService.triggers,
			setExperimentValues: (values: Record<string, unknown>) => configurationService.setExperimentValues(values),
		};
	}

	test('requests the values of installed extensions that could be enabled automatically, by their lowercase identifiers', () => {
		const extensions: ITestExtension[] = [{ name: 'Tools' }, { name: 'supported', eligible: false }, { name: 'builtin', builtin: true }];

		assert.deepStrictEqual({
			managed: createExperiment({ extensions }).requestedKeys(),
			managementDisabled: createExperiment({ extensions, managementEnabled: false }).requestedKeys(),
		}, {
			managed: ['pub.tools'],
			managementDisabled: [],
		});
	});

	test('logs the trigger of an extension\'s experiment in every arm once the experiment assigns its value', () => {
		const tools: ITestExtension = { name: 'tools' };
		const cases: Record<string, IExperimentContext> = {
			treatment: { extensions: [tools], experimentValues: { 'pub.tools': true } },
			control: { extensions: [tools], experimentValues: { 'pub.tools': false } },
			otherExtension: { extensions: [tools], experimentValues: { 'pub.other': true } },
			notAssigned: { extensions: [tools] },
			notEligible: { extensions: [{ name: 'tools', eligible: false }], experimentValues: { 'pub.tools': true } },
			managementDisabled: { extensions: [tools], managementEnabled: false, experimentValues: { 'pub.tools': true } },
		};

		assert.deepStrictEqual(
			Object.fromEntries(Object.entries(cases).map(([name, context]) => [name, createExperiment(context).triggers])),
			{
				treatment: [TREATMENT],
				control: [TREATMENT],
				otherExtension: [],
				notAssigned: [],
				notEligible: [],
				managementDisabled: [],
			},
		);
	});

	test('logs the trigger of an extension\'s experiment when its value is assigned after it was requested', () => {
		const experiment = createExperiment({ extensions: [{ name: 'tools' }] });
		const beforeAssignment = [...experiment.triggers];

		experiment.setExperimentValues({ 'pub.tools': false });

		assert.deepStrictEqual({ beforeAssignment, afterAssignment: experiment.triggers }, {
			beforeAssignment: [],
			afterAssignment: [TREATMENT],
		});
	});
});
