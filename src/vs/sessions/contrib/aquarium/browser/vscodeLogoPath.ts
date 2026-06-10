/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// VS Code logo silhouette path, extracted from sessions/contrib/chat/browser/media/vscode-icon.svg.
// The aquarium cannot use that SVG file directly because each fish renders the
// logo as live, same-document SVG geometry: fish.ts stores this path in a
// shared <symbol>, then renders clipped <use> slices with staggered CSS
// animations. That keeps the swimming-strip effect, currentColor species
// tinting, and auxiliary-window support while avoiding duplicate path parsing
// per fish.
export const VSCODE_LOGO_PATH = 'M65.566 89.4264C66.889 89.9418 68.3976 89.9087 69.7329 89.2662L87.0271 80.9446C88.8444 80.0701 90 78.231 90 76.2132V19.7872C90 17.7695 88.8444 15.9303 87.0271 15.0559L69.7329 6.73395C67.9804 5.89069 65.9295 6.09724 64.3914 7.21543C64.1716 7.37517 63.9624 7.55352 63.7659 7.75007L30.6583 37.9548L16.2372 27.0081C14.8948 25.9891 13.0171 26.0726 11.7702 27.2067L7.14495 31.4141C5.61986 32.8014 5.61811 35.2007 7.14117 36.5902L19.6476 48.0001L7.14117 59.4099C5.61811 60.7995 5.61986 63.1988 7.14495 64.5861L11.7702 68.7934C13.0171 69.9276 14.8948 70.0111 16.2372 68.9921L30.6583 58.0453L63.7659 88.2501C64.2897 88.7741 64.9046 89.1688 65.566 89.4264ZM69.0128 28.9311L43.8917 48.0001L69.0128 67.069V28.9311Z';