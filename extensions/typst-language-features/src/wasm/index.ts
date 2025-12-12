/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export {
	initializeTypstWasm,
	isWasmLoaded,
	compileToPdf,
	compileToSvg,
	validateSource,
	resetCompiler,
	disposeWasm
} from './typstWasm';

export type {
	CompileResult,
	DiagnosticInfo,
	WasmFileReader,
	TypstWasmOptions
} from './typstWasm';
