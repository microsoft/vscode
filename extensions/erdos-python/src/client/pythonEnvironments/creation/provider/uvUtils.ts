/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, QuickPickItem } from 'vscode';
import { showQuickPickWithBack } from '../../../common/vscodeApis/windowApis';
import { CreateEnv } from '../../../common/utils/localize';

const SUPPORTED_UV_PYTHON_VERSIONS = ['3.13', '3.12', '3.11', '3.10', '3.9'];

export function getUvPythonVersions(): { versions: string[] } {
    return {
        versions: SUPPORTED_UV_PYTHON_VERSIONS,
    };
}

export async function pickPythonVersion(token?: CancellationToken): Promise<string | undefined> {
    const items: QuickPickItem[] = SUPPORTED_UV_PYTHON_VERSIONS.map((v) => ({
        label: 'Python',
        description: v,
    }));
    const selection = await showQuickPickWithBack(
        items,
        {
            placeHolder: CreateEnv.Conda.selectPythonQuickPickPlaceholder,
            matchOnDescription: true,
            ignoreFocusOut: true,
        },
        token,
    );

    if (selection) {
        return (selection as QuickPickItem).description;
    }

    return undefined;
}
