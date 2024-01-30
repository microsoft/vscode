/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ShowAccessibilityAlertHelp, ShowAudioCueHelp } from 'vs/workbench/contrib/audioCues/browser/commands';
import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { Extensions as ConfigurationExtensions, IConfigurationPropertySchema, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IAudioCueService, AudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { AudioCueLineDebuggerContribution } from 'vs/workbench/contrib/audioCues/browser/audioCueDebuggerContribution';
import { AudioCueLineFeatureContribution } from 'vs/workbench/contrib/audioCues/browser/audioCueLineFeatureContribution';

registerSingleton(IAudioCueService, AudioCueService, InstantiationType.Delayed);

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
	tags: ['accessibility']
};

const alertFeatureBase: IConfigurationPropertySchema = {
	'type': 'boolean',
	'default': true,
	'tags': ['accessibility']
};

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	'properties': {
		'signals.debouncePositionChanges': {
			'description': localize('signals.debouncePositionChanges', "Whether or not position changes should be debounced"),
			'type': 'boolean',
			'default': false,
			tags: ['accessibility']
		},
		'signals.lineHasBreakpoint': {
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
			}
		},
		'signals.lineHasInlineSuggestion': {
			'description': localize('signals.lineHasInlineSuggestion', "Plays a signal when the active line has an inline suggestion."),
			'properties': {
				'audioCue': {
					'description': localize('signals.lineHasInlineSuggestion.audioCue', "Plays an audio cue when the active line has an inline suggestion."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.lineHasInlineSuggestion.alert', "Alerts when the active line has an inline suggestion."),
					...alertFeatureBase
				},
			}
		},
		'signals.lineHasError': {
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
			}
		},
		'signals.lineHasFoldedArea': {
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
			},
			default: 'on'
		},
		'signals.diffLineInserted': {
			'description': localize('signals.diffLineInserted', "Plays a signal when the focus moves to an inserted line in Accessible Diff Viewer mode or to the next/previous change."),
			'properties': {
				'audioCue': {
					'description': localize('signals.diffLineInserted.audioCue', "Plays an audio cue when the focus moves to an inserted line in Accessible Diff Viewer mode or to the next/previous change."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.diffLineInserted.alert', "Alerts when the focus moves to an inserted line in Accessible Diff Viewer mode or to the next/previous change."),
					...alertFeatureBase
				},
			}
		},
		'signals.diffLineDeleted': {
			'description': localize('signals.diffLineDeleted', "Plays a signal when the focus moves to a deleted line in Accessible Diff Viewer mode or to the next/previous change."),
			'properties': {
				'audioCue': {
					'description': localize('signals.diffLineDeleted.audioCue', "Plays an audio cue when the focus moves to a deleted line in Accessible Diff Viewer mode or to the next/previous change."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.diffLineDeleted.alert', "Alerts when the focus moves to a deleted line in Accessible Diff Viewer mode or to the next/previous change."),
					...alertFeatureBase
				},
			}
		},
		'signals.diffLineModified': {
			'description': localize('signals.diffLineModified', "Plays a signal when the focus moves to a modified line in Accessible Diff Viewer mode or to the next/previous change."),
			'properties': {
				'audioCue': {
					'description': localize('signals.diffLineModified.audioCue', "Plays an audio cue when the focus moves to a modified line in Accessible Diff Viewer mode or to the next/previous change."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.diffLineModified.alert', "Alerts when the focus moves to a modified line in Accessible Diff Viewer mode or to the next/previous change."),
					...alertFeatureBase
				},
			}
		},
		'signals.notebookCellCompleted': {
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
			},
		},
		'signals.chatResponsePending': {
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
		'signals.chatResponseReceived': {
			'description': localize('signals.chatResponseReceived', "Plays a signal on loop while the response has been received."),
			'properties': {
				'audioCue': {
					'description': localize('signals.chatResponseReceived.audioCue', "Plays an audio cue on loop while the response has been received."),
					...audioCueFeatureBase
				},
				'alert': {
					'description': localize('signals.chatResponseReceived.alert', "Alerts on loop while the response has been received."),
					...alertFeatureBase
				},
			},
		},
		'signals.clear': {
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
			}
		},
		'signals.format': {
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

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	'properties': {
		'audioCues.enabled': {
			markdownDeprecationMessage: 'Deprecated. Use the specific setting for each audio cue instead (`audioCues.*`).',
			tags: ['accessibility']
		},
		'audioCues.volume': {
			'description': localize('audioCues.volume', "The volume of the audio cues in percent (0-100)."),
			'type': 'number',
			'minimum': 0,
			'maximum': 100,
			'default': 70,
			tags: ['accessibility']
		},
		'audioCues.debouncePositionChanges': {
			'description': localize('audioCues.debouncePositionChanges', "Whether or not position changes should be debounced"),
			'type': 'boolean',
			'default': false,
			tags: ['accessibility']
		},
		'audioCues.lineHasBreakpoint': {
			'description': localize('audioCues.lineHasBreakpoint', "Plays a sound when the active line has a breakpoint."),
			...audioCueFeatureBase
		},
		'audioCues.lineHasInlineSuggestion': {
			'description': localize('audioCues.lineHasInlineSuggestion', "Plays a sound when the active line has an inline suggestion."),
			...audioCueFeatureBase
		},
		'audioCues.lineHasError': {
			'description': localize('audioCues.lineHasError', "Plays a sound when the active line has an error."),
			...audioCueFeatureBase,
		},
		'audioCues.lineHasFoldedArea': {
			'description': localize('audioCues.lineHasFoldedArea', "Plays a sound when the active line has a folded area that can be unfolded."),
			...audioCueFeatureBase,
		},
		'audioCues.lineHasWarning': {
			'description': localize('audioCues.lineHasWarning', "Plays a sound when the active line has a warning."),
			...audioCueFeatureBase,
			default: 'off',
		},
		'audioCues.onDebugBreak': {
			'description': localize('audioCues.onDebugBreak', "Plays a sound when the debugger stopped on a breakpoint."),
			...audioCueFeatureBase,
		},
		'audioCues.noInlayHints': {
			'description': localize('audioCues.noInlayHints', "Plays a sound when trying to read a line with inlay hints that has no inlay hints."),
			...audioCueFeatureBase,
		},
		'audioCues.taskCompleted': {
			'description': localize('audioCues.taskCompleted', "Plays a sound when a task is completed."),
			...audioCueFeatureBase,
		},
		'audioCues.taskFailed': {
			'description': localize('audioCues.taskFailed', "Plays a sound when a task fails (non-zero exit code)."),
			...audioCueFeatureBase,
		},
		'audioCues.terminalCommandFailed': {
			'description': localize('audioCues.terminalCommandFailed', "Plays a sound when a terminal command fails (non-zero exit code)."),
			...audioCueFeatureBase,
		},
		'audioCues.terminalQuickFix': {
			'description': localize('audioCues.terminalQuickFix', "Plays a sound when terminal Quick Fixes are available."),
			...audioCueFeatureBase,
		},
		'audioCues.terminalBell': {
			'description': localize('audioCues.terminalBell', "Plays a sound when the terminal bell is ringing."),
			...audioCueFeatureBase,
			default: 'on'
		},
		'audioCues.diffLineInserted': {
			'description': localize('audioCues.diffLineInserted', "Plays a sound when the focus moves to an inserted line in Accessible Diff Viewer mode or to the next/previous change."),
			...audioCueFeatureBase,
		},
		'audioCues.diffLineDeleted': {
			'description': localize('audioCues.diffLineDeleted', "Plays a sound when the focus moves to a deleted line in Accessible Diff Viewer mode or to the next/previous change."),
			...audioCueFeatureBase,
		},
		'audioCues.diffLineModified': {
			'description': localize('audioCues.diffLineModified', "Plays a sound when the focus moves to a modified line in Accessible Diff Viewer mode or to the next/previous change."),
			...audioCueFeatureBase,
		},
		'audioCues.notebookCellCompleted': {
			'description': localize('audioCues.notebookCellCompleted', "Plays a sound when a notebook cell execution is successfully completed."),
			...audioCueFeatureBase,
		},
		'audioCues.notebookCellFailed': {
			'description': localize('audioCues.notebookCellFailed', "Plays a sound when a notebook cell execution fails."),
			...audioCueFeatureBase,
		},
		'audioCues.chatRequestSent': {
			'description': localize('audioCues.chatRequestSent', "Plays a sound when a chat request is made."),
			...audioCueFeatureBase,
			default: 'off'
		},
		'audioCues.chatResponsePending': {
			'description': localize('audioCues.chatResponsePending', "Plays a sound on loop while the response is pending."),
			...audioCueFeatureBase,
			default: 'auto'
		},
		'audioCues.chatResponseReceived': {
			'description': localize('audioCues.chatResponseReceived', "Plays a sound on loop while the response has been received."),
			...audioCueFeatureBase,
			default: 'off'
		},
		'audioCues.clear': {
			'description': localize('audioCues.clear', "Plays a sound when a feature is cleared (for example, the terminal, Debug Console, or Output channel). When this is disabled, an ARIA alert will announce 'Cleared'."),
			...audioCueFeatureBase,
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
			tags: ['accessibility']
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
			tags: ['accessibility']
		},
	},
});

registerAction2(ShowAudioCueHelp);
registerAction2(ShowAccessibilityAlertHelp);
