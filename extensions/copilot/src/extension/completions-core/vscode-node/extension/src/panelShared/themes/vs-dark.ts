/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThemeRegistrationAny } from 'shiki';

export const vsDark: ThemeRegistrationAny = {
	$schema: 'vscode://schemas/color-theme',
	type: 'dark',
	colors: {
		'actionBar.toggledBackground': '#383a49',
		'activityBarBadge.background': '#007acc',
		'checkbox.border': '#6b6b6b',
		'editor.background': '#1e1e1e',
		'editor.foreground': '#d4d4d4',
		'editor.inactiveSelectionBackground': '#3a3d41',
		'editor.selectionHighlightBackground': '#add6ff26',
		'editorIndentGuide.activeBackground1': '#707070',
		'editorIndentGuide.background1': '#404040',
		'input.placeholderForeground': '#a6a6a6',
		'list.activeSelectionIconForeground': '#ffffff',
		'list.dropBackground': '#383b3d',
		'menu.background': '#252526',
		'menu.border': '#454545',
		'menu.foreground': '#cccccc',
		'menu.separatorBackground': '#454545',
		'ports.iconRunningProcessForeground': '#369432',
		'sideBarSectionHeader.background': '#00000000',
		'sideBarSectionHeader.border': '#cccccc33',
		'sideBarTitle.foreground': '#bbbbbb',
		'statusBarItem.remoteBackground': '#16825d',
		'statusBarItem.remoteForeground': '#ffffff',
		'tab.lastPinnedBorder': '#cccccc33',
		'terminal.inactiveSelectionBackground': '#3a3d41',
		'widget.border': '#303031',
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
				foreground: '#D4D4D4',
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
			scope: 'header',
			settings: {
				foreground: '#000080',
			},
		},
		{
			scope: 'comment',
			settings: {
				foreground: '#6A9955',
			},
		},
		{
			scope: 'constant.language',
			settings: {
				foreground: '#569CD6',
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
				foreground: '#B5CEA8',
			},
		},
		{
			scope: 'constant.regexp',
			settings: {
				foreground: '#646695',
			},
		},
		{
			scope: 'entity.name.tag',
			settings: {
				foreground: '#569CD6',
			},
		},
		{
			scope: 'entity.name.tag.css',
			settings: {
				foreground: '#D7BA7D',
			},
		},
		{
			scope: 'entity.other.attribute-name',
			settings: {
				foreground: '#9CDCFE',
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
				foreground: '#D7BA7D',
			},
		},
		{
			scope: 'invalid',
			settings: {
				foreground: '#F44747',
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
				foreground: '#569CD6',
				fontStyle: 'bold',
			},
		},
		{
			scope: 'markup.heading',
			settings: {
				foreground: '#569CD6',
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
				foreground: '#B5CEA8',
			},
		},
		{
			scope: 'markup.deleted',
			settings: {
				foreground: '#CE9178',
			},
		},
		{
			scope: 'markup.changed',
			settings: {
				foreground: '#569CD6',
			},
		},
		{
			scope: 'punctuation.definition.quote.begin.markdown',
			settings: {
				foreground: '#6A9955',
			},
		},
		{
			scope: 'punctuation.definition.list.begin.markdown',
			settings: {
				foreground: '#6796E6',
			},
		},
		{
			scope: 'markup.inline.raw',
			settings: {
				foreground: '#CE9178',
			},
		},
		{
			scope: 'punctuation.definition.tag',
			settings: {
				foreground: '#808080',
			},
		},
		{
			scope: ['meta.preprocessor', 'entity.name.function.preprocessor'],
			settings: {
				foreground: '#569CD6',
			},
		},
		{
			scope: 'meta.preprocessor.string',
			settings: {
				foreground: '#CE9178',
			},
		},
		{
			scope: 'meta.preprocessor.numeric',
			settings: {
				foreground: '#B5CEA8',
			},
		},
		{
			scope: 'meta.structure.dictionary.key.python',
			settings: {
				foreground: '#9CDCFE',
			},
		},
		{
			scope: 'meta.diff.header',
			settings: {
				foreground: '#569CD6',
			},
		},
		{
			scope: 'storage',
			settings: {
				foreground: '#569CD6',
			},
		},
		{
			scope: 'storage.type',
			settings: {
				foreground: '#569CD6',
			},
		},
		{
			scope: ['storage.modifier', 'keyword.operator.noexcept'],
			settings: {
				foreground: '#569CD6',
			},
		},
		{
			scope: ['string', 'meta.embedded.assembly'],
			settings: {
				foreground: '#CE9178',
			},
		},
		{
			scope: 'string.tag',
			settings: {
				foreground: '#CE9178',
			},
		},
		{
			scope: 'string.value',
			settings: {
				foreground: '#CE9178',
			},
		},
		{
			scope: 'string.regexp',
			settings: {
				foreground: '#D16969',
			},
		},
		{
			scope: [
				'punctuation.definition.template-expression.begin',
				'punctuation.definition.template-expression.end',
				'punctuation.section.embedded',
			],
			settings: {
				foreground: '#569CD6',
			},
		},
		{
			scope: ['meta.template.expression'],
			settings: {
				foreground: '#D4D4D4',
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
				foreground: '#9CDCFE',
			},
		},
		{
			scope: 'keyword',
			settings: {
				foreground: '#569CD6',
			},
		},
		{
			scope: 'keyword.control',
			settings: {
				foreground: '#569CD6',
			},
		},
		{
			scope: 'keyword.operator',
			settings: {
				foreground: '#D4D4D4',
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
				foreground: '#569CD6',
			},
		},
		{
			scope: 'keyword.other.unit',
			settings: {
				foreground: '#B5CEA8',
			},
		},
		{
			scope: ['punctuation.section.embedded.begin.php', 'punctuation.section.embedded.end.php'],
			settings: {
				foreground: '#569CD6',
			},
		},
		{
			scope: 'support.function.git-rebase',
			settings: {
				foreground: '#9CDCFE',
			},
		},
		{
			scope: 'constant.sha.git-rebase',
			settings: {
				foreground: '#B5CEA8',
			},
		},
		{
			scope: ['storage.modifier.import.java', 'variable.language.wildcard.java', 'storage.modifier.package.java'],
			settings: {
				foreground: '#D4D4D4',
			},
		},
		{
			scope: 'variable.language',
			settings: {
				foreground: '#569CD6',
			},
		},
		{
			scope: 'ref.matchtext',
			settings: {
				foreground: '#FFFFFF',
			},
		},
		{
			scope: 'token.info-token',
			settings: {
				foreground: '#6796E6',
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
				foreground: '#F44747',
			},
		},
		{
			scope: 'token.debug-token',
			settings: {
				foreground: '#B267E6',
			},
		},
	],
};
