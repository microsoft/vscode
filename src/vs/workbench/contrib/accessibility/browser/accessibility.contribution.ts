/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { DynamicSpeechAccessibilityConfiguration, registerAccessibilityConfiguration } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IWorkbenchContributionsRegistry, WorkbenchContributionInstantiation, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IAccessibleViewService, AccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { UnfocusedViewDimmingContribution } from 'vs/workbench/contrib/accessibility/browser/unfocusedViewDimmingContribution';
import { HoverAccessibleViewContribution, InlineCompletionsAccessibleViewContribution, NotificationAccessibleViewContribution } from 'vs/workbench/contrib/accessibility/browser/accessibilityContributions';
import { AccessibilityStatus } from 'vs/workbench/contrib/accessibility/browser/accessibilityStatus';
import { EditorAccessibilityHelpContribution } from 'vs/workbench/contrib/accessibility/browser/editorAccessibilityHelp';
import { SaveAudioCueContribution } from 'vs/workbench/contrib/accessibility/browser/saveAudioCue';
import { CommentsAccessibilityHelpContribution } from 'vs/workbench/contrib/comments/browser/commentsAccessibility';
import { audioCueFeatureBase } from 'vs/workbench/contrib/audioCues/browser/audioCues.contribution';
import { Extensions as ConfigurationExtensions, IConfigurationPropertySchema, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { localize } from 'vs/nls';

registerAccessibilityConfiguration();
registerSingleton(IAccessibleViewService, AccessibleViewService, InstantiationType.Delayed);

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(EditorAccessibilityHelpContribution, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(CommentsAccessibilityHelpContribution, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(UnfocusedViewDimmingContribution, LifecyclePhase.Restored);

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(HoverAccessibleViewContribution, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(NotificationAccessibleViewContribution, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(InlineCompletionsAccessibleViewContribution, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution2(AccessibilityStatus.ID, AccessibilityStatus, WorkbenchContributionInstantiation.BlockRestore);
workbenchContributionsRegistry.registerWorkbenchContribution2(SaveAudioCueContribution.ID, SaveAudioCueContribution, WorkbenchContributionInstantiation.BlockRestore);
workbenchContributionsRegistry.registerWorkbenchContribution2(DynamicSpeechAccessibilityConfiguration.ID, DynamicSpeechAccessibilityConfiguration, WorkbenchContributionInstantiation.BlockRestore);

const signalFeatureBase: IConfigurationPropertySchema = {
	'type': 'object',
	'tags': ['accessibility'],
	additionalProperties: false,
	default: {
		audioCue: 'auto',
		alert: 'on'
	}
};

export const alertFeatureBase: IConfigurationPropertySchema = {
	'type': 'string',
	'enum': ['on', 'off'],
	'default': 'on',
	'enumDescriptions': [
		localize('audioCues.enabled.on', "Enable alert, will only apply when in screen reader optimized mode."),
		localize('audioCues.enabled.off', "Disable alert.")
	],
	tags: ['accessibility'],
};

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'signals',
	order: 100,
	title: localize('signals', "Signals"),
	type: 'object',
	'properties': {
		'signals.debouncePositionChanges': {
			'description': localize('signals.debouncePositionChanges', "Whether or not position changes should be debounced"),
			'type': 'boolean',
			'default': false,
			tags: ['accessibility']
		},
		'signals.lineHasBreakpoint': {
			...signalFeatureBase,
			'description': localize('signals.lineHasBreakpoint', "Plays a signal when the active line has a breakpoint."),
			'properties': {
				'audioCue': {
					'description': localize('signals.lineHasBreakpoint.audioCue', "Plays an audio cue when the active line has a breakpoint."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.lineHasBreakpoint.alert', "Alerts when the active line has a breakpoint."),
					...alertFeatureBase
				},
			},
		},
		'signals.lineHasInlineSuggestion.audioCue': {
			'description': localize('signals.lineHasInlineSuggestion.audioCue', "Plays an audio cue when the active line has an inline suggestion."),
			...audioCueFeatureBase
		},
		'signals.lineHasError': {
			...signalFeatureBase,
			'description': localize('signals.lineHasError', "Plays a signal when the active line has an error."),
			'properties': {
				'audioCue': {
					'description': localize('signals.lineHasError.audioCue', "Plays an audio cue when the active line has an error."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.lineHasError.alert', "Alerts when the active line has an error."),
					...alertFeatureBase
				},
			},
		},
		'signals.lineHasFoldedArea': {
			...signalFeatureBase,
			'description': localize('signals.lineHasFoldedArea', "Plays a signal when the active line has a folded area that can be unfolded."),
			'properties': {
				'audioCue': {
					'description': localize('signals.lineHasFoldedArea.audioCue', "Plays an audio cue when the active line has a folded area that can be unfolded."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.lineHasFoldedArea.alert', "Alerts when the active line has a folded area that can be unfolded."),
					...alertFeatureBase
				},
			}
		},
		'signals.lineHasWarning': {
			...signalFeatureBase,
			'description': localize('signals.lineHasWarning', "Plays a signal when the active line has a warning."),
			'properties': {
				'audioCue': {
					'description': localize('signals.lineHasWarning.audioCue', "Plays an audio cue when the active line has a warning."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.lineHasWarning.alert', "Alerts when the active line has a warning."),
					...alertFeatureBase
				},
			},
		},
		'signals.onDebugBreak': {
			...signalFeatureBase,
			'description': localize('signals.onDebugBreak', "Plays a signal when the debugger stopped on a breakpoint."),
			'properties': {
				'audioCue': {
					'description': localize('signals.onDebugBreak.audioCue', "Plays an audio cue when the debugger stopped on a breakpoint."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.onDebugBreak.alert', "Alerts when the debugger stopped on a breakpoint."),
					...alertFeatureBase
				},
			}
		},
		'signals.noInlayHints': {
			...signalFeatureBase,
			'description': localize('signals.noInlayHints', "Plays a signal when trying to read a line with inlay hints that has no inlay hints."),
			'properties': {
				'audioCue': {
					'description': localize('signals.noInlayHints.audioCue', "Plays an audio cue when trying to read a line with inlay hints that has no inlay hints."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.noInlayHints.alert', "Alerts when trying to read a line with inlay hints that has no inlay hints."),
					...alertFeatureBase
				},
			}
		},
		'signals.taskCompleted': {
			...signalFeatureBase,
			'description': localize('signals.taskCompleted', "Plays a signal when a task is completed."),
			'properties': {
				'audioCue': {
					'description': localize('signals.taskCompleted.audioCue', "Plays an audio cue when a task is completed."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.taskCompleted.alert', "Alerts when a task is completed."),
					...alertFeatureBase
				},
			}
		},
		'signals.taskFailed': {
			...signalFeatureBase,
			'description': localize('signals.taskFailed', "Plays a signal when a task fails (non-zero exit code)."),
			'properties': {
				'audioCue': {
					'description': localize('signals.taskFailed.audioCue', "Plays an audio cue when a task fails (non-zero exit code)."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.taskFailed.alert', "Alerts when a task fails (non-zero exit code)."),
					...alertFeatureBase
				},
			}
		},
		'signals.terminalCommandFailed': {
			...signalFeatureBase,
			'description': localize('signals.terminalCommandFailed', "Plays a signal when a terminal command fails (non-zero exit code)."),
			'properties': {
				'audioCue': {
					'description': localize('signals.terminalCommandFailed.audioCue', "Plays an audio cue when a terminal command fails (non-zero exit code)."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.terminalCommandFailed.alert', "Alerts when a terminal command fails (non-zero exit code)."),
					...alertFeatureBase
				},
			}
		},
		'signals.terminalQuickFix': {
			...signalFeatureBase,
			'description': localize('signals.terminalQuickFix', "Plays a signal when terminal Quick Fixes are available."),
			'properties': {
				'audioCue': {
					'description': localize('signals.terminalQuickFix.audioCue', "Plays an audio cue when terminal Quick Fixes are available."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.terminalQuickFix.alert', "Alerts when terminal Quick Fixes are available."),
					...alertFeatureBase
				},
			}
		},
		'signals.terminalBell': {
			...signalFeatureBase,
			'description': localize('signals.terminalBell', "Plays a signal when the terminal bell is ringing."),
			'properties': {
				'audioCue': {
					'description': localize('signals.terminalBell.audioCue', "Plays an audio cue when the terminal bell is ringing."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.terminalBell.alert', "Alerts when the terminal bell is ringing."),
					...alertFeatureBase
				},
			}
		},
		'signals.diffLineInserted.audioCue': {
			...audioCueFeatureBase,
			'description': localize('signals.diffLineInserted.audioCue', "Plays an audio cue when the focus moves to an inserted line in Accessible Diff Viewer mode or to the next/previous change."),
		},
		'signals.diffLineDeleted.audioCue': {
			...audioCueFeatureBase,
			'description': localize('signals.diffLineDeleted.audioCue', "Plays an audio cue when the focus moves to a deleted line in Accessible Diff Viewer mode or to the next/previous change."),
		},
		'signals.diffLineModified.audioCue': {
			...audioCueFeatureBase,
			'description': localize('signals.diffLineModified.audioCue', "Plays an audio cue when the focus moves to a modified line in Accessible Diff Viewer mode or to the next/previous change."),
		},
		'signals.notebookCellCompleted': {
			...signalFeatureBase,
			'description': localize('signals.notebookCellCompleted', "Plays a signal when a notebook cell execution is successfully completed."),
			'properties': {
				'audioCue': {
					'description': localize('signals.notebookCellCompleted.audioCue', "Plays an audio cue when a notebook cell execution is successfully completed."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.notebookCellCompleted.alert', "Alerts when a notebook cell execution is successfully completed."),
					...alertFeatureBase
				},
			}
		},
		'signals.notebookCellFailed': {
			...signalFeatureBase,
			'description': localize('signals.notebookCellFailed', "Plays a signal when a notebook cell execution fails."),
			'properties': {
				'audioCue': {
					'description': localize('signals.notebookCellFailed.audioCue', "Plays an audio cue when a notebook cell execution fails."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.notebookCellFailed.alert', "Alerts when a notebook cell execution fails."),
					...alertFeatureBase
				},
			}
		},
		'signals.chatRequestSent': {
			...signalFeatureBase,
			'description': localize('signals.chatRequestSent', "Plays a signal when a chat request is made."),
			'properties': {
				'audioCue': {
					'description': localize('signals.chatRequestSent.audioCue', "Plays an audio cue when a chat request is made."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.chatRequestSent.alert', "Alerts when a chat request is made."),
					...alertFeatureBase
				},
			}
		},
		'signals.chatResponsePending': {
			...signalFeatureBase,
			'description': localize('signals.chatResponsePending', "Plays a signal on loop while the response is pending."),
			'properties': {
				'audioCue': {
					'description': localize('signals.chatResponsePending.audioCue', "Plays an audio cue on loop while the response is pending."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.chatResponsePending.alert', "Alerts on loop while the response is pending."),
					...alertFeatureBase
				},
			},
		},
		'signals.chatResponseReceived.audioCue': {
			'description': localize('signals.chatResponseReceived.audioCue', "Plays an audio cue on loop while the response has been received."),
			...audioCueFeatureBase
		},
		'signals.clear': {
			...signalFeatureBase,
			'description': localize('signals.clear', "Plays a signal when a feature is cleared (for example, the terminal, Debug Console, or Output channel). When this is disabled, an ARIA alert will announce 'Cleared'."),
			'properties': {
				'audioCue': {
					'description': localize('signals.clear.audioCue', "Plays an audio cue when a feature is cleared."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.clear.alert', "Alerts when a feature is cleared."),
					...alertFeatureBase
				},
			},
		},
		'signals.save': {
			'type': 'object',
			'tags': ['accessibility'],
			additionalProperties: true,
			'markdownDescription': localize('signals.save', "Plays a signal when a file is saved."),
			'properties': {
				'audioCue': {
					'description': localize('signals.save.audioCue', "Plays an audio cue when a file is saved."),
					'type': 'string',
					'enum': ['userGesture', 'always', 'never'],
					'default': 'never',
					'enumDescriptions': [
						localize('signals.save.audioCue.userGesture', "Plays the audio cue when a user explicitly saves a file."),
						localize('signals.save.audioCue.always', "Plays the audio cue whenever a file is saved, including auto save."),
						localize('signals.save.audioCue.never', "Never plays the audio cue.")
					],
				},
				'alert': {
					'description': localize('signals.save.alert', "Alerts when a file is saved."),
					'type': 'string',
					'enum': ['userGesture', 'always', 'never'],
					'default': 'never',
					'enumDescriptions': [
						localize('signals.save.alert.userGesture', "Plays the alert when a user explicitly saves a file."),
						localize('signals.save.alert.always', "Plays the alert whenever a file is saved, including auto save."),
						localize('signals.save.alert.never', "Never plays the audio cue.")
					],
				},
			},
			default: {
				'audioCue': 'never',
				'alert': 'never'
			}
		},
		'signals.format': {
			'type': 'object',
			'tags': ['accessibility'],
			additionalProperties: true,
			'markdownDescription': localize('signals.format', "Plays a signal when a file or notebook is formatted."),
			'properties': {
				'audioCue': {
					'description': localize('signals.format.audioCue', "Plays an audio cue when a file or notebook is formatted."),
					'type': 'string',
					'enum': ['userGesture', 'always', 'never'],
					'default': 'never',
					'enumDescriptions': [
						localize('signals.format.userGesture', "Plays the audio cue when a user explicitly formats a file."),
						localize('signals.format.always', "Plays the audio cue whenever a file is formatted, including if it is set to format on save, type, or, paste, or run of a cell."),
						localize('signals.format.never', "Never plays the audio cue.")
					],
				},
				'alert': {
					'description': localize('signals.format.alert', "Alerts when a file or notebook is formatted."),
					'type': 'string',
					'enum': ['userGesture', 'always', 'never'],
					'default': 'never',
					'enumDescriptions': [
						localize('signals.format.alert.userGesture', "Plays the alertwhen a user explicitly formats a file."),
						localize('signals.format.alert.always', "Plays the alert whenever a file is formatted, including if it is set to format on save, type, or, paste, or run of a cell."),
						localize('signals.format.alert.never', "Never plays the alert.")
					],
				},
			}
		},
	}
});
