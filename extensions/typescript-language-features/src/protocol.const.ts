/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class Kind {
	public static readonly alias = 'alias';
	public static readonly callSignature = 'call';
	public static readonly class = 'class';
	public static readonly const = 'const';
	public static readonly constructorImplementation = 'constructor';
	public static readonly constructSignature = 'construct';
	public static readonly directory = 'directory';
	public static readonly enum = 'enum';
	public static readonly externalModuleName = 'external module name';
	public static readonly function = 'function';
	public static readonly indexSignature = 'index';
	public static readonly interface = 'interface';
	public static readonly keyword = 'keyword';
	public static readonly let = 'let';
	public static readonly localFunction = 'local function';
	public static readonly localVariable = 'local var';
	public static readonly memberFunction = 'method';
	public static readonly memberGetAccessor = 'getter';
	public static readonly memberSetAccessor = 'setter';
	public static readonly memberVariable = 'property';
	public static readonly module = 'module';
	public static readonly primitiveType = 'primitive type';
	public static readonly script = 'script';
	public static readonly type = 'type';
	public static readonly variable = 'var';
	public static readonly warning = 'warning';
	public static readonly string = 'string';
	public static readonly parameter = 'parameter';
}


export class DiagnosticCategory {
	public static readonly error = 'error';
	public static readonly warning = 'warning';
	public static readonly suggestion = 'suggestion';
}

interface KindModifier {
	readonly pattern: RegExp;
	readonly value: string;
}

export class KindModifiers {
	public static readonly dtsModifier: KindModifier = { pattern: /(^|\s)\.d\.ts($|\s)/i, value: '.d.ts' };
	public static readonly tsModifier: KindModifier = { pattern: /(^|\s)\.ts($|\s)/i, value: '.ts' };
	public static readonly tsxModifier: KindModifier = { pattern: /(^|\s)\.tsx($|\s)/i, value: '.tsx' };
	public static readonly jsModifier: KindModifier = { pattern: /(^|\s)\.js($|\s)/i, value: '.js' };
	public static readonly jsxModifier: KindModifier = { pattern: /(^|\s)\.jsx($|\s)/i, value: '.jsx' };
	public static readonly jsonModifier: KindModifier = { pattern: /(^|\s)\.json($|\s)/i, value: '.json' };

	public static readonly fileExtensionKindModifiers = [
		KindModifiers.dtsModifier,
		KindModifiers.tsModifier,
		KindModifiers.tsxModifier,
		KindModifiers.jsModifier,
		KindModifiers.jsxModifier,
		KindModifiers.jsonModifier,
	];
}