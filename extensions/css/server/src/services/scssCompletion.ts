/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as languageFacts from './languageFacts';
import {CSSCompletion} from './cssCompletion';
import * as nodes from '../parser/cssNodes';
import {CompletionList, CompletionItemKind} from 'vscode-languageserver';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export class SCSSCompletion extends CSSCompletion {

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
		{ func: 'red($color)', desc: localize('scss.builtin.red', 'Gets the red component of a color.') },
		{ func: 'green($color)', desc: localize('scss.builtin.green', 'Gets the green component of a color.') },
		{ func: 'blue($color)', desc: localize('scss.builtin.blue', 'Gets the blue component of a color.') },
		{ func: 'mix($color, $color, [$weight])', desc: localize('scss.builtin.mix', 'Mixes two colors together.') },
		{ func: 'hue($color)', desc: localize('scss.builtin.hue', 'Gets the hue component of a color.') },
		{ func: 'saturation($color)', desc: localize('scss.builtin.saturation', 'Gets the saturation component of a color.') },
		{ func: 'lightness($color)', desc: localize('scss.builtin.lightness', 'Gets the lightness component of a color.') },
		{ func: 'adjust-hue($color, $degrees)', desc: localize('scss.builtin.adjust-hue', 'Changes the hue of a color.') },
		{ func: 'lighten($color, $amount)', desc: localize('scss.builtin.lighten', 'Makes a color lighter.') },
		{ func: 'darken($color, $amount)', desc: localize('scss.builtin.darken', 'Makes a color darker.') },
		{ func: 'saturate($color, $amount)', desc: localize('scss.builtin.saturate', 'Makes a color more saturated.') },
		{ func: 'desaturate($color, $amount)', desc: localize('scss.builtin.desaturate', 'Makes a color less saturated.') },
		{ func: 'grayscale($color)', desc: localize('scss.builtin.grayscale', 'Converts a color to grayscale.') },
		{ func: 'complement($color)', desc: localize('scss.builtin.complement', 'Returns the complement of a color.') },
		{ func: 'invert($color)', desc: localize('scss.builtin.invert', 'Returns the inverse of a color.') },
		{ func: 'alpha($color)', desc: localize('scss.builtin.alpha', 'Gets the opacity component of a color.') },
		{ func: 'opacity($color)', desc: 'Gets the alpha component (opacity) of a color.' },
		{ func: 'rgba($color, $alpha)', desc: localize('scss.builtin.rgba', 'Changes the alpha component for a color.') },
		{ func: 'opacify($color, $amount)', desc: localize('scss.builtin.opacify', 'Makes a color more opaque.') },
		{ func: 'fade-in($color, $amount)', desc: localize('scss.builtin.fade-in', 'Makes a color more opaque.') },
		{ func: 'transparentize($color, $amount) / fade-out($color, $amount)', desc: localize('scss.builtin.transparentize', 'Makes a color more transparent.') },
		{ func: 'adjust-color($color, [$red], [$green], [$blue], [$hue], [$saturation], [$lightness], [$alpha])', desc: localize('scss.builtin.adjust-color', 'Increases or decreases one or more components of a color.') },
		{ func: 'scale-color($color, [$red], [$green], [$blue], [$saturation], [$lightness], [$alpha])', desc: localize('scss.builtin.scale-color', 'Fluidly scales one or more properties of a color.') },
		{ func: 'change-color($color, [$red], [$green], [$blue], [$hue], [$saturation], [$lightness], [$alpha])', desc: localize('scss.builtin.change-color', 'Changes one or more properties of a color.') },
		{ func: 'ie-hex-str($color)', desc: localize('scss.builtin.ie-hex-str', 'Converts a color into the format understood by IE filters.') }
	];

	private static selectorFuncs = [
		{ func: 'selector-nest($selectors…)', desc: localize('scss.builtin.selector-nest', 'Nests selector beneath one another like they would be nested in the stylesheet.') },
		{ func: 'selector-append($selectors…)', desc: localize('scss.builtin.selector-append', 'Appends selectors to one another without spaces in between.') },
		{ func: 'selector-extend($selector, $extendee, $extender)', desc: localize('scss.builtin.selector-extend', 'Extends $extendee with $extender within $selector.') },
		{ func: 'selector-replace($selector, $original, $replacement)', desc: localize('scss.builtin.selector-replace', 'Replaces $original with $replacement within $selector.') },
		{ func: 'selector-unify($selector1, $selector2)', desc: localize('scss.builtin.selector-unify', 'Unifies two selectors to produce a selector that matches elements matched by both.') },
		{ func: 'is-superselector($super, $sub)', desc: localize('scss.builtin.is-superselector', 'Returns whether $super matches all the elements $sub does, and possibly more.') },
		{ func: 'simple-selectors($selector)', desc: localize('scss.builtin.simple-selectors', 'Returns the simple selectors that comprise a compound selector.') },
		{ func: 'selector-parse($selector)', desc: localize('scss.builtin.selector-parse', 'Parses a selector into the format returned by &.') }
	];

	private static builtInFuncs = [
		{ func: 'unquote($string)', desc: localize('scss.builtin.unquote', 'Removes quotes from a string.') },
		{ func: 'quote($string)', desc: localize('scss.builtin.quote', 'Adds quotes to a string.') },
		{ func: 'str-length($string)', desc: localize('scss.builtin.str-length', 'Returns the number of characters in a string.') },
		{ func: 'str-insert($string, $insert, $index)', desc: localize('scss.builtin.str-insert', 'Inserts $insert into $string at $index.') },
		{ func: 'str-index($string, $substring)', desc: localize('scss.builtin.str-index', 'Returns the index of the first occurance of $substring in $string.') },
		{ func: 'str-slice($string, $start-at, [$end-at])', desc: localize('scss.builtin.str-slice', 'Extracts a substring from $string.') },
		{ func: 'to-upper-case($string)', desc: localize('scss.builtin.to-upper-case', 'Converts a string to upper case.') },
		{ func: 'to-lower-case($string)', desc: localize('scss.builtin.to-lower-case', 'Converts a string to lower case.') },
		{ func: 'percentage($number)', desc: localize('scss.builtin.percentage', 'Converts a unitless number to a percentage.') },
		{ func: 'round($number)', desc: localize('scss.builtin.round', 'Rounds a number to the nearest whole number.') },
		{ func: 'ceil($number)', desc: localize('scss.builtin.ceil', 'Rounds a number up to the next whole number.') },
		{ func: 'floor($number)', desc: localize('scss.builtin.floor', 'Rounds a number down to the previous whole number.') },
		{ func: 'abs($number)', desc: localize('scss.builtin.abs', 'Returns the absolute value of a number.') },
		{ func: 'min($numbers)', desc: localize('scss.builtin.min', 'Finds the minimum of several numbers.') },
		{ func: 'max($numbers)', desc: localize('scss.builtin.max', 'Finds the maximum of several numbers.') },
		{ func: 'random([$limit])', desc: localize('scss.builtin.random', 'Returns a random number.') },
		{ func: 'length($list)', desc: localize('scss.builtin.length', 'Returns the length of a list.') },
		{ func: 'nth($list, $n)', desc: localize('scss.builtin.nth', 'Returns a specific item in a list.') },
		{ func: 'set-nth($list, $n, $value)', desc: localize('scss.builtin.set-nth', 'Replaces the nth item in a list.') },
		{ func: 'join($list1, $list2, [$separator])', desc: localize('scss.builtin.join', 'Joins together two lists into one.') },
		{ func: 'append($list1, $val, [$separator])', desc: localize('scss.builtin.append', 'Appends a single value onto the end of a list.') },
		{ func: 'zip($lists)', desc: localize('scss.builtin.zip', 'Combines several lists into a single multidimensional list.') },
		{ func: 'index($list, $value)', desc: localize('scss.builtin.index', 'Returns the position of a value within a list.') },
		{ func: 'list-separator(#list)', desc: localize('scss.builtin.list-separator', 'Returns the separator of a list.') },
		{ func: 'map-get($map, $key)', desc: localize('scss.builtin.map-get', 'Returns the value in a map associated with a given key.') },
		{ func: 'map-merge($map1, $map2)', desc: localize('scss.builtin.map-merge', 'Merges two maps together into a new map.') },
		{ func: 'map-remove($map, $keys)', desc: localize('scss.builtin.map-remove', 'Returns a new map with keys removed.') },
		{ func: 'map-keys($map)', desc: localize('scss.builtin.map-keys', 'Returns a list of all keys in a map.') },
		{ func: 'map-values($map)', desc: localize('scss.builtin.map-values', 'Returns a list of all values in a map.') },
		{ func: 'map-has-key($map, $key)', desc: localize('scss.builtin.map-has-key', 'Returns whether a map has a value associated with a given key.') },
		{ func: 'keywords($args)', desc: localize('scss.builtin.keywords', 'Returns the keywords passed to a function that takes variable arguments.') },
		{ func: 'feature-exists($feature)', desc: localize('scss.builtin.feature-exists', 'Returns whether a feature exists in the current Sass runtime.') },
		{ func: 'variable-exists($name)', desc: localize('scss.builtin.variable-exists', 'Returns whether a variable with the given name exists in the current scope.') },
		{ func: 'global-variable-exists($name)', desc: localize('scss.builtin.global-variable-exists', 'Returns whether a variable with the given name exists in the global scope.') },
		{ func: 'function-exists($name)', desc: localize('scss.builtin.function-exists', 'Returns whether a function with the given name exists.') },
		{ func: 'mixin-exists($name)', desc: localize('scss.builtin.mixin-exists', 'Returns whether a mixin with the given name exists.') },
		{ func: 'inspect($value)', desc: localize('scss.builtin.inspect', 'Returns the string representation of a value as it would be represented in Sass.') },
		{ func: 'type-of($value)', desc: localize('scss.builtin.type-of', 'Returns the type of a value.') },
		{ func: 'unit($number)', desc: localize('scss.builtin.unit', 'Returns the unit(s) associated with a number.') },
		{ func: 'unitless($number)', desc: localize('scss.builtin.unitless', 'Returns whether a number has units.') },
		{ func: 'comparable($number1, $number2)', desc: localize('scss.builtin.comparable', 'Returns whether two numbers can be added, subtracted, or compared.') },
		{ func: 'call($name, $args…)', desc: localize('scss.builtin.call', 'Dynamically calls a Sass function.') }
	];

	constructor() {
		super('$');
	}

	private createFunctionProposals(proposals: {func: string; desc: string; }[], result: CompletionList): CompletionList {
		let replaceFunction = (match: string, p1: string) => p1 + ': {{' + (SCSSCompletion.variableDefaults[p1] || '') + '}}';
		proposals.forEach((p) => {
			result.items.push({
				label: p.func.substr(0, p.func.indexOf('(')),
				detail: p.func,
				documentation: p.desc,
				insertText: p.func.replace(/\[?(\$\w+)\]?/g, replaceFunction),
				kind: CompletionItemKind.Function
			});
		});
		return result;
	}

	public getCompletionsForSelector(ruleSet: nodes.RuleSet, result: CompletionList): CompletionList {
		this.createFunctionProposals(SCSSCompletion.selectorFuncs, result);
		return super.getCompletionsForSelector(ruleSet, result);
	}

	public getTermProposals(result: CompletionList): CompletionList {
		this.createFunctionProposals(SCSSCompletion.builtInFuncs, result);
		return super.getTermProposals(result);
	}

	protected getColorProposals(entry: languageFacts.IEntry, result: CompletionList): CompletionList {
		this.createFunctionProposals(SCSSCompletion.colorProposals, result);
		return super.getColorProposals(entry, result);
	}

	public getCompletionsForDeclarationProperty(result: CompletionList): CompletionList {
		this.getCompletionsForSelector(null, result);
		return super.getCompletionsForDeclarationProperty(result);
	}

}

