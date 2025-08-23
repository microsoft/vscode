// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { l10n } from 'vscode';

/* eslint-disable @typescript-eslint/no-namespace */

// IMPORTANT: Do not import any node fs related modules here, as they do not work in browser.

export namespace LanguageService {
    export const statusItem = {
        name: l10n.t('Python IntelliSense Status'),
        text: l10n.t('Partial Mode'),
        detail: l10n.t('Limited IntelliSense provided by Pylance'),
    };
}

export namespace Common {
    export const learnMore = l10n.t('Learn more');
}
