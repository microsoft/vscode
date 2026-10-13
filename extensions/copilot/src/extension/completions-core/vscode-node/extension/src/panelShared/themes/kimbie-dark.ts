/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThemeRegistrationAny } from 'shiki';

export const kimbieDark: ThemeRegistrationAny = {
	$schema: 'vscode://schemas/color-theme',
	type: 'dark',
	colors: {
		'activityBar.background': '#221a0f',
		'activityBar.foreground': '#d3af86',
		'badge.background': '#7f5d38',
		'button.background': '#6e583b',
		'dropdown.background': '#51412c',
		'editor.background': '#221a0f',
		'editor.foreground': '#d3af86',
		'editor.lineHighlightBackground': '#5e452b',
		'editor.selectionBackground': '#84613daa',
		'editorCursor.foreground': '#d3af86',
		'editorGroupHeader.tabsBackground': '#131510',
		'editorHoverWidget.background': '#221a14',
		'editorLineNumber.activeForeground': '#adadad',
		'editorWhitespace.foreground': '#a57a4c',
		'editorWidget.background': '#131510',
		focusBorder: '#a57a4c',
		'input.background': '#51412c',
		'inputOption.activeBorder': '#a57a4c',
		'inputValidation.errorBackground': '#5f0d0d',
		'inputValidation.errorBorder': '#9d2f23',
		'inputValidation.infoBackground': '#2b2a42',
		'inputValidation.infoBorder': '#1b60a5',
		'inputValidation.warningBackground': '#51412c',
		'list.activeSelectionBackground': '#7c5021',
		'list.highlightForeground': '#e3b583',
		'list.hoverBackground': '#7c502166',
		'list.inactiveSelectionBackground': '#645342',
		'menu.background': '#362712',
		'menu.foreground': '#cccccc',
		'minimap.selectionHighlight': '#84613daa',
		'peekView.border': '#5e452b',
		'peekViewEditor.background': '#221a14',
		'peekViewEditor.matchHighlightBackground': '#84613daa',
		'peekViewResult.background': '#362712',
		'peekViewTitle.background': '#362712',
		'pickerGroup.border': '#e3b583',
		'pickerGroup.foreground': '#e3b583',
		'ports.iconRunningProcessForeground': '#369432',
		'progressBar.background': '#7f5d38',
		'quickInputList.focusBackground': '#7c5021aa',
		'selection.background': '#84613daa',
		'sideBar.background': '#362712',
		'statusBar.background': '#423523',
		'statusBar.debuggingBackground': '#423523',
		'statusBar.noFolderBackground': '#423523',
		'statusBarItem.remoteBackground': '#6e583b',
		'tab.inactiveBackground': '#131510',
		'tab.lastPinnedBorder': '#51412c',
		'titleBar.activeBackground': '#423523',
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
				foreground: '#D3AF86',
			},
		},
		{
			scope: 'variable.parameter.function',
			settings: {
				foreground: '#D3AF86',
			},
		},
		{
			scope: ['comment', 'punctuation.definition.comment'],
			settings: {
				foreground: '#A57A4C',
			},
		},
		{
			scope: [
				'punctuation.definition.string',
				'punctuation.definition.variable',
				'punctuation.definition.string',
				'punctuation.definition.parameters',
				'punctuation.definition.string',
				'punctuation.definition.array',
			],
			settings: {
				foreground: '#D3AF86',
			},
		},
		{
			scope: 'none',
			settings: {
				foreground: '#D3AF86',
			},
		},
		{
			scope: 'keyword.operator',
			settings: {
				foreground: '#D3AF86',
			},
		},
		{
			scope: [
				'keyword',
				'keyword.control',
				'keyword.operator.new.cpp',
				'keyword.operator.delete.cpp',
				'keyword.other.using',
				'keyword.other.directive.using',
				'keyword.other.operator',
			],
			settings: {
				foreground: '#98676A',
			},
		},
		{
			scope: 'variable',
			settings: {
				foreground: '#DC3958',
			},
		},
		{
			scope: ['entity.name.function', 'meta.require', 'support.function.any-method'],
			settings: {
				foreground: '#8AB1B0',
			},
		},
		{
			scope: [
				'support.class',
				'entity.name.class',
				'entity.name.type',
				'entity.name.namespace',
				'entity.name.scope-resolution',
			],
			settings: {
				foreground: '#F06431',
			},
		},
		{
			scope: 'keyword.other.special-method',
			settings: {
				foreground: '#8AB1B0',
			},
		},
		{
			scope: 'storage',
			settings: {
				foreground: '#98676A',
			},
		},
		{
			scope: 'support.function',
			settings: {
				foreground: '#7E602C',
			},
		},
		{
			scope: ['string', 'constant.other.symbol', 'entity.other.inherited-class'],
			settings: {
				foreground: '#889B4A',
			},
		},
		{
			scope: 'constant.numeric',
			settings: {
				foreground: '#F79A32',
			},
		},
		{
			scope: 'none',
			settings: {
				foreground: '#F79A32',
			},
		},
		{
			scope: 'none',
			settings: {
				foreground: '#F79A32',
			},
		},
		{
			scope: 'constant',
			settings: {
				foreground: '#F79A32',
			},
		},
		{
			scope: 'entity.name.tag',
			settings: {
				foreground: '#DC3958',
			},
		},
		{
			scope: 'entity.other.attribute-name',
			settings: {
				foreground: '#F79A32',
			},
		},
		{
			scope: ['entity.other.attribute-name.id', 'punctuation.definition.entity'],
			settings: {
				foreground: '#8AB1B0',
			},
		},
		{
			scope: 'meta.selector',
			settings: {
				foreground: '#98676A',
			},
		},
		{
			scope: 'none',
			settings: {
				foreground: '#F79A32',
			},
		},
		{
			scope: ['markup.heading', 'markup.heading.setext', 'punctuation.definition.heading', 'entity.name.section'],
			settings: {
				foreground: '#8AB1B0',
				fontStyle: 'bold',
			},
		},
		{
			scope: 'keyword.other.unit',
			settings: {
				foreground: '#F79A32',
			},
		},
		{
			scope: ['markup.bold', 'punctuation.definition.bold'],
			settings: {
				foreground: '#F06431',
				fontStyle: 'bold',
			},
		},
		{
			scope: ['markup.italic', 'punctuation.definition.italic'],
			settings: {
				foreground: '#98676A',
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
				foreground: '#889B4A',
			},
		},
		{
			scope: 'string.other.link',
			settings: {
				foreground: '#DC3958',
			},
		},
		{
			scope: 'meta.link',
			settings: {
				foreground: '#F79A32',
			},
		},
		{
			scope: 'markup.list',
			settings: {
				foreground: '#DC3958',
			},
		},
		{
			scope: 'markup.quote',
			settings: {
				foreground: '#F79A32',
			},
		},
		{
			scope: 'meta.separator',
			settings: {
				foreground: '#D3AF86',
			},
		},
		{
			scope: 'markup.inserted',
			settings: {
				foreground: '#889B4A',
			},
		},
		{
			scope: 'markup.deleted',
			settings: {
				foreground: '#DC3958',
			},
		},
		{
			scope: 'markup.changed',
			settings: {
				foreground: '#98676A',
			},
		},
		{
			scope: 'constant.other.color',
			settings: {
				foreground: '#7E602C',
			},
		},
		{
			scope: 'string.regexp',
			settings: {
				foreground: '#7E602C',
			},
		},
		{
			scope: 'constant.character.escape',
			settings: {
				foreground: '#7E602C',
			},
		},
		{
			scope: ['punctuation.section.embedded', 'variable.interpolation'],
			settings: {
				foreground: '#088649',
			},
		},
		{
			scope: 'invalid',
			settings: {
				foreground: '#DC3958',
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
