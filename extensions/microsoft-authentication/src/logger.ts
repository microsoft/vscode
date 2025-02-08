/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const Logger = vscode.window.createOutputChannel(vscode.l10n.t('Microsoft Authentication'), { log: true });
export default Logger;
