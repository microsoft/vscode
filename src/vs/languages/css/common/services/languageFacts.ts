/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nodes = require('vs/languages/css/common/parser/cssNodes');
import browsers = require('vs/languages/css/common/services/browsers');
import strings = require('vs/base/common/strings');

export var colors : { [name:string]:string } = {
	aliceblue: '#f0f8ff',
	antiquewhite: '#faebd7',
	aqua: '#00ffff',
	aquamarine: '#7fffd4',
	azure: '#f0ffff',
	beige: '#f5f5dc',
	bisque: '#ffe4c4',
	black: '#000000',
	blanchedalmond: '#ffebcd',
	blue: '#0000ff',
	blueviolet: '#8a2be2',
	brown: '#a52a2a',
	burlywood: '#deb887',
	cadetblue: '#5f9ea0',
	chartreuse: '#7fff00',
	chocolate: '#d2691e',
	coral: '#ff7f50',
	cornflowerblue: '#6495ed',
	cornsilk: '#fff8dc',
	crimson: '#dc143c',
	cyan: '#00ffff',
	darkblue: '#00008b',
	darkcyan: '#008b8b',
	darkgoldenrod: '#b8860b',
	darkgray: '#a9a9a9',
	darkgrey: '#a9a9a9',
	darkgreen: '#006400',
	darkkhaki: '#bdb76b',
	darkmagenta: '#8b008b',
	darkolivegreen: '#556b2f',
	darkorange: '#ff8c00',
	darkorchid: '#9932cc',
	darkred: '#8b0000',
	darksalmon: '#e9967a',
	darkseagreen: '#8fbc8f',
	darkslateblue: '#483d8b',
	darkslategray: '#2f4f4f',
	darkslategrey: '#2f4f4f',
	darkturquoise: '#00ced1',
	darkviolet: '#9400d3',
	deeppink: '#ff1493',
	deepskyblue: '#00bfff',
	dimgray: '#696969',
	dimgrey: '#696969',
	dodgerblue: '#1e90ff',
	firebrick: '#b22222',
	floralwhite: '#fffaf0',
	forestgreen: '#228b22',
	fuchsia: '#ff00ff',
	gainsboro: '#dcdcdc',
	ghostwhite: '#f8f8ff',
	gold: '#ffd700',
	goldenrod: '#daa520',
	gray: '#808080',
	grey: '#808080',
	green: '#008000',
	greenyellow: '#adff2f',
	honeydew: '#f0fff0',
	hotpink: '#ff69b4',
	indianred: '#cd5c5c',
	indigo: '#4b0082',
	ivory: '#fffff0',
	khaki: '#f0e68c',
	lavender: '#e6e6fa',
	lavenderblush: '#fff0f5',
	lawngreen: '#7cfc00',
	lemonchiffon: '#fffacd',
	lightblue: '#add8e6',
	lightcoral: '#f08080',
	lightcyan: '#e0ffff',
	lightgoldenrodyellow: '#fafad2',
	lightgray: '#d3d3d3',
	lightgrey: '#d3d3d3',
	lightgreen: '#90ee90',
	lightpink: '#ffb6c1',
	lightsalmon: '#ffa07a',
	lightseagreen: '#20b2aa',
	lightskyblue: '#87cefa',
	lightslategray: '#778899',
	lightslategrey: '#778899',
	lightsteelblue: '#b0c4de',
	lightyellow: '#ffffe0',
	lime: '#00ff00',
	limegreen: '#32cd32',
	linen: '#faf0e6',
	magenta: '#ff00ff',
	maroon: '#800000',
	mediumaquamarine: '#66cdaa',
	mediumblue: '#0000cd',
	mediumorchid: '#ba55d3',
	mediumpurple: '#9370d8',
	mediumseagreen: '#3cb371',
	mediumslateblue: '#7b68ee',
	mediumspringgreen: '#00fa9a',
	mediumturquoise: '#48d1cc',
	mediumvioletred: '#c71585',
	midnightblue: '#191970',
	mintcream: '#f5fffa',
	mistyrose: '#ffe4e1',
	moccasin: '#ffe4b5',
	navajowhite: '#ffdead',
	navy: '#000080',
	oldlace: '#fdf5e6',
	olive: '#808000',
	olivedrab: '#6b8e23',
	orange: '#ffa500',
	orangered: '#ff4500',
	orchid: '#da70d6',
	palegoldenrod: '#eee8aa',
	palegreen: '#98fb98',
	paleturquoise: '#afeeee',
	palevioletred: '#d87093',
	papayawhip: '#ffefd5',
	peachpuff: '#ffdab9',
	peru: '#cd853f',
	pink: '#ffc0cb',
	plum: '#dda0dd',
	powderblue: '#b0e0e6',
	purple: '#800080',
	red: '#ff0000',
	rebeccapurple: '#663399',
	rosybrown: '#bc8f8f',
	royalblue: '#4169e1',
	saddlebrown: '#8b4513',
	salmon: '#fa8072',
	sandybrown: '#f4a460',
	seagreen: '#2e8b57',
	seashell: '#fff5ee',
	sienna: '#a0522d',
	silver: '#c0c0c0',
	skyblue: '#87ceeb',
	slateblue: '#6a5acd',
	slategray: '#708090',
	slategrey: '#708090',
	snow: '#fffafa',
	springgreen: '#00ff7f',
	steelblue: '#4682b4',
	tan: '#d2b48c',
	teal: '#008080',
	thistle: '#d8bfd8',
	tomato: '#ff6347',
	turquoise: '#40e0d0',
	violet: '#ee82ee',
	wheat: '#f5deb3',
	white: '#ffffff',
	whitesmoke: '#f5f5f5',
	yellow: '#ffff00',
	yellowgreen: '#9acd32'
};

