/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Request, Response, FileRequest, TextSpan } from './protocol';

export namespace CommandTypes {
	export type Brace = 'brace';
	/* @internal */
	export type BraceFull = 'brace-full';
	export type BraceCompletion = 'braceCompletion';
	export type Change = 'change';
	export type Close = 'close';
	export type Completions = 'completions';
	/* @internal */
	export type CompletionsFull = 'completions-full';
	export type CompletionDetails = 'completionEntryDetails';
	export type CompileOnSaveAffectedFileList = 'compileOnSaveAffectedFileList';
	export type CompileOnSaveEmitFile = 'compileOnSaveEmitFile';
	export type Configure = 'configure';
	export type Definition = 'definition';
	/* @internal */
	export type DefinitionFull = 'definition-full';
	export type Exit = 'exit';
	export type Format = 'format';
	export type Formatonkey = 'formatonkey';
	/* @internal */
	export type FormatFull = 'format-full';
	/* @internal */
	export type FormatonkeyFull = 'formatonkey-full';
	/* @internal */
	export type FormatRangeFull = 'formatRange-full';
	export type Geterr = 'geterr';
	export type GeterrForProject = 'geterrForProject';
	export type SemanticDiagnosticsSync = 'semanticDiagnosticsSync';
	export type SyntacticDiagnosticsSync = 'syntacticDiagnosticsSync';
	export type NavBar = 'navbar';
	/* @internal */
	export type NavBarFull = 'navbar-full';
	export type Navto = 'navto';
	/* @internal */
	export type NavtoFull = 'navto-full';
	export type NavTree = 'navtree';
	export type NavTreeFull = 'navtree-full';
	export type Occurrences = 'occurrences';
	export type DocumentHighlights = 'documentHighlights';
	/* @internal */
	export type DocumentHighlightsFull = 'documentHighlights-full';
	export type Open = 'open';
	export type Quickinfo = 'quickinfo';
	/* @internal */
	export type QuickinfoFull = 'quickinfo-full';
	export type References = 'references';
	/* @internal */
	export type ReferencesFull = 'references-full';
	export type Reload = 'reload';
	export type Rename = 'rename';
	/* @internal */
	export type RenameInfoFull = 'rename-full';
	/* @internal */
	export type RenameLocationsFull = 'renameLocations-full';
	export type Saveto = 'saveto';
	export type SignatureHelp = 'signatureHelp';
	/* @internal */
	export type SignatureHelpFull = 'signatureHelp-full';
	export type TypeDefinition = 'typeDefinition';
	export type ProjectInfo = 'projectInfo';
	export type ReloadProjects = 'reloadProjects';
	export type Unknown = 'unknown';
	export type OpenExternalProject = 'openExternalProject';
	export type OpenExternalProjects = 'openExternalProjects';
	export type CloseExternalProject = 'closeExternalProject';
	/* @internal */
	export type SynchronizeProjectList = 'synchronizeProjectList';
	/* @internal */
	export type ApplyChangedToOpenFiles = 'applyChangedToOpenFiles';
	/* @internal */
	export type EncodedSemanticClassificationsFull = 'encodedSemanticClassifications-full';
	/* @internal */
	export type Cleanup = 'cleanup';
	/* @internal */
	export type OutliningSpans = 'outliningSpans';
	export type TodoComments = 'todoComments';
	export type Indentation = 'indentation';
	export type DocCommentTemplate = 'docCommentTemplate';
	/* @internal */
	export type CompilerOptionsDiagnosticsFull = 'compilerOptionsDiagnostics-full';
	/* @internal */
	export type NameOrDottedNameSpan = 'nameOrDottedNameSpan';
	/* @internal */
	export type BreakpointStatement = 'breakpointStatement';
	export type CompilerOptionsForInferredProjects = 'compilerOptionsForInferredProjects';
}

/**
 * For external projects, some of the project settings are sent together with
 * compiler settings.
 */
export interface ExternalProjectCompilerOptions extends CompilerOptions {
	/**
	 * If compile on save is enabled for the project
	 */
	compileOnSave?: boolean;
}

/**
 * Request to set compiler options for inferred projects.
 * External projects are opened / closed explicitly.
 * Configured projects are opened when user opens loose file that has 'tsconfig.json' or 'jsconfig.json' anywhere in one of containing folders.
 * This configuration file will be used to obtain a list of files and configuration settings for the project.
 * Inferred projects are created when user opens a loose file that is not the part of external project
 * or configured project and will contain only open file and transitive closure of referenced files if 'useOneInferredProject' is false,
 * or all open loose files and its transitive closure of referenced files if 'useOneInferredProject' is true.
 */
export interface SetCompilerOptionsForInferredProjectsRequest extends Request {
	command: CommandTypes.CompilerOptionsForInferredProjects;
	arguments: SetCompilerOptionsForInferredProjectsArgs;
}

/**
 * Argument for SetCompilerOptionsForInferredProjectsRequest request.
 */
