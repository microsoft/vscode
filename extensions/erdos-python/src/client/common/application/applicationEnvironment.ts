// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import * as path from 'path';
import { parse } from 'semver';
import * as vscode from 'vscode';
import { traceError } from '../../logging';
import { Channel } from '../constants';
import { IPlatformService } from '../platform/types';
import { ICurrentProcess, IPathUtils } from '../types';
import { OSType } from '../utils/platform';
import { IApplicationEnvironment } from './types';

@injectable()
export class ApplicationEnvironment implements IApplicationEnvironment {
    constructor(
        @inject(IPlatformService) private readonly platform: IPlatformService,
        @inject(IPathUtils) private readonly pathUtils: IPathUtils,
        @inject(ICurrentProcess) private readonly process: ICurrentProcess,
    ) {}

    public get userSettingsFile(): string | undefined {
        const vscodeFolderName = this.channel === 'insiders' ? 'Code - Insiders' : 'Code';
        switch (this.platform.osType) {
            case OSType.OSX:
                return path.join(
                    this.pathUtils.home,
                    'Library',
                    'Application Support',
                    vscodeFolderName,
                    'User',
                    'settings.json',
                );
            case OSType.Linux:
                return path.join(this.pathUtils.home, '.config', vscodeFolderName, 'User', 'settings.json');
            case OSType.Windows:
                return this.process.env.APPDATA
                    ? path.join(this.process.env.APPDATA, vscodeFolderName, 'User', 'settings.json')
                    : undefined;
            default:
                return;
        }
    }
    public get appName(): string {
        return vscode.env.appName;
    }
    public get vscodeVersion(): string {
        return vscode.version;
    }
    public get appRoot(): string {
        return vscode.env.appRoot;
    }
    public get uiKind(): vscode.UIKind {
        return vscode.env.uiKind;
    }
    public get language(): string {
        return vscode.env.language;
    }
    public get sessionId(): string {
        return vscode.env.sessionId;
    }
    public get machineId(): string {
        return vscode.env.machineId;
    }
    public get remoteName(): string | undefined {
        return vscode.env.remoteName;
    }
    public get extensionName(): string {
        return this.packageJson.displayName;
    }

    public get shell(): string {
        return vscode.env.shell;
    }

    public get onDidChangeShell(): vscode.Event<string> {
        try {
            return vscode.env.onDidChangeShell;
        } catch (ex) {
            traceError('Failed to get onDidChangeShell API', ex);
            // `onDidChangeShell` is a proposed API at the time of writing this, so wrap this in a try...catch
            // block in case the API is removed or changed.
            return new vscode.EventEmitter<string>().event;
        }
    }

    public get packageJson(): any {
        return require('../../../../package.json');
    }
    public get channel(): Channel {
        return this.appName.indexOf('Insider') > 0 ? 'insiders' : 'stable';
    }
    public get extensionChannel(): Channel {
        const version = parse(this.packageJson.version);
        // Insiders versions are those that end with '-dev' or whose minor versions are odd (even is for stable)
        return !version || version.prerelease.length > 0 || version.minor % 2 == 1 ? 'insiders' : 'stable';
    }
    public get uriScheme(): string {
        return vscode.env.uriScheme;
    }
}