export var colorKeywords : { [name:string]:string } = {
	'ActiveBorder': 'Active window border.',
	'ActiveCaption': 'Active window caption.',
	'AppWorkspace': 'Background color of multiple document interface.',
	'Background': 'Desktop background.',
	'ButtonFace': 'The face background color for 3-D elements that appear 3-D due to one layer of surrounding border.',
	'ButtonHighlight': 'The color of the border facing the light source for 3-D elements that appear 3-D due to one layer of surrounding border.',
	'ButtonShadow': 'The color of the border away from the light source for 3-D elements that appear 3-D due to one layer of surrounding border.',
	'ButtonText': 'Text on push buttons.',
	'CaptionText': 'Text in caption, size box, and scrollbar arrow box.',
	'currentColor': 'The value of the \'color\' property. The computed value of the \'currentColor\' keyword is the computed value of the \'color\' property. If the \'currentColor\' keyword is set on the \'color\' property itself, it is treated as \'color:inherit\' at parse time.',
	'GrayText': 'Grayed (disabled) text. This color is set to #000 if the current display driver does not support a solid gray color.',
	'Highlight': 'Item(s) selected in a control.',
	'HighlightText': 'Text of item(s) selected in a control.',
	'InactiveBorder': 'Inactive window border.',
	'InactiveCaption': 'Inactive window caption.',
	'InactiveCaptionText': 'Color of text in an inactive caption.',
	'InfoBackground': 'Background color for tooltip controls.',
	'InfoText': 'Text color for tooltip controls.',
	'Menu': 'Menu background.',
	'MenuText': 'Text in menus.',
	'Scrollbar': 'Scroll bar gray area.',
	'ThreeDDarkShadow': 'The color of the darker (generally outer) of the two borders away from the light source for 3-D elements that appear 3-D due to two concentric layers of surrounding border.',
	'ThreeDFace': 'The face background color for 3-D elements that appear 3-D due to two concentric layers of surrounding border.',
	'ThreeDHighlight': 'The color of the lighter (generally outer) of the two borders facing the light source for 3-D elements that appear 3-D due to two concentric layers of surrounding border.',
	'ThreeDLightShadow': 'The color of the darker (generally inner) of the two borders facing the light source for 3-D elements that appear 3-D due to two concentric layers of surrounding border.',
	'ThreeDShadow': 'The color of the lighter (generally inner) of the two borders away from the light source for 3-D elements that appear 3-D due to two concentric layers of surrounding border.',
	'transparent': 'Fully transparent. This keyword can be considered a shorthand for rgba(0,0,0,0) which is its computed value.',
	'Window': 'Window background.',
	'WindowFrame': 'Window frame.',
	'WindowText': 'Text in windows.',
	'none': ''
};

