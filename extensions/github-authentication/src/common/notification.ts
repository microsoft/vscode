/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function getSafeNotificationMessage(message: string, fallbackMessage: string): string {
	return /\]\(|command:/i.test(message) ? fallbackMessage : message;
}
