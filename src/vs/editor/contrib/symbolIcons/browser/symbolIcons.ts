/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./symbolIcons';
import { localize } from 'vs/nls';
import { foreground, registerColor } from 'vs/platform/theme/common/colorRegistry';

export const SYMBOL_ICON_ARRAY_FOREGROUND = registerColor('symbolIcon.arrayForeground', foreground, localize('symbolIcon.arrayForeground', 'The foreground color for array symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_BOOLEAN_FOREGROUND = registerColor('symbolIcon.booleanForeground', foreground, localize('symbolIcon.booleanForeground', 'The foreground color for boolean symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_CLASS_FOREGROUND = registerColor('symbolIcon.classForeground', {
	dark: '#EE9D28',
	light: '#D67E00',
	hcDark: '#EE9D28',
	hcLight: '#D67E00'
}, localize('symbolIcon.classForeground', 'The foreground color for class symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_COLOR_FOREGROUND = registerColor('symbolIcon.colorForeground', foreground, localize('symbolIcon.colorForeground', 'The foreground color for color symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_CONSTANT_FOREGROUND = registerColor('symbolIcon.constantForeground', foreground, localize('symbolIcon.constantForeground', 'The foreground color for constant symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_CONSTRUCTOR_FOREGROUND = registerColor('symbolIcon.constructorForeground', {
	dark: '#B180D7',
	light: '#652D90',
	hcDark: '#B180D7',
	hcLight: '#652D90'
}, localize('symbolIcon.constructorForeground', 'The foreground color for constructor symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_ENUMERATOR_FOREGROUND = registerColor('symbolIcon.enumeratorForeground', {
	dark: '#EE9D28',
	light: '#D67E00',
	hcDark: '#EE9D28',
	hcLight: '#D67E00'
}, localize('symbolIcon.enumeratorForeground', 'The foreground color for enumerator symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_ENUMERATOR_MEMBER_FOREGROUND = registerColor('symbolIcon.enumeratorMemberForeground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hcDark: '#75BEFF',
	hcLight: '#007ACC'
}, localize('symbolIcon.enumeratorMemberForeground', 'The foreground color for enumerator member symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_EVENT_FOREGROUND = registerColor('symbolIcon.eventForeground', {
	dark: '#EE9D28',
	light: '#D67E00',
	hcDark: '#EE9D28',
	hcLight: '#D67E00'
}, localize('symbolIcon.eventForeground', 'The foreground color for event symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_FIELD_FOREGROUND = registerColor('symbolIcon.fieldForeground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hcDark: '#75BEFF',
	hcLight: '#007ACC'
}, localize('symbolIcon.fieldForeground', 'The foreground color for field symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_FILE_FOREGROUND = registerColor('symbolIcon.fileForeground', foreground, localize('symbolIcon.fileForeground', 'The foreground color for file symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_FOLDER_FOREGROUND = registerColor('symbolIcon.folderForeground', foreground, localize('symbolIcon.folderForeground', 'The foreground color for folder symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_FUNCTION_FOREGROUND = registerColor('symbolIcon.functionForeground', {
	dark: '#B180D7',
	light: '#652D90',
	hcDark: '#B180D7',
	hcLight: '#652D90'
}, localize('symbolIcon.functionForeground', 'The foreground color for function symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_INTERFACE_FOREGROUND = registerColor('symbolIcon.interfaceForeground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hcDark: '#75BEFF',
	hcLight: '#007ACC'
}, localize('symbolIcon.interfaceForeground', 'The foreground color for interface symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_KEY_FOREGROUND = registerColor('symbolIcon.keyForeground', foreground, localize('symbolIcon.keyForeground', 'The foreground color for key symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_KEYWORD_FOREGROUND = registerColor('symbolIcon.keywordForeground', foreground, localize('symbolIcon.keywordForeground', 'The foreground color for keyword symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_METHOD_FOREGROUND = registerColor('symbolIcon.methodForeground', {
	dark: '#B180D7',
	light: '#652D90',
	hcDark: '#B180D7',
	hcLight: '#652D90'
}, localize('symbolIcon.methodForeground', 'The foreground color for method symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_MODULE_FOREGROUND = registerColor('symbolIcon.moduleForeground', foreground, localize('symbolIcon.moduleForeground', 'The foreground color for module symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_NAMESPACE_FOREGROUND = registerColor('symbolIcon.namespaceForeground', foreground, localize('symbolIcon.namespaceForeground', 'The foreground color for namespace symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_NULL_FOREGROUND = registerColor('symbolIcon.nullForeground', foreground, localize('symbolIcon.nullForeground', 'The foreground color for null symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_NUMBER_FOREGROUND = registerColor('symbolIcon.numberForeground', foreground, localize('symbolIcon.numberForeground', 'The foreground color for number symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_OBJECT_FOREGROUND = registerColor('symbolIcon.objectForeground', foreground, localize('symbolIcon.objectForeground', 'The foreground color for object symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_OPERATOR_FOREGROUND = registerColor('symbolIcon.operatorForeground', foreground, localize('symbolIcon.operatorForeground', 'The foreground color for operator symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_PACKAGE_FOREGROUND = registerColor('symbolIcon.packageForeground', foreground, localize('symbolIcon.packageForeground', 'The foreground color for package symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_PROPERTY_FOREGROUND = registerColor('symbolIcon.propertyForeground', foreground, localize('symbolIcon.propertyForeground', 'The foreground color for property symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_REFERENCE_FOREGROUND = registerColor('symbolIcon.referenceForeground', foreground, localize('symbolIcon.referenceForeground', 'The foreground color for reference symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_SNIPPET_FOREGROUND = registerColor('symbolIcon.snippetForeground', foreground, localize('symbolIcon.snippetForeground', 'The foreground color for snippet symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_STRING_FOREGROUND = registerColor('symbolIcon.stringForeground', foreground, localize('symbolIcon.stringForeground', 'The foreground color for string symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_STRUCT_FOREGROUND = registerColor('symbolIcon.structForeground', foreground, localize('symbolIcon.structForeground', 'The foreground color for struct symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_TEXT_FOREGROUND = registerColor('symbolIcon.textForeground', foreground, localize('symbolIcon.textForeground', 'The foreground color for text symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_TYPEPARAMETER_FOREGROUND = registerColor('symbolIcon.typeParameterForeground', foreground, localize('symbolIcon.typeParameterForeground', 'The foreground color for type parameter symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_UNIT_FOREGROUND = registerColor('symbolIcon.unitForeground', foreground, localize('symbolIcon.unitForeground', 'The foreground color for unit symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_VARIABLE_FOREGROUND = registerColor('symbolIcon.variableForeground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hcDark: '#75BEFF',
	hcLight: '#007ACC',
}, localize('symbolIcon.variableForeground', 'The foreground color for variable symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));
