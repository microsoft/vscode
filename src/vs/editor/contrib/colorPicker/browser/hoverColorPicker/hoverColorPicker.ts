/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPartialEditorMouseEvent, MouseTargetType } from '../../../../browser/editorBrowser.js';
import { ColorDecorationInjectedTextMarker } from '../colorDetector.js';


export function isOnColorDecorator(mouseEvent: IPartialEditorMouseEvent): boolean {
	const target = mouseEvent.target;
	return !!target
		&& target.type === MouseTargetType.CONTENT_TEXT
		&& target.detail.injectedText?.options.attachedData === ColorDecorationInjectedTextMarker;
}
