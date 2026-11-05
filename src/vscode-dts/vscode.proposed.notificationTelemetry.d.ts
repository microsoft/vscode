/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface MessageOptions {
		/**
		 * A stable, nonlocalized semantic type recorded only when allowlisted for this extension and message kind, under existing telemetry consent.
		 * Never include content, paths, URLs, errors, or their hashes; this does not affect deduplication, appearance, or modal dialog telemetry.
		 */
		notificationId?: string;
	}

	export interface ProgressOptions {
		/**
		 * A stable, nonlocalized semantic type recorded only when allowlisted for this extension and progress kind, under existing telemetry consent.
		 * Never include content, paths, URLs, errors, or their hashes; this does not affect progress behavior.
		 */
		notificationId?: string;
	}
}
