/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export namespace CommandTypes {
	export type Brace = 'brace';
	export type BraceCompletion = 'braceCompletion';
	export type Change = 'change';
	export type Close = 'close';
	export type Completions = 'completions';
	export type CompletionDetails = 'completionEntryDetails';
	export type CompileOnSaveAffectedFileList = 'compileOnSaveAffectedFileList';
	export type CompileOnSaveEmitFile = 'compileOnSaveEmitFile';
	export type Configure = 'configure';
	export type Definition = 'definition';
	export type Exit = 'exit';
	export type Format = 'format';
	export type Formatonkey = 'formatonkey';
	export type Geterr = 'geterr';
	export type GeterrForProject = 'geterrForProject';
	export type SemanticDiagnosticsSync = 'semanticDiagnosticsSync';
	export type SyntacticDiagnosticsSync = 'syntacticDiagnosticsSync';
	export type NavBar = 'navbar';
	export type Navto = 'navto';
	export type NavTree = 'navtree';
	export type NavTreeFull = 'navtree-full';
	export type Occurrences = 'occurrences';
	export type DocumentHighlights = 'documentHighlights';
	export type Open = 'open';
	export type Quickinfo = 'quickinfo';
	export type References = 'references';
	export type Reload = 'reload';
	export type Rename = 'rename';
	export type Saveto = 'saveto';
	export type SignatureHelp = 'signatureHelp';
	export type TypeDefinition = 'typeDefinition';
	export type ProjectInfo = 'projectInfo';
	export type ReloadProjects = 'reloadProjects';
	export type Unknown = 'unknown';
	export type OpenExternalProject = 'openExternalProject';
	export type OpenExternalProjects = 'openExternalProjects';
	export type CloseExternalProject = 'closeExternalProject';
	export type TodoComments = 'todoComments';
	export type Indentation = 'indentation';
	export type DocCommentTemplate = 'docCommentTemplate';
	export type CompilerOptionsForInferredProjects = 'compilerOptionsForInferredProjects';
}
/**
 * A TypeScript Server message
 */
export interface Message {
	/**
	 * Sequence number of the message
	 */
	seq: number;
	/**
	 * One of "request", "response", or "event"
	 */
	type: string;
}
/**
 * Client-initiated request message
 */
export interface Request extends Message {
	/**
	 * The command to execute
	 */
	command: string;
	/**
	 * Object containing arguments for the command
	 */
	arguments?: any;
}
/**
 * Request to reload the project structure for all the opened files
 */
export interface ReloadProjectsRequest extends Message {
	command: CommandTypes.ReloadProjects;
}
/**
 * Server-initiated event message
 */
export interface Event extends Message {
	/**
	 * Name of event
	 */
	event: string;
	/**
	 * Event-specific information
	 */
	body?: any;
}
/**
 * Response by server to client request message.
 */
export interface Response extends Message {
	/**
	 * Sequence number of the request message.
	 */
	request_seq: number;
	/**
	 * Outcome of the request.
	 */
	success: boolean;
	/**
	 * The command requested.
	 */
	command: string;
	/**
	 * Contains error message if success === false.
	 */
	message?: string;
	/**
	 * Contains message body if success === true.
	 */
	body?: any;
}
/**
 * Arguments for FileRequest messages.
 */
export interface FileRequestArgs {
	/**
	 * The file for the request (absolute pathname required).
	 */
	file: string;
	projectFileName?: string;
}
/**
 * Requests a JS Doc comment template for a given position
 */
export interface DocCommentTemplateRequest extends FileLocationRequest {
	command: CommandTypes.DocCommentTemplate;
}
/**
 * Response to DocCommentTemplateRequest
 */
export interface DocCommandTemplateResponse extends Response {
	body?: TextInsertion;
}
/**
 * A request to get TODO comments from the file
 */
export interface TodoCommentRequest extends FileRequest {
	command: CommandTypes.TodoComments;
	arguments: TodoCommentRequestArgs;
}
/**
 * Arguments for TodoCommentRequest request.
 */
export interface TodoCommentRequestArgs extends FileRequestArgs {
	/**
	 * Array of target TodoCommentDescriptors that describes TODO comments to be found
	 */
	descriptors: TodoCommentDescriptor[];
}
/**
 * Response for TodoCommentRequest request.
 */
export interface TodoCommentsResponse extends Response {
	body?: TodoComment[];
}
/**
 * A request to get indentation for a location in file
 */
export interface IndentationRequest extends FileLocationRequest {
	command: CommandTypes.Indentation;
	arguments: IndentationRequestArgs;
}
/**
 * Response for IndentationRequest request.
 */
export interface IndentationResponse extends Response {
	body?: IndentationResult;
}
/**
 * Indentation result representing where indentation should be placed
 */
export interface IndentationResult {
	/**
	 * The base position in the document that the indent should be relative to
	 */
	position: number;
	/**
	 * The number of columns the indent should be at relative to the position's column.
	 */
	indentation: number;
}
/**
 * Arguments for IndentationRequest request.
 */
export interface IndentationRequestArgs extends FileLocationRequestArgs {
	/**
	 * An optional set of settings to be used when computing indentation.
	 * If argument is omitted - then it will use settings for file that were previously set via 'configure' request or global settings.
	 */
	options?: EditorSettings;
}
/**
 * Arguments for ProjectInfoRequest request.
 */
export interface ProjectInfoRequestArgs extends FileRequestArgs {
	/**
	 * Indicate if the file name list of the project is needed
	 */
	needFileNameList: boolean;
}
/**
 * A request to get the project information of the current file.
 */
