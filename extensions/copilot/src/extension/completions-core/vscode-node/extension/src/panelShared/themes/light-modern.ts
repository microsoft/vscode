/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThemeRegistrationAny } from 'shiki';

export const lightModern: ThemeRegistrationAny = {
	$schema: 'vscode://schemas/color-theme',
	type: 'light',
	colors: {
		'actionBar.toggledBackground': '#dddddd',
		'activityBar.activeBorder': '#005fb8',
		'activityBar.background': '#f8f8f8',
		'activityBar.border': '#e5e5e5',
		'activityBar.foreground': '#1f1f1f',
		'activityBar.inactiveForeground': '#616161',
		'activityBarBadge.background': '#005fb8',
		'activityBarBadge.foreground': '#ffffff',
		'badge.background': '#cccccc',
		'badge.foreground': '#3b3b3b',
		'button.background': '#005fb8',
		'button.border': '#0000001a',
		'button.foreground': '#ffffff',
		'button.hoverBackground': '#0258a8',
		'button.secondaryBackground': '#e5e5e5',
		'button.secondaryForeground': '#3b3b3b',
		'button.secondaryHoverBackground': '#cccccc',
		'chat.slashCommandBackground': '#d2ecff',
		'chat.slashCommandForeground': '#306ca2',
		'checkbox.background': '#f8f8f8',
		'checkbox.border': '#cecece',
		descriptionForeground: '#3b3b3b',
		'dropdown.background': '#ffffff',
		'dropdown.border': '#cecece',
		'dropdown.foreground': '#3b3b3b',
		'dropdown.listBackground': '#ffffff',
		'editor.background': '#ffffff',
		'editor.foreground': '#3b3b3b',
		'editor.inactiveSelectionBackground': '#e5ebf1',
		'editor.selectionHighlightBackground': '#add6ff80',
		'editorGroup.border': '#e5e5e5',
		'editorGroupHeader.tabsBackground': '#f8f8f8',
		'editorGroupHeader.tabsBorder': '#e5e5e5',
		'editorGutter.addedBackground': '#2ea043',
		'editorGutter.deletedBackground': '#f85149',
		'editorGutter.modifiedBackground': '#005fb8',
		'editorIndentGuide.activeBackground1': '#939393',
		'editorIndentGuide.background1': '#d3d3d3',
		'editorLineNumber.activeForeground': '#171184',
		'editorLineNumber.foreground': '#6e7681',
		'editorOverviewRuler.border': '#e5e5e5',
		'editorSuggestWidget.background': '#f8f8f8',
		'editorWidget.background': '#f8f8f8',
		errorForeground: '#f85149',
		focusBorder: '#005fb8',
		foreground: '#3b3b3b',
		'icon.foreground': '#3b3b3b',
		'input.background': '#ffffff',
		'input.border': '#cecece',
		'input.foreground': '#3b3b3b',
		'input.placeholderForeground': '#868686',
		'inputOption.activeBackground': '#bed6ed',
		'inputOption.activeBorder': '#005fb8',
		'inputOption.activeForeground': '#000000',
		'keybindingLabel.foreground': '#3b3b3b',
		'list.activeSelectionBackground': '#e8e8e8',
		'list.activeSelectionForeground': '#000000',
		'list.activeSelectionIconForeground': '#000000',
		'list.focusAndSelectionOutline': '#005fb8',
		'list.hoverBackground': '#f2f2f2',
		'menu.border': '#cecece',
		'notebook.cellBorderColor': '#e5e5e5',
		'notebook.selectedCellBackground': '#c8ddf150',
		'notificationCenterHeader.background': '#ffffff',
		'notificationCenterHeader.foreground': '#3b3b3b',
		'notifications.background': '#ffffff',
		'notifications.border': '#e5e5e5',
		'notifications.foreground': '#3b3b3b',
		'panel.background': '#f8f8f8',
		'panel.border': '#e5e5e5',
		'panelInput.border': '#e5e5e5',
		'panelTitle.activeBorder': '#005fb8',
		'panelTitle.activeForeground': '#3b3b3b',
		'panelTitle.inactiveForeground': '#3b3b3b',
		'peekViewEditor.matchHighlightBackground': '#bb800966',
		'peekViewResult.background': '#ffffff',
		'peekViewResult.matchHighlightBackground': '#bb800966',
		'pickerGroup.border': '#e5e5e5',
		'pickerGroup.foreground': '#8b949e',
		'ports.iconRunningProcessForeground': '#369432',
		'progressBar.background': '#005fb8',
		'quickInput.background': '#f8f8f8',
		'quickInput.foreground': '#3b3b3b',
		'searchEditor.textInputBorder': '#cecece',
		'settings.dropdownBackground': '#ffffff',
		'settings.dropdownBorder': '#cecece',
		'settings.headerForeground': '#1f1f1f',
		'settings.modifiedItemIndicator': '#bb800966',
		'settings.numberInputBorder': '#cecece',
		'settings.textInputBorder': '#cecece',
		'sideBar.background': '#f8f8f8',
		'sideBar.border': '#e5e5e5',
		'sideBar.foreground': '#3b3b3b',
		'sideBarSectionHeader.background': '#f8f8f8',
		'sideBarSectionHeader.border': '#e5e5e5',
		'sideBarSectionHeader.foreground': '#3b3b3b',
		'sideBarTitle.foreground': '#3b3b3b',
		'statusBar.background': '#f8f8f8',
		'statusBar.border': '#e5e5e5',
		'statusBar.debuggingBackground': '#fd716c',
		'statusBar.debuggingForeground': '#000000',
		'statusBar.focusBorder': '#005fb8',
		'statusBar.foreground': '#3b3b3b',
		'statusBar.noFolderBackground': '#f8f8f8',
		'statusBarItem.errorBackground': '#c72e0f',
		'statusBarItem.focusBorder': '#005fb8',
		'statusBarItem.prominentBackground': '#6e768166',
		'statusBarItem.remoteBackground': '#005fb8',
		'statusBarItem.remoteForeground': '#ffffff',
		'tab.activeBackground': '#ffffff',
		'tab.activeBorder': '#f8f8f8',
		'tab.activeBorderTop': '#005fb8',
		'tab.activeForeground': '#3b3b3b',
		'tab.border': '#e5e5e5',
		'tab.hoverBackground': '#ffffff',
		'tab.inactiveBackground': '#f8f8f8',
		'tab.inactiveForeground': '#868686',
		'tab.lastPinnedBorder': '#d4d4d4',
		'tab.unfocusedActiveBorder': '#f8f8f8',
		'tab.unfocusedActiveBorderTop': '#e5e5e5',
		'tab.unfocusedHoverBackground': '#f8f8f8',
		'terminal.foreground': '#3b3b3b',
		'terminal.inactiveSelectionBackground': '#e5ebf1',
		'terminal.tab.activeBorder': '#005fb8',
		'terminalCursor.foreground': '#005fb8',
		'textBlockQuote.background': '#f8f8f8',
		'textBlockQuote.border': '#e5e5e5',
		'textCodeBlock.background': '#f8f8f8',
		'textLink.activeForeground': '#005fb8',
		'textLink.foreground': '#005fb8',
		'textPreformat.background': '#0000001f',
		'textPreformat.foreground': '#3b3b3b',
		'textSeparator.foreground': '#21262d',
		'titleBar.activeBackground': '#f8f8f8',
		'titleBar.activeForeground': '#1e1e1e',
		'titleBar.border': '#e5e5e5',
		'titleBar.inactiveBackground': '#f8f8f8',
		'titleBar.inactiveForeground': '#8b949e',
		'welcomePage.tileBackground': '#f3f3f3',
		'widget.border': '#e5e5e5',
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
			scope: [
				'entity.name.function',
				'support.function',
				'support.constant.handlebars',
				'source.powershell variable.other.member',
				'entity.name.operator.custom-literal',
			],
			settings: {
				foreground: '#795E26',
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
				foreground: '#267F99',
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
				foreground: '#267F99',
			},
		},
		{
			scope: [
				'keyword.control',
				'source.cpp keyword.operator.new',
				'source.cpp keyword.operator.delete',
				'keyword.other.using',
				'keyword.other.directive.using',
				'keyword.other.operator',
				'entity.name.operator',
			],
			settings: {
				foreground: '#AF00DB',
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
				foreground: '#001080',
			},
		},
		{
			scope: ['variable.other.constant', 'variable.other.enummember'],
			settings: {
				foreground: '#0070C1',
			},
		},
		{
			scope: ['meta.object-literal.key'],
			settings: {
				foreground: '#001080',
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
				'punctuation.definition.group.regexp',
				'punctuation.definition.group.assertion.regexp',
				'punctuation.definition.character-class.regexp',
				'punctuation.character.set.begin.regexp',
				'punctuation.character.set.end.regexp',
				'keyword.operator.negation.regexp',
				'support.other.parenthesis.regexp',
			],
			settings: {
				foreground: '#D16969',
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
				foreground: '#811F3F',
			},
		},
		{
			scope: 'keyword.operator.quantifier.regexp',
			settings: {
				foreground: '#000000',
			},
		},
		{
			scope: ['keyword.operator.or.regexp', 'keyword.control.anchor.regexp'],
			settings: {
				foreground: '#EE0000',
			},
		},
		{
			scope: ['constant.character', 'constant.other.option'],
			settings: {
				foreground: '#0000FF',
			},
		},
		{
			scope: 'constant.character.escape',
			settings: {
				foreground: '#EE0000',
			},
		},
		{
			scope: 'entity.name.label',
			settings: {
				foreground: '#000000',
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
