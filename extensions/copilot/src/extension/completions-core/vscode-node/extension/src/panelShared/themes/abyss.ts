/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThemeRegistrationAny } from 'shiki';

export const abyss: ThemeRegistrationAny = {
	type: 'dark',
	colors: {
		'activityBar.background': '#051336',
		'badge.background': '#0063a5',
		'button.background': '#2b3c5d',
		'debugExceptionWidget.background': '#051336',
		'debugExceptionWidget.border': '#ab395b',
		'debugToolBar.background': '#051336',
		'diffEditor.insertedTextBackground': '#31958a55',
		'diffEditor.removedTextBackground': '#892f4688',
		'dropdown.background': '#181f2f',
		'editor.background': '#000c18',
		'editor.findMatchHighlightBackground': '#eeeeee44',
		'editor.foreground': '#6688cc',
		'editor.lineHighlightBackground': '#082050',
		'editor.selectionBackground': '#770811',
		'editorCursor.foreground': '#ddbb88',
		'editorGroup.border': '#2b2b4a',
		'editorGroup.dropBackground': '#25375daa',
		'editorGroupHeader.tabsBackground': '#1c1c2a',
		'editorHoverWidget.background': '#000c38',
		'editorHoverWidget.border': '#004c18',
		'editorIndentGuide.activeBackground': '#204972',
		'editorIndentGuide.background': '#002952',
		'editorLineNumber.activeForeground': '#80a2c2',
		'editorLineNumber.foreground': '#406385',
		'editorLink.activeForeground': '#0063a5',
		'editorMarkerNavigation.background': '#060621',
		'editorMarkerNavigationError.background': '#ab395b',
		'editorMarkerNavigationWarning.background': '#5b7e7a',
		'editorWhitespace.foreground': '#103050',
		'editorWidget.background': '#262641',
		'extensionButton.prominentBackground': '#5f8b3b',
		'extensionButton.prominentHoverBackground': '#5f8b3bbb',
		focusBorder: '#596f99',
		'input.background': '#181f2f',
		'inputOption.activeBorder': '#1d4a87',
		'inputValidation.errorBackground': '#a22d44',
		'inputValidation.errorBorder': '#ab395b',
		'inputValidation.infoBackground': '#051336',
		'inputValidation.infoBorder': '#384078',
		'inputValidation.warningBackground': '#5b7e7a',
		'inputValidation.warningBorder': '#5b7e7a',
		'list.activeSelectionBackground': '#08286b',
		'list.dropBackground': '#041d52',
		'list.highlightForeground': '#0063a5',
		'list.hoverBackground': '#061940',
		'list.inactiveSelectionBackground': '#152037',
		'minimap.selectionHighlight': '#750000',
		'panel.border': '#2b2b4a',
		'peekView.border': '#2b2b4a',
		'peekViewEditor.background': '#10192c',
		'peekViewEditor.matchHighlightBackground': '#eeeeee33',
		'peekViewResult.background': '#060621',
		'peekViewResult.matchHighlightBackground': '#eeeeee44',
		'peekViewTitle.background': '#10192c',
		'pickerGroup.border': '#596f99',
		'pickerGroup.foreground': '#596f99',
		'ports.iconRunningProcessForeground': '#80a2c2',
		'progressBar.background': '#0063a5',
		'quickInputList.focusBackground': '#08286b',
		'scrollbar.shadow': '#515e91aa',
		'scrollbarSlider.activeBackground': '#3b3f5188',
		'scrollbarSlider.background': '#1f2230aa',
		'scrollbarSlider.hoverBackground': '#3b3f5188',
		'sideBar.background': '#060621',
		'sideBarSectionHeader.background': '#10192c',
		'statusBar.background': '#10192c',
		'statusBar.debuggingBackground': '#10192c',
		'statusBar.noFolderBackground': '#10192c',
		'statusBarItem.prominentBackground': '#0063a5',
		'statusBarItem.prominentHoverBackground': '#0063a5dd',
		'statusBarItem.remoteBackground': '#0063a5',
		'tab.border': '#2b2b4a',
		'tab.inactiveBackground': '#10192c',
		'tab.lastPinnedBorder': '#2b3c5d',
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
		'titleBar.activeBackground': '#10192c',
	},
	tokenColors: [
		{
			scope: ['meta.embedded', 'source.groovy.embedded', 'string meta.image.inline.markdown'],
			settings: {
				foreground: '#6688CC',
			},
		},
		{
			scope: 'comment',
			settings: {
				foreground: '#384887',
			},
		},
		{
			scope: 'string',
			settings: {
				foreground: '#22AA44',
			},
		},
		{
			scope: 'constant.numeric',
			settings: {
				foreground: '#F280D0',
			},
		},
		{
			scope: 'constant.language',
			settings: {
				foreground: '#F280D0',
			},
		},
		{
			scope: ['constant.character', 'constant.other'],
			settings: {
				foreground: '#F280D0',
			},
		},
		{
			scope: 'variable',
			settings: {
				fontStyle: '',
			},
		},
		{
			scope: 'keyword',
			settings: {
				foreground: '#225588',
			},
		},
		{
			scope: 'storage',
			settings: {
				foreground: '#225588',
				fontStyle: '',
			},
		},
		{
			scope: 'storage.type',
			settings: {
				foreground: '#9966B8',
				fontStyle: 'italic',
			},
		},
		{
			scope: ['entity.name.class', 'entity.name.type', 'entity.name.namespace', 'entity.name.scope-resolution'],
			settings: {
				foreground: '#FFEEBB',
				fontStyle: 'underline',
			},
		},
		{
			scope: 'entity.other.inherited-class',
			settings: {
				foreground: '#DDBB88',
				fontStyle: 'italic underline',
			},
		},
		{
			scope: 'entity.name.function',
			settings: {
				foreground: '#DDBB88',
				fontStyle: '',
			},
		},
		{
			scope: 'variable.parameter',
			settings: {
				foreground: '#2277FF',
				fontStyle: 'italic',
			},
		},
		{
			scope: 'entity.name.tag',
			settings: {
				foreground: '#225588',
				fontStyle: '',
			},
		},
		{
			scope: 'entity.other.attribute-name',
			settings: {
				foreground: '#DDBB88',
				fontStyle: '',
			},
		},
		{
			scope: 'support.function',
			settings: {
				foreground: '#9966B8',
				fontStyle: '',
			},
		},
		{
			scope: 'support.constant',
			settings: {
				foreground: '#9966B8',
				fontStyle: '',
			},
		},
		{
			scope: ['support.type', 'support.class'],
			settings: {
				foreground: '#9966B8',
				fontStyle: 'italic',
			},
		},
		{
			scope: 'support.other.variable',
			settings: {
				fontStyle: '',
			},
		},
		{
			scope: 'invalid',
			settings: {
				foreground: '#A22D44',
				fontStyle: '',
			},
		},
		{
			scope: 'invalid.deprecated',
			settings: {
				foreground: '#A22D44',
			},
		},
		{
			scope: ['meta.diff', 'meta.diff.header'],
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
				foreground: '#22AA44',
			},
		},
		{
			scope: ['markup.bold', 'markup.italic'],
			settings: {
				foreground: '#22AA44',
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
				foreground: '#9966B8',
				fontStyle: '',
			},
		},
		{
			scope: ['markup.heading', 'markup.heading.setext'],
			settings: {
				foreground: '#6688CC',
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
