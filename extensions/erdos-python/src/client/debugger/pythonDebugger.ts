// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { extensions } from 'vscode';

interface IPythonDebuggerExtensionApi {
    debug: {
        getDebuggerPackagePath(): Promise<string>;
    };
}

async function activateExtension() {
    const extension = extensions.getExtension('ms-python.debugpy');
    if (extension) {
        if (!extension.isActive) {
            await extension.activate();
        }
    }
    return extension;
}

async function getPythonDebuggerExtensionAPI(): Promise<IPythonDebuggerExtensionApi | undefined> {
    const extension = await activateExtension();
    return extension?.exports as IPythonDebuggerExtensionApi;
}

export async function getDebugpyPath(): Promise<string> {
    const api = await getPythonDebuggerExtensionAPI();
    return api?.debug.getDebuggerPackagePath() ?? '';
}
