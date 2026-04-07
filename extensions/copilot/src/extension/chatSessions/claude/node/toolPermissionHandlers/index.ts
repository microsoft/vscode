/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Import all node-specific handlers to trigger self-registration
// VS Code-specific handlers are in ../vscode-node/toolPermissionHandlers/index
import '../../common/toolPermissionHandlers/index';

import './editToolHandler';
