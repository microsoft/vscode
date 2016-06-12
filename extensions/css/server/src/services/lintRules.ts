/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nodes from '../parser/cssNodes';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

let Warning = 'warning';
let Error = 'error';
let Ignore = 'ignore';

export class Rule implements nodes.IRule {

	public constructor(public id: string, public message: string, public defaultValue: string) {
		// nothing to do
	}
}
export let Rules = {
	AllVendorPrefixes: new Rule('compatibleVendorPrefixes', localize('rule.vendorprefixes.all', "When using a vendor-specific prefix make sure to also include all other vendor-specific properties"), Ignore),
	IncludeStandardPropertyWhenUsingVendorPrefix: new Rule('vendorPrefix', localize('rule.standardvendorprefix.all', "When using a vendor-specific prefix also include the standard property"), Warning),
	DuplicateDeclarations: new Rule('duplicateProperties', localize('rule.duplicateDeclarations', "Do not use duplicate style definitions"), Ignore),
	EmptyRuleSet: new Rule('emptyRules', localize('rule.emptyRuleSets', "Do not use empty rulesets"), Warning),
	ImportStatemement: new Rule('importStatement', localize('rule.importDirective', "Import statements do not load in parallel"), Ignore),
	NoWidthOrHeightWhenPaddingOrBorder: new Rule('boxModel', localize('rule.withHeightAndBorderPadding', "Do not use width or height when using padding or border"), Ignore),
	UniversalSelector: new Rule('universalSelector', localize('rule.universalSelector', "The universal selector (*) is known to be slow"), Ignore),
	ZeroWithUnit: new Rule('zeroUnits', localize('rule.zeroWidthUnit', "No unit for zero needed"), Ignore),
	RequiredPropertiesForFontFace: new Rule('fontFaceProperties', localize('rule.fontFaceProperties', "@font-face rule must define 'src' and 'font-family' properties"), Warning),
	HexColorLength: new Rule('hexColorLength', localize('rule.hexColor', "Hex colors must consist of three or six hex numbers"), Error),
	ArgsInColorFunction: new Rule('argumentsInColorFunction', localize('rule.colorFunction', "Invalid number of parameters"), Error),
	UnknownProperty: new Rule('unknownProperties', localize('rule.unknownProperty', "Unknown property."), Warning),
	IEStarHack: new Rule('ieHack', localize('rule.ieHack', "IE hacks are only necessary when supporting IE7 and older"), Ignore),
	UnknownVendorSpecificProperty: new Rule('unknownVendorSpecificProperties', localize('rule.unknownVendorSpecificProperty', "Unknown vendor specific property."), Ignore),
	PropertyIgnoredDueToDisplay: new Rule('propertyIgnoredDueToDisplay', localize('rule.propertyIgnoredDueToDisplay', "Property is ignored due to the display. E.g. with 'display: inline', the width, height, margin-top, margin-bottom, and float properties have no effect"), Warning),
	AvoidImportant: new Rule('important', localize('rule.avoidImportant', "Avoid using !important. It is an indication that the specificity of the entire CSS has gotten out of control and needs to be refactored."), Ignore),
	AvoidFloat: new Rule('float', localize('rule.avoidFloat', "Avoid using 'float'. Floats lead to fragile CSS that is easy to break if one aspect of the layout changes."), Ignore),
	AvoidIdSelector: new Rule('idSelector', localize('rule.avoidIdSelector', "Selectors should not contain IDs because these rules are too tightly coupled with the HTML."), Ignore),
};

export interface ILintConfigurationSettings {
	[ruleId:string] : nodes.Level;
}

export function sanitize(conf:any): ILintConfigurationSettings {
	let settings: ILintConfigurationSettings = {};
	for (let ruleName in Rules) {
		let rule = Rules[ruleName];
		let level = toLevel(conf[rule.id]);
		if (level) {
			settings[rule.id] = level;
		}
	}
	return settings;
}

export function toLevel(level: string):nodes.Level {
	switch (level) {
		case 'ignore': return nodes.Level.Ignore;
		case 'warning': return nodes.Level.Warning;
		case 'error': return nodes.Level.Error;
	}
	return null;
}
