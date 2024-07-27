/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { darken, inputBackground, editorWidgetBackground, lighten, registerColor, textLinkForeground, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { localize } from 'vs/nls';

// Seprate from main module to break dependency cycles between welcomePage and gettingStarted.
export const welcomePageBackground = registerColor('welcomePage.background', null, localize('welcomePage.background', 'Background color for the Welcome page.'));

export const welcomePageTileBackground = registerColor('welcomePage.tileBackground', { dark: editorWidgetBackground, light: editorWidgetBackground, hcDark: '#000', hcLight: editorWidgetBackground }, localize('welcomePage.tileBackground', 'Background color for the tiles on the Welcome page.'));
export const welcomePageTileHoverBackground = registerColor('welcomePage.tileHoverBackground', { dark: lighten(editorWidgetBackground, .2), light: darken(editorWidgetBackground, .1), hcDark: null, hcLight: null }, localize('welcomePage.tileHoverBackground', 'Hover background color for the tiles on the Welcome.'));
export const welcomePageTileBorder = registerColor('welcomePage.tileBorder', { dark: '#ffffff1a', light: '#0000001a', hcDark: contrastBorder, hcLight: contrastBorder }, localize('welcomePage.tileBorder', 'Border color for the tiles on the Welcome page.'));


export const welcomePageProgressBackground = registerColor('welcomePage.progress.background', inputBackground, localize('welcomePage.progress.background', 'Foreground color for the Welcome page progress bars.'));
export const welcomePageProgressForeground = registerColor('welcomePage.progress.foreground', textLinkForeground, localize('welcomePage.progress.foreground', 'Background color for the Welcome page progress bars.'));

export const walkthroughStepTitleForeground = registerColor('walkthrough.stepTitle.foreground', { light: '#000000', dark: '#ffffff', hcDark: null, hcLight: null }, localize('walkthrough.stepTitle.foreground', 'Foreground color of the heading of each walkthrough step'));