export interface SetCompilerOptionsForInferredProjectsArgs {
	/**
	 * Compiler options to be used with inferred projects.
	 */
	options: ExternalProjectCompilerOptions;
}

/**
 * Response to SetCompilerOptionsForInferredProjectsResponse request. This is just an acknowledgement, so
 * no body field is required.
 */
export interface SetCompilerOptionsForInferredProjectsResponse extends Response {
}


/**
 * NavTree request; value of command field is "navtree".
 * Return response giving the navigation tree of the requested file.
 */
export interface NavTreeRequest extends FileRequest {
	command: CommandTypes.NavTree;
}

/** protocol.NavigationTree is identical to ts.NavigationTree, except using protocol.TextSpan instead of ts.TextSpan */
export interface NavigationTree {
	text: string;
	kind: string;
	kindModifiers: string;
	spans: TextSpan[];
	childItems?: NavigationTree[];
}

export interface NavTreeResponse extends Response {
	body?: NavigationTree;
}


// Additional types copied form the services interfaces

export interface TodoCommentDescriptor {
	text: string;
	priority: number;
}

export enum ScriptKind {
	Unknown = 0,
	JS = 1,
	JSX = 2,
	TS = 3,
	TSX = 4
}

export interface TypingOptions {
	enableAutoDiscovery?: boolean;
	include?: string[];
	exclude?: string[];
	[option: string]: string[] | boolean | undefined;
}

export enum JsxEmit {
	None = 0,
	Preserve = 1,
	React = 2
}

export enum ModuleKind {
	None = 0,
	CommonJS = 1,
	AMD = 2,
	UMD = 3,
	System = 4,
	ES6 = 5,
	ES2015 = ES6,
}

export enum ModuleResolutionKind {
	Classic = 1,
	NodeJs = 2
}

export enum NewLineKind {
	CarriageReturnLineFeed = 0,
	LineFeed = 1,
}

export interface MapLike<T> {
	[index: string]: T;
}

export type PathSubstitutions = MapLike<string[]>;

export type RootPaths = string[];

export enum ScriptTarget {
	ES3 = 0,
	ES5 = 1,
	ES6 = 2,
	ES2015 = ES6,
	Latest = ES6,
}

export type TsConfigOnlyOptions = RootPaths | PathSubstitutions;
export type CompilerOptionsValue = string | number | boolean | (string | number)[] | TsConfigOnlyOptions;

export interface CompilerOptions {
	allowJs?: boolean;
	allowSyntheticDefaultImports?: boolean;
	allowUnreachableCode?: boolean;
	allowUnusedLabels?: boolean;
	baseUrl?: string;
	charset?: string;
	declaration?: boolean;
	declarationDir?: string;
	disableSizeLimit?: boolean;
	emitBOM?: boolean;
	emitDecoratorMetadata?: boolean;
	experimentalDecorators?: boolean;
	forceConsistentCasingInFileNames?: boolean;
	inlineSourceMap?: boolean;
	inlineSources?: boolean;
	isolatedModules?: boolean;
	jsx?: JsxEmit;
	lib?: string[];
	locale?: string;
	mapRoot?: string;
	maxNodeModuleJsDepth?: number;
	module?: ModuleKind;
	moduleResolution?: ModuleResolutionKind;
	newLine?: NewLineKind;
	noEmit?: boolean;
	noEmitHelpers?: boolean;
	noEmitOnError?: boolean;
	noErrorTruncation?: boolean;
	noFallthroughCasesInSwitch?: boolean;
	noImplicitAny?: boolean;
	noImplicitReturns?: boolean;
	noImplicitThis?: boolean;
	noUnusedLocals?: boolean;
	noUnusedParameters?: boolean;
	noImplicitUseStrict?: boolean;
	noLib?: boolean;
	noResolve?: boolean;
	out?: string;
	outDir?: string;
	outFile?: string;
	paths?: PathSubstitutions;
	preserveConstEnums?: boolean;
	project?: string;
	reactNamespace?: string;
	removeComments?: boolean;
	rootDir?: string;
	rootDirs?: RootPaths;
	skipLibCheck?: boolean;
	skipDefaultLibCheck?: boolean;
	sourceMap?: boolean;
	sourceRoot?: string;
	strictNullChecks?: boolean;
	suppressExcessPropertyErrors?: boolean;
	suppressImplicitAnyIndexErrors?: boolean;
	target?: ScriptTarget;
	traceResolution?: boolean;
	types?: string[];
	/** Paths used to used to compute primary types search locations */
	typeRoots?: string[];
	[option: string]: CompilerOptionsValue | undefined;
}

export class TextChange {
	span: PTextSpan;
	newText: string;
}

export interface PTextSpan {
	start: number;
	length: number;
}

export interface ProjectVersionInfo {
	projectName: string;
	isInferred: boolean;
	version: number;
	options: CompilerOptions;
}