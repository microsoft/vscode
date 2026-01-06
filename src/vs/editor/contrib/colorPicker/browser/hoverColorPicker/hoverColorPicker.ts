/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPartialEditorMouseEvent, MouseTargetType } from '../../../../browser/editorBrowser.js';
import { ColorDecorationInjectedTextMarker } from '../colorDetector.js';


export function isOnColorDecorator(mouseEvent: IPartialEditorMouseEvent): boolean {
	const target = mouseEvent.target;
	return !!target
		&& target.type === MouseTargetType.CONTENT_TEXT
		&& target.detail.injectedText?.options.attachedData === ColorDecorationInjectedTextMarker;
}
