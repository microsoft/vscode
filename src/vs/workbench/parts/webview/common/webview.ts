/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const CONTEXT_WEBVIEW_WIDGET_VISIBLE = new RawContextKey<boolean>('webviewWidgetVisible', false);
