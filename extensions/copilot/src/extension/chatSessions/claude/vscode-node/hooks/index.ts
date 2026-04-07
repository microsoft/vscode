/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Import node hooks first to trigger self-registration
// This chains: common/hooks -> node/hooks -> vscode-node/hooks
import '../../node/hooks/index';

// Import all VS Code-specific hook modules to trigger self-registration
// VS Code-specific hooks can be added here
