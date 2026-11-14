/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILocalExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionIdentifier, EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE, EXTENSIONS_AGENTS_WINDOW_MANAGEMENT, IExtensionContributions, IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ILanguageModelToolsService, IToolData, IToolInvokedEvent } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../../../workbench/contrib/extensions/common/extensions.js';
import { EnablementState } from '../../../../../workbench/services/extensionManagement/common/extensionManagement.js';
import { IExtensionManifestPropertiesService } from '../../../../../workbench/services/extensions/common/extensionManifestPropertiesService.js';
import { ActivationTimes, IExtensionService, IExtensionsStatus } from '../../../../../workbench/services/extensions/common/extensions.js';
import { AgentsWindowExtensionAutoEnablementTelemetry } from '../../browser/agentsWindowExtensionAutoEnablementTelemetry.js';

class RecordingTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly eventName: string; readonly data: object | undefined }[] = [];

	override publicLog2(eventName?: string, data?: object): void {
		if (eventName) {
			this.events.push({ eventName, data });
		}
	}
}

interface ITestExtension {
	readonly name: string;
	readonly contributes: Record<string, unknown>;
	readonly enablementState: EnablementState;
	readonly candidate?: boolean;
	/** Whether the experiment lists the extension, to enable it automatically even when it isn't a candidate. */
	readonly listed?: boolean;
}

function anExtension(options: ITestExtension): IExtension {
	const manifest: IExtensionManifest = { name: options.name, publisher: 'pub', version: '1.0.0', engines: { vscode: '*' }, contributes: options.contributes as IExtensionContributions };
	return new class extends mock<IExtension>() {
		override readonly identifier = { id: `pub.${options.name}` };
		override readonly isBuiltin = false;
		override readonly state = ExtensionState.Installed;
		override readonly enablementState = options.enablementState;
		override readonly local = new class extends mock<ILocalExtension>() {
			override readonly manifest = manifest;
		}();
	}();
}

function aModel(languageId: string): ITextModel {
	return upcastPartial<ITextModel>({ getLanguageId: () => languageId });
}

const TRIGGER = { eventName: 'experimentTrigger', data: { treatmentName: `config.${EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE}` } };

