// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export interface ITestingSettings {
    readonly promptToConfigure: boolean;
    readonly debugPort: number;
    readonly pytestEnabled: boolean;
    pytestPath: string;
    pytestArgs: string[];
    readonly unittestEnabled: boolean;
    unittestArgs: string[];
    cwd?: string;
    readonly autoTestDiscoverOnSaveEnabled: boolean;
    readonly autoTestDiscoverOnSavePattern: string;
}

export type TestSettingsPropertyNames = {
    enabledName: keyof ITestingSettings;
    argsName: keyof ITestingSettings;
    pathName?: keyof ITestingSettings;
};
