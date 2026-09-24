/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared constants for agent-host protocol transports. Kept in a common
 * module so browser, electron-browser, and sessions-layer transports all
 * apply the same malformed-frame policy without duplicating values.
 */

/**
 * Force-close the transport once more than this many malformed inbound
 * frames have been observed. A handful of bad frames can be tolerated
 * (e.g. a proxy momentarily corrupts a message), but a sustained stream
 * almost always indicates a protocol mismatch or a broken relay, and is
 * best surfaced as a hard disconnect so the reconnect loop can take over.
 */
export const MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD = 10;

/** Cap warn-level logs per connection for malformed frames to avoid spam. */
export const MALFORMED_FRAMES_LOG_CAP = 5;
