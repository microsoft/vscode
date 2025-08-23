// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { BaseLanguageClient } from 'vscode-languageclient';
import { LanguageClient } from 'vscode-languageclient/browser';
import { PYTHON_LANGUAGE } from '../common/constants';
import { ApiForPylance, TelemetryReporter } from '../pylanceApi';

export interface IBrowserExtensionApi {
    /**
     * @deprecated Temporarily exposed for Pylance until we expose this API generally. Will be removed in an
     * iteration or two.
     */
    pylance: ApiForPylance;
}

export function buildApi(reporter: TelemetryReporter): IBrowserExtensionApi {
    const api: IBrowserExtensionApi = {
        pylance: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            createClient: (...args: any[]): BaseLanguageClient =>
                new LanguageClient(PYTHON_LANGUAGE, 'Python Language Server', args[0], args[1]),
            start: (client: BaseLanguageClient): Promise<void> => client.start(),
            stop: (client: BaseLanguageClient): Promise<void> => client.stop(),
            getTelemetryReporter: () => reporter,
        },
    };

    return api;
}
