/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Importing this module registers all built-in local chat commands with the
// LocalChatCommandRegistry (via each command module's bottom-of-file
// `register(...)` side effect). Import it wherever the registry must be
// populated (e.g. AgentSideEffects) so adding a new command is just a new file
// plus an import here.
import './renameLocalCommand.js';
import './bangLocalCommand.js';
