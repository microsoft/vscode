/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Import node MCP server contributors first to trigger self-registration
// This chains: common/mcpServers -> node/mcpServers -> vscode-node/mcpServers
import '../../node/mcpServers/index';

// Import all VS Code-specific MCP server contributor modules to trigger self-registration
// Add new contributor imports here as they are created