suite('AgentsWindowExtensionAutoEnablementTelemetry', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface ITelemetryContext {
		readonly extensions: readonly ITestExtension[];
		readonly managementEnabled?: boolean;
		readonly activated?: ReadonlyMap<string, string>;
		readonly models?: readonly ITextModel[];
	}

	function createTelemetry(context: ITelemetryContext) {
		const telemetryService = new RecordingTelemetryService();
		const statusChanged = disposables.add(new Emitter<ExtensionIdentifier[]>());
		const toolInvoked = disposables.add(new Emitter<IToolInvokedEvent>());
		const modelAdded = disposables.add(new Emitter<ITextModel>());
		const modelLanguageChanged = disposables.add(new Emitter<{ readonly model: ITextModel; readonly oldLanguageId: string }>());
		const activated = new Map(context.activated);
		const candidates = new Set(context.extensions.filter(extension => extension.candidate !== false).map(extension => extension.name));
		const listed = new Set(context.extensions.filter(extension => extension.listed).map(extension => extension.name));
		const tools = new Map(context.extensions.map(extension => [`${extension.name}.tool`, upcastPartial<IToolData>({
			id: `${extension.name}.tool`,
			source: { type: 'extension', label: extension.name, extensionId: new ExtensionIdentifier(`pub.${extension.name}`) },
		})]));

		disposables.add(new AgentsWindowExtensionAutoEnablementTelemetry(
			new class extends mock<IExtensionsWorkbenchService>() {
				override readonly local = context.extensions.map(anExtension);
				override readonly onChange = disposables.add(new Emitter<IExtension | undefined>()).event;
			},
			new class extends mock<IExtensionManifestPropertiesService>() {
				override canAutoEnableOnSessionsWindow(manifest: IExtensionManifest) { return candidates.has(manifest.name); }
				override shouldAutoEnableOnSessionsWindow(manifest: IExtensionManifest) { return listed.has(manifest.name); }
			},
			new class extends mock<IExtensionService>() {
				override readonly onDidChangeExtensionsStatus = statusChanged.event;
				override getExtensionsStatus() {
					const statuses: { [id: string]: IExtensionsStatus } = {};
					for (const extension of context.extensions) {
						const id = new ExtensionIdentifier(`pub.${extension.name}`);
						const activationEvent = activated.get(extension.name);
						statuses[id.value] = upcastPartial<IExtensionsStatus>({
							id,
							activationTimes: activationEvent === undefined ? undefined : new ActivationTimes(0, 0, 0, { startup: false, extensionId: id, activationEvent }),
						});
					}
					return statuses;
				}
			},
			new class extends mock<ILanguageModelToolsService>() {
				override readonly onDidInvokeTool = toolInvoked.event;
				override getTool(id: string) { return tools.get(id); }
			},
			new class extends mock<IModelService>() {
				override readonly onModelAdded = modelAdded.event;
				override readonly onModelLanguageChanged = modelLanguageChanged.event;
				override getModels() { return [...context.models ?? []]; }
			},
			new TestConfigurationService({ [EXTENSIONS_AGENTS_WINDOW_MANAGEMENT]: context.managementEnabled ?? true }),
			telemetryService,
		));

		return {
			events: telemetryService.events,
			activate: (name: string, activationEvent: string) => {
				activated.set(name, activationEvent);
				statusChanged.fire([new ExtensionIdentifier(`pub.${name}`)]);
			},
			invokeTool: (name: string) => toolInvoked.fire({ toolId: `${name}.tool`, sessionResource: undefined, requestId: undefined, subagentInvocationId: undefined }),
			openModel: (languageId: string) => modelAdded.fire(aModel(languageId)),
			changeLanguage: (languageId: string) => modelLanguageChanged.fire({ model: aModel(languageId), oldLanguageId: 'plaintext' }),
		};
	}

	test('logs how enabled candidates were enabled and each way they are used, once per window', () => {
		const telemetry = createTelemetry({
			extensions: [
				{ name: 'auto', contributes: { languageModelTools: [{}], languages: [{ id: 'autoLanguage' }] }, enablementState: EnablementState.EnabledGlobally },
				{ name: 'user', contributes: { chatSkills: [{}], grammars: [{ language: 'userLanguage' }] }, enablementState: EnablementState.EnabledWorkspace },
				{ name: 'disabled', contributes: { languageModelTools: [{}] }, enablementState: EnablementState.DisabledWorkspace },
				{ name: 'unrelated', contributes: { languageModelTools: [{}] }, enablementState: EnablementState.EnabledGlobally, candidate: false },
				{ name: 'listed', contributes: { commands: [{}] }, enablementState: EnablementState.EnabledGlobally, candidate: false, listed: true },
			],
			// Used before the contribution started.
			activated: new Map([['auto', 'onLanguageModelTool:auto.tool']]),
			models: [aModel('userLanguage')],
		});

		telemetry.invokeTool('auto');
		telemetry.invokeTool('auto');
		telemetry.invokeTool('disabled');
		telemetry.invokeTool('unrelated');
		telemetry.invokeTool('listed');
		telemetry.openModel('autoLanguage');
		telemetry.changeLanguage('userLanguage');
		telemetry.activate('user', '*');
		telemetry.activate('disabled', 'onStartupFinished');

		const used = (extensionId: string, enabledBy: string, usage: string, activationEvent = 'none') => ({ eventName: 'agentsWindowAutoEnableCandidateUsed', data: { extensionId, enabledBy, usage, activationEvent } });
		assert.deepStrictEqual(telemetry.events, [
			TRIGGER,
			{ eventName: 'agentsWindowAutoEnableCandidateEnabled', data: { extensionId: 'pub.auto', enabledBy: 'automatic', suggestedContributions: 'languageModelTools' } },
			{ eventName: 'agentsWindowAutoEnableCandidateEnabled', data: { extensionId: 'pub.user', enabledBy: 'user', suggestedContributions: 'chatSkills' } },
			{ eventName: 'agentsWindowAutoEnableCandidateEnabled', data: { extensionId: 'pub.listed', enabledBy: 'automatic', suggestedContributions: '' } },
			used('pub.auto', 'automatic', 'activated', 'onLanguageModelTool'),
			used('pub.user', 'user', 'languageUsed'),
			used('pub.auto', 'automatic', 'toolInvoked'),
			used('pub.listed', 'automatic', 'toolInvoked'),
			used('pub.auto', 'automatic', 'languageUsed'),
			used('pub.user', 'user', 'activated', '*'),
		]);
	});

	test('logs the experiment trigger in every arm when there are candidates', () => {
		const tools = { languageModelTools: [{}] };
		const cases: Record<string, ITelemetryContext> = {
			treatment: { extensions: [{ name: 'tools', contributes: tools, enablementState: EnablementState.EnabledGlobally }] },
			control: { extensions: [{ name: 'tools', contributes: tools, enablementState: EnablementState.DisabledWorkspace }] },
			noCandidates: { extensions: [{ name: 'tools', contributes: tools, enablementState: EnablementState.DisabledWorkspace, candidate: false }] },
			// Which extensions a treatment lists depends on the arm, so listing extensions doesn't trigger the experiment.
			onlyListed: { extensions: [{ name: 'tools', contributes: tools, enablementState: EnablementState.EnabledGlobally, candidate: false, listed: true }] },
			managementDisabled: { extensions: [{ name: 'tools', contributes: tools, enablementState: EnablementState.DisabledByEnvironment }], managementEnabled: false },
		};

		assert.deepStrictEqual(
			Object.fromEntries(Object.entries(cases).map(([name, context]) => [name, createTelemetry(context).events.map(event => event.eventName)])),
			{
				treatment: ['experimentTrigger', 'agentsWindowAutoEnableCandidateEnabled'],
				control: ['experimentTrigger'],
				noCandidates: [],
				onlyListed: ['agentsWindowAutoEnableCandidateEnabled'],
				managementDisabled: [],
			},
		);
	});
});
