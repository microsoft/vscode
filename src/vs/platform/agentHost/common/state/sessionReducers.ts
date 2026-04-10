/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Re-exports the protocol reducers and adds VS Code-specific helpers.
// The actual reducer logic lives in the auto-generated protocol layer.

// Re-export reducers from the protocol layer
export { rootReducer, sessionReducer, softAssertNever, isClientDispatchable } from './protocol/reducers.js';
