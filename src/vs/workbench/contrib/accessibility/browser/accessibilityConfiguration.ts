/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ConfigurationScope, Extensions, IConfigurationNode, IConfigurationPropertySchema, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { workbenchConfigurationNodeBase, Extensions as WorkbenchExtensions, IConfigurationMigrationRegistry, ConfigurationKeyValuePairs } from 'vs/workbench/common/configuration';
import { AccessibilityAlertSettingId, AccessibilitySignal } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { ISpeechService, SPEECH_LANGUAGES, SPEECH_LANGUAGE_CONFIG } from 'vs/workbench/contrib/speech/common/speechService';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Event } from 'vs/base/common/event';
import { soundFeatureBase } from 'vs/workbench/contrib/accessibilitySignals/browser/accessibilitySignal.contribution';

export const accessibilityHelpIsShown = new RawContextKey<boolean>('accessibilityHelpIsShown', false, true);
export const accessibleViewIsShown = new RawContextKey<boolean>('accessibleViewIsShown', false, true);
export const accessibleViewSupportsNavigation = new RawContextKey<boolean>('accessibleViewSupportsNavigation', false, true);
export const accessibleViewVerbosityEnabled = new RawContextKey<boolean>('accessibleViewVerbosityEnabled', false, true);
export const accessibleViewGoToSymbolSupported = new RawContextKey<boolean>('accessibleViewGoToSymbolSupported', false, true);
export const accessibleViewOnLastLine = new RawContextKey<boolean>('accessibleViewOnLastLine', false, true);
export const accessibleViewCurrentProviderId = new RawContextKey<string>('accessibleViewCurrentProviderId', undefined, undefined);
export const accessibleViewInCodeBlock = new RawContextKey<boolean>('accessibleViewInCodeBlock', undefined, undefined);
export const accessibleViewContainsCodeBlocks = new RawContextKey<boolean>('accessibleViewContainsCodeBlocks', undefined, undefined);

/**
 * Miscellaneous settings tagged with accessibility and implemented in the accessibility contrib but
 * were better to live under workbench for discoverability.
 */
export const enum AccessibilityWorkbenchSettingId {
	DimUnfocusedEnabled = 'accessibility.dimUnfocused.enabled',
	DimUnfocusedOpacity = 'accessibility.dimUnfocused.opacity',
	HideAccessibleView = 'accessibility.hideAccessibleView',
	AccessibleViewCloseOnKeyPress = 'accessibility.accessibleView.closeOnKeyPress'
}

export const enum ViewDimUnfocusedOpacityProperties {
	Default = 0.75,
	Minimum = 0.2,
	Maximum = 1
}

export const enum AccessibilityVerbositySettingId {
	Terminal = 'accessibility.verbosity.terminal',
	DiffEditor = 'accessibility.verbosity.diffEditor',
	Chat = 'accessibility.verbosity.panelChat',
	InlineChat = 'accessibility.verbosity.inlineChat',
	TerminalChat = 'accessibility.verbosity.terminalChat',
	InlineCompletions = 'accessibility.verbosity.inlineCompletions',
	KeybindingsEditor = 'accessibility.verbosity.keybindingsEditor',
	Notebook = 'accessibility.verbosity.notebook',
	Editor = 'accessibility.verbosity.editor',
	Hover = 'accessibility.verbosity.hover',
	Notification = 'accessibility.verbosity.notification',
	EmptyEditorHint = 'accessibility.verbosity.emptyEditorHint',
	Comments = 'accessibility.verbosity.comments',
	DiffEditorActive = 'accessibility.verbosity.diffEditorActive'
}

export const enum AccessibleViewProviderId {
	Terminal = 'terminal',
	TerminalChat = 'terminal-chat',
	TerminalHelp = 'terminal-help',
	DiffEditor = 'diffEditor',
	Chat = 'panelChat',
	InlineChat = 'inlineChat',
	InlineCompletions = 'inlineCompletions',
	KeybindingsEditor = 'keybindingsEditor',
	Notebook = 'notebook',
	Editor = 'editor',
	Hover = 'hover',
	Notification = 'notification',
	EmptyEditorHint = 'emptyEditorHint',
	Comments = 'comments'
}

