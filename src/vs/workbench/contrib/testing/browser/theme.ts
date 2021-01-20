/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { editorErrorForeground, registerColor } from 'vs/platform/theme/common/colorRegistry';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';

export const testingColorIconFailed = registerColor('testing.iconFailed', {
	dark: '#f14c4c',
	light: '#f14c4c',
	hc: '#000000'
}, localize('testing.iconFailed', "Color for the 'failed' icon in the test explorer."));

export const testingColorIconErrored = registerColor('testing.iconErrored', {
	dark: '#f14c4c',
	light: '#f14c4c',
	hc: '#000000'
}, localize('testing.iconErrored', "Color for the 'Errored' icon in the test explorer."));


export const testingColorIconPassed = registerColor('testing.iconPassed', {
	dark: '#73c991',
	light: '#73c991',
	hc: '#000000'
}, localize('testing.iconPassed', "Color for the 'passed' icon in the test explorer."));

export const testingColorIconQueued = registerColor('testing.iconQueued', {
	dark: '#cca700',
	light: '#cca700',
	hc: '#000000'
}, localize('testing.iconQueued', "Color for the 'Queued' icon in the test explorer."));

export const testingColorIconUnset = registerColor('testing.iconUnset', {
	dark: '#848484',
	light: '#848484',
	hc: '#848484'
}, localize('testing.iconUnset', "Color for the 'Unset' icon in the test explorer."));

export const testingColorIconSkipped = registerColor('testing.iconSkipped', {
	dark: '#848484',
	light: '#848484',
	hc: '#848484'
}, localize('testing.iconSkipped', "Color for the 'Skipped' icon in the test explorer."));

export const testingPeekBorder = registerColor('testing.peekBorder', {
	dark: editorErrorForeground,
	light: editorErrorForeground,
	hc: editorErrorForeground,
}, localize('testing.peekBorder', 'Color of the peek view borders and arrow.'));

export const testStatesToIconColors: { [K in TestRunState]?: string } = {
	[TestRunState.Errored]: testingColorIconErrored,
	[TestRunState.Failed]: testingColorIconFailed,
	[TestRunState.Passed]: testingColorIconPassed,
	[TestRunState.Queued]: testingColorIconQueued,
	[TestRunState.Unset]: testingColorIconUnset,
	[TestRunState.Skipped]: testingColorIconUnset,
};