export var units : { [unitName:string]:string[] } = {
	'length': ['em', 'rem', 'ex', 'px', 'cm', 'mm', 'in', 'pt', 'pc', 'cc'],
	'angle': ['deg', 'rad', 'grad'],
	'time': ['ms', 's'],
	'frequency': ['Hz', 'kHz'],
	'resolution': ['dpi', 'dpcm'],
	'percentage': ['%']
};

export var html5Tags = ['a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption',
	'cite', 'code', 'col', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer',
	'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'keygen', 'label', 'legend', 'li', 'link',
	'main', 'map', 'mark', 'menu', 'menuitem', 'meta', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'param', 'pre', 'progress', 'q', 'rb',
	'rp', 'rt', 'rtc', 'ruby', 's', 'samp', 'script', 'section', 'select', 'small', 'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template',
	'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr' ];

export function isColorConstructor(node:nodes.Function): boolean {
	var name = node.getName();
	if (!name) {
		return false;
	}
	return strings.equalsIgnoreCase(name, 'rgb') ||
		strings.equalsIgnoreCase(name, 'rgba') ||
		strings.equalsIgnoreCase(name, 'hsl') ||
		strings.equalsIgnoreCase(name, 'hsla');
}

/**
 * Returns true if the node is a color value - either
 * defined a hex number, as rgb or rgba function, or
 * as color name.
 */
export function isColorValue(node:nodes.Node):boolean {
	if(node.type === nodes.NodeType.HexColorValue) {
		return true;
	} else if(node.type === nodes.NodeType.Function) {
		return this.isColorConstructor(<nodes.Function> node);
	} else if (node.type === nodes.NodeType.Identifier) {
		if (node.parent && node.parent.type !== nodes.NodeType.Term) {
			return false;
		}
		var candidateColor = node.getText().toLowerCase();
		if(candidateColor === 'none') {
			return false;
		}
		if (colors[candidateColor]) {
			return true;
		}
	}
	return false;
}

/**
 * Returns true if the given name is a known property.
 */
export function isKnownProperty(name: string):boolean {
	if(!name) {
		return false;
	} else {
		name = name.toLowerCase();
		return getProperties().hasOwnProperty(name);
	}
}

export function isCommonValue(entry:Value):boolean {
	return entry.browsers.count > 1;
}

export function getPageBoxDirectives():string[] {
	return [
		'@bottom-center', '@bottom-left', '@bottom-left-corner', '@bottom-right', '@bottom-right-corner',
		'@left-bottom', '@left-middle', '@left-top', '@right-bottom', '@right-middle', '@right-top',
		'@top-center', '@top-left', '@top-left-corner', '@top-right', '@top-right-corner'
	];
}

export function getEntryDescription(entry:{description: string; browsers: Browsers}): string {
	var desc = entry.description || '';
	var browserLabel = this.getBrowserLabel(entry.browsers);
	if (browserLabel) {
		if (desc) {
			desc = desc + '\n';
		}
		desc= desc + '(' + browserLabel + ')';
	}
	return desc;
}

export function getBrowserLabel(b: Browsers): string {
	var result = '';
	if (!b || b.all || b.count === 0) {
		return null;
	}
	for (var curr in browserNames) {
		if ((<any> b)[curr]) {
			if (result.length > 0) {
				result = result + ', ';
			}
			result = result + (<any> browserNames)[curr];
			var version = (<any> b)[curr];
			if (version.length > 0) {
				result = result + ' ' + version;
			}
		}
	}
	return result;
}

export interface Browsers {
	FF:string;
	IE:string;
	O:string;
	C:string;
	S:string;
	count:number;
	all:boolean;
}

export interface Value {
	name:string;
	description:string;
	browsers:Browsers;
}

