/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Helper to get the hostname of a possible UNC path.
 */
export function getUNCHost(maybeUNCPath: string | undefined | null): string | undefined;

/**
 * Returns the current list of allowed UNC hosts as defined by node.js.
 */
export function getUNCHostAllowlist(): string[];

/**
 * Adds one to many UNC host(s) to the allowed list in node.js.
 */
export function addUNCHostToAllowlist(allowedHost: string | string[]): void;

/**
 * Disables UNC Host allow list in node.js and thus disables UNC
 * path validation.
 */
export function disableUNCAccessRestrictions(): void;

/**
 * Whether UNC Host allow list in node.js is disabled.
 */
export function isUNCAccessRestrictionsDisabled(): boolean;
