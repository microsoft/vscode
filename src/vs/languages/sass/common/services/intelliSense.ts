/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import languageFacts = require('vs/languages/css/common/services/languageFacts');
import Modes = require('vs/editor/common/modes');
import cssIntellisense = require('vs/languages/css/common/services/intelliSense');
import nls = require('vs/nls');
import nodes = require('vs/languages/css/common/parser/cssNodes');

export class SASSIntellisense extends cssIntellisense.CSSIntellisense {

	private static variableDefaults: { [key: string]: string; } = {
		'$red': '1',
		'$green': '2',
		'$blue': '3',
		'$alpha': '1.0',
		'$color': '$color',
		'$weight': '0.5',
		'$hue': '0',
		'$saturation': '0%',
		'$lightness': '0%',
		'$degrees': '0',
		'$amount': '0',
		'$string': '""',
		'$substring': '"s"',
		'$number': '0',
		'$limit': '1'
	};

	private static colorProposals = [
		{ func: 'red($color)', desc: nls.localize('sass.builtin.red', 'Gets the red component of a color.') },
		{ func: 'green($color)', desc: nls.localize('sass.builtin.green', 'Gets the green component of a color.') },
		{ func: 'blue($color)', desc: nls.localize('sass.builtin.blue', 'Gets the blue component of a color.') },
		{ func: 'mix($color, $color, [$weight])', desc: nls.localize('sass.builtin.mix', 'Mixes two colors together.') },
		{ func: 'hue($color)', desc: nls.localize('sass.builtin.hue', 'Gets the hue component of a color.') },
		{ func: 'saturation($color)', desc: nls.localize('sass.builtin.saturation', 'Gets the saturation component of a color.') },
		{ func: 'lightness($color)', desc: nls.localize('sass.builtin.lightness', 'Gets the lightness component of a color.') },
		{ func: 'adjust-hue($color, $degrees)', desc: nls.localize('sass.builtin.adjust-hue', 'Changes the hue of a color.') },
		{ func: 'lighten($color, $amount)', desc: nls.localize('sass.builtin.lighten', 'Makes a color lighter.') },
		{ func: 'darken($color, $amount)', desc: nls.localize('sass.builtin.darken', 'Makes a color darker.') },
		{ func: 'saturate($color, $amount)', desc: nls.localize('sass.builtin.saturate', 'Makes a color more saturated.') },
		{ func: 'desaturate($color, $amount)', desc: nls.localize('sass.builtin.desaturate', 'Makes a color less saturated.') },
		{ func: 'grayscale($color)', desc: nls.localize('sass.builtin.grayscale', 'Converts a color to grayscale.') },
		{ func: 'complement($color)', desc: nls.localize('sass.builtin.complement', 'Returns the complement of a color.') },
		{ func: 'invert($color)', desc: nls.localize('sass.builtin.invert', 'Returns the inverse of a color.') },
		{ func: 'alpha($color)', desc: nls.localize('sass.builtin.alpha', 'Gets the opacity component of a color.') },
		{ func: 'opacity($color)', desc: 'Gets the alpha component (opacity) of a color.' },
		{ func: 'rgba($color, $alpha)', desc: nls.localize('sass.builtin.rgba', 'Changes the alpha component for a color.') },
		{ func: 'opacify($color, $amount)', desc: nls.localize('sass.builtin.opacify', 'Makes a color more opaque.') },
		{ func: 'fade-in($color, $amount)', desc: nls.localize('sass.builtin.fade-in', 'Makes a color more opaque.') },
		{ func: 'transparentize($color, $amount) / fade-out($color, $amount)', desc: nls.localize('sass.builtin.transparentize', 'Makes a color more transparent.') },
		{ func: 'adjust-color($color, [$red], [$green], [$blue], [$hue], [$saturation], [$lightness], [$alpha])', desc: nls.localize('sass.builtin.adjust-color', 'Increases or decreases one or more components of a color.') },
		{ func: 'scale-color($color, [$red], [$green], [$blue], [$saturation], [$lightness], [$alpha])', desc: nls.localize('sass.builtin.scale-color', 'Fluidly scales one or more properties of a color.') },
		{ func: 'change-color($color, [$red], [$green], [$blue], [$hue], [$saturation], [$lightness], [$alpha])', desc: nls.localize('sass.builtin.change-color', 'Changes one or more properties of a color.') },
		{ func: 'ie-hex-str($color)', desc: nls.localize('sass.builtin.ie-hex-str', 'Converts a color into the format understood by IE filters.') }
	];

