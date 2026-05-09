/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * H14 — `HookRunner` lives in `son-of-anton-core/src/persistence/HookRunner.ts`
 * so the IDE host (extension activation in `extensions/son-of-anton/`) can
 * drive the same hook lifecycle the CLI uses. This file is a re-export shim
 * so existing CLI call sites (`agentStackBuilder.ts`, `commands/hooks.ts`)
 * keep working through their relative `./persistence/HookRunner` import path.
 */

export {
	HOOK_EVENTS,
	HookRunner,
	hooksFilePath,
} from 'son-of-anton-core/dist/persistence/HookRunner';

export type {
	HookEvent,
	HookFireResult,
	HookScriptResult,
	HooksFile,
} from 'son-of-anton-core/dist/persistence/HookRunner';
