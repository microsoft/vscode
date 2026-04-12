/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ColorDecorationInjectedTextMarker } from '../colorDetector.js';
export function isOnColorDecorator(mouseEvent) {
    const target = mouseEvent.target;
    return !!target
        && target.type === 6 /* MouseTargetType.CONTENT_TEXT */
        && target.detail.injectedText?.options.attachedData === ColorDecorationInjectedTextMarker;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJDb2xvclBpY2tlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2NvbG9yUGlja2VyL2Jyb3dzZXIvaG92ZXJDb2xvclBpY2tlci9ob3ZlckNvbG9yUGlja2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBR3hFLE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxVQUFvQztJQUN0RSxNQUFNLE1BQU0sR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDO0lBQ2pDLE9BQU8sQ0FBQyxDQUFDLE1BQU07V0FDWCxNQUFNLENBQUMsSUFBSSx5Q0FBaUM7V0FDNUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsT0FBTyxDQUFDLFlBQVksS0FBSyxpQ0FBaUMsQ0FBQztBQUM1RixDQUFDIn0=