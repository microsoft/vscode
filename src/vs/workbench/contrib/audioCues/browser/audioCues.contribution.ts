/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { Extensions as ConfigurationExtensions, IConfigurationPropertySchema, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { AudioCueLineDebuggerContribution } from 'vs/workbench/contrib/audioCues/browser/audioCueDebuggerContribution';
import { AudioCueLineFeatureContribution } from 'vs/workbench/contrib/audioCues/browser/audioCueLineFeatureContribution';
import { AudioCueService, IAudioCueService } from 'vs/workbench/contrib/audioCues/browser/audioCueService';
import { ShowAudioCueHelp } from 'vs/workbench/contrib/audioCues/browser/commands';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

registerSingleton(IAudioCueService, AudioCueService);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AudioCueLineFeatureContribution, LifecyclePhase.Restored);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AudioCueLineDebuggerContribution, LifecyclePhase.Restored);

const audioCueFeatureBase: IConfigurationPropertySchema = {
	'type': 'string',
	'enum': ['auto', 'on', 'off'],
	'default': 'auto',
	'enumDescriptions': [
		localize('audioCues.enabled.auto', "Enable audio cue when a screen reader is attached."),
		localize('audioCues.enabled.on', "Enable audio cue."),
		localize('audioCues.enabled.off', "Disable audio cue.")
	],
};

// TODO@hediet: Migrate audioCues.enabled setting!
// audioCues.enabled -> audioCues.{lineHasBreakpoint, lineHasInlineCompletion, ...}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	'properties': {
		'audioCues.lineHasBreakpoint': {
			'description': localize('audioCues.lineHasBreakpoint', "Plays an audio cue when the active line has a breakpoint."),
			...audioCueFeatureBase,
		},
		'audioCues.lineHasInlineSuggestion': {
			'description': localize('audioCues.lineHasInlineSuggestion', "Plays an audio cue when the active line has an inline suggestion."),
			...audioCueFeatureBase,
		},
		'audioCues.lineHasError': {
			'description': localize('audioCues.lineHasError', "Plays an audio cue when the active line has an error."),
			...audioCueFeatureBase,
		},
		'audioCues.lineHasFoldedArea': {
			'description': localize('audioCues.lineHasFoldedArea', "Plays an audio cue when the active line has a folded area that can be unfolded."),
			...audioCueFeatureBase,
		},
		'audioCues.lineHasWarning': {
			'description': localize('audioCues.lineHasWarning', "Plays an audio cue when the active line has a warning."),
			...audioCueFeatureBase,
			default: 'off',
		},
		'audioCues.debuggerExecutionPaused': {
			'description': localize('audioCues.debuggerExecutionPaused', "Plays an audio cue when the debugger paused."),
			...audioCueFeatureBase,
		},
	}
});

registerAction2(ShowAudioCueHelp);
