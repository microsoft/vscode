/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The most output, in characters, that the Agent Host keeps for a terminal.
 * Past this, the host trims the terminal's oldest output.
 */
export const AGENT_HOST_TERMINAL_MAX_CONTENT_LENGTH = 100_000;