const baseVerbosityProperty: IConfigurationPropertySchema = {
	type: 'boolean',
	default: true,
	tags: ['accessibility']
};
const markdownDeprecationMessage = localize('accessibility.announcement.deprecationMessage', "This setting is deprecated. Use the `signals` settings instead.");
const baseAlertProperty: IConfigurationPropertySchema = {
	type: 'boolean',
	default: true,
	tags: ['accessibility'],
	markdownDeprecationMessage
};

export const accessibilityConfigurationNodeBase = Object.freeze<IConfigurationNode>({
	id: 'accessibility',
	title: localize('accessibilityConfigurationTitle', "Accessibility"),
	type: 'object'
});


const signalFeatureBase: IConfigurationPropertySchema = {
	'type': 'object',
	'tags': ['accessibility'],
	additionalProperties: false,
	default: {
		sound: 'auto',
		announcement: 'auto'
	}
};

export const announcementFeatureBase: IConfigurationPropertySchema = {
	'type': 'string',
	'enum': ['auto', 'off'],
	'default': 'auto',
	'enumDescriptions': [
		localize('announcement.enabled.auto', "Enable announcement, will only play when in screen reader optimized mode."),
		localize('announcement.enabled.off', "Disable announcement.")
	],
	tags: ['accessibility'],
};

const defaultNoAnnouncement: IConfigurationPropertySchema = {
	'type': 'object',
	'tags': ['accessibility'],
	additionalProperties: false,
	'default': {
		'sound': 'auto',
	}
};

