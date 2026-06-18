/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Minimum interval between changeset-driven UI recomputes. While an agent
 * edits, the host streams many changeset envelopes per second; coalescing them
 * to ~10 updates/second keeps the Changes view responsive without perceptible
 * lag, and stops every envelope from forcing a full list relayout.
 */
export const CHANGESET_UPDATE_THROTTLE_MS = 100;
