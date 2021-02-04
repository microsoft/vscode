/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerThemingParticipant, IColorTheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { registerColor, foreground } from 'vs/platform/theme/common/colorRegistry';
import { Codicon } from 'vs/base/common/codicons';

export const SYMBOL_ICON_ARRAY_FOREGROUND = registerColor('symbolIcon.arrayForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.arrayForeground', 'The foreground color for array symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_BOOLEAN_FOREGROUND = registerColor('symbolIcon.booleanForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.booleanForeground', 'The foreground color for boolean symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_CLASS_FOREGROUND = registerColor('symbolIcon.classForeground', {
	dark: '#EE9D28',
	light: '#D67E00',
	hc: '#EE9D28'
}, localize('symbolIcon.classForeground', 'The foreground color for class symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_COLOR_FOREGROUND = registerColor('symbolIcon.colorForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.colorForeground', 'The foreground color for color symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_CONSTANT_FOREGROUND = registerColor('symbolIcon.constantForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.constantForeground', 'The foreground color for constant symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_CONSTRUCTOR_FOREGROUND = registerColor('symbolIcon.constructorForeground', {
	dark: '#B180D7',
	light: '#652D90',
	hc: '#B180D7'
}, localize('symbolIcon.constructorForeground', 'The foreground color for constructor symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_ENUMERATOR_FOREGROUND = registerColor('symbolIcon.enumeratorForeground', {
	dark: '#EE9D28',
	light: '#D67E00',
	hc: '#EE9D28'
}, localize('symbolIcon.enumeratorForeground', 'The foreground color for enumerator symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_ENUMERATOR_MEMBER_FOREGROUND = registerColor('symbolIcon.enumeratorMemberForeground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hc: '#75BEFF'
}, localize('symbolIcon.enumeratorMemberForeground', 'The foreground color for enumerator member symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_EVENT_FOREGROUND = registerColor('symbolIcon.eventForeground', {
	dark: '#EE9D28',
	light: '#D67E00',
	hc: '#EE9D28'
}, localize('symbolIcon.eventForeground', 'The foreground color for event symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_FIELD_FOREGROUND = registerColor('symbolIcon.fieldForeground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hc: '#75BEFF'
}, localize('symbolIcon.fieldForeground', 'The foreground color for field symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_FILE_FOREGROUND = registerColor('symbolIcon.fileForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.fileForeground', 'The foreground color for file symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_FOLDER_FOREGROUND = registerColor('symbolIcon.folderForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.folderForeground', 'The foreground color for folder symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_FUNCTION_FOREGROUND = registerColor('symbolIcon.functionForeground', {
	dark: '#B180D7',
	light: '#652D90',
	hc: '#B180D7'
}, localize('symbolIcon.functionForeground', 'The foreground color for function symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_INTERFACE_FOREGROUND = registerColor('symbolIcon.interfaceForeground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hc: '#75BEFF'
}, localize('symbolIcon.interfaceForeground', 'The foreground color for interface symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_KEY_FOREGROUND = registerColor('symbolIcon.keyForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.keyForeground', 'The foreground color for key symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_KEYWORD_FOREGROUND = registerColor('symbolIcon.keywordForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.keywordForeground', 'The foreground color for keyword symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_METHOD_FOREGROUND = registerColor('symbolIcon.methodForeground', {
	dark: '#B180D7',
	light: '#652D90',
	hc: '#B180D7'
}, localize('symbolIcon.methodForeground', 'The foreground color for method symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_MODULE_FOREGROUND = registerColor('symbolIcon.moduleForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.moduleForeground', 'The foreground color for module symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_NAMESPACE_FOREGROUND = registerColor('symbolIcon.namespaceForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.namespaceForeground', 'The foreground color for namespace symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_NULL_FOREGROUND = registerColor('symbolIcon.nullForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.nullForeground', 'The foreground color for null symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_NUMBER_FOREGROUND = registerColor('symbolIcon.numberForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.numberForeground', 'The foreground color for number symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_OBJECT_FOREGROUND = registerColor('symbolIcon.objectForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.objectForeground', 'The foreground color for object symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_OPERATOR_FOREGROUND = registerColor('symbolIcon.operatorForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.operatorForeground', 'The foreground color for operator symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_PACKAGE_FOREGROUND = registerColor('symbolIcon.packageForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.packageForeground', 'The foreground color for package symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_PROPERTY_FOREGROUND = registerColor('symbolIcon.propertyForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.propertyForeground', 'The foreground color for property symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_REFERENCE_FOREGROUND = registerColor('symbolIcon.referenceForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.referenceForeground', 'The foreground color for reference symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_SNIPPET_FOREGROUND = registerColor('symbolIcon.snippetForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.snippetForeground', 'The foreground color for snippet symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_STRING_FOREGROUND = registerColor('symbolIcon.stringForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.stringForeground', 'The foreground color for string symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_STRUCT_FOREGROUND = registerColor('symbolIcon.structForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.structForeground', 'The foreground color for struct symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_TEXT_FOREGROUND = registerColor('symbolIcon.textForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.textForeground', 'The foreground color for text symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_TYPEPARAMETER_FOREGROUND = registerColor('symbolIcon.typeParameterForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.typeParameterForeground', 'The foreground color for type parameter symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_UNIT_FOREGROUND = registerColor('symbolIcon.unitForeground', {
	dark: foreground,
	light: foreground,
	hc: foreground
}, localize('symbolIcon.unitForeground', 'The foreground color for unit symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

export const SYMBOL_ICON_VARIABLE_FOREGROUND = registerColor('symbolIcon.variableForeground', {
	dark: '#75BEFF',
	light: '#007ACC',
	hc: '#75BEFF'
}, localize('symbolIcon.variableForeground', 'The foreground color for variable symbols. These symbols appear in the outline, breadcrumb, and suggest widget.'));

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {

	const symbolIconArrayColor = theme.getColor(SYMBOL_ICON_ARRAY_FOREGROUND);
	if (symbolIconArrayColor) {
		collector.addRule(`${Codicon.symbolArray.cssSelector} { color: ${symbolIconArrayColor}; }`);
	}

	const symbolIconBooleanColor = theme.getColor(SYMBOL_ICON_BOOLEAN_FOREGROUND);
	if (symbolIconBooleanColor) {
		collector.addRule(`${Codicon.symbolBoolean.cssSelector} { color: ${symbolIconBooleanColor}; }`);
	}

	const symbolIconClassColor = theme.getColor(SYMBOL_ICON_CLASS_FOREGROUND);
	if (symbolIconClassColor) {
		collector.addRule(`${Codicon.symbolClass.cssSelector} { color: ${symbolIconClassColor}; }`);
	}

	const symbolIconMethodColor = theme.getColor(SYMBOL_ICON_METHOD_FOREGROUND);
	if (symbolIconMethodColor) {
		collector.addRule(`${Codicon.symbolMethod.cssSelector} { color: ${symbolIconMethodColor}; }`);
	}

	const symbolIconColorColor = theme.getColor(SYMBOL_ICON_COLOR_FOREGROUND);
	if (symbolIconColorColor) {
		collector.addRule(`${Codicon.symbolColor.cssSelector} { color: ${symbolIconColorColor}; }`);
	}

	const symbolIconConstantColor = theme.getColor(SYMBOL_ICON_CONSTANT_FOREGROUND);
	if (symbolIconConstantColor) {
		collector.addRule(`${Codicon.symbolConstant.cssSelector} { color: ${symbolIconConstantColor}; }`);
	}

	const symbolIconConstructorColor = theme.getColor(SYMBOL_ICON_CONSTRUCTOR_FOREGROUND);
	if (symbolIconConstructorColor) {
		collector.addRule(`${Codicon.symbolConstructor.cssSelector} { color: ${symbolIconConstructorColor}; }`);
	}

	const symbolIconEnumeratorColor = theme.getColor(SYMBOL_ICON_ENUMERATOR_FOREGROUND);
	if (symbolIconEnumeratorColor) {
		collector.addRule(`
			${Codicon.symbolValue.cssSelector},${Codicon.symbolEnum.cssSelector} { color: ${symbolIconEnumeratorColor}; }`);
	}

	const symbolIconEnumeratorMemberColor = theme.getColor(SYMBOL_ICON_ENUMERATOR_MEMBER_FOREGROUND);
	if (symbolIconEnumeratorMemberColor) {
		collector.addRule(`${Codicon.symbolEnumMember.cssSelector} { color: ${symbolIconEnumeratorMemberColor}; }`);
	}

	const symbolIconEventColor = theme.getColor(SYMBOL_ICON_EVENT_FOREGROUND);
	if (symbolIconEventColor) {
		collector.addRule(`${Codicon.symbolEvent.cssSelector} { color: ${symbolIconEventColor}; }`);
	}

	const symbolIconFieldColor = theme.getColor(SYMBOL_ICON_FIELD_FOREGROUND);
	if (symbolIconFieldColor) {
		collector.addRule(`${Codicon.symbolField.cssSelector} { color: ${symbolIconFieldColor}; }`);
	}

	const symbolIconFileColor = theme.getColor(SYMBOL_ICON_FILE_FOREGROUND);
	if (symbolIconFileColor) {
		collector.addRule(`${Codicon.symbolFile.cssSelector} { color: ${symbolIconFileColor}; }`);
	}

	const symbolIconFolderColor = theme.getColor(SYMBOL_ICON_FOLDER_FOREGROUND);
	if (symbolIconFolderColor) {
		collector.addRule(`${Codicon.symbolFolder.cssSelector} { color: ${symbolIconFolderColor}; }`);
	}

	const symbolIconFunctionColor = theme.getColor(SYMBOL_ICON_FUNCTION_FOREGROUND);
	if (symbolIconFunctionColor) {
		collector.addRule(`${Codicon.symbolFunction.cssSelector} { color: ${symbolIconFunctionColor}; }`);
	}

	const symbolIconInterfaceColor = theme.getColor(SYMBOL_ICON_INTERFACE_FOREGROUND);
	if (symbolIconInterfaceColor) {
		collector.addRule(`${Codicon.symbolInterface.cssSelector} { color: ${symbolIconInterfaceColor}; }`);
	}

	const symbolIconKeyColor = theme.getColor(SYMBOL_ICON_KEY_FOREGROUND);
	if (symbolIconKeyColor) {
		collector.addRule(`${Codicon.symbolKey.cssSelector} { color: ${symbolIconKeyColor}; }`);
	}

	const symbolIconKeywordColor = theme.getColor(SYMBOL_ICON_KEYWORD_FOREGROUND);
	if (symbolIconKeywordColor) {
		collector.addRule(`${Codicon.symbolKeyword.cssSelector} { color: ${symbolIconKeywordColor}; }`);
	}

	const symbolIconModuleColor = theme.getColor(SYMBOL_ICON_MODULE_FOREGROUND);
	if (symbolIconModuleColor) {
		collector.addRule(`${Codicon.symbolModule.cssSelector} { color: ${symbolIconModuleColor}; }`);
	}

	const outlineNamespaceColor = theme.getColor(SYMBOL_ICON_NAMESPACE_FOREGROUND);
	if (outlineNamespaceColor) {
		collector.addRule(`${Codicon.symbolNamespace.cssSelector} { color: ${outlineNamespaceColor}; }`);
	}

	const symbolIconNullColor = theme.getColor(SYMBOL_ICON_NULL_FOREGROUND);
	if (symbolIconNullColor) {
		collector.addRule(`${Codicon.symbolNull.cssSelector} { color: ${symbolIconNullColor}; }`);
	}

	const symbolIconNumberColor = theme.getColor(SYMBOL_ICON_NUMBER_FOREGROUND);
	if (symbolIconNumberColor) {
		collector.addRule(`${Codicon.symbolNumber.cssSelector} { color: ${symbolIconNumberColor}; }`);
	}

	const symbolIconObjectColor = theme.getColor(SYMBOL_ICON_OBJECT_FOREGROUND);
	if (symbolIconObjectColor) {
		collector.addRule(`${Codicon.symbolObject.cssSelector} { color: ${symbolIconObjectColor}; }`);
	}

	const symbolIconOperatorColor = theme.getColor(SYMBOL_ICON_OPERATOR_FOREGROUND);
	if (symbolIconOperatorColor) {
		collector.addRule(`${Codicon.symbolOperator.cssSelector} { color: ${symbolIconOperatorColor}; }`);
	}

	const symbolIconPackageColor = theme.getColor(SYMBOL_ICON_PACKAGE_FOREGROUND);
	if (symbolIconPackageColor) {
		collector.addRule(`${Codicon.symbolPackage.cssSelector} { color: ${symbolIconPackageColor}; }`);
	}

	const symbolIconPropertyColor = theme.getColor(SYMBOL_ICON_PROPERTY_FOREGROUND);
	if (symbolIconPropertyColor) {
		collector.addRule(`${Codicon.symbolProperty.cssSelector} { color: ${symbolIconPropertyColor}; }`);
	}

	const symbolIconReferenceColor = theme.getColor(SYMBOL_ICON_REFERENCE_FOREGROUND);
	if (symbolIconReferenceColor) {
		collector.addRule(`${Codicon.symbolReference.cssSelector} { color: ${symbolIconReferenceColor}; }`);
	}

	const symbolIconSnippetColor = theme.getColor(SYMBOL_ICON_SNIPPET_FOREGROUND);
	if (symbolIconSnippetColor) {
		collector.addRule(`${Codicon.symbolSnippet.cssSelector} { color: ${symbolIconSnippetColor}; }`);
	}

	const symbolIconStringColor = theme.getColor(SYMBOL_ICON_STRING_FOREGROUND);
	if (symbolIconStringColor) {
		collector.addRule(`${Codicon.symbolString.cssSelector} { color: ${symbolIconStringColor}; }`);
	}

	const symbolIconStructColor = theme.getColor(SYMBOL_ICON_STRUCT_FOREGROUND);
	if (symbolIconStructColor) {
		collector.addRule(`${Codicon.symbolStruct.cssSelector} { color: ${symbolIconStructColor}; }`);
	}

	const symbolIconTextColor = theme.getColor(SYMBOL_ICON_TEXT_FOREGROUND);
	if (symbolIconTextColor) {
		collector.addRule(`${Codicon.symbolText.cssSelector} { color: ${symbolIconTextColor}; }`);
	}

	const symbolIconTypeParameterColor = theme.getColor(SYMBOL_ICON_TYPEPARAMETER_FOREGROUND);
	if (symbolIconTypeParameterColor) {
		collector.addRule(`${Codicon.symbolTypeParameter.cssSelector} { color: ${symbolIconTypeParameterColor}; }`);
	}

	const symbolIconUnitColor = theme.getColor(SYMBOL_ICON_UNIT_FOREGROUND);
	if (symbolIconUnitColor) {
		collector.addRule(`${Codicon.symbolUnit.cssSelector} { color: ${symbolIconUnitColor}; }`);
	}

	const symbolIconVariableColor = theme.getColor(SYMBOL_ICON_VARIABLE_FOREGROUND);
	if (symbolIconVariableColor) {
		collector.addRule(`${Codicon.symbolVariable.cssSelector} { color: ${symbolIconVariableColor}; }`);
	}
});
