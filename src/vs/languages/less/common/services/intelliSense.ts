/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import languageFacts = require('vs/languages/css/common/services/languageFacts');
import Modes = require('vs/editor/common/modes');
import cssIntellisense = require('vs/languages/css/common/services/intelliSense');
import nls = require('vs/nls');

export class LESSIntellisense extends cssIntellisense.CSSIntellisense {

	private static builtInProposals = [
		{
			'name': 'escape',
			'example': 'escape(@string);',
			'description': nls.localize('less.builtin.escape', 'URL encodes a string')
		},
		{
			'name': 'e',
			'example': 'e(@string);',
			'description': nls.localize('less.builtin.e', 'escape string content')
		},
		{
			'name': 'replace',
			'example': 'replace(@string, @pattern, @replacement[, @flags]);',
			'description': nls.localize('less.builtin.replace', 'string replace')
		},
		{
			'name': 'unit',
			'example': 'unit(@dimension, [@unit: \'\']);',
			'description': nls.localize('less.builtin.unit', 'remove or change the unit of a dimension')
		},
		{
			'name': 'color',
			'example': 'color(@string);',
			'description': nls.localize('less.builtin.color', 'parses a string to a color')
		},
		{
			'name': 'convert',
			'example': 'convert(@value, unit);',
			'description': nls.localize('less.builtin.convert', 'converts numbers from one type into another')
		},
		{
			'name': 'data-uri',
			'example': 'data-uri([mimetype,] url);',
			'description': nls.localize('less.builtin.data-uri', 'inlines a resource and falls back to `url()`')
		},
		{
			'name': 'length',
			'example': 'length(@list);',
			'description': nls.localize('less.builtin.length', 'returns the number of elements in a value list')
		},
		{
			'name': 'extract',
			'example': 'extract(@list, index);',
			'description': nls.localize('less.builtin.extract', 'returns a value at the specified position in the list')
		},
		{
			'name': 'abs',
			'description': nls.localize('less.builtin.abs', 'absolute value of a number'),
			'example': 'abs(number);'
		},
		{
			'name': 'acos',
			'description': nls.localize('less.builtin.acos', 'arccosine - inverse of cosine function'),
			'example': 'acos(number);'
		},
		{
			'name': 'asin',
			'description': nls.localize('less.builtin.asin', 'arcsine - inverse of sine function'),
			'example': 'asin(number);'
		},
		{
			'name': 'ceil',
			'example': 'ceil(@number);',
			'description': nls.localize('less.builtin.ceil', 'rounds up to an integer')
		},
		{
			'name': 'cos',
			'description': nls.localize('less.builtin.cos', 'cosine function'),
			'example': 'cos(number);'
		},
		{
			'name': 'floor',
			'description': nls.localize('less.builtin.floor', 'rounds down to an integer'),
			'example': 'floor(@number);'
		},
		{
			'name': 'percentage',
			'description': nls.localize('less.builtin.percentage', 'converts to a %, e.g. 0.5 > 50%'),
			'example': 'percentage(@number);'
		},
		{
			'name': 'round',
			'description': nls.localize('less.builtin.round', 'rounds a number to a number of places'),
			'example': 'round(number, [places: 0]);'
		},
		{
			'name': 'sqrt',
			'description': nls.localize('less.builtin.sqrt', 'calculates square root of a number'),
			'example': 'sqrt(number);'
		},
		{
			'name': 'sin',
			'description': nls.localize('less.builtin.sin', 'sine function'),
			'example': 'sin(number);'
		},
		{
			'name': 'tan',
			'description': nls.localize('less.builtin.tan', 'tangent function'),
			'example': 'tan(number);'
		},
		{
			'name': 'atan',
			'description': nls.localize('less.builtin.atan', 'arctangent - inverse of tangent function'),
			'example': 'atan(number);'
		},
		{
			'name': 'pi',
			'description': nls.localize('less.builtin.pi', 'returns pi'),
			'example': 'pi();'
		},
		{
			'name': 'pow',
			'description': nls.localize('less.builtin.pow', 'first argument raised to the power of the second argument'),
			'example': 'pow(@base, @exponent);'
		},
		{
			'name': 'mod',
			'description': nls.localize('less.builtin.mod', 'first argument modulus second argument'),
			'example': 'mod(number, number);'
		},
		{
			'name': 'min',
			'description': nls.localize('less.builtin.min', 'returns the lowest of one or more values'),
			'example': 'min(@x, @y);'
		},
		{
			'name': 'max',
			'description': nls.localize('less.builtin.max', 'returns the lowest of one or more values'),
			'example': 'max(@x, @y);'
		}
	];

