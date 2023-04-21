/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const CONTEXT_RESPONSE_HAS_PROVIDER_ID = new RawContextKey<boolean>('interactiveSessionResponseHasProviderId', false, { type: 'boolean', description: localize('interactiveSessionResponseHasProviderId', "True when the provider has assigned an id to this response.") });
export const CONTEXT_RESPONSE_VOTE = new RawContextKey<string>('interactiveSessionResponseVote', '', { type: 'string', description: localize('interactiveSessionResponseVote', "When the response has been voted up, is set to 'up'. When voted down, is set to 'down'. Otherwise an empty string.") });
export const CONTEXT_INTERACTIVE_REQUEST_IN_PROGRESS = new RawContextKey<boolean>('interactiveSessionRequestInProgress', false, { type: 'boolean', description: localize('interactiveSessionRequestInProgress', "True when the current request is still in progress.") });

export const CONTEXT_INTERACTIVE_INPUT_HAS_TEXT = new RawContextKey<boolean>('interactiveInputHasText', false, { type: 'boolean', description: localize('interactiveInputHasText', "True when the interactive input has text.") });
export const CONTEXT_IN_INTERACTIVE_INPUT = new RawContextKey<boolean>('inInteractiveInput', false, { type: 'boolean', description: localize('inInteractiveInput', "True when focus is in the interactive input, false otherwise.") });
export const CONTEXT_IN_INTERACTIVE_SESSION = new RawContextKey<boolean>('inInteractiveSession', false, { type: 'boolean', description: localize('inInteractiveSession', "True when focus is in the interactive session widget, false otherwise.") });

export const CONTEXT_PROVIDER_EXISTS = new RawContextKey<boolean>('hasInteractiveSessionProvider', false, { type: 'boolean', description: localize('hasInteractiveSessionProvider', "True when some interactive session provider has been registered.") });
