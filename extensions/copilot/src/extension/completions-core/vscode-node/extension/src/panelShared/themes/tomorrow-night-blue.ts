/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThemeRegistrationAny } from 'shiki';

export const tomorrowNightBlue: ThemeRegistrationAny = {
	$schema: 'vscode://schemas/color-theme',
	type: 'dark',
	colors: {
		'activityBar.background': '#001733',
		'badge.background': '#bbdaffcc',
		'badge.foreground': '#001733',
		'debugToolBar.background': '#001c40',
		'dropdown.background': '#001733',
		'editor.background': '#002451',
		'editor.foreground': '#ffffff',
		'editor.lineHighlightBackground': '#00346e',
		'editor.selectionBackground': '#003f8e',
		'editorCursor.foreground': '#ffffff',
		'editorGroup.border': '#404f7d',
		'editorGroup.dropBackground': '#25375daa',
		'editorGroupHeader.tabsBackground': '#001733',
		'editorHoverWidget.background': '#001c40',
		'editorHoverWidget.border': '#ffffff44',
		'editorLineNumber.activeForeground': '#949494',
		'editorWhitespace.foreground': '#404f7d',
		'editorWidget.background': '#001c40',
		errorForeground: '#a92049',
		focusBorder: '#bbdaff',
		'input.background': '#001733',
		'list.activeSelectionBackground': '#ffffff60',
		'list.highlightForeground': '#bbdaff',
		'list.hoverBackground': '#ffffff30',
		'list.inactiveSelectionBackground': '#ffffff40',
		'minimap.selectionHighlight': '#003f8e',
		'peekViewResult.background': '#001c40',
		'pickerGroup.foreground': '#bbdaff',
		'ports.iconRunningProcessForeground': '#bbdaff',
		'progressBar.background': '#bbdaffcc',
		'quickInputList.focusBackground': '#ffffff60',
		'sideBar.background': '#001c40',
		'statusBar.background': '#001126',
		'statusBar.debuggingBackground': '#001126',
		'statusBar.noFolderBackground': '#001126',
		'statusBarItem.remoteBackground': '#0e639c',
		'tab.inactiveBackground': '#001c40',
		'tab.lastPinnedBorder': '#007acc80',
		'terminal.ansiBlack': '#111111',
		'terminal.ansiBlue': '#bbdaff',
		'terminal.ansiBrightBlack': '#333333',
		'terminal.ansiBrightBlue': '#80baff',
		'terminal.ansiBrightCyan': '#78ffff',
		'terminal.ansiBrightGreen': '#b8f171',
		'terminal.ansiBrightMagenta': '#d778ff',
		'terminal.ansiBrightRed': '#ff7882',
		'terminal.ansiBrightWhite': '#ffffff',
		'terminal.ansiBrightYellow': '#ffe580',
		'terminal.ansiCyan': '#99ffff',
		'terminal.ansiGreen': '#d1f1a9',
		'terminal.ansiMagenta': '#ebbbff',
		'terminal.ansiRed': '#ff9da4',
		'terminal.ansiWhite': '#cccccc',
		'terminal.ansiYellow': '#ffeead',
		'titleBar.activeBackground': '#001126',
	},
	tokenColors: [
		{
			scope: [
				'meta.embedded',
				'source.groovy.embedded',
				'meta.jsx.children',
				'string meta.image.inline.markdown',
				'variable.legacy.builtin.python',
			],
			settings: {
				foreground: '#FFFFFF',
			},
		},
		{
			scope: 'comment',
			settings: {
				foreground: '#7285B7',
			},
		},
		{
			scope: 'keyword.operator.class, keyword.operator, constant.other, source.php.embedded.line',
			settings: {
				foreground: '#FFFFFF',
				fontStyle: '',
			},
		},
		{
			scope: 'variable, support.other.variable, string.other.link, string.regexp, entity.name.tag, entity.other.attribute-name, meta.tag, declaration.tag, markup.deleted.git_gutter',
			settings: {
				foreground: '#FF9DA4',
			},
		},
		{
			scope: 'constant.numeric, constant.language, support.constant, constant.character, variable.parameter, punctuation.section.embedded, keyword.other.unit',
			settings: {
				foreground: '#FFC58F',
				fontStyle: '',
			},
		},
		{
			scope: 'entity.name.class, entity.name.type, entity.name.namespace, entity.name.scope-resolution, support.type, support.class',
			settings: {
				foreground: '#FFEEAD',
				fontStyle: '',
			},
		},
		{
			scope: 'string, constant.other.symbol, entity.other.inherited-class, markup.heading, markup.inserted.git_gutter',
			settings: {
				foreground: '#D1F1A9',
				fontStyle: '',
			},
		},
		{
			scope: 'keyword.operator, constant.other.color',
			settings: {
				foreground: '#99FFFF',
			},
		},
		{
			scope: 'entity.name.function, meta.function-call, support.function, keyword.other.special-method, meta.block-level, markup.changed.git_gutter',
			settings: {
				foreground: '#BBDAFF',
				fontStyle: '',
			},
		},
		{
			scope: 'keyword, storage, storage.type, entity.name.tag.css',
			settings: {
				foreground: '#EBBBFF',
				fontStyle: '',
			},
		},
		{
			scope: 'invalid',
			settings: {
				foreground: '#A92049',
				fontStyle: '',
			},
		},
		{
			scope: 'meta.separator',
			settings: {
				foreground: '#FFFFFF',
			},
		},
		{
			scope: 'invalid.deprecated',
			settings: {
				foreground: '#CD9731',
				fontStyle: '',
			},
		},
		{
			scope: 'markup.inserted.diff, markup.deleted.diff, meta.diff.header.to-file, meta.diff.header.from-file',
			settings: {
				foreground: '#FFFFFF',
			},
		},
		{
			scope: 'markup.inserted.diff, meta.diff.header.to-file',
			settings: {
				foreground: '#718C00',
			},
		},
		{
			scope: 'markup.deleted.diff, meta.diff.header.from-file',
			settings: {
				foreground: '#C82829',
			},
		},
		{
			scope: 'meta.diff.header.from-file, meta.diff.header.to-file',
			settings: {
				foreground: '#4271AE',
			},
		},
		{
			scope: 'meta.diff.range',
			settings: {
				foreground: '#3E999F',
				fontStyle: 'italic',
			},
		},
		{
			scope: 'markup.quote',
			settings: {
				foreground: '#FFC58F',
			},
		},
		{
			scope: 'markup.list',
			settings: {
				foreground: '#BBDAFF',
			},
		},
		{
			scope: 'markup.bold, markup.italic',
			settings: {
				foreground: '#FFC58F',
			},
		},
		{
			scope: 'markup.bold',
			settings: {
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
			scope: 'markup.inline.raw',
			settings: {
				foreground: '#FF9DA4',
				fontStyle: '',
			},
		},
		{
			scope: 'markup.heading',
			settings: {
				fontStyle: 'bold',
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
