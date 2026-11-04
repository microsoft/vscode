/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { isString } from '../../../../base/common/types.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier, EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE, EXTENSIONS_AGENTS_WINDOW_MANAGEMENT, IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ILanguageModelToolsService } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ExtensionState, IExtensionsWorkbenchService } from '../../../../workbench/contrib/extensions/common/extensions.js';
import { EnablementState } from '../../../../workbench/services/extensionManagement/common/extensionManagement.js';
import { getSessionsWindowSuggestedContributions, IExtensionManifestPropertiesService } from '../../../../workbench/services/extensions/common/extensionManifestPropertiesService.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';

type EnabledBy = 'automatic' | 'user';
type Usage = 'activated' | 'toolInvoked' | 'languageUsed';

type AutoEnableCandidateEnabledEvent = {
	extensionId: string;
	enabledBy: EnabledBy;
	suggestedContributions: string;
};

type AutoEnableCandidateEnabledClassification = {
	owner: 'alexr00';
	comment: 'Logged once per Agents window for each enabled extension that the Agents window can enable automatically, to learn whether such extensions are used there.';
	extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the extension.' };
	enabledBy: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the extension was enabled in the Agents window automatically or by the user.' };
	suggestedContributions: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The comma-separated contribution points, from a fixed list, that make the extension useful in the Agents window.' };
};

type AutoEnableCandidateUsedEvent = {
	extensionId: string;
	enabledBy: EnabledBy;
	usage: Usage;
	activationEvent: string;
};

type AutoEnableCandidateUsedClassification = {
	owner: 'alexr00';
	comment: 'Logged at most once per Agents window for each way that an enabled extension, which the Agents window can enable automatically, is used there.';
	extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the extension.' };
	enabledBy: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the extension was enabled in the Agents window automatically or by the user.' };
	usage: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the extension was used: activated, toolInvoked when the agent invoked one of its tools, or languageUsed when a file in one of its languages was opened.' };
	activationEvent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'For activated, the kind of activation event that activated the extension, such as onLanguage, without its argument. Otherwise none.' };
};

interface IEnabledCandidate {
	readonly enabledBy: EnabledBy;
	readonly manifest: IExtensionManifest;
}

function getEnabledBy(enablementState: EnablementState): EnabledBy | undefined {
	switch (enablementState) {
		case EnablementState.EnabledWorkspace:
			return 'user';
		// Extensions that don't support the Agents window are only enabled there globally when they are enabled automatically.
		case EnablementState.EnabledGlobally:
			return 'automatic';
		default:
			return undefined;
	}
}

function getLanguageIds(manifest: IExtensionManifest): string[] {
	return [
		...(manifest.contributes?.languages ?? []).map(language => language.id),
		...(manifest.contributes?.grammars ?? []).map(grammar => grammar.language),
	].filter(isString);
}

/**
 * Logs whether extensions that the Agents window can enable automatically, because they could be useful there or
 * because {@link EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE} lists them, are enabled and used, together with the trigger of
 * the {@link EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE} experiment.
 */