	private static colorProposals = [
		{
			'name': 'argb',
			'example': 'argb(@color);',
			'description': nls.localize('less.builtin.argb', 'creates a #AARRGGBB')
		},
		{
			'name': 'hsl',
			'example': 'hsl(@hue, @saturation, @lightness);',
			'description': nls.localize('less.builtin.hsl', 'creates a color')
		},
		{
			'name': 'hsla',
			'example': 'hsla(@hue, @saturation, @lightness, @alpha);',
			'description': nls.localize('less.builtin.hsla', 'creates a color')
		},
		{
			'name': 'hsv',
			'example': 'hsv(@hue, @saturation, @value);',
			'description': nls.localize('less.builtin.hsv', 'creates a color')
		},
		{
			'name': 'hsva',
			'example': 'hsva(@hue, @saturation, @value, @alpha);',
			'description': nls.localize('less.builtin.hsva', 'creates a color')
		},
		{
			'name': 'hue',
			'example': 'hue(@color);',
			'description': nls.localize('less.builtin.hue', 'returns the `hue` channel of `@color` in the HSL space')
		},
		{
			'name': 'saturation',
			'example': 'saturation(@color);',
			'description': nls.localize('less.builtin.saturation', 'returns the `saturation` channel of `@color` in the HSL space')
		},
		{
			'name': 'lightness',
			'example': 'lightness(@color);',
			'description': nls.localize('less.builtin.lightness', 'returns the `lightness` channel of `@color` in the HSL space')
		},
		{
			'name': 'hsvhue',
			'example': 'hsvhue(@color);',
			'description': nls.localize('less.builtin.hsvhue', 'returns the `hue` channel of `@color` in the HSV space')
		},
		{
			'name': 'hsvsaturation',
			'example': 'hsvsaturation(@color);',
			'description': nls.localize('less.builtin.hsvsaturation', 'returns the `saturation` channel of `@color` in the HSV space')
		},
		{
			'name': 'hsvvalue',
			'example': 'hsvvalue(@color);',
			'description': nls.localize('less.builtin.hsvvalue', 'returns the `value` channel of `@color` in the HSV space')
		},
		{
			'name': 'red',
			'example': 'red(@color);',
			'description': nls.localize('less.builtin.red', 'returns the `red` channel of `@color`')
		},
		{
			'name': 'green',
			'example': 'green(@color);',
			'description': nls.localize('less.builtin.green', 'returns the `green` channel of `@color`')
		},
		{
			'name': 'blue',
			'example': 'blue(@color);',
			'description': nls.localize('less.builtin.blue', 'returns the `blue` channel of `@color`')
		},
		{
			'name': 'alpha',
			'example': 'alpha(@color);',
			'description': nls.localize('less.builtin.alpha', 'returns the `alpha` channel of `@color`')
		},
		{
			'name': 'luma',
			'example': 'luma(@color);',
			'description': nls.localize('less.builtin.luma', 'returns the `luma` value (perceptual brightness) of `@color`')
		},
		{
			'name': 'saturate',
			'example': 'saturate(@color, 10%);',
			'description': nls.localize('less.builtin.saturate', 'return `@color` 10% points more saturated')
		},
		{
			'name': 'desaturate',
			'example': 'desaturate(@color, 10%);',
			'description': nls.localize('less.builtin.desaturate', 'return `@color` 10% points less saturated')
		},
		{
			'name': 'lighten',
			'example': 'lighten(@color, 10%);',
			'description': nls.localize('less.builtin.lighten', 'return `@color` 10% points lighter')
		},
		{
			'name': 'darken',
			'example': 'darken(@color, 10%);',
			'description': nls.localize('less.builtin.darken', 'return `@color` 10% points darker')
		},
		{
			'name': 'fadein',
			'example': 'fadein(@color, 10%);',
			'description': nls.localize('less.builtin.fadein', 'return `@color` 10% points less transparent')
		},
		{
			'name': 'fadeout',
			'example': 'fadeout(@color, 10%);',
			'description': nls.localize('less.builtin.fadeout', 'return `@color` 10% points more transparent')
		},
		{
			'name': 'fade',
			'example': 'fade(@color, 50%);',
			'description': nls.localize('less.builtin.fade', 'return `@color` with 50% transparency')
		},
		{
			'name': 'spin',
			'example': 'spin(@color, 10);',
			'description': nls.localize('less.builtin.spin', 'return `@color` with a 10 degree larger in hue')
		},
		{
			'name': 'mix',
			'example': 'mix(@color1, @color2, [@weight: 50%]);',
			'description': nls.localize('less.builtin.mix', 'return a mix of `@color1` and `@color2`')
		},
		{
			'name': 'greyscale',
			'example': 'greyscale(@color);',
			'description': nls.localize('less.builtin.greyscale', 'returns a grey, 100% desaturated color')
		},
		{
			'name': 'contrast',
			'example': 'contrast(@color1, [@darkcolor: black], [@lightcolor: white], [@threshold: 43%]);',
			'description': nls.localize('less.builtin.contrast', 'return `@darkcolor` if `@color1 is> 43% luma` otherwise return `@lightcolor`, see notes')
		},
		{
			'name': 'multiply',
			'example': 'multiply(@color1, @color2);'
		},
		{
			'name': 'screen',
			'example': 'screen(@color1, @color2);'
		},
		{
			'name': 'overlay',
			'example': 'overlay(@color1, @color2);'
		},
		{
			'name': 'softlight',
			'example': 'softlight(@color1, @color2);'
		},
		{
			'name': 'hardlight',
			'example': 'hardlight(@color1, @color2);'
		},
		{
			'name': 'difference',
			'example': 'difference(@color1, @color2);'
		},
		{
			'name': 'exclusion',
			'example': 'exclusion(@color1, @color2);'
		},
		{
			'name': 'average',
			'example': 'average(@color1, @color2);'
		},
		{
			'name': 'negation',
			'example': 'negation(@color1, @color2);'
		}
	];


	constructor() {
		super('@');
	}

	private createFunctionProposals(proposals: { name: string; example: string; description?: string; }[], result: Modes.ISuggestion[]): Modes.ISuggestion[] {
		proposals.forEach((p) => {
			result.push({
				label: p.name,
				typeLabel: p.example,
				documentationLabel: p.description,
				codeSnippet: p.name + '({{}})',
				type: 'function'
			});
		});
		return result;
	}


	public getTermProposals(result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		this.createFunctionProposals(LESSIntellisense.builtInProposals, result);
		return super.getTermProposals(result);
	}

	protected getColorProposals(entry: languageFacts.IEntry, result: Modes.ISuggestion[]): Modes.ISuggestion[] {
		this.createFunctionProposals(LESSIntellisense.colorProposals, result);
		return super.getColorProposals(entry, result);
	}

}

