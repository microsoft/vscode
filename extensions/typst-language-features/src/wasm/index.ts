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
	queryDocument,
	resetCompiler,
	disposeWasm,
	// Bidirectional sync functions (text-based, WASM compatible)
	compileWithSpans,
	resolveSourceLocationByText,
	resolveSourceLocation,
	findDocumentPositions,
	isRendererReady,
	disposeRenderer
} from './typstWasm';

export type {
	CompileResult,
	DiagnosticInfo,
	WasmFileReader,
	TypstWasmOptions,
	// Bidirectional sync types
	CompileWithSpansResult,
	SourceLocation,
	DocumentPosition
} from './typstWasm';