	private static selectorFuncs = [
		{ func: 'selector-nest($selectors…)', desc: nls.localize('sass.builtin.selector-nest', 'Nests selector beneath one another like they would be nested in the stylesheet.') },
		{ func: 'selector-append($selectors…)', desc: nls.localize('sass.builtin.selector-append', 'Appends selectors to one another without spaces in between.') },
		{ func: 'selector-extend($selector, $extendee, $extender)', desc: nls.localize('sass.builtin.selector-extend', 'Extends $extendee with $extender within $selector.') },
		{ func: 'selector-replace($selector, $original, $replacement)', desc: nls.localize('sass.builtin.selector-replace', 'Replaces $original with $replacement within $selector.') },
		{ func: 'selector-unify($selector1, $selector2)', desc: nls.localize('sass.builtin.selector-unify', 'Unifies two selectors to produce a selector that matches elements matched by both.') },
		{ func: 'is-superselector($super, $sub)', desc: nls.localize('sass.builtin.is-superselector', 'Returns whether $super matches all the elements $sub does, and possibly more.') },
		{ func: 'simple-selectors($selector)', desc: nls.localize('sass.builtin.simple-selectors', 'Returns the simple selectors that comprise a compound selector.') },
		{ func: 'selector-parse($selector)', desc: nls.localize('sass.builtin.selector-parse', 'Parses a selector into the format returned by &.') }
	];

	private static builtInFuncs = [
		{ func: 'unquote($string)', desc: nls.localize('sass.builtin.unquote', 'Removes quotes from a string.') },
		{ func: 'quote($string)', desc: nls.localize('sass.builtin.quote', 'Adds quotes to a string.') },
		{ func: 'str-length($string)', desc: nls.localize('sass.builtin.str-length', 'Returns the number of characters in a string.') },
		{ func: 'str-insert($string, $insert, $index)', desc: nls.localize('sass.builtin.str-insert', 'Inserts $insert into $string at $index.') },
		{ func: 'str-index($string, $substring)', desc: nls.localize('sass.builtin.str-index', 'Returns the index of the first occurance of $substring in $string.') },
		{ func: 'str-slice($string, $start-at, [$end-at])', desc: nls.localize('sass.builtin.str-slice', 'Extracts a substring from $string.') },
		{ func: 'to-upper-case($string)', desc: nls.localize('sass.builtin.to-upper-case', 'Converts a string to upper case.') },
		{ func: 'to-lower-case($string)', desc: nls.localize('sass.builtin.to-lower-case', 'Converts a string to lower case.') },
		{ func: 'percentage($number)', desc: nls.localize('sass.builtin.percentage', 'Converts a unitless number to a percentage.') },
		{ func: 'round($number)', desc: nls.localize('sass.builtin.round', 'Rounds a number to the nearest whole number.') },
		{ func: 'ceil($number)', desc: nls.localize('sass.builtin.ceil', 'Rounds a number up to the next whole number.') },
		{ func: 'floor($number)', desc: nls.localize('sass.builtin.floor', 'Rounds a number down to the previous whole number.') },
		{ func: 'abs($number)', desc: nls.localize('sass.builtin.abs', 'Returns the absolute value of a number.') },
		{ func: 'min($numbers)', desc: nls.localize('sass.builtin.min', 'Finds the minimum of several numbers.') },
		{ func: 'max($numbers)', desc: nls.localize('sass.builtin.max', 'Finds the maximum of several numbers.') },
		{ func: 'random([$limit])', desc: nls.localize('sass.builtin.random', 'Returns a random number.') },
		{ func: 'length($list)', desc: nls.localize('sass.builtin.length', 'Returns the length of a list.') },
		{ func: 'nth($list, $n)', desc: nls.localize('sass.builtin.nth', 'Returns a specific item in a list.') },
		{ func: 'set-nth($list, $n, $value)', desc: nls.localize('sass.builtin.set-nth', 'Replaces the nth item in a list.') },
		{ func: 'join($list1, $list2, [$separator])', desc: nls.localize('sass.builtin.join', 'Joins together two lists into one.') },
		{ func: 'append($list1, $val, [$separator])', desc: nls.localize('sass.builtin.append', 'Appends a single value onto the end of a list.') },
		{ func: 'zip($lists)', desc: nls.localize('sass.builtin.zip', 'Combines several lists into a single multidimensional list.') },
		{ func: 'index($list, $value)', desc: nls.localize('sass.builtin.index', 'Returns the position of a value within a list.') },
		{ func: 'list-separator(#list)', desc: nls.localize('sass.builtin.list-separator', 'Returns the separator of a list.') },
		{ func: 'map-get($map, $key)', desc: nls.localize('sass.builtin.map-get', 'Returns the value in a map associated with a given key.') },
		{ func: 'map-merge($map1, $map2)', desc: nls.localize('sass.builtin.map-merge', 'Merges two maps together into a new map.') },
		{ func: 'map-remove($map, $keys)', desc: nls.localize('sass.builtin.map-remove', 'Returns a new map with keys removed.') },
		{ func: 'map-keys($map)', desc: nls.localize('sass.builtin.map-keys', 'Returns a list of all keys in a map.') },
		{ func: 'map-values($map)', desc: nls.localize('sass.builtin.map-values', 'Returns a list of all values in a map.') },
		{ func: 'map-has-key($map, $key)', desc: nls.localize('sass.builtin.map-has-key', 'Returns whether a map has a value associated with a given key.') },
		{ func: 'keywords($args)', desc: nls.localize('sass.builtin.keywords', 'Returns the keywords passed to a function that takes variable arguments.') },
		{ func: 'feature-exists($feature)', desc: nls.localize('sass.builtin.feature-exists', 'Returns whether a feature exists in the current Sass runtime.') },
		{ func: 'variable-exists($name)', desc: nls.localize('sass.builtin.variable-exists', 'Returns whether a variable with the given name exists in the current scope.') },
		{ func: 'global-variable-exists($name)', desc: nls.localize('sass.builtin.global-variable-exists', 'Returns whether a variable with the given name exists in the global scope.') },
		{ func: 'function-exists($name)', desc: nls.localize('sass.builtin.function-exists', 'Returns whether a function with the given name exists.') },
		{ func: 'mixin-exists($name)', desc: nls.localize('sass.builtin.mixin-exists', 'Returns whether a mixin with the given name exists.') },
		{ func: 'inspect($value)', desc: nls.localize('sass.builtin.inspect', 'Returns the string representation of a value as it would be represented in Sass.') },
		{ func: 'type-of($value)', desc: nls.localize('sass.builtin.type-of', 'Returns the type of a value.') },
		{ func: 'unit($number)', desc: nls.localize('sass.builtin.unit', 'Returns the unit(s) associated with a number.') },
		{ func: 'unitless($number)', desc: nls.localize('sass.builtin.unitless', 'Returns whether a number has units.') },
		{ func: 'comparable($number1, $number2)', desc: nls.localize('sass.builtin.comparable', 'Returns whether two numbers can be added, subtracted, or compared.') },
		{ func: 'call($name, $args…)', desc: nls.localize('sass.builtin.call', 'Dynamically calls a Sass function.') }
	];

