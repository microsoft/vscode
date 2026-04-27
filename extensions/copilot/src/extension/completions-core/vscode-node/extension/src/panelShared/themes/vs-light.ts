/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThemeRegistrationAny } from 'shiki';

export const vsLight: ThemeRegistrationAny = {
	$schema: 'vscode://schemas/color-theme',
	type: 'light',
	colors: {
		'actionBar.toggledBackground': '#dddddd',
		'activityBarBadge.background': '#007acc',
		'checkbox.border': '#919191',
		'editor.background': '#ffffff',
		'editor.foreground': '#000000',
		'editor.inactiveSelectionBackground': '#e5ebf1',
		'editor.selectionHighlightBackground': '#add6ff80',
		'editorIndentGuide.activeBackground1': '#939393',
		'editorIndentGuide.background1': '#d3d3d3',
		'editorSuggestWidget.background': '#f3f3f3',
		'input.placeholderForeground': '#767676',
		'list.activeSelectionIconForeground': '#ffffff',
		'list.focusAndSelectionOutline': '#90c2f9',
		'list.hoverBackground': '#e8e8e8',
		'menu.border': '#d4d4d4',
		'notebook.cellBorderColor': '#e8e8e8',
		'notebook.selectedCellBackground': '#c8ddf150',
		'ports.iconRunningProcessForeground': '#369432',
		'searchEditor.textInputBorder': '#cecece',
		'settings.numberInputBorder': '#cecece',
		'settings.textInputBorder': '#cecece',
		'sideBarSectionHeader.background': '#00000000',
		'sideBarSectionHeader.border': '#61616130',
		'sideBarTitle.foreground': '#6f6f6f',
		'statusBarItem.errorBackground': '#c72e0f',
		'statusBarItem.remoteBackground': '#16825d',
		'statusBarItem.remoteForeground': '#ffffff',
		'tab.lastPinnedBorder': '#61616130',
		'terminal.inactiveSelectionBackground': '#e5ebf1',
		'widget.border': '#d4d4d4',
	},
	tokenColors: [
		{
			scope: [
				'meta.embedded',
				'source.groovy.embedded',
				'string meta.image.inline.markdown',
				'variable.legacy.builtin.python',
			],
			settings: {
				foreground: '#000000',
			},
		},
		{
			scope: 'emphasis',
			settings: {
				fontStyle: 'italic',
			},
		},
		{
			scope: 'strong',
			settings: {
				fontStyle: 'bold',
			},
		},
		{
			scope: 'meta.diff.header',
			settings: {
				foreground: '#000080',
			},
		},
		{
			scope: 'comment',
			settings: {
				foreground: '#008000',
			},
		},
		{
			scope: 'constant.language',
			settings: {
				foreground: '#0000FF',
			},
		},
		{
			scope: [
				'constant.numeric',
				'variable.other.enummember',
				'keyword.operator.plus.exponent',
				'keyword.operator.minus.exponent',
			],
			settings: {
				foreground: '#098658',
			},
		},
		{
			scope: 'constant.regexp',
			settings: {
				foreground: '#811F3F',
			},
		},
		{
			scope: 'entity.name.tag',
			settings: {
				foreground: '#800000',
			},
		},
		{
			scope: 'entity.name.selector',
			settings: {
				foreground: '#800000',
			},
		},
		{
			scope: 'entity.other.attribute-name',
			settings: {
				foreground: '#E50000',
			},
		},
		{
			scope: [
				'entity.other.attribute-name.class.css',
				'entity.other.attribute-name.class.mixin.css',
				'entity.other.attribute-name.id.css',
				'entity.other.attribute-name.parent-selector.css',
				'entity.other.attribute-name.pseudo-class.css',
				'entity.other.attribute-name.pseudo-element.css',
				'source.css.less entity.other.attribute-name.id',
				'entity.other.attribute-name.scss',
			],
			settings: {
				foreground: '#800000',
			},
		},
		{
			scope: 'invalid',
			settings: {
				foreground: '#CD3131',
			},
		},
		{
			scope: 'markup.underline',
			settings: {
				fontStyle: 'underline',
			},
		},
		{
			scope: 'markup.bold',
			settings: {
				foreground: '#000080',
				fontStyle: 'bold',
			},
		},
		{
			scope: 'markup.heading',
			settings: {
				foreground: '#800000',
				fontStyle: 'bold',
			},
		},
		{
			scope: 'markup.italic',
			settings: {
				fontStyle: 'italic',
			},
		},
		{
			scope: 'markup.strikethrough',
			settings: {
				fontStyle: 'strikethrough',
			},
		},
		{
			scope: 'markup.inserted',
			settings: {
				foreground: '#098658',
			},
		},
		{
			scope: 'markup.deleted',
			settings: {
				foreground: '#A31515',
			},
		},
		{
			scope: 'markup.changed',
			settings: {
				foreground: '#0451A5',
			},
		},
		{
			scope: ['punctuation.definition.quote.begin.markdown', 'punctuation.definition.list.begin.markdown'],
			settings: {
				foreground: '#0451A5',
			},
		},
		{
			scope: 'markup.inline.raw',
			settings: {
				foreground: '#800000',
			},
		},
		{
			scope: 'punctuation.definition.tag',
			settings: {
				foreground: '#800000',
			},
		},
		{
			scope: ['meta.preprocessor', 'entity.name.function.preprocessor'],
			settings: {
				foreground: '#0000FF',
			},
		},
		{
			scope: 'meta.preprocessor.string',
			settings: {
				foreground: '#A31515',
			},
		},
		{
			scope: 'meta.preprocessor.numeric',
			settings: {
				foreground: '#098658',
			},
		},
		{
			scope: 'meta.structure.dictionary.key.python',
			settings: {
				foreground: '#0451A5',
			},
		},
		{
			scope: 'storage',
			settings: {
				foreground: '#0000FF',
			},
		},
		{
			scope: 'storage.type',
			settings: {
				foreground: '#0000FF',
			},
		},
		{
			scope: ['storage.modifier', 'keyword.operator.noexcept'],
			settings: {
				foreground: '#0000FF',
			},
		},
		{
			scope: ['string', 'meta.embedded.assembly'],
			settings: {
				foreground: '#A31515',
			},
		},
		{
			scope: [
				'string.comment.buffered.block.pug',
				'string.quoted.pug',
				'string.interpolated.pug',
				'string.unquoted.plain.in.yaml',
				'string.unquoted.plain.out.yaml',
				'string.unquoted.block.yaml',
				'string.quoted.single.yaml',
				'string.quoted.double.xml',
				'string.quoted.single.xml',
				'string.unquoted.cdata.xml',
				'string.quoted.double.html',
				'string.quoted.single.html',
				'string.unquoted.html',
				'string.quoted.single.handlebars',
				'string.quoted.double.handlebars',
			],
			settings: {
				foreground: '#0000FF',
			},
		},
		{
			scope: 'string.regexp',
			settings: {
				foreground: '#811F3F',
			},
		},
		{
			scope: [
				'punctuation.definition.template-expression.begin',
				'punctuation.definition.template-expression.end',
				'punctuation.section.embedded',
			],
			settings: {
				foreground: '#0000FF',
			},
		},
		{
			scope: ['meta.template.expression'],
			settings: {
				foreground: '#000000',
			},
		},
		{
			scope: [
				'support.constant.property-value',
				'support.constant.font-name',
				'support.constant.media-type',
				'support.constant.media',
				'constant.other.color.rgb-value',
				'constant.other.rgb-value',
				'support.constant.color',
			],
			settings: {
				foreground: '#0451A5',
			},
		},
		{
			scope: [
				'support.type.vendored.property-name',
				'support.type.property-name',
				'variable.css',
				'variable.scss',
				'variable.other.less',
				'source.coffee.embedded',
			],
			settings: {
				foreground: '#E50000',
			},
		},
		{
			scope: ['support.type.property-name.json'],
			settings: {
				foreground: '#0451A5',
			},
		},
		{
			scope: 'keyword',
			settings: {
				foreground: '#0000FF',
			},
		},
		{
			scope: 'keyword.control',
			settings: {
				foreground: '#0000FF',
			},
		},
		{
			scope: 'keyword.operator',
			settings: {
				foreground: '#000000',
			},
		},
		{
			scope: [
				'keyword.operator.new',
				'keyword.operator.expression',
				'keyword.operator.cast',
				'keyword.operator.sizeof',
				'keyword.operator.alignof',
				'keyword.operator.typeid',
				'keyword.operator.alignas',
				'keyword.operator.instanceof',
				'keyword.operator.logical.python',
				'keyword.operator.wordlike',
			],
			settings: {
				foreground: '#0000FF',
			},
		},
		{
			scope: 'keyword.other.unit',
			settings: {
				foreground: '#098658',
			},
		},
		{
			scope: ['punctuation.section.embedded.begin.php', 'punctuation.section.embedded.end.php'],
			settings: {
				foreground: '#800000',
			},
		},
		{
			scope: 'support.function.git-rebase',
			settings: {
				foreground: '#0451A5',
			},
		},
		{
			scope: 'constant.sha.git-rebase',
			settings: {
				foreground: '#098658',
			},
		},
		{
			scope: ['storage.modifier.import.java', 'variable.language.wildcard.java', 'storage.modifier.package.java'],
			settings: {
				foreground: '#000000',
			},
		},
		{
			scope: 'variable.language',
			settings: {
				foreground: '#0000FF',
			},
		},
		{
			scope: 'ref.matchtext',
			settings: {
				foreground: '#000000',
			},
		},
		{
			scope: 'token.info-token',
			settings: {
				foreground: '#316BCD',
			},
		},
		{
			scope: 'token.warn-token',
			settings: {
				foreground: '#CD9731',
			},
		},
		{
			scope: 'token.error-token',
			settings: {
				foreground: '#CD3131',
			},
		},
		{
			scope: 'token.debug-token',
			settings: {
				foreground: '#800080',
			},
		},
	],
};
