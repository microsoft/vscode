/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThemeRegistrationAny } from 'shiki';

export const quietLight: ThemeRegistrationAny = {
	$schema: 'vscode://schemas/color-theme',
	type: 'light',
	colors: {
		'activityBar.background': '#ededf5',
		'activityBar.foreground': '#705697',
		'activityBarBadge.background': '#705697',
		'badge.background': '#705697aa',
		'button.background': '#705697',
		'dropdown.background': '#f5f5f5',
		'editor.background': '#f5f5f5',
		'editor.findMatchBackground': '#bf9cac',
		'editor.findMatchHighlightBackground': '#edc9d899',
		'editor.lineHighlightBackground': '#e4f6d4',
		'editor.selectionBackground': '#c9d0d9',
		'editorCursor.foreground': '#54494b',
		'editorGroup.dropBackground': '#c9d0d988',
		'editorIndentGuide.activeBackground': '#777777b0',
		'editorIndentGuide.background': '#aaaaaa60',
		'editorLineNumber.activeForeground': '#9769dc',
		'editorLineNumber.foreground': '#6d705b',
		'editorWhitespace.foreground': '#aaaaaa',
		errorForeground: '#f1897f',
		focusBorder: '#9769dc',
		'inputOption.activeBorder': '#adafb7',
		'inputValidation.errorBackground': '#ffeaea',
		'inputValidation.errorBorder': '#f1897f',
		'inputValidation.infoBackground': '#f2fcff',
		'inputValidation.infoBorder': '#4ec1e5',
		'inputValidation.warningBackground': '#fffee2',
		'inputValidation.warningBorder': '#ffe055',
		'list.activeSelectionBackground': '#c4d9b1',
		'list.activeSelectionForeground': '#6c6c6c',
		'list.highlightForeground': '#9769dc',
		'list.hoverBackground': '#e0e0e0',
		'list.inactiveSelectionBackground': '#d3dbcd',
		'minimap.selectionHighlight': '#c9d0d9',
		'panel.background': '#f5f5f5',
		'peekView.border': '#705697',
		'peekViewEditor.background': '#f2f8fc',
		'peekViewEditor.matchHighlightBackground': '#c2dfe3',
		'peekViewResult.background': '#f2f8fc',
		'peekViewResult.matchHighlightBackground': '#93c6d6',
		'peekViewTitle.background': '#f2f8fc',
		'pickerGroup.border': '#749351',
		'pickerGroup.foreground': '#a6b39b',
		'ports.iconRunningProcessForeground': '#749351',
		'progressBar.background': '#705697',
		'quickInputList.focusBackground': '#cadeb9',
		'selection.background': '#c9d0d9',
		'sideBar.background': '#f2f2f2',
		'sideBarSectionHeader.background': '#ede8ef',
		'statusBar.background': '#705697',
		'statusBar.debuggingBackground': '#705697',
		'statusBar.noFolderBackground': '#705697',
		'statusBarItem.remoteBackground': '#4e3c69',
		'tab.lastPinnedBorder': '#c9d0d9',
		'titleBar.activeBackground': '#c4b7d7',
		'walkThrough.embeddedEditorBackground': '#00000014',
		'welcomePage.tileBackground': '#f0f0f7',
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
				foreground: '#333333',
			},
		},
		{
			scope: ['comment', 'punctuation.definition.comment'],
			settings: {
				foreground: '#AAAAAA',
				fontStyle: 'italic',
			},
		},
		{
			scope: 'comment.block.preprocessor',
			settings: {
				foreground: '#AAAAAA',
				fontStyle: '',
			},
		},
		{
			scope: [
				'comment.documentation',
				'comment.block.documentation',
				'comment.block.documentation punctuation.definition.comment ',
			],
			settings: {
				foreground: '#448C27',
			},
		},
		{
			scope: 'invalid',
			settings: {
				foreground: '#CD3131',
			},
		},
		{
			scope: 'invalid.illegal',
			settings: {
				foreground: '#660000',
			},
		},
		{
			scope: 'keyword.operator',
			settings: {
				foreground: '#777777',
			},
		},
		{
			scope: ['keyword', 'storage'],
			settings: {
				foreground: '#4B69C6',
			},
		},
		{
			scope: ['storage.type', 'support.type'],
			settings: {
				foreground: '#7A3E9D',
			},
		},
		{
			scope: ['constant.language', 'support.constant', 'variable.language'],
			settings: {
				foreground: '#9C5D27',
			},
		},
		{
			scope: ['variable', 'support.variable'],
			settings: {
				foreground: '#7A3E9D',
			},
		},
		{
			scope: ['entity.name.function', 'support.function'],
			settings: {
				foreground: '#AA3731',
				fontStyle: 'bold',
			},
		},
		{
			scope: [
				'entity.name.type',
				'entity.name.namespace',
				'entity.name.scope-resolution',
				'entity.other.inherited-class',
				'support.class',
			],
			settings: {
				foreground: '#7A3E9D',
				fontStyle: 'bold',
			},
		},
		{
			scope: 'entity.name.exception',
			settings: {
				foreground: '#660000',
			},
		},
		{
			scope: 'entity.name.section',
			settings: {
				fontStyle: 'bold',
			},
		},
		{
			scope: ['constant.numeric', 'constant.character', 'constant'],
			settings: {
				foreground: '#9C5D27',
			},
		},
		{
			scope: 'string',
			settings: {
				foreground: '#448C27',
			},
		},
		{
			scope: 'constant.character.escape',
			settings: {
				foreground: '#777777',
			},
		},
		{
			scope: 'string.regexp',
			settings: {
				foreground: '#4B69C6',
			},
		},
		{
			scope: 'constant.other.symbol',
			settings: {
				foreground: '#9C5D27',
			},
		},
		{
			scope: 'punctuation',
			settings: {
				foreground: '#777777',
			},
		},
		{
			scope: [
				'meta.tag.sgml.doctype',
				'meta.tag.sgml.doctype string',
				'meta.tag.sgml.doctype entity.name.tag',
				'meta.tag.sgml punctuation.definition.tag.html',
			],
			settings: {
				foreground: '#AAAAAA',
			},
		},
		{
			scope: [
				'meta.tag',
				'punctuation.definition.tag.html',
				'punctuation.definition.tag.begin.html',
				'punctuation.definition.tag.end.html',
			],
			settings: {
				foreground: '#91B3E0',
			},
		},
		{
			scope: 'entity.name.tag',
			settings: {
				foreground: '#4B69C6',
			},
		},
		{
			scope: ['meta.tag entity.other.attribute-name', 'entity.other.attribute-name.html'],
			settings: {
				foreground: '#8190A0',
				fontStyle: 'italic',
			},
		},
		{
			scope: ['constant.character.entity', 'punctuation.definition.entity'],
			settings: {
				foreground: '#9C5D27',
			},
		},
		{
			scope: ['meta.selector', 'meta.selector entity', 'meta.selector entity punctuation', 'entity.name.tag.css'],
			settings: {
				foreground: '#7A3E9D',
			},
		},
		{
			scope: ['meta.property-name', 'support.type.property-name'],
			settings: {
				foreground: '#9C5D27',
			},
		},
		{
			scope: ['meta.property-value', 'meta.property-value constant.other', 'support.constant.property-value'],
			settings: {
				foreground: '#448C27',
			},
		},
		{
			scope: 'keyword.other.important',
			settings: {
				fontStyle: 'bold',
			},
		},
		{
			scope: 'markup.changed',
			settings: {
				foreground: '#000000',
			},
		},
		{
			scope: 'markup.deleted',
			settings: {
				foreground: '#000000',
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
			scope: 'markup.error',
			settings: {
				foreground: '#660000',
			},
		},
		{
			scope: 'markup.inserted',
			settings: {
				foreground: '#000000',
			},
		},
		{
			scope: 'meta.link',
			settings: {
				foreground: '#4B69C6',
			},
		},
		{
			scope: ['markup.output', 'markup.raw'],
			settings: {
				foreground: '#777777',
			},
		},
		{
			scope: 'markup.prompt',
			settings: {
				foreground: '#777777',
			},
		},
		{
			scope: 'markup.heading',
			settings: {
				foreground: '#AA3731',
			},
		},
		{
			scope: 'markup.bold',
			settings: {
				fontStyle: 'bold',
			},
		},
		{
			scope: 'markup.traceback',
			settings: {
				foreground: '#660000',
			},
		},
		{
			scope: 'markup.underline',
			settings: {
				fontStyle: 'underline',
			},
		},
		{
			scope: 'markup.quote',
			settings: {
				foreground: '#7A3E9D',
			},
		},
		{
			scope: 'markup.list',
			settings: {
				foreground: '#4B69C6',
			},
		},
		{
			scope: ['markup.bold', 'markup.italic'],
			settings: {
				foreground: '#448C27',
			},
		},
		{
			scope: 'markup.inline.raw',
			settings: {
				foreground: '#9C5D27',
				fontStyle: '',
			},
		},
		{
			scope: ['meta.diff.range', 'meta.diff.index', 'meta.separator'],
			settings: {
				foreground: '#434343',
			},
		},
		{
			scope: ['meta.diff.header.from-file', 'punctuation.definition.from-file.diff'],
			settings: {
				foreground: '#4B69C6',
			},
		},
		{
			scope: ['meta.diff.header.to-file', 'punctuation.definition.to-file.diff'],
			settings: {
				foreground: '#4B69C6',
			},
		},
		{
			scope: 'markup.deleted.diff',
			settings: {
				foreground: '#C73D20',
			},
		},
		{
			scope: 'markup.changed.diff',
			settings: {
				foreground: '#9C5D27',
			},
		},
		{
			scope: 'markup.inserted.diff',
			settings: {
				foreground: '#448C27',
			},
		},
		{
			scope: [
				'punctuation.definition.tag.js',
				'punctuation.definition.tag.begin.js',
				'punctuation.definition.tag.end.js',
			],
			settings: {
				foreground: '#91B3E0',
			},
		},
		{
			scope: 'meta.jsx.children.js',
			settings: {
				foreground: '#333333',
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