export class AgentsWindowExtensionAutoEnablementTelemetry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsWindowExtensionAutoEnablementTelemetry';

	private readonly enabledCandidates: IObservable<ReadonlyMap<string, IEnabledCandidate>>;
	private readonly loggedEnablements = new Set<string>();
	private readonly loggedUsages = new Set<string>();

	constructor(
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManifestPropertiesService extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IModelService modelService: IModelService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		const managementEnabled = observableConfigValue(EXTENSIONS_AGENTS_WINDOW_MANAGEMENT, false, configurationService);
		const autoEnable = observableConfigValue<unknown>(EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE, false, configurationService);
		const extensionsChanged = observableSignalFromEvent(this, extensionsWorkbenchService.onChange);
		const installed = derived(this, reader => {
			if (!managementEnabled.read(reader)) {
				return [];
			}
			extensionsChanged.read(reader);
			return extensionsWorkbenchService.local.flatMap(extension => !extension.isBuiltin && extension.local && extension.state === ExtensionState.Installed
				? [{ extension, manifest: extension.local.manifest }]
				: []);
		});
		// Extensions that could be useful don't depend on the experiment, which only decides whether they are enabled
		// automatically, so every arm logs the trigger alike.
		const hasCandidates = derived(this, reader => installed.read(reader).some(({ manifest }) => extensionManifestPropertiesService.canAutoEnableOnSessionsWindow(manifest)));
		this.enabledCandidates = derived(this, reader => {
			autoEnable.read(reader);
			const enabledCandidates = new Map<string, IEnabledCandidate>();
			for (const { extension, manifest } of installed.read(reader)) {
				const enabledBy = getEnabledBy(extension.enablementState);
				// Listed extensions are enabled automatically even when they don't look useful.
				if (enabledBy && (extensionManifestPropertiesService.canAutoEnableOnSessionsWindow(manifest) || extensionManifestPropertiesService.shouldAutoEnableOnSessionsWindow(manifest))) {
					enabledCandidates.set(ExtensionIdentifier.toKey(extension.identifier.id), { enabledBy, manifest });
				}
			}
			return enabledCandidates;
		});

		this._register(autorun(reader => {
			if (hasCandidates.read(reader)) {
				logSettingExperimentTrigger(this.telemetryService, EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE);
			}
			let newlyEnabled = false;
			for (const [id, candidate] of this.enabledCandidates.read(reader)) {
				newlyEnabled = this.logEnabled(id, candidate) || newlyEnabled;
			}
			// Extensions might have been used before they were known to be enabled, for example while the window was restored.
			if (newlyEnabled) {
				this.logActivations(Object.values(this.extensionService.getExtensionsStatus()).map(status => status.id));
				for (const model of modelService.getModels()) {
					this.logLanguageUsed(model.getLanguageId());
				}
			}
		}));

		this._register(this.extensionService.onDidChangeExtensionsStatus(ids => this.logActivations(ids)));
		this._register(toolsService.onDidInvokeTool(event => {
			const source = toolsService.getTool(event.toolId)?.source;
			if (source?.type === 'extension') {
				this.logUsed(ExtensionIdentifier.toKey(source.extensionId), 'toolInvoked');
			}
		}));
		this._register(modelService.onModelAdded(model => this.logLanguageUsed(model.getLanguageId())));
		this._register(modelService.onModelLanguageChanged(({ model }) => this.logLanguageUsed(model.getLanguageId())));
	}

	/**
	 * Logs that a candidate is enabled, once for each way it is enabled, and returns whether it was logged now.
	 */
	private logEnabled(id: string, candidate: IEnabledCandidate): boolean {
		const key = `${id}/${candidate.enabledBy}`;
		if (this.loggedEnablements.has(key)) {
			return false;
		}
		this.loggedEnablements.add(key);
		this.telemetryService.publicLog2<AutoEnableCandidateEnabledEvent, AutoEnableCandidateEnabledClassification>('agentsWindowAutoEnableCandidateEnabled', {
			extensionId: id,
			enabledBy: candidate.enabledBy,
			suggestedContributions: getSessionsWindowSuggestedContributions(candidate.manifest).sort().join(','),
		});
		return true;
	}

	private logActivations(ids: readonly ExtensionIdentifier[]): void {
		const enabledCandidates = this.enabledCandidates.get();
		const candidateIds = ids.filter(id => enabledCandidates.has(ExtensionIdentifier.toKey(id)));
		if (candidateIds.length === 0) {
			return;
		}
		const statuses = this.extensionService.getExtensionsStatus();
		for (const id of candidateIds) {
			const activationEvent = statuses[id.value]?.activationTimes?.activationReason.activationEvent;
			if (activationEvent !== undefined) {
				// Activation event arguments, such as file patterns, are not needed to tell why the extension was activated.
				this.logUsed(ExtensionIdentifier.toKey(id), 'activated', activationEvent.split(':')[0]);
			}
		}
	}

	private logLanguageUsed(languageId: string): void {
		for (const [id, candidate] of this.enabledCandidates.get()) {
			if (getLanguageIds(candidate.manifest).includes(languageId)) {
				this.logUsed(id, 'languageUsed');
			}
		}
	}

	private logUsed(id: string, usage: Usage, activationEvent = 'none'): void {
		const candidate = this.enabledCandidates.get().get(id);
		const key = `${id}/${usage}`;
		if (!candidate || this.loggedUsages.has(key)) {
			return;
		}
		this.loggedUsages.add(key);
		this.telemetryService.publicLog2<AutoEnableCandidateUsedEvent, AutoEnableCandidateUsedClassification>('agentsWindowAutoEnableCandidateUsed', {
			extensionId: id,
			enabledBy: candidate.enabledBy,
			usage,
			activationEvent,
		});
	}
}
