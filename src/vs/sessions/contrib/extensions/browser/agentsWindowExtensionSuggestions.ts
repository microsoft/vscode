/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { isString } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier, EXTENSIONS_AGENTS_WINDOW_MANAGEMENT, IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../../workbench/contrib/extensions/common/extensions.js';
import { EnablementState } from '../../../../workbench/services/extensionManagement/common/extensionManagement.js';
import { IExtensionManifestPropertiesService } from '../../../../workbench/services/extensions/common/extensionManifestPropertiesService.js';

/**
 * Suggests installed extensions that could be useful in the Agents window: entry points to the Extensions section of
 * Agent Customizations show a badge, and the section lists the extensions in a Suggested group.
 */
export const AGENTS_WINDOW_EXTENSION_SUGGESTIONS_SETTING = 'extensions.experimental.agentsWindowSuggestions';

/**
 * Contribution points that make an extension worth enabling in the Agents window.
 */
const SUGGESTED_CONTRIBUTION_POINTS: ReadonlySet<string> = new Set([
	// Agent capabilities and customizations, which the Agents window forwards to its agents.
	'languageModelTools',
	'languageModelToolSets',
	'mcpServerDefinitionProviders',
	'chatSkills',
	'chatAgents',
	'chatInstructions',
	'chatPromptFiles',
	'chatPlugins',
	// Reviewing the files and changes that agents produce.
	'grammars',
	'customEditors',
	'notebooks',
	'notebookRenderer',
	'markdown.markdownItPlugins',
	'markdown.previewScripts',
	'markdown.previewStyles'
]);

const BADGE_DISMISSED_STORAGE_KEY = 'agentsWindow.extensionSuggestions.badgeDismissed';

/**
 * Describes the badge that entry points to the Extensions section show for suggested extensions.
 */
export function getExtensionSuggestionsBadgeDescription(): string {
	return localize('agentsWindowExtensionSuggestions.badge', "Some installed extensions can be enabled in the Agents window.");
}

function contributesSuggestedPoint(manifest: IExtensionManifest): boolean {
	return Object.entries(manifest.contributes ?? {}).some(([point, value]) => SUGGESTED_CONTRIBUTION_POINTS.has(point) && (Array.isArray(value) ? value.length > 0 : !!value));
}

/**
 * Whether to suggest an installed extension in the Agents window: it contributes something that is useful there, but
 * hasn't declared support for the Agents window, so users choose whether it runs there.
 */
export function isAgentsWindowExtensionSuggestion(extension: IExtension, supportsAgentsWindow: (extension: IExtension) => boolean): boolean {
	if (extension.isBuiltin || !extension.local || extension.state !== ExtensionState.Installed) {
		return false;
	}
	// Enabled suggestions stay suggested, so they keep their place when users enable them. Other states cannot be changed for the Agents window.
	if ((extension.enablementState !== EnablementState.DisabledWorkspace && extension.enablementState !== EnablementState.EnabledWorkspace) || supportsAgentsWindow(extension)) {
		return false;
	}
	const manifest = extension.local.manifest;
	return manifest.capabilities?.agentsWindow?.supported !== false && contributesSuggestedPoint(manifest);
}

export const IAgentsWindowExtensionSuggestionsService = createDecorator<IAgentsWindowExtensionSuggestionsService>('agentsWindowExtensionSuggestionsService');

/**
 * Suggests installed extensions that could be useful in the Agents window. Entry points to the Extensions section show a
 * badge while suggested extensions are disabled there, until the user navigates to the section.
 */
export interface IAgentsWindowExtensionSuggestionsService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether entry points to the Extensions section show a badge. Only read it where an entry point renders,
	 * because reading it logs the trigger of the {@link AGENTS_WINDOW_EXTENSION_SUGGESTIONS_SETTING} experiment.
	 */
	readonly showBadge: IObservable<boolean>;

	/**
	 * The installed extensions that the Extensions section lists as suggested. Only read it where the section renders,
	 * because reading it logs the trigger of the {@link AGENTS_WINDOW_EXTENSION_SUGGESTIONS_SETTING} experiment.
	 */
	readonly suggestedExtensions: IObservable<readonly IExtension[]>;

	/**
	 * Dismisses the badge for the current suggestions, because the user has navigated to the Extensions section.
	 * Suggestions that are installed later show the badge again.
	 */
	dismissBadge(): void;
}

export class AgentsWindowExtensionSuggestionsService extends Disposable implements IAgentsWindowExtensionSuggestionsService {

	declare readonly _serviceBrand: undefined;

	readonly showBadge: IObservable<boolean>;
	readonly suggestedExtensions: IObservable<readonly IExtension[]>;

	private readonly suggestions: IObservable<readonly IExtension[]>;
	private readonly dismissedExtensions: ISettableObservable<ReadonlySet<string>>;

	constructor(
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManifestPropertiesService extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		this.dismissedExtensions = observableValue(this, this.readDismissedExtensions());
		const managementEnabled = observableConfigValue(EXTENSIONS_AGENTS_WINDOW_MANAGEMENT, false, configurationService);
		const suggestionsEnabled = observableConfigValue(AGENTS_WINDOW_EXTENSION_SUGGESTIONS_SETTING, false, configurationService);
		const extensionsChanged = observableSignalFromEvent(this, extensionsWorkbenchService.onChange);
		const supportsAgentsWindow = (extension: IExtension) => !!extension.local && extensionManifestPropertiesService.canExecuteOnSessionsWindow(extension.local.manifest, extension.isBuiltin);

		// Suggestions are computed, and the badge is dismissed, in every experiment arm, so the trigger does not depend on the assigned treatment.
		this.suggestions = derived(this, reader => {
			if (!managementEnabled.read(reader)) {
				return [];
			}
			extensionsChanged.read(reader);
			return extensionsWorkbenchService.local.filter(extension => isAgentsWindowExtensionSuggestion(extension, supportsAgentsWindow));
		});
		this.showBadge = derived(this, reader => {
			const dismissed = this.dismissedExtensions.read(reader);
			if (!this.suggestions.read(reader).some(extension => extension.enablementState === EnablementState.DisabledWorkspace && !dismissed.has(ExtensionIdentifier.toKey(extension.identifier.id)))) {
				return false;
			}
			logSettingExperimentTrigger(telemetryService, AGENTS_WINDOW_EXTENSION_SUGGESTIONS_SETTING);
			return suggestionsEnabled.read(reader);
		});
		this.suggestedExtensions = derived(this, reader => {
			const suggestions = this.suggestions.read(reader);
			if (suggestions.length === 0) {
				return [];
			}
			logSettingExperimentTrigger(telemetryService, AGENTS_WINDOW_EXTENSION_SUGGESTIONS_SETTING);
			return suggestionsEnabled.read(reader) ? suggestions : [];
		});
	}

	dismissBadge(): void {
		const previous = this.dismissedExtensions.get();
		const dismissed = new Set(previous);
		for (const extension of this.suggestions.get()) {
			dismissed.add(ExtensionIdentifier.toKey(extension.identifier.id));
		}
		if (dismissed.size === previous.size) {
			return;
		}
		this.dismissedExtensions.set(dismissed, undefined);
		this.storageService.store(BADGE_DISMISSED_STORAGE_KEY, [...dismissed], StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private readDismissedExtensions(): ReadonlySet<string> {
		const stored = this.storageService.getObject<unknown[]>(BADGE_DISMISSED_STORAGE_KEY, StorageScope.PROFILE, []);
		return new Set(Array.isArray(stored) ? stored.filter(isString) : []);
	}
}
