/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export class Kind {
	public static unknown = '';
	public static keyword = 'keyword';
	public static script = 'script';
	public static module = 'module';
	public static class = 'class';
	public static interface = 'interface';
	public static type = 'type';
	public static enum = 'enum';
	public static variable = 'var';
	public static localVariable = 'local var';
	public static function = 'function';
	public static localFunction = 'local function';
	public static memberFunction = 'method';
	public static memberGetAccessor = 'getter';
	public static memberSetAccessor = 'setter';
	public static memberVariable = 'property';
	public static constructorImplementation = 'constructor';
	public static callSignature = 'call';
	public static indexSignature = 'index';
	public static constructSignature = 'construct';
	public static parameter = 'parameter';
	public static typeParameter = 'type parameter';
	public static primitiveType = 'primitive type';
	public static alias = 'alias';
	public static const = 'const';
	public static let = 'let';
	public static warning = 'warning';
	public static directory = 'directory';
	public static file = 'file';
	public static externalModuleName = 'external module name';
}
