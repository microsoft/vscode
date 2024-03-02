/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ShowAccessibilityAnnouncementHelp, ShowSignalSoundHelp } from 'vs/workbench/contrib/accessibilitySignals/browser/commands';
import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { Extensions as ConfigurationExtensions, IConfigurationPropertySchema, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IAccessibilitySignalService, AccessibilitySignalService } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { AccessibilitySignalLineDebuggerContribution } from 'vs/workbench/contrib/accessibilitySignals/browser/accessibilitySignalDebuggerContribution';
import { SignalLineFeatureContribution } from 'vs/workbench/contrib/accessibilitySignals/browser/accessibilitySignalLineFeatureContribution';

registerSingleton(IAccessibilitySignalService, AccessibilitySignalService, InstantiationType.Delayed);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SignalLineFeatureContribution, LifecyclePhase.Restored);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AccessibilitySignalLineDebuggerContribution, LifecyclePhase.Restored);

export const soundFeatureBase: IConfigurationPropertySchema = {
	'type': 'string',
	'enum': ['auto', 'on', 'off'],
	'default': 'auto',
	'enumDescriptions': [
		localize('audioCues.enabled.auto', "Enable sound when a screen reader is attached."),
		localize('audioCues.enabled.on', "Enable sound."),
		localize('audioCues.enabled.off', "Disable sound.")
	],
	tags: ['accessibility'],
};
const markdownDeprecationMessage = localize('audioCues.enabled.deprecated', "This setting is deprecated. Use `signals` settings instead.");
const soundDeprecatedFeatureBase: IConfigurationPropertySchema = {
	...soundFeatureBase,
	markdownDeprecationMessage
};

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	'properties': {
		'audioCues.enabled': {
			markdownDeprecationMessage: 'Deprecated. Use the specific setting for each audio cue instead (`audioCues.*`).',
			tags: ['accessibility']
		},
		'audioCues.volume': {
			markdownDeprecationMessage: 'Deprecated. Use `accessibility.signals.sounds.volume` instead.',
			tags: ['accessibility']
		},
		'audioCues.debouncePositionChanges': {
			'description': localize('audioCues.debouncePositionChanges', "Whether or not position changes should be debounced"),
			'type': 'boolean',
			'default': false,
			tags: ['accessibility'],
			'markdownDeprecationMessage': localize('audioCues.debouncePositionChangesDeprecated', 'This setting is deprecated, instead use the `signals.debouncePositionChanges` setting.')
		},
		'audioCues.lineHasBreakpoint': {
			'description': localize('audioCues.lineHasBreakpoint', "Plays a sound when the active line has a breakpoint."),
			...soundDeprecatedFeatureBase
		},
		'audioCues.lineHasInlineSuggestion': {
			'description': localize('audioCues.lineHasInlineSuggestion', "Plays a sound when the active line has an inline suggestion."),
			...soundDeprecatedFeatureBase
		},
		'audioCues.lineHasError': {
			'description': localize('audioCues.lineHasError', "Plays a sound when the active line has an error."),
			...soundDeprecatedFeatureBase,
		},
		'audioCues.lineHasFoldedArea': {
			'description': localize('audioCues.lineHasFoldedArea', "Plays a sound when the active line has a folded area that can be unfolded."),
			...soundDeprecatedFeatureBase,
		},
		'audioCues.lineHasWarning': {
			'description': localize('audioCues.lineHasWarning', "Plays a sound when the active line has a warning."),
			...soundDeprecatedFeatureBase,
			default: 'off',
		},
		'audioCues.onDebugBreak': {
			'description': localize('audioCues.onDebugBreak', "Plays a sound when the debugger stopped on a breakpoint."),
			...soundDeprecatedFeatureBase,
		},
		'audioCues.noInlayHints': {
			'description': localize('audioCues.noInlayHints', "Plays a sound when trying to read a line with inlay hints that has no inlay hints."),
			...soundDeprecatedFeatureBase,
		},
		'audioCues.taskCompleted': {
			'description': localize('audioCues.taskCompleted', "Plays a sound when a task is completed."),
			...soundDeprecatedFeatureBase,
		},
		'audioCues.taskFailed': {
			'description': localize('audioCues.taskFailed', "Plays a sound when a task fails (non-zero exit code)."),
			...soundDeprecatedFeatureBase,
		},
		'audioCues.terminalCommandFailed': {
			'description': localize('audioCues.terminalCommandFailed', "Plays a sound when a terminal command fails (non-zero exit code)."),
			...soundDeprecatedFeatureBase,
		},
		'audioCues.terminalQuickFix': {
			'description': localize('audioCues.terminalQuickFix', "Plays a sound when terminal Quick Fixes are available."),
			...soundDeprecatedFeatureBase,
		},
		'audioCues.terminalBell': {
			'description': localize('audioCues.terminalBell', "Plays a sound when the terminal bell is ringing."),
			...soundDeprecatedFeatureBase,
			default: 'on'
		},
		'audioCues.diffLineInserted': {
			'description': localize('audioCues.diffLineInserted', "Plays a sound when the focus moves to an inserted line in Accessible Diff Viewer mode or to the next/previous change."),
			...soundDeprecatedFeatureBase,
		},
		'audioCues.diffLineDeleted': {
			'description': localize('audioCues.diffLineDeleted', "Plays a sound when the focus moves to a deleted line in Accessible Diff Viewer mode or to the next/previous change."),
			...soundDeprecatedFeatureBase,
		},
		'audioCues.diffLineModified': {
			'description': localize('audioCues.diffLineModified', "Plays a sound when the focus moves to a modified line in Accessible Diff Viewer mode or to the next/previous change."),
			...soundDeprecatedFeatureBase,
		},
		'audioCues.notebookCellCompleted': {
			'description': localize('audioCues.notebookCellCompleted', "Plays a sound when a notebook cell execution is successfully completed."),
			...soundDeprecatedFeatureBase,
		},
		'audioCues.notebookCellFailed': {
			'description': localize('audioCues.notebookCellFailed', "Plays a sound when a notebook cell execution fails."),
			...soundDeprecatedFeatureBase,
		},
		'audioCues.chatRequestSent': {
			'description': localize('audioCues.chatRequestSent', "Plays a sound when a chat request is made."),
			...soundDeprecatedFeatureBase,
			default: 'off'
		},
		'audioCues.chatResponsePending': {
			'description': localize('audioCues.chatResponsePending', "Plays a sound on loop while the response is pending."),
			...soundDeprecatedFeatureBase,
			default: 'auto'
		},
		'audioCues.chatResponseReceived': {
			'description': localize('audioCues.chatResponseReceived', "Plays a sound on loop while the response has been received."),
			...soundDeprecatedFeatureBase,
			default: 'off'
		},
		'audioCues.clear': {
			'description': localize('audioCues.clear', "Plays a sound when a feature is cleared (for example, the terminal, Debug Console, or Output channel). When this is disabled, an ARIA alert will announce 'Cleared'."),
			...soundDeprecatedFeatureBase,
			default: 'off'
		},
		'audioCues.save': {
			'markdownDescription': localize('audioCues.save', "Plays a sound when a file is saved. Also see {0}", '`#accessibility.alert.save#`'),
			'type': 'string',
			'enum': ['userGesture', 'always', 'never'],
			'default': 'never',
			'enumDescriptions': [
				localize('audioCues.save.userGesture', "Plays the audio cue when a user explicitly saves a file."),
				localize('audioCues.save.always', "Plays the audio cue whenever a file is saved, including auto save."),
				localize('audioCues.save.never', "Never plays the audio cue.")
			],
			tags: ['accessibility'],
			markdownDeprecationMessage
		},
		'audioCues.format': {
			'markdownDescription': localize('audioCues.format', "Plays a sound when a file or notebook is formatted. Also see {0}", '`#accessibility.alert.format#`'),
			'type': 'string',
			'enum': ['userGesture', 'always', 'never'],
			'default': 'never',
			'enumDescriptions': [
				localize('audioCues.format.userGesture', "Plays the audio cue when a user explicitly formats a file."),
				localize('audioCues.format.always', "Plays the audio cue whenever a file is formatted, including if it is set to format on save, type, or, paste, or run of a cell."),
				localize('audioCues.format.never', "Never plays the audio cue.")
			],
			tags: ['accessibility'],
			markdownDeprecationMessage
		},
	},
});

registerAction2(ShowSignalSoundHelp);
registerAction2(ShowAccessibilityAnnouncementHelp);