const configuration: IConfigurationNode = {
	...accessibilityConfigurationNodeBase,
	properties: {
		[AccessibilityVerbositySettingId.Terminal]: {
			description: localize('verbosity.terminal.description', 'Provide information about how to access the terminal accessibility help menu when the terminal is focused.'),
			...baseVerbosityProperty
		},
		[AccessibilityVerbositySettingId.DiffEditor]: {
			description: localize('verbosity.diffEditor.description', 'Provide information about how to navigate changes in the diff editor when it is focused.'),
			...baseVerbosityProperty
		},
		[AccessibilityVerbositySettingId.Chat]: {
			description: localize('verbosity.chat.description', 'Provide information about how to access the chat help menu when the chat input is focused.'),
			...baseVerbosityProperty
		},
		[AccessibilityVerbositySettingId.InlineChat]: {
			description: localize('verbosity.interactiveEditor.description', 'Provide information about how to access the inline editor chat accessibility help menu and alert with hints that describe how to use the feature when the input is focused.'),
			...baseVerbosityProperty
		},
		[AccessibilityVerbositySettingId.InlineCompletions]: {
			description: localize('verbosity.inlineCompletions.description', 'Provide information about how to access the inline completions hover and Accessible View.'),
			...baseVerbosityProperty
		},
		[AccessibilityVerbositySettingId.KeybindingsEditor]: {
			description: localize('verbosity.keybindingsEditor.description', 'Provide information about how to change a keybinding in the keybindings editor when a row is focused.'),
			...baseVerbosityProperty
		},
		[AccessibilityVerbositySettingId.Notebook]: {
			description: localize('verbosity.notebook', 'Provide information about how to focus the cell container or inner editor when a notebook cell is focused.'),
			...baseVerbosityProperty
		},
		[AccessibilityVerbositySettingId.Hover]: {
			description: localize('verbosity.hover', 'Provide information about how to open the hover in an Accessible View.'),
			...baseVerbosityProperty
		},
		[AccessibilityVerbositySettingId.Notification]: {
			description: localize('verbosity.notification', 'Provide information about how to open the notification in an Accessible View.'),
			...baseVerbosityProperty
		},
		[AccessibilityVerbositySettingId.EmptyEditorHint]: {
			description: localize('verbosity.emptyEditorHint', 'Provide information about relevant actions in an empty text editor.'),
			...baseVerbosityProperty
		},
		[AccessibilityVerbositySettingId.Comments]: {
			description: localize('verbosity.comments', 'Provide information about actions that can be taken in the comment widget or in a file which contains comments.'),
			...baseVerbosityProperty
		},
		[AccessibilityVerbositySettingId.DiffEditorActive]: {
			description: localize('verbosity.diffEditorActive', 'Indicate when a diff editor becomes the active editor.'),
			...baseVerbosityProperty
		},
		[AccessibilityAlertSettingId.Save]: {
			'markdownDescription': localize('announcement.save', "Indicates when a file is saved. Also see {0}.", '`#audioCues.save#`'),
			'enum': ['userGesture', 'always', 'never'],
			'default': 'always',
			'enumDescriptions': [
				localize('announcement.save.userGesture', "Indicates when a file is saved via user gesture."),
				localize('announcement.save.always', "Indicates whenever is a file is saved, including auto save."),
				localize('announcement.save.never', "Never alerts.")
			],
			tags: ['accessibility'],
			markdownDeprecationMessage
		},
		[AccessibilityAlertSettingId.Clear]: {
			'markdownDescription': localize('announcement.clear', "Indicates when a feature is cleared (for example, the terminal, Debug Console, or Output channel). Also see {0}.", '`#audioCues.clear#`'),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.Format]: {
			'markdownDescription': localize('announcement.format', "Indicates when a file or notebook cell is formatted. Also see {0}.", '`#audioCues.format#`'),
			'type': 'string',
			'enum': ['userGesture', 'always', 'never'],
			'default': 'always',
			'enumDescriptions': [
				localize('announcement.format.userGesture', "Indicates when a file is formatted via user gesture."),
				localize('announcement.format.always', "Indicates whenever is a file is formatted, including auto save, on cell execution, and more."),
				localize('announcement.format.never', "Never alerts.")
			],
			tags: ['accessibility'],
			markdownDeprecationMessage
		},
		[AccessibilityAlertSettingId.Breakpoint]: {
			'markdownDescription': localize('announcement.breakpoint', "Indicates when the debugger breaks. Also see {0}.", '`#audioCues.onDebugBreak#`'),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.Error]: {
			'markdownDescription': localize('announcement.error', "Indicates when the active line has an error. Also see {0}.", '`#audioCues.lineHasError#`'),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.Warning]: {
			'markdownDescription': localize('announcement.warning', "Indicates when the active line has a warning. Also see {0}.", '`#audioCues.lineHasWarning#`'),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.FoldedArea]: {
			'markdownDescription': localize('announcement.foldedArea', "Indicates when the active line has a folded area that can be unfolded. Also see {0}.", '`#audioCues.lineHasFoldedArea#`'),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.TerminalQuickFix]: {
			'markdownDescription': localize('announcement.terminalQuickFix', "Indicates when there is an available terminal quick fix. Also see {0}.", '`#audioCues.terminalQuickFix#`'),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.TerminalBell]: {
			'markdownDescription': localize('announcement.terminalBell', "Indicates when the terminal bell is activated."),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.TerminalCommandFailed]: {
			'markdownDescription': localize('announcement.terminalCommandFailed', "Indicates when a terminal command fails (non-zero exit code). Also see {0}.", '`#audioCues.terminalCommandFailed#`'),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.TaskFailed]: {
			'markdownDescription': localize('announcement.taskFailed', "Indicates when a task fails (non-zero exit code). Also see {0}.", '`#audioCues.taskFailed#`'),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.TaskCompleted]: {
			'markdownDescription': localize('announcement.taskCompleted', "Indicates when a task completes successfully (zero exit code). Also see {0}.", '`#audioCues.taskCompleted#`'),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.ChatRequestSent]: {
			'markdownDescription': localize('announcement.chatRequestSent', "Indicates when a chat request is sent. Also see {0}.", '`#audioCues.chatRequestSent#`'),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.ChatResponsePending]: {
			'markdownDescription': localize('announcement.chatResponsePending', "Indicates when a chat response is pending. Also see {0}.", '`#audioCues.chatResponsePending#`'),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.NoInlayHints]: {
			'markdownDescription': localize('announcement.noInlayHints', "Indicates when there are no inlay hints. Also see {0}.", '`#audioCues.noInlayHints#`'),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.LineHasBreakpoint]: {
			'markdownDescription': localize('announcement.lineHasBreakpoint', "Indicates when on a line with a breakpoint. Also see {0}.", '`#audioCues.lineHasBreakpoint#`'),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.NotebookCellCompleted]: {
			'markdownDescription': localize('announcement.notebookCellCompleted', "Indicates when a notebook cell completes successfully. Also see {0}.", '`#audioCues.notebookCellCompleted#`'),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.NotebookCellFailed]: {
			'markdownDescription': localize('announcement.notebookCellFailed', "Indicates when a notebook cell fails. Also see {0}.", '`#audioCues.notebookCellFailed#`'),
			...baseAlertProperty
		},
		[AccessibilityAlertSettingId.OnDebugBreak]: {
			'markdownDescription': localize('announcement.onDebugBreak', "Indicates when the debugger breaks. Also see {0}.", '`#audioCues.onDebugBreak#`'),
			...baseAlertProperty
		},
		[AccessibilityWorkbenchSettingId.AccessibleViewCloseOnKeyPress]: {
			markdownDescription: localize('terminal.integrated.accessibleView.closeOnKeyPress', "On keypress, close the Accessible View and focus the element from which it was invoked."),
			type: 'boolean',
			default: true
		},
		'accessibility.signals.sounds.volume': {
			'description': localize('accessibility.signals.sounds.volume', "The volume of the sounds in percent (0-100)."),
			'type': 'number',
			'minimum': 0,
			'maximum': 100,
			'default': 70,
			tags: ['accessibility']
		},
		'accessibility.signals.debouncePositionChanges': {
			'description': localize('accessibility.signals.debouncePositionChanges', "Whether or not position changes should be debounced"),
			'type': 'boolean',
			'default': false,
			tags: ['accessibility']
		},
		'accessibility.signals.lineHasBreakpoint': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.lineHasBreakpoint', "Plays a signal when the active line has a breakpoint."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.lineHasBreakpoint.sound', "Plays a sound when the active line has a breakpoint."),
					...soundFeatureBase
				},
				'announcement': {
					'description': localize('accessibility.signals.lineHasBreakpoint.announcement', "Indicates when the active line has a breakpoint."),
					...announcementFeatureBase
				},
			},
		},
		'accessibility.signals.lineHasInlineSuggestion': {
			...defaultNoAnnouncement,
			'description': localize('accessibility.signals.lineHasInlineSuggestion', "Indicates when the active line has an inline suggestion."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.lineHasInlineSuggestion.sound', "Plays a sound when the active line has an inline suggestion."),
					...soundFeatureBase,
					'default': 'off'
				}
			}
		},
		'accessibility.signals.lineHasError': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.lineHasError', "Indicates when the active line has an error."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.lineHasError.sound', "Plays a sound when the active line has an error."),
					...soundFeatureBase
				},
				'announcement': {
					'description': localize('accessibility.signals.lineHasError.announcement', "Indicates when the active line has an error."),
					...announcementFeatureBase,
					default: 'off'
				},
			},
		},
		'accessibility.signals.lineHasFoldedArea': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.lineHasFoldedArea', "Indicates when the active line has a folded area that can be unfolded."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.lineHasFoldedArea.sound', "Plays a sound when the active line has a folded area that can be unfolded."),
					...soundFeatureBase,
					default: 'off'
				},
				'announcement': {
					'description': localize('accessibility.signals.lineHasFoldedArea.announcement', "Indicates when the active line has a folded area that can be unfolded."),
					...announcementFeatureBase
				},
			}
		},
		'accessibility.signals.lineHasWarning': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.lineHasWarning', "Plays a signal when the active line has a warning."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.lineHasWarning.sound', "Plays a sound when the active line has a warning."),
					...soundFeatureBase
				},
				'announcement': {
					'description': localize('accessibility.signals.lineHasWarning.announcement', "Indicates when the active line has a warning."),
					...announcementFeatureBase,
					default: 'off'
				},
			},
		},
		'accessibility.signals.onDebugBreak': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.onDebugBreak', "Plays a signal when the debugger stopped on a breakpoint."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.onDebugBreak.sound', "Plays a sound when the debugger stopped on a breakpoint."),
					...soundFeatureBase
				},
				'announcement': {
					'description': localize('accessibility.signals.onDebugBreak.announcement', "Indicates when the debugger stopped on a breakpoint."),
					...announcementFeatureBase
				},
			}
		},
		'accessibility.signals.noInlayHints': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.noInlayHints', "Plays a signal when trying to read a line with inlay hints that has no inlay hints."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.noInlayHints.sound', "Plays a sound when trying to read a line with inlay hints that has no inlay hints."),
					...soundFeatureBase
				},
				'announcement': {
					'description': localize('accessibility.signals.noInlayHints.announcement', "Indicates when trying to read a line with inlay hints that has no inlay hints."),
					...announcementFeatureBase
				},
			}
		},
		'accessibility.signals.taskCompleted': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.taskCompleted', "Plays a signal when a task is completed."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.taskCompleted.sound', "Plays a sound when a task is completed."),
					...soundFeatureBase
				},
				'announcement': {
					'description': localize('accessibility.signals.taskCompleted.announcement', "Indicates when a task is completed."),
					...announcementFeatureBase
				},
			}
		},
		'accessibility.signals.taskFailed': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.taskFailed', "Plays a signal when a task fails (non-zero exit code)."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.taskFailed.sound', "Plays a sound when a task fails (non-zero exit code)."),
					...soundFeatureBase
				},
				'announcement': {
					'description': localize('accessibility.signals.taskFailed.announcement', "Indicates when a task fails (non-zero exit code)."),
					...announcementFeatureBase
				},
			}
		},
		'accessibility.signals.terminalCommandFailed': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.terminalCommandFailed', "Plays a signal when a terminal command fails (non-zero exit code)."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.terminalCommandFailed.sound', "Plays a sound when a terminal command fails (non-zero exit code)."),
					...soundFeatureBase
				},
				'announcement': {
					'description': localize('accessibility.signals.terminalCommandFailed.announcement', "Indicates when a terminal command fails (non-zero exit code)."),
					...announcementFeatureBase
				},
			}
		},
		'accessibility.signals.terminalQuickFix': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.terminalQuickFix', "Plays a signal when terminal Quick Fixes are available."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.terminalQuickFix.sound', "Plays a sound when terminal Quick Fixes are available."),
					...soundFeatureBase
				},
				'announcement': {
					'description': localize('accessibility.signals.terminalQuickFix.announcement', "Indicates when terminal Quick Fixes are available."),
					...announcementFeatureBase
				},
			}
		},
		'accessibility.signals.terminalBell': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.terminalBell', "Plays a signal when the terminal bell is ringing."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.terminalBell.sound', "Plays a sound when the terminal bell is ringing."),
					...soundFeatureBase
				},
				'announcement': {
					'description': localize('accessibility.signals.terminalBell.announcement', "Indicates when the terminal bell is ringing."),
					...announcementFeatureBase
				},
			}
		},
		'accessibility.signals.diffLineInserted': {
			...defaultNoAnnouncement,
			'description': localize('accessibility.signals.diffLineInserted', "Indicates when the focus moves to an inserted line in Accessible Diff Viewer mode or to the next/previous change."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.sound', "Plays a sound when the focus moves to an inserted line in Accessible Diff Viewer mode or to the next/previous change."),
					...soundFeatureBase
				}
			}
		},
		'accessibility.signals.diffLineModified': {
			...defaultNoAnnouncement,
			'description': localize('accessibility.signals.diffLineModified', "Indicates when the focus moves to an modified line in Accessible Diff Viewer mode or to the next/previous change."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.diffLineModified.sound', "Plays a sound when the focus moves to a modified line in Accessible Diff Viewer mode or to the next/previous change."),
					...soundFeatureBase
				}
			}
		},
		'accessibility.signals.diffLineDeleted': {
			...defaultNoAnnouncement,
			'description': localize('accessibility.signals.diffLineDeleted', "Indicates when the focus moves to an deleted line in Accessible Diff Viewer mode or to the next/previous change."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.diffLineDeleted.sound', "Plays a sound when the focus moves to an deleted line in Accessible Diff Viewer mode or to the next/previous change."),
					...soundFeatureBase
				}
			}
		},
		'accessibility.signals.notebookCellCompleted': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.notebookCellCompleted', "Plays a signal when a notebook cell execution is successfully completed."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.notebookCellCompleted.sound', "Plays a sound when a notebook cell execution is successfully completed."),
					...soundFeatureBase
				},
				'announcement': {
					'description': localize('accessibility.signals.notebookCellCompleted.announcement', "Indicates when a notebook cell execution is successfully completed."),
					...announcementFeatureBase
				},
			}
		},
		'accessibility.signals.notebookCellFailed': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.notebookCellFailed', "Plays a signal when a notebook cell execution fails."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.notebookCellFailed.sound', "Plays a sound when a notebook cell execution fails."),
					...soundFeatureBase
				},
				'announcement': {
					'description': localize('accessibility.signals.notebookCellFailed.announcement', "Indicates when a notebook cell execution fails."),
					...announcementFeatureBase
				},
			}
		},
		'accessibility.signals.chatRequestSent': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.chatRequestSent', "Plays a signal when a chat request is made."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.chatRequestSent.sound', "Plays a sound when a chat request is made."),
					...soundFeatureBase
				},
				'announcement': {
					'description': localize('accessibility.signals.chatRequestSent.announcement', "Indicates when a chat request is made."),
					...announcementFeatureBase
				},
			}
		},
		'accessibility.signals.chatResponsePending': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.chatResponsePending', "Plays a signal on loop while the response is pending."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.chatResponsePending.sound', "Plays a sound on loop while the response is pending."),
					...soundFeatureBase
				},
				'announcement': {
					'description': localize('accessibility.signals.chatResponsePending.announcement', "Alerts on loop while the response is pending."),
					...announcementFeatureBase
				},
			},
		},
		'accessibility.signals.chatResponseReceived': {
			...defaultNoAnnouncement,
			'description': localize('accessibility.signals.chatResponseReceived', "Indicates when the response has been received."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.chatResponseReceived.sound', "Plays a sound on loop while the response has been received."),
					...soundFeatureBase
				},
			}
		},
		'accessibility.signals.voiceRecordingStarted': {
			...defaultNoAnnouncement,
			'description': localize('accessibility.signals.voiceRecordingStarted', "Indicates when the voice recording has started."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.voiceRecordingStarted.sound', "Plays a sound when the voice recording has started."),
					...soundFeatureBase,
				},
			},
			'default': {
				'sound': 'on'
			}
		},
		'accessibility.signals.voiceRecordingStopped': {
			...defaultNoAnnouncement,
			'description': localize('accessibility.signals.voiceRecordingStopped', "Indicates when the voice recording has stopped."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.voiceRecordingStopped.sound', "Plays a sound when the voice recording has stopped."),
					...soundFeatureBase,
					default: 'off'
				},
			}
		},
		'accessibility.signals.clear': {
			...signalFeatureBase,
			'description': localize('accessibility.signals.clear', "Plays a signal when a feature is cleared (for example, the terminal, Debug Console, or Output channel)."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.clear.sound', "Plays a sound when a feature is cleared."),
					...soundFeatureBase
				},
				'announcement': {
					'description': localize('accessibility.signals.clear.announcement', "Indicates when a feature is cleared."),
					...announcementFeatureBase
				},
			},
		},
		'accessibility.signals.save': {
			'type': 'object',
			'tags': ['accessibility'],
			additionalProperties: false,
			'markdownDescription': localize('accessibility.signals.save', "Plays a signal when a file is saved."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.save.sound', "Plays a sound when a file is saved."),
					'type': 'string',
					'enum': ['userGesture', 'always', 'never'],
					'default': 'never',
					'enumDescriptions': [
						localize('accessibility.signals.save.sound.userGesture', "Plays the audio cue when a user explicitly saves a file."),
						localize('accessibility.signals.save.sound.always', "Plays the audio cue whenever a file is saved, including auto save."),
						localize('accessibility.signals.save.sound.never', "Never plays the audio cue.")
					],
				},
				'announcement': {
					'description': localize('accessibility.signals.save.announcement', "Indicates when a file is saved."),
					'type': 'string',
					'enum': ['userGesture', 'always', 'never'],
					'default': 'never',
					'enumDescriptions': [
						localize('accessibility.signals.save.announcement.userGesture', "Announces when a user explicitly saves a file."),
						localize('accessibility.signals.save.announcement.always', "Announces whenever a file is saved, including auto save."),
						localize('accessibility.signals.save.announcement.never', "Never plays the audio cue.")
					],
				},
			},
			default: {
				'sound': 'never',
				'announcement': 'never'
			}
		},
		'accessibility.signals.format': {
			'type': 'object',
			'tags': ['accessibility'],
			additionalProperties: false,
			'markdownDescription': localize('accessibility.signals.format', "Plays a signal when a file or notebook is formatted."),
			'properties': {
				'sound': {
					'description': localize('accessibility.signals.format.sound', "Plays a sound when a file or notebook is formatted."),
					'type': 'string',
					'enum': ['userGesture', 'always', 'never'],
					'default': 'never',
					'enumDescriptions': [
						localize('accessibility.signals.format.userGesture', "Plays the audio cue when a user explicitly formats a file."),
						localize('accessibility.signals.format.always', "Plays the audio cue whenever a file is formatted, including if it is set to format on save, type, or, paste, or run of a cell."),
						localize('accessibility.signals.format.never', "Never plays the audio cue.")
					],
				},
				'announcement': {
					'description': localize('accessibility.signals.format.announcement', "Indicates when a file or notebook is formatted."),
					'type': 'string',
					'enum': ['userGesture', 'always', 'never'],
					'default': 'never',
					'enumDescriptions': [
						localize('accessibility.signals.format.announcement.userGesture', "Announceswhen a user explicitly formats a file."),
						localize('accessibility.signals.format.announcement.always', "Announces whenever a file is formatted, including if it is set to format on save, type, or, paste, or run of a cell."),
						localize('accessibility.signals.format.announcement.never', "Never announces.")
					],
				},
			},
			default: {
				'sound': 'never',
				'announcement': 'never'
			}
		},
	}
};

