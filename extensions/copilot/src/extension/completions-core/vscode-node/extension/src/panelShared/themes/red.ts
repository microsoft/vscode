/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThemeRegistrationAny } from 'shiki';

export const red: ThemeRegistrationAny = {
	$schema: 'vscode://schemas/color-theme',
	type: 'dark',
	colors: {
		'activityBar.background': '#580000',
		'badge.background': '#cc3333',
		'button.background': '#883333',
		'debugToolBar.background': '#660000',
		'dropdown.background': '#580000',
		'editor.background': '#390000',
		'editor.foreground': '#f8f8f8',
		'editor.hoverHighlightBackground': '#ff000044',
		'editor.lineHighlightBackground': '#ff000033',
		'editor.selectionBackground': '#750000',
		'editor.selectionHighlightBackground': '#f5500039',
		'editorCursor.foreground': '#970000',
		'editorGroup.border': '#ff666633',
		'editorGroupHeader.tabsBackground': '#330000',
		'editorHoverWidget.background': '#300000',
		'editorLineNumber.activeForeground': '#ffbbbb88',
		'editorLineNumber.foreground': '#ff777788',
		'editorLink.activeForeground': '#ffd0aa',
		'editorSuggestWidget.background': '#300000',
		'editorSuggestWidget.border': '#220000',
		'editorWhitespace.foreground': '#c10000',
		'editorWidget.background': '#300000',
		errorForeground: '#ffeaea',
		'extensionButton.prominentBackground': '#cc3333',
		'extensionButton.prominentHoverBackground': '#cc333388',
		focusBorder: '#ff6666aa',
		'input.background': '#580000',
		'inputOption.activeBorder': '#cc0000',
		'inputValidation.infoBackground': '#550000',
		'inputValidation.infoBorder': '#db7e58',
		'list.activeSelectionBackground': '#880000',
		'list.dropBackground': '#662222',
		'list.highlightForeground': '#ff4444',
		'list.hoverBackground': '#800000',
		'list.inactiveSelectionBackground': '#770000',
		'minimap.selectionHighlight': '#750000',
		'peekView.border': '#ff000044',
		'peekViewEditor.background': '#300000',
		'peekViewResult.background': '#400000',
		'peekViewTitle.background': '#550000',
		'pickerGroup.border': '#ff000033',
		'pickerGroup.foreground': '#cc9999',
		'ports.iconRunningProcessForeground': '#db7e58',
		'progressBar.background': '#cc3333',
		'quickInputList.focusBackground': '#660000',
		'selection.background': '#ff777788',
		'sideBar.background': '#330000',
		'statusBar.background': '#700000',
		'statusBar.noFolderBackground': '#700000',
		'statusBarItem.remoteBackground': '#cc3333',
		'tab.activeBackground': '#490000',
		'tab.inactiveBackground': '#300a0a',
		'tab.lastPinnedBorder': '#ff000044',
		'titleBar.activeBackground': '#770000',
		'titleBar.inactiveBackground': '#772222',
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
				foreground: '#F8F8F8',
			},
		},
		{
			scope: 'comment',
			settings: {
				foreground: '#E7C0C0',
				fontStyle: 'italic',
			},
		},
		{
			scope: 'constant',
			settings: {
				foreground: '#994646',
				fontStyle: '',
			},
		},
		{
			scope: 'keyword',
			settings: {
				foreground: '#F12727',
				fontStyle: '',
			},
		},
		{
			scope: 'entity',
			settings: {
				foreground: '#FEC758',
				fontStyle: '',
			},
		},
		{
			scope: 'storage',
			settings: {
				foreground: '#FF6262',
				fontStyle: 'bold',
			},
		},
		{
			scope: 'string',
			settings: {
				foreground: '#CD8D8D',
				fontStyle: '',
			},
		},
		{
			scope: 'support',
			settings: {
				foreground: '#9DF39F',
				fontStyle: '',
			},
		},
		{
			scope: 'variable',
			settings: {
				foreground: '#FB9A4B',
				fontStyle: 'italic',
			},
		},
		{
			scope: 'invalid',
			settings: {
				foreground: '#FFFFFF',
			},
		},
		{
			scope: 'entity.other.inherited-class',
			settings: {
				foreground: '#AA5507',
				fontStyle: 'underline',
			},
		},
		{
			scope: 'constant.character',
			settings: {
				foreground: '#EC0D1E',
			},
		},
		{
			scope: ['string constant', 'constant.character.escape'],
			settings: {
				foreground: '#FFE862',
				fontStyle: '',
			},
		},
		{
			scope: 'string.regexp',
			settings: {
				foreground: '#FFB454',
			},
		},
		{
			scope: 'string variable',
			settings: {
				foreground: '#EDEF7D',
			},
		},
		{
			scope: 'support.function',
			settings: {
				foreground: '#FFB454',
				fontStyle: '',
			},
		},
		{
			scope: ['support.constant', 'support.variable'],
			settings: {
				foreground: '#EB939A',
				fontStyle: '',
			},
		},
		{
			scope: [
				'declaration.sgml.html declaration.doctype',
				'declaration.sgml.html declaration.doctype entity',
				'declaration.sgml.html declaration.doctype string',
				'declaration.xml-processing',
				'declaration.xml-processing entity',
				'declaration.xml-processing string',
			],
			settings: {
				foreground: '#73817D',
				fontStyle: '',
			},
		},
		{
			scope: ['declaration.tag', 'declaration.tag entity', 'meta.tag', 'meta.tag entity'],
			settings: {
				foreground: '#EC0D1E',
				fontStyle: '',
			},
		},
		{
			scope: 'meta.selector.css entity.name.tag',
			settings: {
				foreground: '#AA5507',
				fontStyle: '',
			},
		},
		{
			scope: 'meta.selector.css entity.other.attribute-name.id',
			settings: {
				foreground: '#FEC758',
			},
		},
		{
			scope: 'meta.selector.css entity.other.attribute-name.class',
			settings: {
				foreground: '#41A83E',
				fontStyle: '',
			},
		},
		{
			scope: 'support.type.property-name.css',
			settings: {
				foreground: '#96DD3B',
				fontStyle: '',
			},
		},
		{
			scope: [
				'meta.property-group support.constant.property-value.css',
				'meta.property-value support.constant.property-value.css',
			],
			settings: {
				foreground: '#FFE862',
				fontStyle: 'italic',
			},
		},
		{
			scope: ['meta.property-value support.constant.named-color.css', 'meta.property-value constant'],
			settings: {
				foreground: '#FFE862',
				fontStyle: '',
			},
		},
		{
			scope: 'meta.preprocessor.at-rule keyword.control.at-rule',
			settings: {
				foreground: '#FD6209',
			},
		},
		{
			scope: 'meta.constructor.argument.css',
			settings: {
				foreground: '#EC9799',
				fontStyle: '',
			},
		},
		{
			scope: ['meta.diff', 'meta.diff.header'],
			settings: {
				foreground: '#F8F8F8',
				fontStyle: 'italic',
			},
		},
		{
			scope: 'markup.deleted',
			settings: {
				foreground: '#EC9799',
			},
		},
		{
			scope: 'markup.changed',
			settings: {
				foreground: '#F8F8F8',
			},
		},
		{
			scope: 'markup.inserted',
			settings: {
				foreground: '#41A83E',
			},
		},
		{
			scope: 'markup.quote',
			settings: {
				foreground: '#F12727',
			},
		},
		{
			scope: 'markup.list',
			settings: {
				foreground: '#FF6262',
			},
		},
		{
			scope: ['markup.bold', 'markup.italic'],
			settings: {
				foreground: '#FB9A4B',
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
				foreground: '#CD8D8D',
				fontStyle: '',
			},
		},
		{
			scope: ['markup.heading', 'markup.heading.setext', 'punctuation.definition.heading', 'entity.name.section'],
			settings: {
				foreground: '#FEC758',
				fontStyle: 'bold',
			},
		},
		{
			scope: [
				'punctuation.definition.template-expression.begin',
				'punctuation.definition.template-expression.end',
				'punctuation.section.embedded',
				'.format.placeholder',
			],
			settings: {
				foreground: '#EC0D1E',
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
