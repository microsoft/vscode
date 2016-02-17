/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IJSONSchema } from 'vs/base/common/jsonSchema';
import nodes = require('vs/languages/css/common/parser/cssNodes');
import nls = require('vs/nls');
import configurationRegistry = require('vs/platform/configuration/common/configurationRegistry');
import _level = require('vs/languages/css/common/level');

var Warning = 'warning';
var Error = 'error';
var Ignore = 'ignore';

export class Rule implements nodes.IRule {

	public constructor(public id: string, public message: string, public defaultValue: string) {
		// nothing to do
	}

	public getConfiguration(): IJSONSchema {
		return {
			type: 'string',
			enum: [Ignore, Warning, Error],
			default: this.defaultValue,
			description: this.message
		};
	}

}
export var Rules = {
	AllVendorPrefixes: new Rule('compatibleVendorPrefixes', nls.localize('rule.vendorprefixes.all', "When using a vendor-specific prefix make sure to also include all other vendor-specific properties"), Ignore),
	IncludeStandardPropertyWhenUsingVendorPrefix: new Rule('vendorPrefix', nls.localize('rule.standardvendorprefix.all', "When using a vendor-specific prefix also include the standard property"), Warning),
	DuplicateDeclarations: new Rule('duplicateProperties', nls.localize('rule.duplicateDeclarations', "Do not use duplicate style definitions"), Ignore),
	EmptyRuleSet: new Rule('emptyRules', nls.localize('rule.emptyRuleSets', "Do not use empty rulesets"), Warning),
	ImportStatemement: new Rule('importStatement', nls.localize('rule.importDirective', "Import statements do not load in parallel"), Ignore),
	NoWidthOrHeightWhenPaddingOrBorder: new Rule('boxModel', nls.localize('rule.withHeightAndBorderPadding', "Do not use width or height when using padding or border"), Ignore),
	UniversalSelector: new Rule('universalSelector', nls.localize('rule.universalSelector', "The universal selector (*) is known to be slow"), Ignore),
	ZeroWithUnit: new Rule('zeroUnits', nls.localize('rule.zeroWidthUnit', "No unit for zero needed"), Ignore),
	RequiredPropertiesForFontFace: new Rule('fontFaceProperties', nls.localize('rule.fontFaceProperties', "@font-face rule must define 'src' and 'font-family' properties"), Warning),
	HexColorLength: new Rule('hexColorLength', nls.localize('rule.hexColor', "Hex colors must consist of three or six hex numbers"), Error),
	ArgsInColorFunction: new Rule('argumentsInColorFunction', nls.localize('rule.colorFunction', "Invalid number of parameters"), Error),
	UnknownProperty: new Rule('unknownProperties', nls.localize('rule.unknownProperty', "Unknown property."), Warning),
	IEStarHack: new Rule('ieHack', nls.localize('rule.ieHack', "IE hacks are only necessary when supporting IE7 and older"), Ignore),
	UnknownVendorSpecificProperty: new Rule('unknownVendorSpecificProperties', nls.localize('rule.unknownVendorSpecificProperty', "Unknown vendor specific property."), Ignore),
	PropertyIgnoredDueToDisplay: new Rule('propertyIgnoredDueToDisplay', nls.localize('rule.propertyIgnoredDueToDisplay', "Property is ignored due to the display. E.g. with 'display: inline', the width, height, margin-top, margin-bottom, and float properties have no effect"), Warning),
	AvoidImportant: new Rule('important', nls.localize('rule.avoidImportant', "Avoid using !important. It is an indication that the specificity of the entire CSS has gotten out of control and needs to be refactored."), Ignore),
	AvoidFloat: new Rule('float', nls.localize('rule.avoidFloat', "Avoid using 'float'. Floats lead to fragile CSS that is easy to break if one aspect of the layout changes."), Ignore),
	AvoidIdSelector: new Rule('idSelector', nls.localize('rule.avoidIdSelector', "Selectors should not contain IDs because these rules are too tightly coupled with the HTML."), Ignore),
};

export function getConfigurationProperties(keyPrefix: string): { [path:string]:configurationRegistry.IConfigurationNode } {
	var properties: { [path:string]:configurationRegistry.IConfigurationNode; } = {};

	properties[keyPrefix + '.validate'] = {
		type: 'boolean',
		default: true,
		description: nls.localize('enableValidation', 'Enables or disables all validations')
	};
	for (var ruleName in Rules) {
		var rule = Rules[ruleName];
		properties[keyPrefix + '.lint.' + rule.id] = rule.getConfiguration();
	}
	return properties;
}

export interface IConfigurationSettings {
	[ruleId:string] : _level.Level;
}

export function sanitize(conf:any): IConfigurationSettings {
	var settings: IConfigurationSettings = {};
	for (var ruleName in Rules) {
		var rule = Rules[ruleName];
		var level = _level.toLevel(conf[rule.id]);
		if (level) {
			settings[rule.id] = level;
		}
	}
	return settings;
}

/* old rules
		'duplicate-background-images' : {
			'type': 'string',
			'enum': ['ignore', 'warning', 'error'],
			'default': 'ignore',
			'description': nls.localize('duplicateBackgroundImages', "Every background-image should be unique. Use a common class for e.g. sprites.")
		},
		'gradients' : {
			'type': 'string',
			'enum': ['ignore', 'warning', 'error'],
			'default': 'warning',
			'description': nls.localize('gradients', "When using a vendor-prefixed gradient, make sure to use them all.")
		},
		'outline-none' : {
			'type': 'string',
			'enum': ['ignore', 'warning', 'error'],
			'default': 'warning',
			'description': nls.localize('outlineNone', "Use of outline: none or outline: 0 should be limited to :focus rules.")
		},
		'overqualified-elements' : {
			'type': 'string',
			'enum': ['ignore', 'warning', 'error'],
			'default': 'ignore',
			'description': nls.localize('overqualifiedElements', "Don't use classes or IDs with elements (a.foo or a#foo).")
		},
		'qualified-headings' : {
			'type': 'string',
			'enum': ['ignore', 'warning', 'error'],
			'default': 'ignore',
			'description': nls.localize('qualifiedHeadings', "Headings should not be qualified (namespaced).")
		},
		'regex-selectors' : {
			'type': 'string',
			'enum': ['ignore', 'warning', 'error'],
			'default': 'ignore',
			'description': nls.localize('regexSelectors', "Selectors that look like regular expressions are slow and should be avoided.")
		},
		'shorthand' : {
			'type': 'string',
			'enum': ['ignore', 'warning', 'error'],
			'default': 'ignore',
			'description': nls.localize('shorthand', "Use shorthand properties where possible.")
		},
		'text-indent' : {
			'type': 'string',
			'enum': ['ignore', 'warning', 'error'],
			'default': 'ignore',
			'description': nls.localize('textIndent', "Checks for text indent less than -99px.")
		},
		'unique-headings' : {
			'type': 'string',
			'enum': ['ignore', 'warning', 'error'],
			'default': 'ignore',
			'description': nls.localize('uniqueHeadings', "Headings should be defined only once.")
		},

		'unqualified-attributes' : {
			'type': 'string',
			'enum': ['ignore', 'warning', 'error'],
			'default': 'ignore',
			'description': nls.localize('unqualifiedAttributes', "Unqualified attribute selectors are known to be slow.")
		},
		*/

