/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThemeRegistrationAny } from 'shiki';

export const darkModern: ThemeRegistrationAny = {
	$schema: 'vscode://schemas/color-theme',
	type: 'dark',
	colors: {
		'actionBar.toggledBackground': '#383a49',
		'activityBar.activeBorder': '#0078d4',
		'activityBar.background': '#181818',
		'activityBar.border': '#2b2b2b',
		'activityBar.foreground': '#d7d7d7',
		'activityBar.inactiveForeground': '#868686',
		'activityBarBadge.background': '#0078d4',
		'activityBarBadge.foreground': '#ffffff',
		'badge.background': '#616161',
		'badge.foreground': '#f8f8f8',
		'button.background': '#0078d4',
		'button.border': '#ffffff12',
		'button.foreground': '#ffffff',
		'button.hoverBackground': '#026ec1',
		'button.secondaryBackground': '#313131',
		'button.secondaryForeground': '#cccccc',
		'button.secondaryHoverBackground': '#3c3c3c',
		'chat.slashCommandBackground': '#34414b',
		'chat.slashCommandForeground': '#40a6ff',
		'checkbox.background': '#313131',
		'checkbox.border': '#3c3c3c',
		'debugToolBar.background': '#181818',
		descriptionForeground: '#9d9d9d',
		'dropdown.background': '#313131',
		'dropdown.border': '#3c3c3c',
		'dropdown.foreground': '#cccccc',
		'dropdown.listBackground': '#1f1f1f',
		'editor.background': '#1f1f1f',
		'editor.findMatchBackground': '#9e6a03',
		'editor.foreground': '#cccccc',
		'editor.inactiveSelectionBackground': '#3a3d41',
		'editor.selectionHighlightBackground': '#add6ff26',
		'editorGroup.border': '#ffffff17',
		'editorGroupHeader.tabsBackground': '#181818',
		'editorGroupHeader.tabsBorder': '#2b2b2b',
		'editorGutter.addedBackground': '#2ea043',
		'editorGutter.deletedBackground': '#f85149',
		'editorGutter.modifiedBackground': '#0078d4',
		'editorIndentGuide.activeBackground1': '#707070',
		'editorIndentGuide.background1': '#404040',
		'editorLineNumber.activeForeground': '#cccccc',
		'editorLineNumber.foreground': '#6e7681',
		'editorOverviewRuler.border': '#010409',
		'editorWidget.background': '#202020',
		errorForeground: '#f85149',
		focusBorder: '#0078d4',
		foreground: '#cccccc',
		'icon.foreground': '#cccccc',
		'input.background': '#313131',
		'input.border': '#3c3c3c',
		'input.foreground': '#cccccc',
		'input.placeholderForeground': '#818181',
		'inputOption.activeBackground': '#2489db82',
		'inputOption.activeBorder': '#2488db',
		'keybindingLabel.foreground': '#cccccc',
		'list.activeSelectionIconForeground': '#ffffff',
		'list.dropBackground': '#383b3d',
		'menu.background': '#1f1f1f',
		'menu.border': '#454545',
		'menu.foreground': '#cccccc',
		'menu.separatorBackground': '#454545',
		'notificationCenterHeader.background': '#1f1f1f',
		'notificationCenterHeader.foreground': '#cccccc',
		'notifications.background': '#1f1f1f',
		'notifications.border': '#2b2b2b',
		'notifications.foreground': '#cccccc',
		'panel.background': '#181818',
		'panel.border': '#2b2b2b',
		'panelInput.border': '#2b2b2b',
		'panelTitle.activeBorder': '#0078d4',
		'panelTitle.activeForeground': '#cccccc',
		'panelTitle.inactiveForeground': '#9d9d9d',
		'peekViewEditor.background': '#1f1f1f',
		'peekViewEditor.matchHighlightBackground': '#bb800966',
		'peekViewResult.background': '#1f1f1f',
		'peekViewResult.matchHighlightBackground': '#bb800966',
		'pickerGroup.border': '#3c3c3c',
		'ports.iconRunningProcessForeground': '#369432',
		'progressBar.background': '#0078d4',
		'quickInput.background': '#222222',
		'quickInput.foreground': '#cccccc',
		'settings.dropdownBackground': '#313131',
		'settings.dropdownBorder': '#3c3c3c',
		'settings.headerForeground': '#ffffff',
		'settings.modifiedItemIndicator': '#bb800966',
		'sideBar.background': '#181818',
		'sideBar.border': '#2b2b2b',
		'sideBar.foreground': '#cccccc',
		'sideBarSectionHeader.background': '#181818',
		'sideBarSectionHeader.border': '#2b2b2b',
		'sideBarSectionHeader.foreground': '#cccccc',
		'sideBarTitle.foreground': '#cccccc',
		'statusBar.background': '#181818',
		'statusBar.border': '#2b2b2b',
		'statusBar.debuggingBackground': '#0078d4',
		'statusBar.debuggingForeground': '#ffffff',
		'statusBar.focusBorder': '#0078d4',
		'statusBar.foreground': '#cccccc',
		'statusBar.noFolderBackground': '#1f1f1f',
		'statusBarItem.focusBorder': '#0078d4',
		'statusBarItem.prominentBackground': '#6e768166',
		'statusBarItem.remoteBackground': '#0078d4',
		'statusBarItem.remoteForeground': '#ffffff',
		'tab.activeBackground': '#1f1f1f',
		'tab.activeBorder': '#1f1f1f',
		'tab.activeBorderTop': '#0078d4',
		'tab.activeForeground': '#ffffff',
		'tab.border': '#2b2b2b',
		'tab.hoverBackground': '#1f1f1f',
		'tab.inactiveBackground': '#181818',
		'tab.inactiveForeground': '#9d9d9d',
		'tab.lastPinnedBorder': '#cccccc33',
		'tab.unfocusedActiveBorder': '#1f1f1f',
		'tab.unfocusedActiveBorderTop': '#2b2b2b',
		'tab.unfocusedHoverBackground': '#1f1f1f',
		'terminal.foreground': '#cccccc',
		'terminal.inactiveSelectionBackground': '#3a3d41',
		'terminal.tab.activeBorder': '#0078d4',
		'textBlockQuote.background': '#2b2b2b',
		'textBlockQuote.border': '#616161',
		'textCodeBlock.background': '#2b2b2b',
		'textLink.activeForeground': '#4daafc',
		'textLink.foreground': '#4daafc',
		'textPreformat.background': '#3c3c3c',
		'textPreformat.foreground': '#d0d0d0',
		'textSeparator.foreground': '#21262d',
		'titleBar.activeBackground': '#181818',
		'titleBar.activeForeground': '#cccccc',
		'titleBar.border': '#2b2b2b',
		'titleBar.inactiveBackground': '#1f1f1f',
		'titleBar.inactiveForeground': '#9d9d9d',
		'welcomePage.progress.foreground': '#0078d4',
		'welcomePage.tileBackground': '#2b2b2b',
		'widget.border': '#313131',
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
			scope: [
				'entity.name.function',
				'support.function',
				'support.constant.handlebars',
				'source.powershell variable.other.member',
				'entity.name.operator.custom-literal',
			],
			settings: {
				foreground: '#DCDCAA',
			},
		},
		{
			scope: [
				'support.class',
				'support.type',
				'entity.name.type',
				'entity.name.namespace',
				'entity.other.attribute',
				'entity.name.scope-resolution',
				'entity.name.class',
				'storage.type.numeric.go',
				'storage.type.byte.go',
				'storage.type.boolean.go',
				'storage.type.string.go',
				'storage.type.uintptr.go',
				'storage.type.error.go',
				'storage.type.rune.go',
				'storage.type.cs',
				'storage.type.generic.cs',
				'storage.type.modifier.cs',
				'storage.type.variable.cs',
				'storage.type.annotation.java',
				'storage.type.generic.java',
				'storage.type.java',
				'storage.type.object.array.java',
				'storage.type.primitive.array.java',
				'storage.type.primitive.java',
				'storage.type.token.java',
				'storage.type.groovy',
				'storage.type.annotation.groovy',
				'storage.type.parameters.groovy',
				'storage.type.generic.groovy',
				'storage.type.object.array.groovy',
				'storage.type.primitive.array.groovy',
				'storage.type.primitive.groovy',
			],
			settings: {
				foreground: '#4EC9B0',
			},
		},
		{
			scope: [
				'meta.type.cast.expr',
				'meta.type.new.expr',
				'support.constant.math',
				'support.constant.dom',
				'support.constant.json',
				'entity.other.inherited-class',
			],
			settings: {
				foreground: '#4EC9B0',
			},
		},
		{
			scope: [
				'keyword.control',
				'source.cpp keyword.operator.new',
				'keyword.operator.delete',
				'keyword.other.using',
				'keyword.other.directive.using',
				'keyword.other.operator',
				'entity.name.operator',
			],
			settings: {
				foreground: '#C586C0',
			},
		},
		{
			scope: [
				'variable',
				'meta.definition.variable.name',
				'support.variable',
				'entity.name.variable',
				'constant.other.placeholder',
			],
			settings: {
				foreground: '#9CDCFE',
			},
		},
		{
			scope: ['variable.other.constant', 'variable.other.enummember'],
			settings: {
				foreground: '#4FC1FF',
			},
		},
		{
			scope: ['meta.object-literal.key'],
			settings: {
				foreground: '#9CDCFE',
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
				foreground: '#CE9178',
			},
		},
		{
			scope: [
				'punctuation.definition.group.regexp',
				'punctuation.definition.group.assertion.regexp',
				'punctuation.definition.character-class.regexp',
				'punctuation.character.set.begin.regexp',
				'punctuation.character.set.end.regexp',
				'keyword.operator.negation.regexp',
				'support.other.parenthesis.regexp',
			],
			settings: {
				foreground: '#CE9178',
			},
		},
		{
			scope: [
				'constant.character.character-class.regexp',
				'constant.other.character-class.set.regexp',
				'constant.other.character-class.regexp',
				'constant.character.set.regexp',
			],
			settings: {
				foreground: '#D16969',
			},
		},
		{
			scope: ['keyword.operator.or.regexp', 'keyword.control.anchor.regexp'],
			settings: {
				foreground: '#DCDCAA',
			},
		},
		{
			scope: 'keyword.operator.quantifier.regexp',
			settings: {
				foreground: '#D7BA7D',
			},
		},
		{
			scope: ['constant.character', 'constant.other.option'],
			settings: {
				foreground: '#569CD6',
			},
		},
		{
			scope: 'constant.character.escape',
			settings: {
				foreground: '#D7BA7D',
			},
		},
		{
			scope: 'entity.name.label',
			settings: {
				foreground: '#C8C8C8',
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
