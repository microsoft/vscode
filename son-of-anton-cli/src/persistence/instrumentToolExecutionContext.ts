/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * H14 — `instrumentToolExecutionContext` lives in
 * `son-of-anton-core/src/persistence/instrumentToolExecutionContext.ts` so the
 * IDE host can wrap its own tool execution context with the same decorator
 * the CLI uses. This file is a re-export shim so existing CLI call sites keep
 * working through their relative `./persistence/instrumentToolExecutionContext`
 * import path.
 */

export { instrumentToolExecutionContext } from 'son-of-anton-core/dist/persistence/instrumentToolExecutionContext';