export function registerAccessibilityConfiguration() {
	const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	registry.registerConfiguration(configuration);

	registry.registerConfiguration({
		...workbenchConfigurationNodeBase,
		properties: {
			[AccessibilityWorkbenchSettingId.DimUnfocusedEnabled]: {
				description: localize('dimUnfocusedEnabled', 'Whether to dim unfocused editors and terminals, which makes it more clear where typed input will go to. This works with the majority of editors with the notable exceptions of those that utilize iframes like notebooks and extension webview editors.'),
				type: 'boolean',
				default: false,
				tags: ['accessibility'],
				scope: ConfigurationScope.APPLICATION,
			},
			[AccessibilityWorkbenchSettingId.DimUnfocusedOpacity]: {
				markdownDescription: localize('dimUnfocusedOpacity', 'The opacity fraction (0.2 to 1.0) to use for unfocused editors and terminals. This will only take effect when {0} is enabled.', `\`#${AccessibilityWorkbenchSettingId.DimUnfocusedEnabled}#\``),
				type: 'number',
				minimum: ViewDimUnfocusedOpacityProperties.Minimum,
				maximum: ViewDimUnfocusedOpacityProperties.Maximum,
				default: ViewDimUnfocusedOpacityProperties.Default,
				tags: ['accessibility'],
				scope: ConfigurationScope.APPLICATION,
			},
			[AccessibilityWorkbenchSettingId.HideAccessibleView]: {
				description: localize('accessibility.hideAccessibleView', "Controls whether the Accessible View is hidden."),
				type: 'boolean',
				default: false,
				tags: ['accessibility']
			}
		}
	});
}

