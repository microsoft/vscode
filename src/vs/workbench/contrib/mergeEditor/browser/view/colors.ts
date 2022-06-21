/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';

export const modifiedBaseRangeInput1 = registerColor(
	'mergeEditor.modifiedBaseRange.input1',
	{
		dark: '#a44c9d53',
		light: '#a44c9d38',
		hcDark: '#a44c9d53',
		hcLight: '#a44c9d38',
	},
	localize(
		'mergeEditor.modifiedBaseRange.input1',
		'The foreground color for changes in input 1.'
	)
);

export const modifiedBaseRangeInput2 = registerColor(
	'mergeEditor.modifiedBaseRange.input2',
	{
		dark: '#878feb53',
		light: '#878feb53',
		hcDark: '#878feb53',
		hcLight: '#878feb53',
	},
	localize(
		'mergeEditor.modifiedBaseRange.input2',
		'The foreground color for changes in input 2.'
	)
);

export const modifiedBaseRangeCombination = registerColor(
	'mergeEditor.modifiedBaseRange.combination',
	{
		dark: '#8a4d249e',
		light: '#8a4d243e',
		hcDark: '#8a4d249e',
		hcLight: '#8a4d243e',
	},
	localize(
		'mergeEditor.modifiedBaseRange.combination',
		'The foreground color for combined changes in the result editor.'
	)
);

export const diffInput1 = registerColor(
	'mergeEditor.diff.input1',
	{
		dark: '#e571db21',
		light: '#e571db21',
		hcDark: '#e571db21',
		hcLight: '#e571db21',
	},
	localize(
		'mergeEditor.diff.input1',
		'The foreground color for changed words in input 1.'
	)
);

export const diff = registerColor(
	'mergeEditor.diff',
	{
		dark: '#d3d3d321',
		light: '#d3d3d321',
		hcDark: '#d3d3d321',
		hcLight: '#d3d3d321',
	},
	localize(
		'mergeEditor.diff',
		'The foreground color for changes in the result.'
	)
);

export const diffWord = registerColor(
	'mergeEditor.diff.word',
	{
		dark: '#e571db21',
		light: '#e571db21',
		hcDark: '#e571db21',
		hcLight: '#e571db21',
	},
	localize(
		'mergeEditor.diff.word',
		'The foreground color for word changes in the result.'
	)
);

export const diffInput2 = registerColor(
	'mergeEditor.diff.input2',
	{
		dark: '#878feb53',
		light: '#878feb53',
		hcDark: '#878feb53',
		hcLight: '#878feb53',
	},
	localize(
		'mergeEditor.diff.input2',
		'The foreground color for changed words in input 2.'
	)
);
