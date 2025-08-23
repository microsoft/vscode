// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License

import * as tomljs from '@iarna/toml';
import { flatten, isArray } from 'lodash';
import * as path from 'path';
import {
    CancellationToken,
    ProgressLocation,
    QuickPickItem,
    QuickPickItemButtonEvent,
    RelativePattern,
    ThemeIcon,
    Uri,
    WorkspaceFolder,
} from 'vscode';
import * as fs from '../../../common/platform/fs-paths';
import { Common, CreateEnv } from '../../../common/utils/localize';
import {
    MultiStepAction,
    MultiStepNode,
    showQuickPickWithBack,
    showTextDocument,
    withProgress,
} from '../../../common/vscodeApis/windowApis';
import { findFiles } from '../../../common/vscodeApis/workspaceApis';
import { traceError, traceVerbose } from '../../../logging';
import { Commands } from '../../../common/constants';
import { isWindows } from '../../../common/utils/platform';
import { getVenvPath, hasVenv } from '../common/commonUtils';
import { deleteEnvironmentNonWindows, deleteEnvironmentWindows } from './venvDeleteUtils';

export const OPEN_REQUIREMENTS_BUTTON = {
    iconPath: new ThemeIcon('go-to-file'),
    tooltip: CreateEnv.Venv.openRequirementsFile,
};
const exclude = '**/{.venv*,.git,.nox,.tox,.conda,site-packages,__pypackages__}/**';
export async function getPipRequirementsFiles(
    workspaceFolder: WorkspaceFolder,
    token?: CancellationToken,
): Promise<string[] | undefined> {
    const files = flatten(
        await Promise.all([
            findFiles(new RelativePattern(workspaceFolder, '**/*requirement*.txt'), exclude, undefined, token),
            findFiles(new RelativePattern(workspaceFolder, '**/requirements/*.txt'), exclude, undefined, token),
        ]),
    ).map((u) => u.fsPath);
    return files;
}

function tomlParse(content: string): tomljs.JsonMap {
    try {
        return tomljs.parse(content);
    } catch (err) {
        traceError('Failed to parse `pyproject.toml`:', err);
    }
    return {};
}

function tomlHasBuildSystem(toml: tomljs.JsonMap): boolean {
    return toml['build-system'] !== undefined;
}

function tomlHasProject(toml: tomljs.JsonMap): boolean {
    return toml.project !== undefined;
}

function getTomlOptionalDeps(toml: tomljs.JsonMap): string[] {
    const extras: string[] = [];
    if (toml.project && (toml.project as tomljs.JsonMap)['optional-dependencies']) {
        const deps = (toml.project as tomljs.JsonMap)['optional-dependencies'];
        for (const key of Object.keys(deps)) {
            extras.push(key);
        }
    }
    return extras;
}

async function pickTomlExtras(extras: string[], token?: CancellationToken): Promise<string[] | undefined> {
    const items: QuickPickItem[] = extras.map((e) => ({ label: e }));

    const selection = await showQuickPickWithBack(
        items,
        {
            placeHolder: CreateEnv.Venv.tomlExtrasQuickPickTitle,
            canPickMany: true,
            ignoreFocusOut: true,
        },
        token,
    );

    if (selection && isArray(selection)) {
        return selection.map((s) => s.label);
    }

    return undefined;
}

async function pickRequirementsFiles(
    files: string[],
    root: string,
    token?: CancellationToken,
): Promise<string[] | undefined> {
    const items: QuickPickItem[] = files
        .map((p) => path.relative(root, p))
        .sort((a, b) => {
            const al: number = a.split(/[\\\/]/).length;
            const bl: number = b.split(/[\\\/]/).length;
            if (al === bl) {
                if (a.length === b.length) {
                    return a.localeCompare(b);
                }
                return a.length - b.length;
            }
            return al - bl;
        })
        .map((e) => ({
            label: e,
            buttons: [OPEN_REQUIREMENTS_BUTTON],
        }));

    const selection = await showQuickPickWithBack(
        items,
        {
            placeHolder: CreateEnv.Venv.requirementsQuickPickTitle,
            ignoreFocusOut: true,
            canPickMany: true,
        },
        token,
        async (e: QuickPickItemButtonEvent<QuickPickItem>) => {
            if (e.item.label) {
                await showTextDocument(Uri.file(path.join(root, e.item.label)));
            }
        },
    );

    if (selection && isArray(selection)) {
        return selection.map((s) => s.label);
    }

    return undefined;
}

export function isPipInstallableToml(tomlContent: string): boolean {
    const toml = tomlParse(tomlContent);
    return tomlHasBuildSystem(toml) && tomlHasProject(toml);
}

export interface IPackageInstallSelection {
    installType: 'toml' | 'requirements' | 'none';
    installItem?: string;
    source?: string;
}