export const enum AccessibilityVoiceSettingId {
	SpeechTimeout = 'accessibility.voice.speechTimeout',
	SpeechLanguage = SPEECH_LANGUAGE_CONFIG
}
export const SpeechTimeoutDefault = 1200;

export class DynamicSpeechAccessibilityConfiguration extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.dynamicSpeechAccessibilityConfiguration';

	constructor(
		@ISpeechService private readonly speechService: ISpeechService
	) {
		super();

		this._register(Event.runAndSubscribe(speechService.onDidChangeHasSpeechProvider, () => this.updateConfiguration()));
	}

	private updateConfiguration(): void {
		if (!this.speechService.hasSpeechProvider) {
			return; // these settings require a speech provider
		}

		const languages = this.getLanguages();
		const languagesSorted = Object.keys(languages).sort((langA, langB) => {
			return languages[langA].name.localeCompare(languages[langB].name);
		});

		const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
		registry.registerConfiguration({
			...accessibilityConfigurationNodeBase,
			properties: {
				[AccessibilityVoiceSettingId.SpeechTimeout]: {
					'markdownDescription': localize('voice.speechTimeout', "The duration in milliseconds that voice speech recognition remains active after you stop speaking. For example in a chat session, the transcribed text is submitted automatically after the timeout is met. Set to `0` to disable this feature."),
					'type': 'number',
					'default': SpeechTimeoutDefault,
					'minimum': 0,
					'tags': ['accessibility']
				},
				[AccessibilityVoiceSettingId.SpeechLanguage]: {
					'markdownDescription': localize('voice.speechLanguage', "The language that voice speech recognition should recognize. Select `auto` to use the configured display language if possible. Note that not all display languages maybe supported by speech recognition"),
					'type': 'string',
					'enum': languagesSorted,
					'default': 'auto',
					'tags': ['accessibility'],
					'enumDescriptions': languagesSorted.map(key => languages[key].name),
					'enumItemLabels': languagesSorted.map(key => languages[key].name)
				}
			}
		});
	}

	private getLanguages(): { [locale: string]: { name: string } } {
		return {
			['auto']: {
				name: localize('speechLanguage.auto', "Auto (Use Display Language)")
			},
			...SPEECH_LANGUAGES
		};
	}
}

