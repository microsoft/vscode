/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { observableFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IConfigurationNode } from '../../../../platform/configuration/common/configurationRegistry.js';

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
	CoveragePercent = 'testing.displayedCoveragePercent',
	ShowCoverageInExplorer = 'testing.showCoverageInExplorer',
	CoverageBarThresholds = 'testing.coverageBarThresholds',
	CoverageToolbarEnabled = 'testing.coverageToolbarEnabled',
}

export const enum AutoOpenTesting {
	NeverOpen = 'neverOpen',
	OpenOnTestStart = 'openOnTestStart',
	OpenOnTestFailure = 'openOnTestFailure',
	OpenExplorerOnTestStart = 'openExplorerOnTestStart',
}

export const enum AutoOpenPeekViewWhen {
	FailureVisible = 'failureInVisibleDocument',
	FailureAnywhere = 'failureAnywhere',
	Never = 'never',
}

export const enum DefaultGutterClickAction {
	Run = 'run',
	Debug = 'debug',
	Coverage = 'runWithCoverage',
	ContextMenu = 'contextMenu',
}

export const enum TestingCountBadge {
	Failed = 'failed',
	Off = 'off',
	Passed = 'passed',
	Skipped = 'skipped',
}

export const enum TestingDisplayedCoveragePercent {
	TotalCoverage = 'totalCoverage',
	Statement = 'statement',
	Minimum = 'minimum',
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
				DefaultGutterClickAction.Coverage,
				DefaultGutterClickAction.ContextMenu,
			],
			enumDescriptions: [
				localize('testing.defaultGutterClickAction.run', 'Run the test.'),
				localize('testing.defaultGutterClickAction.debug', 'Debug the test.'),
				localize('testing.defaultGutterClickAction.coverage', 'Run the test with coverage.'),
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
				AutoOpenTesting.OpenExplorerOnTestStart,
			],
			enumDescriptions: [
				localize('testing.openTesting.neverOpen', 'Never automatically open the testing views'),
				localize('testing.openTesting.openOnTestStart', 'Open the test results view when tests start'),
				localize('testing.openTesting.openOnTestFailure', 'Open the test result view on any test failure'),
				localize('testing.openTesting.openExplorerOnTestStart', 'Open the test explorer when tests start'),
			],
			default: 'openOnTestStart',
			description: localize('testing.openTesting', "Controls when the testing view should open.")
		},
		[TestingConfigKeys.AlwaysRevealTestOnStateChange]: {
			markdownDescription: localize('testing.alwaysRevealTestOnStateChange', "Always reveal the executed test when {0} is on. If this setting is turned off, only failed tests will be revealed.", '`#testing.followRunningTest#`'),
			type: 'boolean',
			default: false,
		},
		[TestingConfigKeys.ShowCoverageInExplorer]: {
			description: localize('testing.ShowCoverageInExplorer', "Whether test coverage should be down in the File Explorer view."),
			type: 'boolean',
			default: true,
		},
		[TestingConfigKeys.CoveragePercent]: {
			markdownDescription: localize('testing.displayedCoveragePercent', "Configures what percentage is displayed by default for test coverage."),
			default: TestingDisplayedCoveragePercent.TotalCoverage,
			enum: [
				TestingDisplayedCoveragePercent.TotalCoverage,
				TestingDisplayedCoveragePercent.Statement,
				TestingDisplayedCoveragePercent.Minimum,
			],
			enumDescriptions: [
				localize('testing.displayedCoveragePercent.totalCoverage', 'A calculation of the combined statement, function, and branch coverage.'),
				localize('testing.displayedCoveragePercent.statement', 'The statement coverage.'),
				localize('testing.displayedCoveragePercent.minimum', 'The minimum of statement, function, and branch coverage.'),
			],
		},
		[TestingConfigKeys.CoverageBarThresholds]: {
			markdownDescription: localize('testing.coverageBarThresholds', "Configures the colors used for percentages in test coverage bars."),
			default: { red: 0, yellow: 60, green: 90 },
			properties: {
				red: { type: 'number', minimum: 0, maximum: 100, default: 0 },
				yellow: { type: 'number', minimum: 0, maximum: 100, default: 60 },
				green: { type: 'number', minimum: 0, maximum: 100, default: 90 },
			},
		},
		[TestingConfigKeys.CoverageToolbarEnabled]: {
			description: localize('testing.coverageToolbarEnabled', 'Controls whether the coverage toolbar is shown in the editor.'),
			type: 'boolean',
			default: false, // todo@connor4312: disabled by default until UI sync
		},
	}
};

export interface ITestingCoverageBarThresholds {
	red: number;
	green: number;
	yellow: number;
}

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
	[TestingConfigKeys.CoveragePercent]: TestingDisplayedCoveragePercent;
	[TestingConfigKeys.ShowCoverageInExplorer]: boolean;
	[TestingConfigKeys.CoverageBarThresholds]: ITestingCoverageBarThresholds;
	[TestingConfigKeys.CoverageToolbarEnabled]: boolean;
}

export const getTestingConfiguration = <K extends TestingConfigKeys>(config: IConfigurationService, key: K) => config.getValue<ITestingConfiguration[K]>(key);

export const observeTestingConfiguration = <K extends TestingConfigKeys>(config: IConfigurationService, key: K) => observableFromEvent(config.onDidChangeConfiguration, () =>
	getTestingConfiguration(config, key));
