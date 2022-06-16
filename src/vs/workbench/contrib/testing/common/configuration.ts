/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationNode } from 'vs/platform/configuration/common/configurationRegistry';

export const enum TestingConfigKeys {
	AutoRunDelay = 'testing.autoRun.delay',
	AutoRunMode = 'testing.autoRun.mode',
	AutoOpenPeekView = 'testing.automaticallyOpenPeekView',
	AutoOpenPeekViewDuringAutoRun = 'testing.automaticallyOpenPeekViewDuringAutoRun',
	OpenTesting = 'testing.openTesting',
	FollowRunningTest = 'testing.followRunningTest',
	DefaultGutterClickAction = 'testing.defaultGutterClickAction',
	GutterEnabled = 'testing.gutterEnabled',
	SaveBeforeTest = 'testing.saveBeforeTest',
	AlwaysRevealTestOnStateChange = 'testing.alwaysRevealTestOnStateChange'
}

export const enum AutoOpenTesting {
	NeverOpen = 'neverOpen',
	OpenOnTestStart = 'openOnTestStart',
	OpenOnTestFailure = 'openOnTestFailure',
}

export const enum AutoOpenPeekViewWhen {
	FailureVisible = 'failureInVisibleDocument',
	FailureAnywhere = 'failureAnywhere',
	Never = 'never',
}

export const enum AutoRunMode {
	AllInWorkspace = 'all',
	OnlyPreviouslyRun = 'rerun',
}

export const enum DefaultGutterClickAction {
	Run = 'run',
	Debug = 'debug',
	ContextMenu = 'contextMenu',
}

export const testingConfiguation: IConfigurationNode = {
	id: 'testing',
	order: 21,
	title: localize('testConfigurationTitle', "Testing"),
	type: 'object',
	properties: {
		[TestingConfigKeys.AutoRunMode]: {
			description: localize('testing.autoRun.mode', "Controls which tests are automatically run."),
			enum: [
				AutoRunMode.AllInWorkspace,
				AutoRunMode.OnlyPreviouslyRun,
			],
			default: AutoRunMode.AllInWorkspace,
			enumDescriptions: [
				localize('testing.autoRun.mode.allInWorkspace', "Automatically runs all discovered test when auto-run is toggled. Reruns individual tests when they are changed."),
				localize('testing.autoRun.mode.onlyPreviouslyRun', "Reruns individual tests when they are changed. Will not automatically run any tests that have not been already executed.")
			],
		},
		[TestingConfigKeys.AutoRunDelay]: {
			type: 'integer',
			minimum: 0,
			description: localize('testing.autoRun.delay', "How long to wait, in milliseconds, after a test is marked as outdated and starting a new run."),
			default: 1000,
		},
		[TestingConfigKeys.AutoOpenPeekView]: {
			description: localize('testing.automaticallyOpenPeekView', "Configures when the error peek view is automatically opened."),
			enum: [
				AutoOpenPeekViewWhen.FailureAnywhere,
				AutoOpenPeekViewWhen.FailureVisible,
				AutoOpenPeekViewWhen.Never,
			],
			default: AutoOpenPeekViewWhen.FailureVisible,
			enumDescriptions: [
				localize('testing.automaticallyOpenPeekView.failureAnywhere', "Open automatically no matter where the failure is."),
				localize('testing.automaticallyOpenPeekView.failureInVisibleDocument', "Open automatically when a test fails in a visible document."),
				localize('testing.automaticallyOpenPeekView.never', "Never automatically open."),
			],
		},
		[TestingConfigKeys.AutoOpenPeekViewDuringAutoRun]: {
			description: localize('testing.automaticallyOpenPeekViewDuringAutoRun', "Controls whether to automatically open the peek view during auto-run mode."),
			type: 'boolean',
			default: false,
		},
		[TestingConfigKeys.FollowRunningTest]: {
			description: localize('testing.followRunningTest', 'Controls whether the running test should be followed in the test explorer view'),
			type: 'boolean',
			default: true,
		},
		[TestingConfigKeys.DefaultGutterClickAction]: {
			description: localize('testing.defaultGutterClickAction', 'Controls the action to take when left-clicking on a test decoration in the gutter.'),
			enum: [
				DefaultGutterClickAction.Run,
				DefaultGutterClickAction.Debug,
				DefaultGutterClickAction.ContextMenu,
			],
			enumDescriptions: [
				localize('testing.defaultGutterClickAction.run', 'Run the test.'),
				localize('testing.defaultGutterClickAction.debug', 'Debug the test.'),
				localize('testing.defaultGutterClickAction.contextMenu', 'Open the context menu for more options.'),
			],
			default: DefaultGutterClickAction.Run,
		},
		[TestingConfigKeys.GutterEnabled]: {
			description: localize('testing.gutterEnabled', 'Controls whether test decorations are shown in the editor gutter.'),
			type: 'boolean',
			default: true,
		},
		[TestingConfigKeys.SaveBeforeTest]: {
			description: localize('testing.saveBeforeTest', 'Control whether save all dirty editors before running a test.'),
			type: 'boolean',
			default: true,
		},
		[TestingConfigKeys.OpenTesting]: {
			enum: [
				AutoOpenTesting.NeverOpen,
				AutoOpenTesting.OpenOnTestStart,
				AutoOpenTesting.OpenOnTestFailure,
			],
			enumDescriptions: [
				localize('testing.openTesting.neverOpen', 'Never automatically open the testing view'),
				localize('testing.openTesting.openOnTestStart', 'Open the testing view when tests start'),
				localize('testing.openTesting.openOnTestFailure', 'Open the testing view on any test failure'),
			],
			default: 'openOnTestStart',
			description: localize('testing.openTesting', "Controls when the testing view should open.")
		},
		[TestingConfigKeys.AlwaysRevealTestOnStateChange]: {
			markdownDescription: localize('testing.alwaysRevealTestOnStateChange', "Always reveal the executed test when `#testing.followRunningTest#` is on. If this setting is turned off, only failed tests will be revealed."),
			type: 'boolean',
			default: false,
		},
	}
};

export interface ITestingConfiguration {
	[TestingConfigKeys.AutoRunMode]: AutoRunMode;
	[TestingConfigKeys.AutoRunDelay]: number;
	[TestingConfigKeys.AutoOpenPeekView]: AutoOpenPeekViewWhen;
	[TestingConfigKeys.AutoOpenPeekViewDuringAutoRun]: boolean;
	[TestingConfigKeys.FollowRunningTest]: boolean;
	[TestingConfigKeys.DefaultGutterClickAction]: DefaultGutterClickAction;
	[TestingConfigKeys.GutterEnabled]: boolean;
	[TestingConfigKeys.SaveBeforeTest]: boolean;
	[TestingConfigKeys.OpenTesting]: AutoOpenTesting;
	[TestingConfigKeys.AlwaysRevealTestOnStateChange]: boolean;
}

export const getTestingConfiguration = <K extends TestingConfigKeys>(config: IConfigurationService, key: K) => config.getValue<ITestingConfiguration[K]>(key);