export interface ProjectInfoRequest extends Request {
	command: CommandTypes.ProjectInfo;
	arguments: ProjectInfoRequestArgs;
}
/**
 * A request to retrieve compiler options diagnostics for a project
 */
export interface CompilerOptionsDiagnosticsRequest extends Request {
	arguments: CompilerOptionsDiagnosticsRequestArgs;
}
/**
 * Arguments for CompilerOptionsDiagnosticsRequest request.
 */
export interface CompilerOptionsDiagnosticsRequestArgs {
	/**
	 * Name of the project to retrieve compiler options diagnostics.
	 */
	projectFileName: string;
}
/**
 * Response message body for "projectInfo" request
 */
export interface ProjectInfo {
	/**
	 * For configured project, this is the normalized path of the 'tsconfig.json' file
	 * For inferred project, this is undefined
	 */
	configFileName: string;
	/**
	 * The list of normalized file name in the project, including 'lib.d.ts'
	 */
	fileNames?: string[];
	/**
	 * Indicates if the project has a active language service instance
	 */
	languageServiceDisabled?: boolean;
}
/**
 * Represents diagnostic info that includes location of diagnostic in two forms
 * - start position and length of the error span
 * - startLocation and endLocation - a pair of Location objects that store start/end line and offset of the error span.
 */
export interface DiagnosticWithLinePosition {
	message: string;
	start: number;
	length: number;
	startLocation: Location;
	endLocation: Location;
	category: string;
	code: number;
}
/**
 * Response message for "projectInfo" request
 */
export interface ProjectInfoResponse extends Response {
	body?: ProjectInfo;
}
/**
 * Request whose sole parameter is a file name.
 */
export interface FileRequest extends Request {
	arguments: FileRequestArgs;
}
/**
 * Instances of this interface specify a location in a source file:
 * (file, line, character offset), where line and character offset are 1-based.
 */
export interface FileLocationRequestArgs extends FileRequestArgs {
	/**
	 * The line number for the request (1-based).
	 */
	line: number;
	/**
	 * The character offset (on the line) for the request (1-based).
	 */
	offset: number;
}
/**
 * A request whose arguments specify a file location (file, line, col).
 */
export interface FileLocationRequest extends FileRequest {
	arguments: FileLocationRequestArgs;
}
/**
 * Arguments for EncodedSemanticClassificationsRequest request.
 */
export interface EncodedSemanticClassificationsRequestArgs extends FileRequestArgs {
	/**
	 * Start position of the span.
	 */
	start: number;
	/**
	 * Length of the span.
	 */
	length: number;
}
/**
 * Arguments in document highlight request; include: filesToSearch, file,
 * line, offset.
 */
export interface DocumentHighlightsRequestArgs extends FileLocationRequestArgs {
	/**
	 * List of files to search for document highlights.
	 */
	filesToSearch: string[];
}
/**
 * Go to definition request; value of command field is
 * "definition". Return response giving the file locations that
 * define the symbol found in file at location line, col.
 */
export interface DefinitionRequest extends FileLocationRequest {
	command: CommandTypes.Definition;
}
/**
 * Go to type request; value of command field is
 * "typeDefinition". Return response giving the file locations that
 * define the type for the symbol found in file at location line, col.
 */
export interface TypeDefinitionRequest extends FileLocationRequest {
	command: CommandTypes.TypeDefinition;
}
/**
 * Location in source code expressed as (one-based) line and character offset.
 */
export interface Location {
	line: number;
	offset: number;
}
/**
 * Object found in response messages defining a span of text in source code.
 */
export interface TextSpan {
	/**
	 * First character of the definition.
	 */
	start: Location;
	/**
	 * One character past last character of the definition.
	 */
	end: Location;
}
/**
 * Object found in response messages defining a span of text in a specific source file.
 */
export interface FileSpan extends TextSpan {
	/**
	 * File containing text span.
	 */
	file: string;
}
/**
 * Definition response message.  Gives text range for definition.
 */
export interface DefinitionResponse extends Response {
	body?: FileSpan[];
}
/**
 * Definition response message.  Gives text range for definition.
 */
export interface TypeDefinitionResponse extends Response {
	body?: FileSpan[];
}
/**
 * Implementation response message.  Gives text range for implementations.
 */
export interface ImplementationResponse extends Response {
	body?: FileSpan[];
}
/**
 * Request to get brace completion for a location in the file.
 */
export interface BraceCompletionRequest extends FileLocationRequest {
	command: CommandTypes.BraceCompletion;
	arguments: BraceCompletionRequestArgs;
}
/**
 * Argument for BraceCompletionRequest request.
 */
export interface BraceCompletionRequestArgs extends FileLocationRequestArgs {
	/**
	 * Kind of opening brace
	 */
	openingBrace: string;
}
/**
 * Get occurrences request; value of command field is
 * "occurrences". Return response giving spans that are relevant
 * in the file at a given line and column.
 */
export interface OccurrencesRequest extends FileLocationRequest {
	command: CommandTypes.Occurrences;
}
export interface OccurrencesResponseItem extends FileSpan {
	/**
	 * True if the occurrence is a write location, false otherwise.
	 */
	isWriteAccess: boolean;
}
export interface OccurrencesResponse extends Response {
	body?: OccurrencesResponseItem[];
}
/**
 * Get document highlights request; value of command field is
 * "documentHighlights". Return response giving spans that are relevant
 * in the file at a given line and column.
 */