export interface IEntry {
	name:string;
	restrictions:string[];
	browsers:Browsers;
	description:string;
	values:Value[];
}

function evalBrowserEntry(browsers: string) {
	var browserEntry : Browsers = { all: false, FF: '', S: '', C: '', IE: '', O: '', count: 0};
	var count = 0;
	if (browsers) {
		browsers.split(',').forEach(
			(s: string) => {
				s = s.trim();
				if (s === 'all') {
					browserEntry.all= true;
					count = Number.MAX_VALUE;
				} else if (s !== 'none') {
					for (var key in browserNames) {
						if (s.indexOf(key) === 0) {
							(<any> browserEntry)[key] = s.substring(key.length).trim();
							count++;
						}
					}
				}
			}
		);
	} else {
		browserEntry.all = true;
		count = Number.MAX_VALUE;
	}
	browserEntry.count = count;
	return browserEntry;
};


class ValueImpl implements Value {

	private browserEntry: Browsers;

	constructor(public data: any) {
	}

	get name() : string {
		return this.data.name;
	}

	get description() : string {
		return this.data.desc || browsers.descriptions[this.data.name];
	}

	get browsers() : Browsers {
		if (!this.browserEntry) {
			this.browserEntry = evalBrowserEntry(this.data.browsers);
		}
		return this.browserEntry;
	}
}

class EntryImpl implements IEntry {
	private browserEntry: Browsers;

	constructor(public data: any) {
	}

	get name(): string {
		return this.data.name;
	}

	get description(): string {
		return this.data.desc || browsers.descriptions[this.data.name];
	}

	get browsers(): Browsers {
		if (!this.browserEntry) {
			this.browserEntry = evalBrowserEntry(this.data.browsers);
		}
		return this.browserEntry;
	}

	get restrictions(): string[] {
		if (this.data.restriction) {
			return this.data.restriction.split(',').map(function(s: string) { return s.trim(); });
		} else {
			return [];
		}
	}

	get values(): Value[] {
		if(!this.data.values) {
			return [];
		}
		if(!Array.isArray(this.data.values)) {
			return [new ValueImpl(this.data.values.value)];
		}
		return this.data.values.map(function (v: string) {
			return new ValueImpl(v);
		});
	}
}

var propertySet: { [key: string]: IEntry };
var properties = browsers.data.css.properties;
export function getProperties(): { [name: string]: IEntry; } {
	if(!propertySet) {
		propertySet = {
		};
		for(var i = 0, len = properties.length; i < len; i++) {
			var rawEntry = properties[i];
			propertySet[rawEntry.name] = new EntryImpl(rawEntry);
		}
	}
	return propertySet;
}

var atDirectives = browsers.data.css.atdirectives;
var atDirectiveList: IEntry[];
export function getAtDirectives(): IEntry[] {
	if (!atDirectiveList) {
		atDirectiveList = [];
		for (var i = 0, len = atDirectives.length; i < len; i++) {
			var rawEntry = atDirectives[i];
			atDirectiveList.push(new EntryImpl(rawEntry));
		}
	}
	return atDirectiveList;
}


var pseudoElements = browsers.data.css.pseudoelements;
var pseudoElementList: IEntry[];
export function getPseudoElements(): IEntry[] {
		if (!pseudoElementList) {
			pseudoElementList = [];
			for (var i = 0, len = pseudoElements.length; i < len; i++) {
				var rawEntry = pseudoElements[i];
				pseudoClassesList.push(new EntryImpl(rawEntry));
			}
		}
		return pseudoElementList;
}

var pseudoClasses = browsers.data.css.pseudoclasses;
var pseudoClassesList: IEntry[];
export function getPseudoClasses(): IEntry[]{
	if (!pseudoClassesList) {
		pseudoClassesList = [];
		for (var i = 0, len = pseudoClasses.length; i < len; i++) {
			var rawEntry = pseudoClasses[i];
			pseudoClassesList.push(new EntryImpl(rawEntry));
		}
	}
	return pseudoClassesList;
}

export var browserNames = {
	FF : 'Firefox',
	S : 'Safari',
	C : 'Chrome',
	IE : 'IE',
	O : 'Opera'
};