export async function pickPackagesToInstall(
    workspaceFolder: WorkspaceFolder,
    token?: CancellationToken,
): Promise<IPackageInstallSelection[] | undefined> {
    const tomlPath = path.join(workspaceFolder.uri.fsPath, 'pyproject.toml');
    const packages: IPackageInstallSelection[] = [];

    const tomlStep = new MultiStepNode(
        undefined,
        async (context?: MultiStepAction) => {
            traceVerbose(`Looking for toml pyproject.toml with optional dependencies at: ${tomlPath}`);

            let extras: string[] = [];
            let hasBuildSystem = false;
            let hasProject = false;

            if (await fs.pathExists(tomlPath)) {
                const toml = tomlParse(await fs.readFile(tomlPath, 'utf-8'));
                extras = getTomlOptionalDeps(toml);
                hasBuildSystem = tomlHasBuildSystem(toml);
                hasProject = tomlHasProject(toml);

                if (!hasProject) {
                    traceVerbose('Create env: Found toml without project. So we will not use editable install.');
                }
                if (!hasBuildSystem) {
                    traceVerbose('Create env: Found toml without build system. So we will not use editable install.');
                }
                if (extras.length === 0) {
                    traceVerbose('Create env: Found toml without optional dependencies.');
                }
            } else if (context === MultiStepAction.Back) {
                // This step is not really used so just go back
                return MultiStepAction.Back;
            }

            if (hasBuildSystem && hasProject) {
                if (extras.length > 0) {
                    traceVerbose('Create Env: Found toml with optional dependencies.');

                    try {
                        const installList = await pickTomlExtras(extras, token);
                        if (installList) {
                            if (installList.length > 0) {
                                installList.forEach((i) => {
                                    packages.push({ installType: 'toml', installItem: i, source: tomlPath });
                                });
                            }
                            packages.push({ installType: 'toml', source: tomlPath });
                        } else {
                            return MultiStepAction.Cancel;
                        }
                    } catch (ex) {
                        if (ex === MultiStepAction.Back || ex === MultiStepAction.Cancel) {
                            return ex;
                        }
                        throw ex;
                    }
                } else if (context === MultiStepAction.Back) {
                    // This step is not really used so just go back
                    return MultiStepAction.Back;
                } else {
                    // There are no extras to install and the context is to go to next step
                    packages.push({ installType: 'toml', source: tomlPath });
                }
            } else if (context === MultiStepAction.Back) {
                // This step is not really used because there is no build system in toml, so just go back
                return MultiStepAction.Back;
            }

            return MultiStepAction.Continue;
        },
        undefined,
    );

    const requirementsStep = new MultiStepNode(
        tomlStep,
        async (context?: MultiStepAction) => {
            traceVerbose('Looking for pip requirements.');
            const requirementFiles = await getPipRequirementsFiles(workspaceFolder, token);
            if (requirementFiles && requirementFiles.length > 0) {
                traceVerbose('Found pip requirements.');
                try {
                    const result = await pickRequirementsFiles(requirementFiles, workspaceFolder.uri.fsPath, token);
                    const installList = result?.map((p) => path.join(workspaceFolder.uri.fsPath, p));
                    if (installList) {
                        installList.forEach((i) => {
                            packages.push({ installType: 'requirements', installItem: i });
                        });
                    } else {
                        return MultiStepAction.Cancel;
                    }
                } catch (ex) {
                    if (ex === MultiStepAction.Back || ex === MultiStepAction.Cancel) {
                        return ex;
                    }
                    throw ex;
                }
            } else if (context === MultiStepAction.Back) {
                // This step is not really used, because there were no requirement files, so just go back
                return MultiStepAction.Back;
            }

            return MultiStepAction.Continue;
        },
        undefined,
    );
    tomlStep.next = requirementsStep;

    const action = await MultiStepNode.run(tomlStep);
    if (action === MultiStepAction.Back || action === MultiStepAction.Cancel) {
        throw action;
    }

    return packages;
}

export async function deleteEnvironment(
    workspaceFolder: WorkspaceFolder,
    interpreter: string | undefined,
): Promise<boolean> {
    const venvPath = getVenvPath(workspaceFolder);
    return withProgress<boolean>(
        {
            location: ProgressLocation.Notification,
            title: `${CreateEnv.Venv.deletingEnvironmentProgress} ([${Common.showLogs}](command:${Commands.ViewOutput})): ${venvPath}`,
            cancellable: false,
        },
        async () => {
            if (isWindows()) {
                return deleteEnvironmentWindows(workspaceFolder, interpreter);
            }
            return deleteEnvironmentNonWindows(workspaceFolder);
        },
    );
}

export enum ExistingVenvAction {
    Recreate,
    UseExisting,
    Create,
}

export async function pickExistingVenvAction(
    workspaceFolder: WorkspaceFolder | undefined,
): Promise<ExistingVenvAction> {
    if (workspaceFolder) {
        if (await hasVenv(workspaceFolder)) {
            const items: QuickPickItem[] = [
                {
                    label: CreateEnv.Venv.useExisting,
                    description: CreateEnv.Venv.useExistingDescription,
                },
                {
                    label: CreateEnv.Venv.recreate,
                    description: CreateEnv.Venv.recreateDescription,
                },
            ];

            const selection = (await showQuickPickWithBack(
                items,
                {
                    placeHolder: CreateEnv.Venv.existingVenvQuickPickPlaceholder,
                    ignoreFocusOut: true,
                },
                undefined,
            )) as QuickPickItem | undefined;

            if (selection?.label === CreateEnv.Venv.recreate) {
                return ExistingVenvAction.Recreate;
            }

            if (selection?.label === CreateEnv.Venv.useExisting) {
                return ExistingVenvAction.UseExisting;
            }
        } else {
            return ExistingVenvAction.Create;
        }
    }

    throw MultiStepAction.Cancel;
}