export interface DocumentHighlightsRequest extends FileLocationRequest {
	command: CommandTypes.DocumentHighlights;
	arguments: DocumentHighlightsRequestArgs;
}
/**
 * Span augmented with extra information that denotes the kind of the highlighting to be used for span.
 * Kind is taken from HighlightSpanKind type.
 */
export interface HighlightSpan extends TextSpan {
	kind: string;
}
/**
 * Represents a set of highligh spans for a give name
 */
export interface DocumentHighlightsItem {
	/**
	 * File containing highlight spans.
	 */
	file: string;
	/**
	 * Spans to highlight in file.
	 */
	highlightSpans: HighlightSpan[];
}
/**
 * Response for a DocumentHighlightsRequest request.
 */
export interface DocumentHighlightsResponse extends Response {
	body?: DocumentHighlightsItem[];
}
/**
 * Find references request; value of command field is
 * "references". Return response giving the file locations that
 * reference the symbol found in file at location line, col.
 */
export interface ReferencesRequest extends FileLocationRequest {
	command: CommandTypes.References;
}
export interface ReferencesResponseItem extends FileSpan {
	/** Text of line containing the reference.  Including this
	 *  with the response avoids latency of editor loading files
	 * to show text of reference line (the server already has
	 * loaded the referencing files).
	 */
	lineText: string;
	/**
	 * True if reference is a write location, false otherwise.
	 */
	isWriteAccess: boolean;
	/**
	 * True if reference is a definition, false otherwise.
	 */
	isDefinition: boolean;
}
/**
 * The body of a "references" response message.
 */
export interface ReferencesResponseBody {
	/**
	 * The file locations referencing the symbol.
	 */
	refs: ReferencesResponseItem[];
	/**
	 * The name of the symbol.
	 */
	symbolName: string;
	/**
	 * The start character offset of the symbol (on the line provided by the references request).
	 */
	symbolStartOffset: number;
	/**
	 * The full display name of the symbol.
	 */
	symbolDisplayString: string;
}
/**
 * Response to "references" request.
 */
export interface ReferencesResponse extends Response {
	body?: ReferencesResponseBody;
}
/**
 * Argument for RenameRequest request.
 */
export interface RenameRequestArgs extends FileLocationRequestArgs {
	/**
	 * Should text at specified location be found/changed in comments?
	 */
	findInComments?: boolean;
	/**
	 * Should text at specified location be found/changed in strings?
	 */
	findInStrings?: boolean;
}
/**
 * Rename request; value of command field is "rename". Return
 * response giving the file locations that reference the symbol
 * found in file at location line, col. Also return full display
 * name of the symbol so that client can print it unambiguously.
 */
export interface RenameRequest extends FileLocationRequest {
	command: CommandTypes.Rename;
	arguments: RenameRequestArgs;
}
/**
 * Information about the item to be renamed.
 */
export interface RenameInfo {
	/**
	 * True if item can be renamed.
	 */
	canRename: boolean;
	/**
	 * Error message if item can not be renamed.
	 */
	localizedErrorMessage?: string;
	/**
	 * Display name of the item to be renamed.
	 */
	displayName: string;
	/**
	 * Full display name of item to be renamed.
	 */
	fullDisplayName: string;
	/**
	 * The items's kind (such as 'className' or 'parameterName' or plain 'text').
	 */
	kind: string;
	/**
	 * Optional modifiers for the kind (such as 'public').
	 */
	kindModifiers: string;
}
/**
 *  A group of text spans, all in 'file'.
 */
export interface SpanGroup {
	/** The file to which the spans apply */
	file: string;
	/** The text spans in this group */
	locs: TextSpan[];
}
export interface RenameResponseBody {
	/**
	 * Information about the item to be renamed.
	 */
	info: RenameInfo;
	/**
	 * An array of span groups (one per file) that refer to the item to be renamed.
	 */
	locs: SpanGroup[];
}
/**
 * Rename response message.
 */
export interface RenameResponse extends Response {
	body?: RenameResponseBody;
}
/**
 * Represents a file in external project.
 * External project is project whose set of files, compilation options and open\close state
 * is maintained by the client (i.e. if all this data come from .csproj file in Visual Studio).
 * External project will exist even if all files in it are closed and should be closed explicity.
 * If external project includes one or more tsconfig.json/jsconfig.json files then tsserver will
 * create configured project for every config file but will maintain a link that these projects were created
 * as a result of opening external project so they should be removed once external project is closed.
 */
export interface ExternalFile {
	/**
	 * Name of file file
	 */
	fileName: string;
	/**
	 * Script kind of the file
	 */
	scriptKind?: ScriptKind;
	/**
	 * Whether file has mixed content (i.e. .cshtml file that combines html markup with C#/JavaScript)
	 */
	hasMixedContent?: boolean;
	/**
	 * Content of the file
	 */
	content?: string;
}
/**
 * Represent an external project
 */
