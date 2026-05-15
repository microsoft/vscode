/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThemeRegistrationAny } from 'shiki';

export const darkHC: ThemeRegistrationAny = {
	$schema: 'vscode://schemas/color-theme',
	type: 'dark',
	colors: {
		'actionBar.toggledBackground': '#383a49',
		'editor.background': '#000000',
		'editor.foreground': '#ffffff',
		'editor.selectionBackground': '#ffffff',
		'editorIndentGuide.activeBackground1': '#ffffff',
		'editorIndentGuide.background1': '#ffffff',
		'editorWhitespace.foreground': '#7c7c7c',
		'ports.iconRunningProcessForeground': '#ffffff',
		'selection.background': '#008000',
		'sideBarTitle.foreground': '#ffffff',
		'statusBarItem.remoteBackground': '#00000000',
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
				foreground: '#FFFFFF',
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
				foreground: '#7CA668',
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
				'constant.other.color.rgb-value',
				'constant.other.rgb-value',
				'support.constant.color',
			],
			settings: {
				foreground: '#B5CEA8',
			},
		},
		{
			scope: 'constant.regexp',
			settings: {
				foreground: '#B46695',
			},
		},
		{
			scope: 'constant.character',
			settings: {
				foreground: '#569CD6',
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
				fontStyle: 'bold',
			},
		},
		{
			scope: 'markup.heading',
			settings: {
				foreground: '#6796E6',
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
			scope: ['punctuation.definition.tag'],
			settings: {
				foreground: '#808080',
			},
		},
		{
			scope: 'meta.preprocessor',
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
			scope: 'storage.modifier',
			settings: {
				foreground: '#569CD6',
			},
		},
		{
			scope: 'string',
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
				foreground: '#FFFFFF',
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
				foreground: '#D4D4D4',
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
				'keyword.operator.logical.python',
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
			scope: 'support.function.git-rebase',
			settings: {
				foreground: '#D4D4D4',
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
			scope: 'variable.language.this',
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
				'entity.name.scope-resolution',
				'entity.name.class',
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
				'source.cpp keyword.operator.delete',
				'keyword.other.using',
				'keyword.other.directive.using',
				'keyword.other.operator',
			],
			settings: {
				foreground: '#C586C0',
			},
		},
		{
			scope: ['variable', 'meta.definition.variable.name', 'support.variable'],
			settings: {
				foreground: '#9CDCFE',
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
			scope: 'meta.resultLinePrefix.contextLinePrefix.search',
			settings: {
				foreground: '#CBEDCB',
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
				foreground: '#008000',
			},
		},
		{
			scope: 'token.error-token',
			settings: {
				foreground: '#FF0000',
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
