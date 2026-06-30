/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Import node slash commands first to trigger self-registration
// This chains: common/slashCommands -> node/slashCommands -> vscode-node/slashCommands
import '../../node/slashCommands/index';

// Import all VS Code-specific slash command handlers to trigger self-registration
// Add new command imports here as they are created

import './agentsCommand';
import './hooksCommand';
import './memoryCommand';
// TODO: Re-enable after legal review is complete
// import './terminalCommand';
