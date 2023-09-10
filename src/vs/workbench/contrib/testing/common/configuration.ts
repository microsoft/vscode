/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationNode } from 'vs/platform/configuration/common/configurationRegistry';

export const enum TestingConfigKeys {
	AutoRunDelay = 'testing.autoRun.delay',
	AutoOpenPeekView = 'testing.automaticallyOpenPeekView',
	AutoOpenPeekViewDuringContinuousRun = 'testing.automaticallyOpenPeekViewDuringAutoRun',
	OpenTesting = 'testing.openTesting',
	FollowRunningTest = 'testing.followRunningTest',
	DefaultGutterClickAction = 'testing.defaultGutterClickAction',
	GutterEnabled = 'testing.gutterEnabled',
	SaveBeforeTest = 'testing.saveBeforeTest',
	AlwaysRevealTestOnStateChange = 'testing.alwaysRevealTestOnStateChange',
	CountBadge = 'testing.countBadge',
	ShowAllMessages = 'testing.showAllMessages',
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

export const enum DefaultGutterClickAction {
	Run = 'run',
	Debug = 'debug',
	ContextMenu = 'contextMenu',
}

export const enum TestingCountBadge {
	Failed = 'failed',
	Off = 'off',
	Passed = 'passed',
	Skipped = 'skipped',
}

export const testingConfiguration: IConfigurationNode = {
	id: 'testing',
	order: 21,
	title: localize('testConfigurationTitle', "Testing"),
	type: 'object',
	properties: {
		[TestingConfigKeys.AutoRunDelay]: {
			type: 'integer',
			minimum: 0,
			description: localize('testing.autoRun.delay', "How long to wait, in milliseconds, after a test is marked as outdated and starting a new run."),
			default: 1000,
		},
		[TestingConfigKeys.AutoOpenPeekView]: {
			description: localize('testing.automaticallyOpenPeekView', "Configures when the error Peek view is automatically opened."),
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
		[TestingConfigKeys.ShowAllMessages]: {
			description: localize('testing.showAllMessages', "Controls whether to show messages from all test runs."),
			type: 'boolean',
			default: false,
		},
		[TestingConfigKeys.AutoOpenPeekViewDuringContinuousRun]: {
			description: localize('testing.automaticallyOpenPeekViewDuringContinuousRun', "Controls whether to automatically open the Peek view during continuous run mode."),
			type: 'boolean',
			default: false,
		},
		[TestingConfigKeys.CountBadge]: {
			description: localize('testing.countBadge', 'Controls the count badge on the Testing icon on the Activity Bar.'),
			enum: [
				TestingCountBadge.Failed,
				TestingCountBadge.Off,
				TestingCountBadge.Passed,
				TestingCountBadge.Skipped,
			],
			enumDescriptions: [
				localize('testing.countBadge.failed', 'Show the number of failed tests'),
				localize('testing.countBadge.off', 'Disable the testing count badge'),
				localize('testing.countBadge.passed', 'Show the number of passed tests'),
				localize('testing.countBadge.skipped', 'Show the number of skipped tests'),
			],
			default: TestingCountBadge.Failed,
		},
		[TestingConfigKeys.FollowRunningTest]: {
			description: localize('testing.followRunningTest', 'Controls whether the running test should be followed in the Test Explorer view.'),
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
	[TestingConfigKeys.AutoRunDelay]: number;
	[TestingConfigKeys.AutoOpenPeekView]: AutoOpenPeekViewWhen;
	[TestingConfigKeys.AutoOpenPeekViewDuringContinuousRun]: boolean;
	[TestingConfigKeys.CountBadge]: TestingCountBadge;
	[TestingConfigKeys.FollowRunningTest]: boolean;
	[TestingConfigKeys.DefaultGutterClickAction]: DefaultGutterClickAction;
	[TestingConfigKeys.GutterEnabled]: boolean;
	[TestingConfigKeys.SaveBeforeTest]: boolean;
	[TestingConfigKeys.OpenTesting]: AutoOpenTesting;
	[TestingConfigKeys.AlwaysRevealTestOnStateChange]: boolean;
	[TestingConfigKeys.ShowAllMessages]: boolean;
}

export const getTestingConfiguration = <K extends TestingConfigKeys>(config: IConfigurationService, key: K) => config.getValue<ITestingConfiguration[K]>(key);