export interface ExternalProject {
	/**
	 * Project name
	 */
	projectFileName: string;
	/**
	 * List of root files in project
	 */
	rootFiles: ExternalFile[];
	/**
	 * Compiler options for the project
	 */
	options: ExternalProjectCompilerOptions;
	/**
	 * Explicitly specified typing options for the project
	 */
	typingOptions?: TypingOptions;
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
 * Contains information about current project version
 */
export interface ProjectVersionInfo {
	/**
	 * Project name
	 */
	projectName: string;
	/**
	 * true if project is inferred or false if project is external or configured
	 */
	isInferred: boolean;
	/**
	 * Project version
	 */
	version: number;
	/**
	 * Current set of compiler options for project
	 */
	options: CompilerOptions;
}
/**
 * Represents a set of changes that happen in project
 */
export interface ProjectChanges {
	/**
	 * List of added files
	 */
	added: string[];
	/**
	 * List of removed files
	 */
	removed: string[];
}
/**
 * Describes set of files in the project.
 * info might be omitted in case of inferred projects
 * if files is set - then this is the entire set of files in the project
 * if changes is set - then this is the set of changes that should be applied to existing project
 * otherwise - assume that nothing is changed
 */
export interface ProjectFiles {
	/**
	 * Information abount project verison
	 */
	info?: ProjectVersionInfo;
	/**
	 * List of files in project (might be omitted if current state of project can be computed using only information from 'changes')
	 */
	files?: string[];
	/**
	 * Set of changes in project (omitted if the entire set of files in project should be replaced)
	 */
	changes?: ProjectChanges;
}
/**
 * Combines project information with project level errors.
 */
export interface ProjectFilesWithDiagnostics extends ProjectFiles {
	/**
	 * List of errors in project
	 */
	projectErrors: DiagnosticWithLinePosition[];
}
/**
 * Information found in a configure request.
 */
export interface ConfigureRequestArguments {
	/**
	 * Information about the host, for example 'Emacs 24.4' or
	 * 'Sublime Text version 3075'
	 */
	hostInfo?: string;
	/**
	 * If present, tab settings apply only to this file.
	 */
	file?: string;
	/**
	 * The format options to use during formatting and other code editing features.
	 */
	formatOptions?: FormatCodeSettings;
}
/**
 *  Configure request; value of command field is "configure".  Specifies
 *  host information, such as host type, tab size, and indent size.
 */
export interface ConfigureRequest extends Request {
	command: CommandTypes.Configure;
	arguments: ConfigureRequestArguments;
}
/**
 * Response to "configure" request.  This is just an acknowledgement, so
 * no body field is required.
 */
export interface ConfigureResponse extends Response {
}
/**
 *  Information found in an "open" request.
 */
export interface OpenRequestArgs extends FileRequestArgs {
	/**
	 * Used when a version of the file content is known to be more up to date than the one on disk.
	 * Then the known content will be used upon opening instead of the disk copy
	 */
	fileContent?: string;
	/**
	 * Used to specify the script kind of the file explicitly. It could be one of the following:
	 * "TS", "JS", "TSX", "JSX"
	 */
	scriptKindName?: 'TS' | 'JS' | 'TSX' | 'JSX';
}
/**
 * Open request; value of command field is "open". Notify the
 * server that the client has file open.  The server will not
 * monitor the filesystem for changes in this file and will assume
 * that the client is updating the server (using the change and/or
 * reload messages) when the file changes. Server does not currently
 * send a response to an open request.
 */
export interface OpenRequest extends Request {
	command: CommandTypes.Open;
	arguments: OpenRequestArgs;
}
/**
 * Request to open or update external project
 */
export interface OpenExternalProjectRequest extends Request {
	command: CommandTypes.OpenExternalProject;
	arguments: OpenExternalProjectArgs;
}
/**
 * Arguments to OpenExternalProjectRequest request
 */
export type OpenExternalProjectArgs = ExternalProject;
/**
 * Request to open multiple external projects
 */
export interface OpenExternalProjectsRequest extends Request {
	command: CommandTypes.OpenExternalProjects;
	arguments: OpenExternalProjectsArgs;
}
/**
 * Arguments to OpenExternalProjectsRequest
 */
export interface OpenExternalProjectsArgs {
	/**
	 * List of external projects to open or update
	 */
	projects: ExternalProject[];
}
/**
 * Response to OpenExternalProjectRequest request. This is just an acknowledgement, so
 * no body field is required.
 */
export interface OpenExternalProjectResponse extends Response {
}
/**
 * Response to OpenExternalProjectsRequest request. This is just an acknowledgement, so
 * no body field is required.
 */
export interface OpenExternalProjectsResponse extends Response {
}
/**
 * Request to close external project.
 */
export interface CloseExternalProjectRequest extends Request {
	command: CommandTypes.CloseExternalProject;
	arguments: CloseExternalProjectRequestArgs;
}
/**
 * Arguments to CloseExternalProjectRequest request
 */
export interface CloseExternalProjectRequestArgs {
	/**
	 * Name of the project to close
	 */
	projectFileName: string;
}
/**
 * Response to CloseExternalProjectRequest request. This is just an acknowledgement, so
 * no body field is required.
 */
export interface CloseExternalProjectResponse extends Response {
}
/**
 * Arguments to SynchronizeProjectListRequest
 */
export interface SynchronizeProjectListRequestArgs {
	/**
	 * List of last known projects
	 */
	knownProjects: ProjectVersionInfo[];
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
 *  Exit request; value of command field is "exit".  Ask the server process
 *  to exit.
 */
export interface ExitRequest extends Request {
	command: CommandTypes.Exit;
}
/**
 * Close request; value of command field is "close". Notify the
 * server that the client has closed a previously open file.  If
 * file is still referenced by open files, the server will resume
 * monitoring the filesystem for changes to file.  Server does not
 * currently send a response to a close request.
 */
export interface CloseRequest extends FileRequest {
	command: CommandTypes.Close;
}
/**
 * Request to obtain the list of files that should be regenerated if target file is recompiled.
 * NOTE: this us query-only operation and does not generate any output on disk.
 */
export interface CompileOnSaveAffectedFileListRequest extends FileRequest {
	command: CommandTypes.CompileOnSaveAffectedFileList;
}
/**
 * Contains a list of files that should be regenerated in a project
 */
export interface CompileOnSaveAffectedFileListSingleProject {
	/**
	 * Project name
	 */
	projectFileName: string;
	/**
	 * List of files names that should be recompiled
	 */
	fileNames: string[];
}
/**
 * Response for CompileOnSaveAffectedFileListRequest request;
 */
export interface CompileOnSaveAffectedFileListResponse extends Response {
	body: CompileOnSaveAffectedFileListSingleProject[];
}
/**
 * Request to recompile the file. All generated outputs (.js, .d.ts or .js.map files) is written on disk.
 */
export interface CompileOnSaveEmitFileRequest extends FileRequest {
	command: CommandTypes.CompileOnSaveEmitFile;
	arguments: CompileOnSaveEmitFileRequestArgs;
}
/**
 * Arguments for CompileOnSaveEmitFileRequest
 */
export interface CompileOnSaveEmitFileRequestArgs extends FileRequestArgs {
	/**
	 * if true - then file should be recompiled even if it does not have any changes.
	 */
	forced?: boolean;
}
/**
 * Quickinfo request; value of command field is
 * "quickinfo". Return response giving a quick type and
 * documentation string for the symbol found in file at location
 * line, col.
 */
export interface QuickInfoRequest extends FileLocationRequest {
	command: CommandTypes.Quickinfo;
}
/**
 * Body of QuickInfoResponse.
 */
export interface QuickInfoResponseBody {
	/**
	 * The symbol's kind (such as 'className' or 'parameterName' or plain 'text').
	 */
	kind: string;
	/**
	 * Optional modifiers for the kind (such as 'public').
	 */
	kindModifiers: string;
	/**
	 * Starting file location of symbol.
	 */
	start: Location;
	/**
	 * One past last character of symbol.
	 */
	end: Location;
	/**
	 * Type and kind of symbol.
	 */
	displayString: string;
	/**
	 * Documentation associated with symbol.
	 */
	documentation: string;
}
/**
 * Quickinfo response message.
 */
export interface QuickInfoResponse extends Response {
	body?: QuickInfoResponseBody;
}
/**
 * Arguments for format messages.
 */
export interface FormatRequestArgs extends FileLocationRequestArgs {
	/**
	 * Last line of range for which to format text in file.
	 */
	endLine: number;
	/**
	 * Character offset on last line of range for which to format text in file.
	 */
	endOffset: number;
	/**
	 * Format options to be used.
	 */
	options?: FormatCodeSettings;
}
/**
 * Format request; value of command field is "format".  Return
 * response giving zero or more edit instructions.  The edit
 * instructions will be sorted in file order.  Applying the edit
 * instructions in reverse to file will result in correctly
 * reformatted text.
 */
export interface FormatRequest extends FileLocationRequest {
	command: CommandTypes.Format;
	arguments: FormatRequestArgs;
}
/**
 * Object found in response messages defining an editing
 * instruction for a span of text in source code.  The effect of
 * this instruction is to replace the text starting at start and
 * ending one character before end with newText. For an insertion,
 * the text span is empty.  For a deletion, newText is empty.
 */
export interface CodeEdit {
	/**
	 * First character of the text span to edit.
	 */
	start: Location;
	/**
	 * One character past last character of the text span to edit.
	 */
	end: Location;
	/**
	 * Replace the span defined above with this string (may be
	 * the empty string).
	 */
	newText: string;
}
/**
 * Format and format on key response message.
 */
export interface FormatResponse extends Response {
	body?: CodeEdit[];
}
/**
 * Arguments for format on key messages.
 */
export interface FormatOnKeyRequestArgs extends FileLocationRequestArgs {
	/**
	 * Key pressed (';', '\n', or '}').
	 */
	key: string;
	options?: FormatCodeSettings;
}
/**
 * Format on key request; value of command field is
 * "formatonkey". Given file location and key typed (as string),
 * return response giving zero or more edit instructions.  The
 * edit instructions will be sorted in file order.  Applying the
 * edit instructions in reverse to file will result in correctly
 * reformatted text.
 */
export interface FormatOnKeyRequest extends FileLocationRequest {
	command: CommandTypes.Formatonkey;
	arguments: FormatOnKeyRequestArgs;
}
/**
 * Arguments for completions messages.
 */
export interface CompletionsRequestArgs extends FileLocationRequestArgs {
	/**
	 * Optional prefix to apply to possible completions.
	 */
	prefix?: string;
}
/**
 * Completions request; value of command field is "completions".
 * Given a file location (file, line, col) and a prefix (which may
 * be the empty string), return the possible completions that
 * begin with prefix.
 */
export interface CompletionsRequest extends FileLocationRequest {
	command: CommandTypes.Completions;
	arguments: CompletionsRequestArgs;
}
/**
 * Arguments for completion details request.
 */
export interface CompletionDetailsRequestArgs extends FileLocationRequestArgs {
	/**
	 * Names of one or more entries for which to obtain details.
	 */
	entryNames: string[];
}
/**
 * Completion entry details request; value of command field is
 * "completionEntryDetails".  Given a file location (file, line,
 * col) and an array of completion entry names return more
 * detailed information for each completion entry.
 */
export interface CompletionDetailsRequest extends FileLocationRequest {
	command: CommandTypes.CompletionDetails;
	arguments: CompletionDetailsRequestArgs;
}
/**
 * Part of a symbol description.
 */
export interface SymbolDisplayPart {
	/**
	 * Text of an item describing the symbol.
	 */
	text: string;
	/**
	 * The symbol's kind (such as 'className' or 'parameterName' or plain 'text').
	 */
	kind: string;
}
/**
 * An item found in a completion response.
 */
export interface CompletionEntry {
	/**
	 * The symbol's name.
	 */
	name: string;
	/**
	 * The symbol's kind (such as 'className' or 'parameterName').
	 */
	kind: string;
	/**
	 * Optional modifiers for the kind (such as 'public').
	 */
	kindModifiers: string;
	/**
	 * A string that is used for comparing completion items so that they can be ordered.  This
	 * is often the same as the name but may be different in certain circumstances.
	 */
	sortText: string;
	/**
	 * An optional span that indicates the text to be replaced by this completion item. If present,
	 * this span should be used instead of the default one.
	 */
	replacementSpan?: TextSpan;
}
/**
 * Additional completion entry details, available on demand
 */
export interface CompletionEntryDetails {
	/**
	 * The symbol's name.
	 */
	name: string;
	/**
	 * The symbol's kind (such as 'className' or 'parameterName').
	 */
	kind: string;
	/**
	 * Optional modifiers for the kind (such as 'public').
	 */
	kindModifiers: string;
	/**
	 * Display parts of the symbol (similar to quick info).
	 */
	displayParts: SymbolDisplayPart[];
	/**
	 * Documentation strings for the symbol.
	 */
	documentation: SymbolDisplayPart[];
}
export interface CompletionsResponse extends Response {
	body?: CompletionEntry[];
}
export interface CompletionDetailsResponse extends Response {
	body?: CompletionEntryDetails[];
}
/**
 * Signature help information for a single parameter
 */
export interface SignatureHelpParameter {
	/**
	 * The parameter's name
	 */
	name: string;
	/**
	 * Documentation of the parameter.
	 */
	documentation: SymbolDisplayPart[];
	/**
	 * Display parts of the parameter.
	 */
	displayParts: SymbolDisplayPart[];
	/**
	 * Whether the parameter is optional or not.
	 */
	isOptional: boolean;
}
/**
 * Represents a single signature to show in signature help.
 */
export interface SignatureHelpItem {
	/**
	 * Whether the signature accepts a variable number of arguments.
	 */
	isVariadic: boolean;
	/**
	 * The prefix display parts.
	 */
	prefixDisplayParts: SymbolDisplayPart[];
	/**
	 * The suffix display parts.
	 */
	suffixDisplayParts: SymbolDisplayPart[];
	/**
	 * The separator display parts.
	 */
	separatorDisplayParts: SymbolDisplayPart[];
	/**
	 * The signature helps items for the parameters.
	 */
	parameters: SignatureHelpParameter[];
	/**
	 * The signature's documentation
	 */
	documentation: SymbolDisplayPart[];
}
/**
 * Signature help items found in the response of a signature help request.
 */
export interface SignatureHelpItems {
	/**
	 * The signature help items.
	 */
	items: SignatureHelpItem[];
	/**
	 * The span for which signature help should appear on a signature
	 */
	applicableSpan: TextSpan;
	/**
	 * The item selected in the set of available help items.
	 */
	selectedItemIndex: number;
	/**
	 * The argument selected in the set of parameters.
	 */
	argumentIndex: number;
	/**
	 * The argument count
	 */
	argumentCount: number;
}
/**
 * Arguments of a signature help request.
 */
export interface SignatureHelpRequestArgs extends FileLocationRequestArgs {
}
/**
 * Signature help request; value of command field is "signatureHelp".
 * Given a file location (file, line, col), return the signature
 * help.
 */
export interface SignatureHelpRequest extends FileLocationRequest {
	command: CommandTypes.SignatureHelp;
	arguments: SignatureHelpRequestArgs;
}
/**
 * Response object for a SignatureHelpRequest.
 */
export interface SignatureHelpResponse extends Response {
	body?: SignatureHelpItems;
}
/**
 * Synchronous request for semantic diagnostics of one file.
 */
export interface SemanticDiagnosticsSyncRequest extends FileRequest {
	command: CommandTypes.SemanticDiagnosticsSync;
	arguments: SemanticDiagnosticsSyncRequestArgs;
}
export interface SemanticDiagnosticsSyncRequestArgs extends FileRequestArgs {
	includeLinePosition?: boolean;
}
/**
 * Response object for synchronous sematic diagnostics request.
 */
export interface SemanticDiagnosticsSyncResponse extends Response {
	body?: Diagnostic[] | DiagnosticWithLinePosition[];
}
/**
 * Synchronous request for syntactic diagnostics of one file.
 */
export interface SyntacticDiagnosticsSyncRequest extends FileRequest {
	command: CommandTypes.SyntacticDiagnosticsSync;
	arguments: SyntacticDiagnosticsSyncRequestArgs;
}
export interface SyntacticDiagnosticsSyncRequestArgs extends FileRequestArgs {
	includeLinePosition?: boolean;
}
/**
 * Response object for synchronous syntactic diagnostics request.
 */
export interface SyntacticDiagnosticsSyncResponse extends Response {
	body?: Diagnostic[] | DiagnosticWithLinePosition[];
}
/**
* Arguments for GeterrForProject request.
*/
export interface GeterrForProjectRequestArgs {
	/**
	 * the file requesting project error list
	 */
	file: string;
	/**
	 * Delay in milliseconds to wait before starting to compute
	 * errors for the files in the file list
	 */
	delay: number;
}
/**
 * GeterrForProjectRequest request; value of command field is
 * "geterrForProject". It works similarly with 'Geterr', only
 * it request for every file in this project.
 */
export interface GeterrForProjectRequest extends Request {
	command: CommandTypes.GeterrForProject;
	arguments: GeterrForProjectRequestArgs;
}
/**
 * Arguments for geterr messages.
 */
export interface GeterrRequestArgs {
	/**
	 * List of file names for which to compute compiler errors.
	 * The files will be checked in list order.
	 */
	files: string[];
	/**
	 * Delay in milliseconds to wait before starting to compute
	 * errors for the files in the file list
	 */
	delay: number;
}
/**
 * Geterr request; value of command field is "geterr". Wait for
 * delay milliseconds and then, if during the wait no change or
 * reload messages have arrived for the first file in the files
 * list, get the syntactic errors for the file, field requests,
 * and then get the semantic errors for the file.  Repeat with a
 * smaller delay for each subsequent file on the files list.  Best
 * practice for an editor is to send a file list containing each
 * file that is currently visible, in most-recently-used order.
 */
export interface GeterrRequest extends Request {
	command: CommandTypes.Geterr;
	arguments: GeterrRequestArgs;
}
/**
 * Item of diagnostic information found in a DiagnosticEvent message.
 */
export interface Diagnostic {
	/**
	 * Starting file location at which text applies.
	 */
	start: Location;
	/**
	 * The last file location at which the text applies.
	 */
	end: Location;
	/**
	 * Text of diagnostic message.
	 */
	text: string;
}
export interface DiagnosticEventBody {
	/**
	 * The file for which diagnostic information is reported.
	 */
	file: string;
	/**
	 * An array of diagnostic information items.
	 */
	diagnostics: Diagnostic[];
}
/**
 * Event message for "syntaxDiag" and "semanticDiag" event types.
 * These events provide syntactic and semantic errors for a file.
 */
export interface DiagnosticEvent extends Event {
	body?: DiagnosticEventBody;
}
export interface ConfigFileDiagnosticEventBody {
	/**
	 * The file which trigged the searching and error-checking of the config file
	 */
	triggerFile: string;
	/**
	 * The name of the found config file.
	 */
	configFile: string;
	/**
	 * An arry of diagnostic information items for the found config file.
	 */
	diagnostics: Diagnostic[];
}
/**
 * Event message for "configFileDiag" event type.
 * This event provides errors for a found config file.
 */
export interface ConfigFileDiagnosticEvent extends Event {
	body?: ConfigFileDiagnosticEventBody;
	event: 'configFileDiag';
}
/**
 * Arguments for reload request.
 */
export interface ReloadRequestArgs extends FileRequestArgs {
	/**
	 * Name of temporary file from which to reload file
	 * contents. May be same as file.
	 */
	tmpfile: string;
}
/**
 * Reload request message; value of command field is "reload".
 * Reload contents of file with name given by the 'file' argument
 * from temporary file with name given by the 'tmpfile' argument.
 * The two names can be identical.
 */
export interface ReloadRequest extends FileRequest {
	command: CommandTypes.Reload;
	arguments: ReloadRequestArgs;
}
/**
 * Response to "reload" request. This is just an acknowledgement, so
 * no body field is required.
 */
export interface ReloadResponse extends Response {
}
/**
 * Arguments for saveto request.
 */
export interface SavetoRequestArgs extends FileRequestArgs {
	/**
	 * Name of temporary file into which to save server's view of
	 * file contents.
	 */
	tmpfile: string;
}
/**
 * Saveto request message; value of command field is "saveto".
 * For debugging purposes, save to a temporaryfile (named by
 * argument 'tmpfile') the contents of file named by argument
 * 'file'.  The server does not currently send a response to a
 * "saveto" request.
 */
export interface SavetoRequest extends FileRequest {
	command: CommandTypes.Saveto;
	arguments: SavetoRequestArgs;
}
/**
 * Arguments for navto request message.
 */
export interface NavtoRequestArgs extends FileRequestArgs {
	/**
	 * Search term to navigate to from current location; term can
	 * be '.*' or an identifier prefix.
	 */
	searchValue: string;
	/**
	 *  Optional limit on the number of items to return.
	 */
	maxResultCount?: number;
	projectFileName?: string;
}
/**
 * Navto request message; value of command field is "navto".
 * Return list of objects giving file locations and symbols that
 * match the search term given in argument 'searchTerm'.  The
 * context for the search is given by the named file.
 */
export interface NavtoRequest extends FileRequest {
	command: CommandTypes.Navto;
	arguments: NavtoRequestArgs;
}
/**
 * An item found in a navto response.
 */
export interface NavtoItem {
	/**
	 * The symbol's name.
	 */
	name: string;
	/**
	 * The symbol's kind (such as 'className' or 'parameterName').
	 */
	kind: string;
	/**
	 * exact, substring, or prefix.
	 */
	matchKind?: string;
	/**
	 * If this was a case sensitive or insensitive match.
	 */
	isCaseSensitive?: boolean;
	/**
	 * Optional modifiers for the kind (such as 'public').
	 */
	kindModifiers?: string;
	/**
	 * The file in which the symbol is found.
	 */
	file: string;
	/**
	 * The location within file at which the symbol is found.
	 */
	start: Location;
	/**
	 * One past the last character of the symbol.
	 */
	end: Location;
	/**
	 * Name of symbol's container symbol (if any); for example,
	 * the class name if symbol is a class member.
	 */
	containerName?: string;
	/**
	 * Kind of symbol's container symbol (if any).
	 */
	containerKind?: string;
}
/**
 * Navto response message. Body is an array of navto items.  Each
 * item gives a symbol that matched the search term.
 */
export interface NavtoResponse extends Response {
	body?: NavtoItem[];
}
/**
 * Arguments for change request message.
 */
export interface ChangeRequestArgs extends FormatRequestArgs {
	/**
	 * Optional string to insert at location (file, line, offset).
	 */
	insertString?: string;
}
/**
 * Change request message; value of command field is "change".
 * Update the server's view of the file named by argument 'file'.
 * Server does not currently send a response to a change request.
 */
export interface ChangeRequest extends FileLocationRequest {
	command: CommandTypes.Change;
	arguments: ChangeRequestArgs;
}
/**
 * Response to "brace" request.
 */
export interface BraceResponse extends Response {
	body?: TextSpan[];
}
/**
 * Brace matching request; value of command field is "brace".
 * Return response giving the file locations of matching braces
 * found in file at location line, offset.
 */
export interface BraceRequest extends FileLocationRequest {
	command: CommandTypes.Brace;
}
/**
 * NavBar items request; value of command field is "navbar".
 * Return response giving the list of navigation bar entries
 * extracted from the requested file.
 */
export interface NavBarRequest extends FileRequest {
	command: CommandTypes.NavBar;
}
/**
 * NavTree request; value of command field is "navtree".
 * Return response giving the navigation tree of the requested file.
 */
export interface NavTreeRequest extends FileRequest {
	command: CommandTypes.NavTree;
}
export interface NavigationBarItem {
	/**
	 * The item's display text.
	 */
	text: string;
	/**
	 * The symbol's kind (such as 'className' or 'parameterName').
	 */
	kind: string;
	/**
	 * Optional modifiers for the kind (such as 'public').
	 */
	kindModifiers?: string;
	/**
	 * The definition locations of the item.
	 */
	spans: TextSpan[];
	/**
	 * Optional children.
	 */
	childItems?: NavigationBarItem[];
	/**
	 * Number of levels deep this item should appear.
	 */
	indent: number;
}
/** protocol.NavigationTree is identical to ts.NavigationTree, except using protocol.TextSpan instead of ts.TextSpan */
export interface NavigationTree {
	text: string;
	kind: string;
	kindModifiers: string;
	spans: TextSpan[];
	childItems?: NavigationTree[];
}
export interface NavBarResponse extends Response {
	body?: NavigationBarItem[];
}
export interface NavTreeResponse extends Response {
	body?: NavigationTree;
}

export interface TextInsertion {
	newText: string;
	/** The position in newText the caret should point to after the insertion. */
	caretOffset: number;
}

export interface TodoCommentDescriptor {
	text: string;
	priority: number;
}

export interface TodoComment {
	descriptor: TodoCommentDescriptor;
	message: string;
	position: number;
}

export interface EditorSettings {
	baseIndentSize?: number;
	indentSize?: number;
	tabSize?: number;
	newLineCharacter?: string;
	convertTabsToSpaces?: boolean;
	indentStyle?: IndentStyle;
}

export const enum IndentStyle {
	None = 0,
	Block = 1,
	Smart = 2,
}

export const enum ScriptKind {
	Unknown = 0,
	JS = 1,
	JSX = 2,
	TS = 3,
	TSX = 4,
}

export interface TypingOptions {
	enableAutoDiscovery?: boolean;
	include?: string[];
	exclude?: string[];
	[option: string]: string[] | boolean | undefined;
}

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
	paths?: MapLike<string[]>;
	preserveConstEnums?: boolean;
	project?: string;
	reactNamespace?: string;
	removeComments?: boolean;
	rootDir?: string;
	rootDirs?: string[];
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

export const enum JsxEmit {
	None = 0,
	Preserve = 1,
	React = 2,
}

export const enum ModuleKind {
	None = 0,
	CommonJS = 1,
	AMD = 2,
	UMD = 3,
	System = 4,
	ES6 = 5,
	ES2015 = 5,
}

export const enum ModuleResolutionKind {
	Classic = 1,
	NodeJs = 2,
}

export const enum NewLineKind {
	CarriageReturnLineFeed = 0,
	LineFeed = 1,
}

export interface MapLike<T> {
	[index: string]: T;
}

export const enum ScriptTarget {
	ES3 = 0,
	ES5 = 1,
	ES6 = 2,
	ES2015 = 2,
	Latest = 2,
}

export type CompilerOptionsValue = string | number | boolean | (string | number)[] | string[] | MapLike<string[]>;

export interface FormatCodeSettings extends EditorSettings {
	insertSpaceAfterCommaDelimiter?: boolean;
	insertSpaceAfterSemicolonInForStatements?: boolean;
	insertSpaceBeforeAndAfterBinaryOperators?: boolean;
	insertSpaceAfterKeywordsInControlFlowStatements?: boolean;
	insertSpaceAfterFunctionKeywordForAnonymousFunctions?: boolean;
	insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis?: boolean;
	insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets?: boolean;
	insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces?: boolean;
	insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces?: boolean;
	placeOpenBraceOnNewLineForFunctions?: boolean;
	placeOpenBraceOnNewLineForControlBlocks?: boolean;
}