Registry.as<IConfigurationMigrationRegistry>(WorkbenchExtensions.ConfigurationMigration)
	.registerConfigurationMigrations([{
		key: 'audioCues.volume',
		migrateFn: (value, accessor) => {
			return [
				['accessibility.signals.sounds.volume', { value }],
				['audioCues.volume', { value: undefined }]
			];
		}
	}]);

Registry.as<IConfigurationMigrationRegistry>(WorkbenchExtensions.ConfigurationMigration)
	.registerConfigurationMigrations([{
		key: 'audioCues.debouncePositionChanges',
		migrateFn: (value, accessor) => {
			return [
				['accessibility.signals.debouncePositionChanges', { value }],
				['audioCues.debouncePositionChanges', { value: undefined }]
			];
		}
	}]);

Registry.as<IConfigurationMigrationRegistry>(WorkbenchExtensions.ConfigurationMigration)
	.registerConfigurationMigrations(AccessibilitySignal.allAccessibilitySignals.map(item => ({
		key: item.legacySoundSettingsKey,
		migrateFn: (sound, accessor) => {
			const configurationKeyValuePairs: ConfigurationKeyValuePairs = [];
			const legacyAnnouncementSettingsKey = item.legacyAnnouncementSettingsKey;
			let announcement: string | undefined;
			if (legacyAnnouncementSettingsKey) {
				announcement = accessor(legacyAnnouncementSettingsKey) ?? undefined;
				if (announcement !== undefined && typeof announcement !== 'string') {
					announcement = announcement ? 'auto' : 'off';
				}
			}
			configurationKeyValuePairs.push([`${item.legacySoundSettingsKey}`, { value: undefined }]);
			configurationKeyValuePairs.push([`${item.settingsKey}`, { value: announcement !== undefined ? { announcement, sound } : { sound } }]);
			return configurationKeyValuePairs;
		}
	})));

Registry.as<IConfigurationMigrationRegistry>(WorkbenchExtensions.ConfigurationMigration)
	.registerConfigurationMigrations(AccessibilitySignal.allAccessibilitySignals.filter(i => !!i.legacyAnnouncementSettingsKey).map(item => ({
		key: item.legacyAnnouncementSettingsKey!,
		migrateFn: (announcement, accessor) => {
			const configurationKeyValuePairs: ConfigurationKeyValuePairs = [];
			const sound = accessor(item.settingsKey)?.sound || accessor(item.legacySoundSettingsKey);
			if (announcement !== undefined && typeof announcement !== 'string') {
				announcement = announcement ? 'auto' : 'off';
			}
			configurationKeyValuePairs.push([`${item.settingsKey}`, { value: announcement !== undefined ? { announcement, sound } : { sound } }]);
			configurationKeyValuePairs.push([`${item.legacyAnnouncementSettingsKey}`, { value: undefined }]);
			configurationKeyValuePairs.push([`${item.legacySoundSettingsKey}`, { value: undefined }]);
			return configurationKeyValuePairs;
		}
	})));
