/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThemeRegistrationAny } from 'shiki';

export const monokaiDim: ThemeRegistrationAny = {
	$schema: 'vscode://schemas/color-theme',
	type: 'dark',
	colors: {
		'activityBar.background': '#353535',
		'activityBar.foreground': '#ffffff',
		'activityBarBadge.background': '#3655b5',
		'button.background': '#565656',
		'dropdown.background': '#525252',
		'editor.background': '#1e1e1e',
		'editor.foreground': '#c5c8c6',
		'editor.lineHighlightBackground': '#303030',
		'editor.selectionBackground': '#676b7180',
		'editor.selectionHighlightBackground': '#575b6180',
		'editor.wordHighlightBackground': '#4747a180',
		'editor.wordHighlightStrongBackground': '#6767ce80',
		'editorCursor.foreground': '#c07020',
		'editorGroupHeader.tabsBackground': '#282828',
		'editorIndentGuide.activeBackground': '#707057',
		'editorIndentGuide.background': '#505037',
		'editorLineNumber.activeForeground': '#949494',
		'editorWhitespace.foreground': '#505037',
		focusBorder: '#3655b5',
		'inputOption.activeBorder': '#3655b5',
		'list.activeSelectionBackground': '#707070',
		'list.highlightForeground': '#e58520',
		'list.hoverBackground': '#444444',
		'list.inactiveSelectionBackground': '#4e4e4e',
		'menu.background': '#272727',
		'menu.foreground': '#cccccc',
		'minimap.selectionHighlight': '#676b7180',
		'panelTitle.activeForeground': '#ffffff',
		'peekView.border': '#3655b5',
		'pickerGroup.foreground': '#b0b0b0',
		'ports.iconRunningProcessForeground': '#cccccc',
		'quickInputList.focusBackground': '#707070',
		'sideBar.background': '#272727',
		'sideBarSectionHeader.background': '#505050',
		'statusBar.background': '#505050',
		'statusBar.debuggingBackground': '#505050',
		'statusBar.noFolderBackground': '#505050',
		'statusBarItem.remoteBackground': '#3655b5',
		'tab.border': '#303030',
		'tab.inactiveBackground': '#404040',
		'tab.inactiveForeground': '#d8d8d8',
		'tab.lastPinnedBorder': '#505050',
		'terminal.ansiBlack': '#1e1e1e',
		'terminal.ansiBlue': '#6a7ec8',
		'terminal.ansiBrightBlack': '#666666',
		'terminal.ansiBrightBlue': '#819aff',
		'terminal.ansiBrightCyan': '#66d9ef',
		'terminal.ansiBrightGreen': '#a6e22e',
		'terminal.ansiBrightMagenta': '#ae81ff',
		'terminal.ansiBrightRed': '#f92672',
		'terminal.ansiBrightWhite': '#f8f8f2',
		'terminal.ansiBrightYellow': '#e2e22e',
		'terminal.ansiCyan': '#56adbc',
		'terminal.ansiGreen': '#86b42b',
		'terminal.ansiMagenta': '#8c6bc8',
		'terminal.ansiRed': '#c4265e',
		'terminal.ansiWhite': '#e3e3dd',
		'terminal.ansiYellow': '#b3b42b',
		'terminal.inactiveSelectionBackground': '#676b7140',
		'titleBar.activeBackground': '#505050',
	},
	tokenColors: [
		{
			scope: ['meta.embedded', 'source.groovy.embedded', 'variable.legacy.builtin.python'],
			settings: {
				foreground: '#C5C8C6',
			},
		},
		{
			scope: 'comment',
			settings: {
				foreground: '#9A9B99',
				fontStyle: '',
			},
		},
		{
			scope: 'string',
			settings: {
				foreground: '#9AA83A',
				fontStyle: '',
			},
		},
		{
			scope: 'string source',
			settings: {
				foreground: '#D08442',
				fontStyle: '',
			},
		},
		{
			scope: 'constant.numeric',
			settings: {
				foreground: '#6089B4',
				fontStyle: '',
			},
		},
		{
			scope: 'constant.language',
			settings: {
				foreground: '#408080',
				fontStyle: '',
			},
		},
		{
			scope: 'constant.character, constant.other',
			settings: {
				foreground: '#8080FF',
				fontStyle: '',
			},
		},
		{
			scope: 'keyword',
			settings: {
				foreground: '#6089B4',
				fontStyle: '',
			},
		},
		{
			scope: 'support',
			settings: {
				foreground: '#C7444A',
				fontStyle: '',
			},
		},
		{
			scope: 'storage',
			settings: {
				foreground: '#9872A2',
				fontStyle: '',
			},
		},
		{
			scope: 'entity.name.class, entity.name.type, entity.name.namespace, entity.name.scope-resolution',
			settings: {
				foreground: '#9B0000',
				fontStyle: '',
			},
		},
		{
			scope: 'entity.other.inherited-class',
			settings: {
				foreground: '#C7444A',
				fontStyle: '',
			},
		},
		{
			scope: 'entity.name.function',
			settings: {
				foreground: '#CE6700',
				fontStyle: '',
			},
		},
		{
			scope: 'variable.parameter',
			settings: {
				foreground: '#6089B4',
				fontStyle: '',
			},
		},
		{
			scope: 'entity.name.tag',
			settings: {
				foreground: '#9872A2',
				fontStyle: '',
			},
		},
		{
			scope: 'entity.other.attribute-name',
			settings: {
				foreground: '#9872A2',
				fontStyle: '',
			},
		},
		{
			scope: 'support.function',
			settings: {
				foreground: '#9872A2',
				fontStyle: '',
			},
		},
		{
			scope: 'keyword',
			settings: {
				foreground: '#676867',
				fontStyle: '',
			},
		},
		{
			scope: 'variable.other, variable.js, punctuation.separator.variable',
			settings: {
				foreground: '#6089B4',
				fontStyle: '',
			},
		},
		{
			scope: 'punctuation.section.embedded -(source string source punctuation.section.embedded), meta.brace.erb.html',
			settings: {
				foreground: '#008200',
				fontStyle: '',
			},
		},
		{
			scope: 'invalid',
			settings: {
				foreground: '#FF0B00',
				fontStyle: '',
			},
		},
		{
			scope: 'variable.other.php, variable.other.normal',
			settings: {
				foreground: '#6089B4',
				fontStyle: '',
			},
		},
		{
			scope: 'meta.function-call.object',
			settings: {
				foreground: '#9872A2',
				fontStyle: '',
			},
		},
		{
			scope: 'variable.other.property',
			settings: {
				foreground: '#9872A2',
				fontStyle: '',
			},
		},
		{
			scope: [
				'keyword.control',
				'keyword.operator.new.cpp',
				'keyword.operator.delete.cpp',
				'keyword.other.using',
				'keyword.other.directive.using',
				'keyword.other.operator',
			],
			settings: {
				foreground: '#9872A2',
				fontStyle: '',
			},
		},
		{
			scope: 'meta.tag',
			settings: {
				foreground: '#D0B344',
				fontStyle: '',
			},
		},
		{
			scope: 'entity.name.tag',
			settings: {
				foreground: '#6089B4',
				fontStyle: '',
			},
		},
		{
			scope: 'meta.doctype, meta.tag.sgml-declaration.doctype, meta.tag.sgml.doctype',
			settings: {
				foreground: '#9AA83A',
				fontStyle: '',
			},
		},
		{
			scope: 'meta.tag.inline source, text.html.php.source',
			settings: {
				foreground: '#9AA83A',
				fontStyle: '',
			},
		},
		{
			scope: 'meta.tag.other, entity.name.tag.style, entity.name.tag.script, meta.tag.block.script, source.js.embedded punctuation.definition.tag.html, source.css.embedded punctuation.definition.tag.html',
			settings: {
				foreground: '#9872A2',
				fontStyle: '',
			},
		},
		{
			scope: 'entity.other.attribute-name, meta.tag punctuation.definition.string',
			settings: {
				foreground: '#D0B344',
				fontStyle: '',
			},
		},
		{
			scope: 'meta.tag string -source -punctuation, text source text meta.tag string -punctuation',
			settings: {
				foreground: '#6089B4',
				fontStyle: '',
			},
		},
		{
			scope: 'punctuation.section.embedded -(source string source punctuation.section.embedded), meta.brace.erb.html',
			settings: {
				foreground: '#D0B344',
				fontStyle: '',
			},
		},
		{
			scope: 'meta.toc-list.id',
			settings: {
				foreground: '#9AA83A',
			},
		},
		{
			scope: 'string.quoted.double.html, punctuation.definition.string.begin.html, punctuation.definition.string.end.html, punctuation.definition.string.end.html source, string.quoted.double.html source',
			settings: {
				foreground: '#9AA83A',
				fontStyle: '',
			},
		},
		{
			scope: 'punctuation.definition.tag.html, punctuation.definition.tag.begin, punctuation.definition.tag.end',
			settings: {
				foreground: '#6089B4',
				fontStyle: '',
			},
		},
		{
			scope: 'meta.selector.css entity.other.attribute-name.id',
			settings: {
				foreground: '#9872A2',
				fontStyle: '',
			},
		},
		{
			scope: 'support.type.property-name.css',
			settings: {
				foreground: '#676867',
				fontStyle: '',
			},
		},
		{
			scope: 'meta.property-group support.constant.property-value.css, meta.property-value support.constant.property-value.css',
			settings: {
				foreground: '#C7444A',
				fontStyle: '',
			},
		},
		{
			scope: 'variable.language.js',
			settings: {
				foreground: '#CC555A',
			},
		},
		{
			scope: ['punctuation.definition.template-expression', 'punctuation.section.embedded.coffee'],
			settings: {
				foreground: '#D08442',
			},
		},
		{
			scope: ['meta.template.expression'],
			settings: {
				foreground: '#C5C8C6',
			},
		},
		{
			scope: 'meta.function-call.object.php',
			settings: {
				foreground: '#D0B344',
				fontStyle: '',
			},
		},
		{
			scope: 'punctuation.definition.string.end.php, punctuation.definition.string.begin.php',
			settings: {
				foreground: '#9AA83A',
			},
		},
		{
			scope: 'source.php.embedded.line.html',
			settings: {
				foreground: '#676867',
			},
		},
		{
			scope: 'punctuation.section.embedded.begin.php, punctuation.section.embedded.end.php',
			settings: {
				foreground: '#D08442',
				fontStyle: '',
			},
		},
		{
			scope: 'constant.other.symbol.ruby',
			settings: {
				foreground: '#9AA83A',
				fontStyle: '',
			},
		},
		{
			scope: 'variable.language.ruby',
			settings: {
				foreground: '#D0B344',
				fontStyle: '',
			},
		},
		{
			scope: 'keyword.other.special-method.ruby',
			settings: {
				foreground: '#D9B700',
				fontStyle: '',
			},
		},
		{
			scope: ['punctuation.section.embedded.begin.ruby', 'punctuation.section.embedded.end.ruby'],
			settings: {
				foreground: '#D08442',
			},
		},
		{
			scope: 'keyword.other.DML.sql',
			settings: {
				foreground: '#D0B344',
				fontStyle: '',
			},
		},
		{
			scope: 'meta.diff, meta.diff.header',
			settings: {
				foreground: '#E0EDDD',
				fontStyle: 'italic',
			},
		},
		{
			scope: 'markup.deleted',
			settings: {
				foreground: '#DC322F',
				fontStyle: '',
			},
		},
		{
			scope: 'markup.changed',
			settings: {
				foreground: '#CB4B16',
				fontStyle: '',
			},
		},
		{
			scope: 'markup.inserted',
			settings: {
				foreground: '#219186',
			},
		},
		{
			scope: 'markup.quote',
			settings: {
				foreground: '#9872A2',
			},
		},
		{
			scope: 'markup.list',
			settings: {
				foreground: '#9AA83A',
			},
		},
		{
			scope: 'markup.bold, markup.italic',
			settings: {
				foreground: '#6089B4',
			},
		},
		{
			scope: 'markup.inline.raw',
			settings: {
				foreground: '#FF0080',
				fontStyle: '',
			},
		},
		{
			scope: 'markup.heading',
			settings: {
				foreground: '#D0B344',
			},
		},
		{
			scope: 'markup.heading.setext',
			settings: {
				foreground: '#D0B344',
				fontStyle: '',
			},
		},
		{
			scope: 'markup.heading.markdown',
			settings: {
				fontStyle: 'bold',
			},
		},
		{
			scope: 'markup.quote.markdown',
			settings: {
				fontStyle: 'italic',
			},
		},
		{
			scope: 'markup.bold.markdown',
			settings: {
				fontStyle: 'bold',
			},
		},
		{
			scope: 'string.other.link.title.markdown,string.other.link.description.markdown',
			settings: {
				foreground: '#AE81FF',
			},
		},
		{
			scope: 'markup.underline.link.markdown,markup.underline.link.image.markdown',
			settings: {},
		},
		{
			scope: 'markup.italic.markdown',
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
			scope: 'markup.list.unnumbered.markdown, markup.list.numbered.markdown',
			settings: {},
		},
		{
			scope: ['punctuation.definition.list.begin.markdown'],
			settings: {},
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
		{
			scope: 'variable.language',
			settings: {
				foreground: '#C7444A',
			},
		},
	],
};
