// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { ConfigurationTarget, WorkspaceConfiguration } from 'vscode';

type SectionType<T> = {
    key: string;
    defaultValue?: T | undefined;
    globalValue?: T | undefined;
    globalLanguageValue?: T | undefined;
    workspaceValue?: T | undefined;
    workspaceLanguageValue?: T | undefined;
    workspaceFolderValue?: T | undefined;
    workspaceFolderLanguageValue?: T | undefined;
};

export class MockWorkspaceConfiguration implements WorkspaceConfiguration {
    private values = new Map<string, unknown>();

    constructor(defaultSettings?: { [key: string]: unknown }) {
        if (defaultSettings) {
            const keys = [...Object.keys(defaultSettings)];
            keys.forEach((k) => this.values.set(k, defaultSettings[k]));
        }
    }

    public get<T>(key: string, defaultValue?: T): T | undefined {
        if (this.values.has(key)) {
            return this.values.get(key) as T;
        }

        return arguments.length > 1 ? defaultValue : undefined;
    }

    public has(section: string): boolean {
        return this.values.has(section);
    }

    public inspect<T>(section: string): SectionType<T> | undefined {
        return this.values.get(section) as SectionType<T>;
    }

    public update(
        section: string,
        value: unknown,
        _configurationTarget?: boolean | ConfigurationTarget | undefined,
    ): Promise<void> {
        this.values.set(section, value);
        return Promise.resolve();
    }
}
