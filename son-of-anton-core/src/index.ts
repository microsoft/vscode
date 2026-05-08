/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Re-export the public surface of the core package. Consumers should prefer
// the deep import paths (`son-of-anton-core/agents/AgentManager`) for tree-
// shaking, but the barrel exists so `import x from 'son-of-anton-core'` works
// for ad-hoc consumers and the CLI bootstrap.

export * from './host';
export * from './eventEmitter';
export * from './chatStream';
