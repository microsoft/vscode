/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { autorun } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILocalExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { EXTENSIONS_AGENTS_WINDOW_MANAGEMENT, IExtensionContributions, IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../../../workbench/contrib/extensions/common/extensions.js';
import { EnablementState } from '../../../../../workbench/services/extensionManagement/common/extensionManagement.js';
import { IExtensionManifestPropertiesService } from '../../../../../workbench/services/extensions/common/extensionManifestPropertiesService.js';
import { AGENTS_WINDOW_EXTENSION_SUGGESTIONS_SETTING, AgentsWindowExtensionSuggestionsService, isAgentsWindowExtensionSuggestion } from '../../browser/agentsWindowExtensionSuggestions.js';

interface ITestExtensionOptions {
	readonly contributes: Record<string, unknown>;
	readonly enablementState?: EnablementState;
	readonly isBuiltin?: boolean;
	readonly declaredAgentsWindowSupport?: boolean;
}

function anExtension(name: string, options: ITestExtensionOptions): IExtension {
	const manifest: IExtensionManifest = {
		name,
		publisher: 'pub',
		version: '1.0.0',
		engines: { vscode: '*' },
		contributes: options.contributes as IExtensionContributions,
		capabilities: options.declaredAgentsWindowSupport === undefined ? undefined : { agentsWindow: { supported: options.declaredAgentsWindowSupport } },
	};
	return new class extends mock<IExtension>() {
		override readonly identifier = { id: `pub.${name}` };
		override readonly isBuiltin = options.isBuiltin ?? false;
		override readonly state = ExtensionState.Installed;
		override readonly enablementState = options.enablementState ?? EnablementState.DisabledWorkspace;
		override readonly local = new class extends mock<ILocalExtension>() {
			override readonly manifest = manifest;
		}();
	}();
}

const TRIGGER = `config.${AGENTS_WINDOW_EXTENSION_SUGGESTIONS_SETTING}`;

suite('AgentsWindowExtensionSuggestions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface IServiceOptions {
		readonly local: IExtension[];
		readonly storageService: IStorageService;
		readonly telemetryService: ITelemetryService;
		readonly onChange?: Event<IExtension | undefined>;
		readonly managementEnabled?: boolean;
		readonly suggestionsEnabled?: boolean;
	}

	function createService(options: IServiceOptions): AgentsWindowExtensionSuggestionsService {
		return disposables.add(new AgentsWindowExtensionSuggestionsService(
			new class extends mock<IExtensionsWorkbenchService>() {
				override get local() { return options.local; }
				override readonly onChange = options.onChange ?? Event.None;
			},
			new class extends mock<IExtensionManifestPropertiesService>() {
				override canExecuteOnSessionsWindow() { return false; }
			},
			new TestConfigurationService({
				[EXTENSIONS_AGENTS_WINDOW_MANAGEMENT]: options.managementEnabled ?? true,
				[AGENTS_WINDOW_EXTENSION_SUGGESTIONS_SETTING]: options.suggestionsEnabled ?? true,
			}),
			options.storageService,
			options.telemetryService,
		));
	}

	test('suggests extensions whose Agents window enablement users control and that contribute something useful there', () => {
		const supported = new Set(['pub.supported']);
		const extensions = [
			anExtension('tools', { contributes: { languageModelTools: [{}] } }),
			anExtension('mcp', { contributes: { commands: [{}], mcpServerDefinitionProviders: [{}] } }),
			anExtension('skills', { contributes: { chatSkills: [{}] } }),
			anExtension('grammar', { contributes: { grammars: [{}] } }),
			anExtension('markdown', { contributes: { 'markdown.markdownItPlugins': true } }),
			anExtension('enabled', { contributes: { languageModelTools: [{}] }, enablementState: EnablementState.EnabledWorkspace }),
			anExtension('enabledAutomatically', { contributes: { languageModelTools: [{}] }, enablementState: EnablementState.EnabledGlobally }),
			anExtension('commandsOnly', { contributes: { commands: [{}] } }),
			anExtension('themeOnly', { contributes: { themes: [{}] } }),
			anExtension('noTools', { contributes: { languageModelTools: [] } }),
			anExtension('disabledGlobally', { contributes: { languageModelTools: [{}] }, enablementState: EnablementState.DisabledGlobally }),
			anExtension('disabledByEnvironment', { contributes: { languageModelTools: [{}] }, enablementState: EnablementState.DisabledByEnvironment }),
			anExtension('supported', { contributes: { languageModelTools: [{}] } }),
			anExtension('declaredUnsupported', { contributes: { languageModelTools: [{}] }, declaredAgentsWindowSupport: false }),
			anExtension('builtin', { contributes: { languageModelTools: [{}] }, isBuiltin: true }),
		];

		assert.deepStrictEqual(
			extensions.filter(extension => isAgentsWindowExtensionSuggestion(extension, candidate => supported.has(candidate.identifier.id))).map(extension => extension.identifier.id),
			['pub.tools', 'pub.mcp', 'pub.skills', 'pub.enabled', 'pub.enabledAutomatically'],
		);
	});

	test('badges disabled suggestions until the user navigates to the Extensions section, and again for new suggestions', () => {
		const local = [
			anExtension('tools', { contributes: { languageModelTools: [{}] } }),
			anExtension('enabled', { contributes: { languageModelTools: [{}] }, enablementState: EnablementState.EnabledWorkspace }),
			anExtension('commandsOnly', { contributes: { commands: [{}] } }),
		];
		const onChange = disposables.add(new Emitter<IExtension | undefined>());
		const storageService = disposables.add(new InMemoryStorageService());
		const service = createService({ local, storageService, telemetryService: new TestExperimentTriggerTelemetryService(), onChange: onChange.event });
		const badges: boolean[] = [];
		disposables.add(autorun(reader => {
			badges.push(service.showBadge.read(reader));
		}));

		service.dismissBadge();
		const afterRestart = createService({ local, storageService, telemetryService: new TestExperimentTriggerTelemetryService() }).showBadge.get();
		local.push(anExtension('skills', { contributes: { chatSkills: [{}] } }));
		onChange.fire(undefined);

		assert.deepStrictEqual({
			badges,
			afterRestart,
			suggested: service.suggestedExtensions.get().map(extension => extension.identifier.id),
		}, {
			badges: [true, false, true],
			afterRestart: false,
			suggested: ['pub.tools', 'pub.enabled', 'pub.skills'],
		});
	});

	test('logs the experiment trigger in every arm where the badge or the AI Features group could show', () => {
		const disabled = anExtension('tools', { contributes: { languageModelTools: [{}] } });
		const enabled = anExtension('enabled', { contributes: { languageModelTools: [{}] }, enablementState: EnablementState.EnabledWorkspace });
		const cases: Omit<IServiceOptions, 'storageService' | 'telemetryService'>[] = [
			{ local: [disabled], suggestionsEnabled: true },
			{ local: [disabled], suggestionsEnabled: false },
			{ local: [enabled], suggestionsEnabled: true },
			{ local: [], suggestionsEnabled: true },
			{ local: [disabled], suggestionsEnabled: true, managementEnabled: false },
		];
		const read = <T>(options: Omit<IServiceOptions, 'storageService' | 'telemetryService'>, readValue: (service: AgentsWindowExtensionSuggestionsService) => T) => {
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const value = readValue(createService({ ...options, storageService: disposables.add(new InMemoryStorageService()), telemetryService }));
			return { value, triggers: telemetryService.triggers };
		};

		assert.deepStrictEqual(cases.map(options => ({
			badge: read(options, service => service.showBadge.get()),
			suggested: read(options, service => service.suggestedExtensions.get().map(extension => extension.identifier.id)),
		})), [
			{ badge: { value: true, triggers: [TRIGGER] }, suggested: { value: ['pub.tools'], triggers: [TRIGGER] } },
			{ badge: { value: false, triggers: [TRIGGER] }, suggested: { value: [], triggers: [TRIGGER] } },
			{ badge: { value: false, triggers: [] }, suggested: { value: ['pub.enabled'], triggers: [TRIGGER] } },
			{ badge: { value: false, triggers: [] }, suggested: { value: [], triggers: [] } },
			{ badge: { value: false, triggers: [] }, suggested: { value: [], triggers: [] } },
		]);
	});
});
