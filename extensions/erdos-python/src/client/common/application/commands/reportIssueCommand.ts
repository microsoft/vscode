// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as os from 'os';
import * as path from 'path';
import { inject, injectable } from 'inversify';
import { isEqual } from 'lodash';
import * as fs from '../../platform/fs-paths';
import { IExtensionSingleActivationService } from '../../../activation/types';
import { IApplicationEnvironment, ICommandManager, IWorkspaceService } from '../types';
import { EXTENSION_ROOT_DIR } from '../../../constants';
import { IInterpreterService } from '../../../interpreter/contracts';
import { Commands } from '../../constants';
import { IConfigurationService, IPythonSettings } from '../../types';
import { sendTelemetryEvent } from '../../../telemetry';
import { EventName } from '../../../telemetry/constants';
import { EnvironmentType } from '../../../pythonEnvironments/info';
import { PythonSettings } from '../../configSettings';
import { SystemVariables } from '../../variables/systemVariables';
import { getExtensions } from '../../vscodeApis/extensionsApi';

/**
 * Allows the user to report an issue related to the Python extension using our template.
 */
@injectable()
export class ReportIssueCommandHandler implements IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: true };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly packageJSONSettings: any;

    constructor(
        @inject(ICommandManager) private readonly commandManager: ICommandManager,
        @inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService,
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
        @inject(IConfigurationService) protected readonly configurationService: IConfigurationService,
        @inject(IApplicationEnvironment) appEnvironment: IApplicationEnvironment,
    ) {
        this.packageJSONSettings = appEnvironment.packageJson?.contributes?.configuration?.properties;
    }

    public async activate(): Promise<void> {
        this.commandManager.registerCommand(Commands.ReportIssue, this.openReportIssue, this);
    }

    private argSettingsPath = path.join(EXTENSION_ROOT_DIR, 'resources', 'report_issue_user_settings.json');

    private templatePath = path.join(EXTENSION_ROOT_DIR, 'resources', 'report_issue_template.md');

    private userDataTemplatePath = path.join(EXTENSION_ROOT_DIR, 'resources', 'report_issue_user_data_template.md');

    public async openReportIssue(): Promise<void> {
        const settings: IPythonSettings = this.configurationService.getSettings();
        const argSettings = JSON.parse(await fs.readFile(this.argSettingsPath, 'utf8'));
        let userSettings = '';
        const keys: [keyof IPythonSettings] = Object.keys(settings) as [keyof IPythonSettings];
        keys.forEach((property) => {
            const argSetting = argSettings[property];
            if (argSetting) {
                if (typeof argSetting === 'object') {
                    let propertyHeaderAdded = false;
                    const argSettingsDict = (settings[property] as unknown) as Record<string, unknown>;
                    if (typeof argSettingsDict === 'object') {
                        Object.keys(argSetting).forEach((item) => {
                            const prop = argSetting[item];
                            if (prop) {
                                const defaultValue = this.getDefaultValue(`${property}.${item}`);
                                if (defaultValue === undefined || !isEqual(defaultValue, argSettingsDict[item])) {
                                    if (!propertyHeaderAdded) {
                                        userSettings = userSettings.concat(os.EOL, property, os.EOL);
                                        propertyHeaderAdded = true;
                                    }
                                    const value =
                                        prop === true ? JSON.stringify(argSettingsDict[item]) : '"<placeholder>"';
                                    userSettings = userSettings.concat('• ', item, ': ', value, os.EOL);
                                }
                            }
                        });
                    }
                } else {
                    const defaultValue = this.getDefaultValue(property);
                    if (defaultValue === undefined || !isEqual(defaultValue, settings[property])) {
                        const value = argSetting === true ? JSON.stringify(settings[property]) : '"<placeholder>"';
                        userSettings = userSettings.concat(os.EOL, property, ': ', value, os.EOL);
                    }
                }
            }
        });
        const template = await fs.readFile(this.templatePath, 'utf8');
        const userTemplate = await fs.readFile(this.userDataTemplatePath, 'utf8');
        const interpreter = await this.interpreterService.getActiveInterpreter();
        const pythonVersion = interpreter?.version?.raw ?? '';
        const languageServer =
            this.workspaceService.getConfiguration('python').get<string>('languageServer') || 'Not Found';
        const virtualEnvKind = interpreter?.envType || EnvironmentType.Unknown;

        const hasMultipleFolders = (this.workspaceService.workspaceFolders?.length ?? 0) > 1;
        const hasMultipleFoldersText =
            hasMultipleFolders && userSettings !== ''
                ? `Multiroot scenario, following user settings may not apply:${os.EOL}`
                : '';

        const installedExtensions = getExtensions()
            .filter((extension) => !extension.id.startsWith('vscode.'))
            .sort((a, b) => {
                if (a.packageJSON.name && b.packageJSON.name) {
                    return a.packageJSON.name.localeCompare(b.packageJSON.name);
                }
                return a.id.localeCompare(b.id);
            })
            .map((extension) => {
                let publisher: string = extension.packageJSON.publisher as string;
                if (publisher) {
                    publisher = publisher.substring(0, 3);
                }
                return `|${extension.packageJSON.name}|${publisher}|${extension.packageJSON.version}|`;
            });

        await this.commandManager.executeCommand('workbench.action.openIssueReporter', {
            extensionId: 'ms-python.python',
            issueBody: template,
            data: userTemplate.format(
                pythonVersion,
                virtualEnvKind,
                languageServer,
                hasMultipleFoldersText,
                userSettings,
                installedExtensions.join('\n'),
            ),
        });
        sendTelemetryEvent(EventName.USE_REPORT_ISSUE_COMMAND, undefined, {});
    }

    private getDefaultValue(settingKey: string) {
        if (!this.packageJSONSettings) {
            return undefined;
        }
        const resource = PythonSettings.getSettingsUriAndTarget(undefined, this.workspaceService).uri;
        const systemVariables = new SystemVariables(resource, undefined, this.workspaceService);
        return systemVariables.resolveAny(this.packageJSONSettings[`python.${settingKey}`]?.default);
    }
}
