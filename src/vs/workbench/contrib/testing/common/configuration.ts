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
}

export const enum AutoOpenPeekViewWhen {
	FailureVisible = 'failureInVisibleDocument',
	FailureAnywhere = 'failureAnywhere',
}

export const enum AutoRunMode {
	AllInWorkspace = 'allInWorkspace',
	OnlyPreviouslyRun = 'onlyPreviouslyRun',
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
				localize('testing.autoRun.mode.allInWorkspace', "Automatically run and then re-run all tests in the workspace."),
				localize('testing.autoRun.mode.onlyPreviouslyRun', "Only re-run tests that have been run before, when they change.")
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
			],
			default: AutoOpenPeekViewWhen.FailureVisible,
			enumDescriptions: [
				localize('testing.automaticallyOpenPeekView.failureAnywhere', "Open automatically no matter where the failure is."),
				localize('testing.automaticallyOpenPeekView.failureInVisibleDocument', "Open automatically when a test fails in a visible document.")
			],
		},
		[TestingConfigKeys.AutoOpenPeekViewDuringAutoRun]: {
			description: localize('testing.automaticallyOpenPeekViewDuringAutoRun', "Controls whether to automatically open the peek view during auto-run mode."),
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
}

export const getTestingConfiguration = <K extends TestingConfigKeys>(config: IConfigurationService, key: K) => config.getValue<ITestingConfiguration[K]>(key);
