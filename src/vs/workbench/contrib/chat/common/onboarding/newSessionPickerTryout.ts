/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const NEW_SESSION_PICKER_TRYOUT_PRESENTATION_KIND = 'newSessionPicker';

export type NewSessionPickerTryoutPayload = 'model';

export function isNewSessionPickerTryoutPayload(value: unknown): value is NewSessionPickerTryoutPayload {
	return value === 'model';
}
