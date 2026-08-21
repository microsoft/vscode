/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


/**
 * Status of the agent, used in different IDE status menus and icons.
 *
 * **Normal** - When everything is working normally (*Current Default*).
 *
 * **InProgress** - When a task is in progress. When a spinner should be shown.
 *
 * **Error** - When cannot connect, is not authorized, or authenticated.
 *
 * **Warning** - When there is a temporary issue. Such as request failed or logged out unexpectedly.
 *
 * **Inactive** - When the current file is ignored due to file size or content exclusions.
 */
export type StatusKind = 'Normal' | 'Error' | 'Warning' | 'Inactive';