	constructor() {
		super('$');
	}

	private createFunctionProposals(proposals: {func: string; desc: string; }[], result: Modes.ISuggestion[]): Modes.ISuggestion[] {
		var replaceFunction = (match: string, p1: string) => p1 + ': {{' + (SASSIntellisense.variableDefaults[p1] || '') + '}}';
		proposals.forEach((p) => {
			result.push({
				label: p.func.substr(0, p.func.indexOf('(')),
				typeLabel: p.func,
				documentationLabel: p.desc,
				codeSnippet: p.func.replace(/\[?(\$\w+)\]?/g, replaceFunction),
				type: 'function'
			});
		});
		return result;
	}

	public getCompletionsForSelector(ruleSet: nodes.RuleSet, result:Modes.ISuggestion[]): Modes.ISuggestion[] {
		this.createFunctionProposals(SASSIntellisense.selectorFuncs, result);
		return super.getCompletionsForSelector(ruleSet, result);
	}

	public getTermProposals(result:Modes.ISuggestion[]):Modes.ISuggestion[] {
		this.createFunctionProposals(SASSIntellisense.builtInFuncs, result);
		return super.getTermProposals(result);
	}

	protected getColorProposals(entry: languageFacts.IEntry, result: Modes.ISuggestion[]): Modes.ISuggestion[] {
		this.createFunctionProposals(SASSIntellisense.colorProposals, result);
		return super.getColorProposals(entry, result);
	}

	public getCompletionsForDeclarationProperty(result: Modes.ISuggestion[]): Modes.ISuggestion[]{
		this.getCompletionsForSelector(null, result);
		return super.getCompletionsForDeclarationProperty(result);
	}

}

