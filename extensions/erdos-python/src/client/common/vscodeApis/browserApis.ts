// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { env, Uri } from 'vscode';

export function launch(url: string): void {
    env.openExternal(Uri.parse(url));
}
