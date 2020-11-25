/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PerformanceEntry } from 'perf_hooks';

/**
 * Start the startup performace observer
 */
export function start(): void;

/**
 * Return all performance entries captured so far and stop startup
 * performance recording.
 */
export function consumeAndStop(): PerformanceEntry[];
