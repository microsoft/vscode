/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export class Kind {
	public static unknown: string = '';
	public static keyword: string = 'keyword';
	public static script: string = 'script';
	public static module: string = 'module';
	public static class: string = 'class';
	public static interface: string = 'interface';
	public static type: string = 'type';
	public static enum: string = 'enum';
	public static variable: string = 'var';
	public static localVariable: string = 'local var';
	public static function: string = 'function';
	public static localFunction: string = 'local function';
	public static memberFunction: string = 'method';
	public static memberGetAccessor: string = 'getter';
	public static memberSetAccessor: string = 'setter';
	public static memberVariable: string = 'property';
	public static constructorImplementation: string = 'constructor';
	public static callSignature: string = 'call';
	public static indexSignature: string = 'index';
	public static constructSignature: string = 'construct';
	public static parameter: string = 'parameter';
	public static typeParameter: string = 'type parameter';
	public static primitiveType: string = 'primitive type';
	public static label: string = 'label';
	public static alias: string = 'alias';
	public static const: string = 'const';
	public static let: string = 'let';
	public static warning: string = 'warning';
	public static directory: string = 'directory';
	public static file: string = 'file';
	public static externalModuleName = 'external module name';
}

export class KindModifier {
	public static none: string = '';
	public static staticMember: string = 'public static';
	public static privateMember: string = 'private';
	public static protectedMember: string = 'protected';
	public static exported: string = 'export';
	public static ambient: string = 'declare';
	public static static: string = 'static';
}