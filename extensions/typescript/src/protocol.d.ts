/**
  * Declaration module describing the TypeScript Server protocol
  */
declare namespace ts.server.protocol {
    namespace CommandTypes {
        type Brace = "brace";
        type BraceCompletion = "braceCompletion";
        type Change = "change";
        type Close = "close";
        type Completions = "completions";
        type CompletionDetails = "completionEntryDetails";
        type CompileOnSaveAffectedFileList = "compileOnSaveAffectedFileList";
        type CompileOnSaveEmitFile = "compileOnSaveEmitFile";
        type Configure = "configure";
        type Definition = "definition";
        type Exit = "exit";
        type Format = "format";
        type Formatonkey = "formatonkey";
        type Geterr = "geterr";
        type GeterrForProject = "geterrForProject";
        type SemanticDiagnosticsSync = "semanticDiagnosticsSync";
        type SyntacticDiagnosticsSync = "syntacticDiagnosticsSync";
        type NavBar = "navbar";
        type Navto = "navto";
        type NavTree = "navtree";
        type NavTreeFull = "navtree-full";
        type Occurrences = "occurrences";
        type DocumentHighlights = "documentHighlights";
        type Open = "open";
        type Quickinfo = "quickinfo";
        type References = "references";
        type Reload = "reload";
        type Rename = "rename";
        type Saveto = "saveto";
        type SignatureHelp = "signatureHelp";
        type TypeDefinition = "typeDefinition";
        type ProjectInfo = "projectInfo";
        type ReloadProjects = "reloadProjects";
        type Unknown = "unknown";
        type OpenExternalProject = "openExternalProject";
        type OpenExternalProjects = "openExternalProjects";
        type CloseExternalProject = "closeExternalProject";
        type TodoComments = "todoComments";
        type Indentation = "indentation";
        type DocCommentTemplate = "docCommentTemplate";
        type CompilerOptionsForInferredProjects = "compilerOptionsForInferredProjects";
    }
    /**
      * A TypeScript Server message
      */
    interface Message {
        /**
          * Sequence number of the message
          */
        seq: number;
        /**
          * One of "request", "response", or "event"
          */
        type: "request" | "response" | "event";
    }
    /**
      * Client-initiated request message
      */
    interface Request extends Message {
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
    interface ReloadProjectsRequest extends Message {
        command: CommandTypes.ReloadProjects;
    }
    /**
      * Server-initiated event message
      */
    interface Event extends Message {
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
    interface Response extends Message {
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
    interface FileRequestArgs {
        /**
          * The file for the request (absolute pathname required).
          */
        file: string;
        projectFileName?: string;
    }
    /**
     * Requests a JS Doc comment template for a given position
     */
    interface DocCommentTemplateRequest extends FileLocationRequest {
        command: CommandTypes.DocCommentTemplate;
    }
    /**
     * Response to DocCommentTemplateRequest
     */
    interface DocCommandTemplateResponse extends Response {
        body?: TextInsertion;
    }
    /**
     * A request to get TODO comments from the file
     */
    interface TodoCommentRequest extends FileRequest {
        command: CommandTypes.TodoComments;
        arguments: TodoCommentRequestArgs;
    }
    /**
     * Arguments for TodoCommentRequest request.
     */
    interface TodoCommentRequestArgs extends FileRequestArgs {
        /**
         * Array of target TodoCommentDescriptors that describes TODO comments to be found
         */
        descriptors: TodoCommentDescriptor[];
    }
    /**
     * Response for TodoCommentRequest request.
     */
    interface TodoCommentsResponse extends Response {
        body?: TodoComment[];
    }
    /**
     * A request to get indentation for a location in file
     */
    interface IndentationRequest extends FileLocationRequest {
        command: CommandTypes.Indentation;
        arguments: IndentationRequestArgs;
    }
    /**
     * Response for IndentationRequest request.
     */
    interface IndentationResponse extends Response {
        body?: IndentationResult;
    }
    /**
     * Indentation result representing where indentation should be placed
     */
    interface IndentationResult {
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
    interface IndentationRequestArgs extends FileLocationRequestArgs {
        /**
         * An optional set of settings to be used when computing indentation.
         * If argument is omitted - then it will use settings for file that were previously set via 'configure' request or global settings.
         */
        options?: EditorSettings;
    }
    /**
      * Arguments for ProjectInfoRequest request.
      */
    interface ProjectInfoRequestArgs extends FileRequestArgs {
        /**
          * Indicate if the file name list of the project is needed
          */
        needFileNameList: boolean;
    }
    /**
      * A request to get the project information of the current file.
      */
    interface ProjectInfoRequest extends Request {
        command: CommandTypes.ProjectInfo;
        arguments: ProjectInfoRequestArgs;
    }
    /**
     * A request to retrieve compiler options diagnostics for a project
     */
    interface CompilerOptionsDiagnosticsRequest extends Request {
        arguments: CompilerOptionsDiagnosticsRequestArgs;
    }
    /**
     * Arguments for CompilerOptionsDiagnosticsRequest request.
     */
    interface CompilerOptionsDiagnosticsRequestArgs {
        /**
         * Name of the project to retrieve compiler options diagnostics.
         */
        projectFileName: string;
    }
    /**
      * Response message body for "projectInfo" request
      */
    interface ProjectInfo {
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
    interface DiagnosticWithLinePosition {
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
    interface ProjectInfoResponse extends Response {
        body?: ProjectInfo;
    }
    /**
      * Request whose sole parameter is a file name.
      */
    interface FileRequest extends Request {
        arguments: FileRequestArgs;
    }
    /**
      * Instances of this interface specify a location in a source file:
      * (file, line, character offset), where line and character offset are 1-based.
      */
    interface FileLocationRequestArgs extends FileRequestArgs {
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
    interface FileLocationRequest extends FileRequest {
        arguments: FileLocationRequestArgs;
    }
    /**
     * Arguments for EncodedSemanticClassificationsRequest request.
     */
    interface EncodedSemanticClassificationsRequestArgs extends FileRequestArgs {
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
    interface DocumentHighlightsRequestArgs extends FileLocationRequestArgs {
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
    interface DefinitionRequest extends FileLocationRequest {
        command: CommandTypes.Definition;
    }
    /**
      * Go to type request; value of command field is
      * "typeDefinition". Return response giving the file locations that
      * define the type for the symbol found in file at location line, col.
      */
    interface TypeDefinitionRequest extends FileLocationRequest {
        command: CommandTypes.TypeDefinition;
    }
    /**
      * Location in source code expressed as (one-based) line and character offset.
      */
    interface Location {
        line: number;
        offset: number;
    }
    /**
      * Object found in response messages defining a span of text in source code.
      */
    interface TextSpan {
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
    interface FileSpan extends TextSpan {
        /**
          * File containing text span.
          */
        file: string;
    }
    /**
      * Definition response message.  Gives text range for definition.
      */
    interface DefinitionResponse extends Response {
        body?: FileSpan[];
    }
    /**
      * Definition response message.  Gives text range for definition.
      */
    interface TypeDefinitionResponse extends Response {
        body?: FileSpan[];
    }
    /**
      * Implementation response message.  Gives text range for implementations.
      */
    interface ImplementationResponse extends Response {
        body?: FileSpan[];
    }
    /**
     * Request to get brace completion for a location in the file.
     */
    interface BraceCompletionRequest extends FileLocationRequest {
        command: CommandTypes.BraceCompletion;
        arguments: BraceCompletionRequestArgs;
    }
    /**
     * Argument for BraceCompletionRequest request.
     */
    interface BraceCompletionRequestArgs extends FileLocationRequestArgs {
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
    interface OccurrencesRequest extends FileLocationRequest {
        command: CommandTypes.Occurrences;
    }
    interface OccurrencesResponseItem extends FileSpan {
        /**
          * True if the occurrence is a write location, false otherwise.
          */
        isWriteAccess: boolean;
    }
    interface OccurrencesResponse extends Response {
        body?: OccurrencesResponseItem[];
    }
    /**
      * Get document highlights request; value of command field is
      * "documentHighlights". Return response giving spans that are relevant
      * in the file at a given line and column.
      */
    interface DocumentHighlightsRequest extends FileLocationRequest {
        command: CommandTypes.DocumentHighlights;
        arguments: DocumentHighlightsRequestArgs;
    }
    /**
     * Span augmented with extra information that denotes the kind of the highlighting to be used for span.
     * Kind is taken from HighlightSpanKind type.
     */
    interface HighlightSpan extends TextSpan {
        kind: string;
    }
    /**
     * Represents a set of highligh spans for a give name
     */
    interface DocumentHighlightsItem {
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
    interface DocumentHighlightsResponse extends Response {
        body?: DocumentHighlightsItem[];
    }
    /**
      * Find references request; value of command field is
      * "references". Return response giving the file locations that
      * reference the symbol found in file at location line, col.
      */
    interface ReferencesRequest extends FileLocationRequest {
        command: CommandTypes.References;
    }
    interface ReferencesResponseItem extends FileSpan {
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
    interface ReferencesResponseBody {
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
    interface ReferencesResponse extends Response {
        body?: ReferencesResponseBody;
    }
    /**
     * Argument for RenameRequest request.
     */
    interface RenameRequestArgs extends FileLocationRequestArgs {
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
    interface RenameRequest extends FileLocationRequest {
        command: CommandTypes.Rename;
        arguments: RenameRequestArgs;
    }
    /**
      * Information about the item to be renamed.
      */
    interface RenameInfo {
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
    interface SpanGroup {
        /** The file to which the spans apply */
        file: string;
        /** The text spans in this group */
        locs: TextSpan[];
    }
    interface RenameResponseBody {
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
    interface RenameResponse extends Response {
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
    interface ExternalFile {
        /**
         * Name of file file
         */
        fileName: string;
        /**
         * Script kind of the file
         */
        scriptKind?: ScriptKindName | ts.ScriptKind;
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
    interface ExternalProject {
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
    interface CompileOnSaveMixin {
        /**
         * If compile on save is enabled for the project
         */
        compileOnSave?: boolean;
    }
    /**
     * For external projects, some of the project settings are sent together with
     * compiler settings.
     */
    type ExternalProjectCompilerOptions = CompilerOptions & CompileOnSaveMixin;
    /**
     * Represents a set of changes that happen in project
     */
    interface ProjectChanges {
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
      * Information found in a configure request.
      */
    interface ConfigureRequestArguments {
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
    interface ConfigureRequest extends Request {
        command: CommandTypes.Configure;
        arguments: ConfigureRequestArguments;
    }
    /**
      * Response to "configure" request.  This is just an acknowledgement, so
      * no body field is required.
      */
    interface ConfigureResponse extends Response {
    }
    /**
      *  Information found in an "open" request.
      */
    interface OpenRequestArgs extends FileRequestArgs {
        /**
         * Used when a version of the file content is known to be more up to date than the one on disk.
         * Then the known content will be used upon opening instead of the disk copy
         */
        fileContent?: string;
        /**
         * Used to specify the script kind of the file explicitly. It could be one of the following:
         *      "TS", "JS", "TSX", "JSX"
         */
        scriptKindName?: ScriptKindName;
    }
    type ScriptKindName = "TS" | "JS" | "TSX" | "JSX";
    /**
      * Open request; value of command field is "open". Notify the
      * server that the client has file open.  The server will not
      * monitor the filesystem for changes in this file and will assume
      * that the client is updating the server (using the change and/or
      * reload messages) when the file changes. Server does not currently
      * send a response to an open request.
      */
    interface OpenRequest extends Request {
        command: CommandTypes.Open;
        arguments: OpenRequestArgs;
    }
    /**
     * Request to open or update external project
     */
    interface OpenExternalProjectRequest extends Request {
        command: CommandTypes.OpenExternalProject;
        arguments: OpenExternalProjectArgs;
    }
    /**
     * Arguments to OpenExternalProjectRequest request
     */
    type OpenExternalProjectArgs = ExternalProject;
    /**
     * Request to open multiple external projects
     */
    interface OpenExternalProjectsRequest extends Request {
        command: CommandTypes.OpenExternalProjects;
        arguments: OpenExternalProjectsArgs;
    }
    /**
     * Arguments to OpenExternalProjectsRequest
     */
    interface OpenExternalProjectsArgs {
        /**
         * List of external projects to open or update
         */
        projects: ExternalProject[];
    }
    /**
     * Response to OpenExternalProjectRequest request. This is just an acknowledgement, so
     * no body field is required.
     */
    interface OpenExternalProjectResponse extends Response {
    }
    /**
     * Response to OpenExternalProjectsRequest request. This is just an acknowledgement, so
     * no body field is required.
     */
    interface OpenExternalProjectsResponse extends Response {
    }
    /**
     * Request to close external project.
     */
    interface CloseExternalProjectRequest extends Request {
        command: CommandTypes.CloseExternalProject;
        arguments: CloseExternalProjectRequestArgs;
    }
    /**
     * Arguments to CloseExternalProjectRequest request
     */
    interface CloseExternalProjectRequestArgs {
        /**
         * Name of the project to close
         */
        projectFileName: string;
    }
    /**
     * Response to CloseExternalProjectRequest request. This is just an acknowledgement, so
     * no body field is required.
     */
    interface CloseExternalProjectResponse extends Response {
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
    interface SetCompilerOptionsForInferredProjectsRequest extends Request {
        command: CommandTypes.CompilerOptionsForInferredProjects;
        arguments: SetCompilerOptionsForInferredProjectsArgs;
    }
    /**
     * Argument for SetCompilerOptionsForInferredProjectsRequest request.
     */
    interface SetCompilerOptionsForInferredProjectsArgs {
        /**
         * Compiler options to be used with inferred projects.
         */
        options: ExternalProjectCompilerOptions;
    }
    /**
      * Response to SetCompilerOptionsForInferredProjectsResponse request. This is just an acknowledgement, so
      * no body field is required.
      */
    interface SetCompilerOptionsForInferredProjectsResponse extends Response {
    }
    /**
      *  Exit request; value of command field is "exit".  Ask the server process
      *  to exit.
      */
    interface ExitRequest extends Request {
        command: CommandTypes.Exit;
    }
    /**
      * Close request; value of command field is "close". Notify the
      * server that the client has closed a previously open file.  If
      * file is still referenced by open files, the server will resume
      * monitoring the filesystem for changes to file.  Server does not
      * currently send a response to a close request.
      */
    interface CloseRequest extends FileRequest {
        command: CommandTypes.Close;
    }
    /**
     * Request to obtain the list of files that should be regenerated if target file is recompiled.
     * NOTE: this us query-only operation and does not generate any output on disk.
     */
    interface CompileOnSaveAffectedFileListRequest extends FileRequest {
        command: CommandTypes.CompileOnSaveAffectedFileList;
    }
    /**
     * Contains a list of files that should be regenerated in a project
     */
    interface CompileOnSaveAffectedFileListSingleProject {
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
    interface CompileOnSaveAffectedFileListResponse extends Response {
        body: CompileOnSaveAffectedFileListSingleProject[];
    }
    /**
     * Request to recompile the file. All generated outputs (.js, .d.ts or .js.map files) is written on disk.
     */
    interface CompileOnSaveEmitFileRequest extends FileRequest {
        command: CommandTypes.CompileOnSaveEmitFile;
        arguments: CompileOnSaveEmitFileRequestArgs;
    }
    /**
     * Arguments for CompileOnSaveEmitFileRequest
     */
    interface CompileOnSaveEmitFileRequestArgs extends FileRequestArgs {
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
    interface QuickInfoRequest extends FileLocationRequest {
        command: CommandTypes.Quickinfo;
    }
    /**
      * Body of QuickInfoResponse.
      */
    interface QuickInfoResponseBody {
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
    interface QuickInfoResponse extends Response {
        body?: QuickInfoResponseBody;
    }
    /**
      * Arguments for format messages.
      */
    interface FormatRequestArgs extends FileLocationRequestArgs {
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
    interface FormatRequest extends FileLocationRequest {
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
    interface CodeEdit {
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
    interface FormatResponse extends Response {
        body?: CodeEdit[];
    }
    /**
      * Arguments for format on key messages.
      */
    interface FormatOnKeyRequestArgs extends FileLocationRequestArgs {
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
    interface FormatOnKeyRequest extends FileLocationRequest {
        command: CommandTypes.Formatonkey;
        arguments: FormatOnKeyRequestArgs;
    }
    /**
      * Arguments for completions messages.
      */
    interface CompletionsRequestArgs extends FileLocationRequestArgs {
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
    interface CompletionsRequest extends FileLocationRequest {
        command: CommandTypes.Completions;
        arguments: CompletionsRequestArgs;
    }
    /**
      * Arguments for completion details request.
      */
    interface CompletionDetailsRequestArgs extends FileLocationRequestArgs {
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
    interface CompletionDetailsRequest extends FileLocationRequest {
        command: CommandTypes.CompletionDetails;
        arguments: CompletionDetailsRequestArgs;
    }
    /**
      * Part of a symbol description.
      */
    interface SymbolDisplayPart {
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
    interface CompletionEntry {
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
    interface CompletionEntryDetails {
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
    interface CompletionsResponse extends Response {
        body?: CompletionEntry[];
    }
    interface CompletionDetailsResponse extends Response {
        body?: CompletionEntryDetails[];
    }
    /**
     * Signature help information for a single parameter
     */
    interface SignatureHelpParameter {
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
    interface SignatureHelpItem {
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
    interface SignatureHelpItems {
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
    interface SignatureHelpRequestArgs extends FileLocationRequestArgs {
    }
    /**
      * Signature help request; value of command field is "signatureHelp".
      * Given a file location (file, line, col), return the signature
      * help.
      */
    interface SignatureHelpRequest extends FileLocationRequest {
        command: CommandTypes.SignatureHelp;
        arguments: SignatureHelpRequestArgs;
    }
    /**
     * Response object for a SignatureHelpRequest.
     */
    interface SignatureHelpResponse extends Response {
        body?: SignatureHelpItems;
    }
    /**
      * Synchronous request for semantic diagnostics of one file.
      */
    interface SemanticDiagnosticsSyncRequest extends FileRequest {
        command: CommandTypes.SemanticDiagnosticsSync;
        arguments: SemanticDiagnosticsSyncRequestArgs;
    }
    interface SemanticDiagnosticsSyncRequestArgs extends FileRequestArgs {
        includeLinePosition?: boolean;
    }
    /**
      * Response object for synchronous sematic diagnostics request.
      */
    interface SemanticDiagnosticsSyncResponse extends Response {
        body?: Diagnostic[] | DiagnosticWithLinePosition[];
    }
    /**
      * Synchronous request for syntactic diagnostics of one file.
      */
    interface SyntacticDiagnosticsSyncRequest extends FileRequest {
        command: CommandTypes.SyntacticDiagnosticsSync;
        arguments: SyntacticDiagnosticsSyncRequestArgs;
    }
    interface SyntacticDiagnosticsSyncRequestArgs extends FileRequestArgs {
        includeLinePosition?: boolean;
    }
    /**
      * Response object for synchronous syntactic diagnostics request.
      */
    interface SyntacticDiagnosticsSyncResponse extends Response {
        body?: Diagnostic[] | DiagnosticWithLinePosition[];
    }
    /**
    * Arguments for GeterrForProject request.
    */
    interface GeterrForProjectRequestArgs {
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
    interface GeterrForProjectRequest extends Request {
        command: CommandTypes.GeterrForProject;
        arguments: GeterrForProjectRequestArgs;
    }
    /**
      * Arguments for geterr messages.
      */
    interface GeterrRequestArgs {
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
    interface GeterrRequest extends Request {
        command: CommandTypes.Geterr;
        arguments: GeterrRequestArgs;
    }
    /**
      * Item of diagnostic information found in a DiagnosticEvent message.
      */
    interface Diagnostic {
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
    interface DiagnosticEventBody {
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
    interface DiagnosticEvent extends Event {
        body?: DiagnosticEventBody;
    }
    interface ConfigFileDiagnosticEventBody {
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
    interface ConfigFileDiagnosticEvent extends Event {
        body?: ConfigFileDiagnosticEventBody;
        event: "configFileDiag";
    }
    /**
      * Arguments for reload request.
      */
    interface ReloadRequestArgs extends FileRequestArgs {
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
    interface ReloadRequest extends FileRequest {
        command: CommandTypes.Reload;
        arguments: ReloadRequestArgs;
    }
    /**
      * Response to "reload" request. This is just an acknowledgement, so
      * no body field is required.
      */
    interface ReloadResponse extends Response {
    }
    /**
      * Arguments for saveto request.
      */
    interface SavetoRequestArgs extends FileRequestArgs {
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
    interface SavetoRequest extends FileRequest {
        command: CommandTypes.Saveto;
        arguments: SavetoRequestArgs;
    }
    /**
      * Arguments for navto request message.
      */
    interface NavtoRequestArgs extends FileRequestArgs {
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
    interface NavtoRequest extends FileRequest {
        command: CommandTypes.Navto;
        arguments: NavtoRequestArgs;
    }
    /**
      * An item found in a navto response.
      */
    interface NavtoItem {
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
    interface NavtoResponse extends Response {
        body?: NavtoItem[];
    }
    /**
      * Arguments for change request message.
      */
    interface ChangeRequestArgs extends FormatRequestArgs {
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
    interface ChangeRequest extends FileLocationRequest {
        command: CommandTypes.Change;
        arguments: ChangeRequestArgs;
    }
    /**
      * Response to "brace" request.
      */
    interface BraceResponse extends Response {
        body?: TextSpan[];
    }
    /**
      * Brace matching request; value of command field is "brace".
      * Return response giving the file locations of matching braces
      * found in file at location line, offset.
      */
    interface BraceRequest extends FileLocationRequest {
        command: CommandTypes.Brace;
    }
    /**
      * NavBar items request; value of command field is "navbar".
      * Return response giving the list of navigation bar entries
      * extracted from the requested file.
      */
    interface NavBarRequest extends FileRequest {
        command: CommandTypes.NavBar;
    }
    /**
     * NavTree request; value of command field is "navtree".
     * Return response giving the navigation tree of the requested file.
     */
    interface NavTreeRequest extends FileRequest {
        command: CommandTypes.NavTree;
    }
    interface NavigationBarItem {
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
    interface NavigationTree {
        text: string;
        kind: string;
        kindModifiers: string;
        spans: TextSpan[];
        childItems?: NavigationTree[];
    }
    interface NavBarResponse extends Response {
        body?: NavigationBarItem[];
    }
    interface NavTreeResponse extends Response {
        body?: NavigationTree;
    }
    namespace IndentStyle {
        type None = "None";
        type Block = "Block";
        type Smart = "Smart";
    }
    type IndentStyle = IndentStyle.None | IndentStyle.Block | IndentStyle.Smart;
    interface EditorSettings {
        baseIndentSize?: number;
        indentSize?: number;
        tabSize?: number;
        newLineCharacter?: string;
        convertTabsToSpaces?: boolean;
        indentStyle?: IndentStyle | ts.IndentStyle;
    }
    interface FormatCodeSettings extends EditorSettings {
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
    interface CompilerOptions {
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
        jsx?: JsxEmit | ts.JsxEmit;
        lib?: string[];
        locale?: string;
        mapRoot?: string;
        maxNodeModuleJsDepth?: number;
        module?: ModuleKind | ts.ModuleKind;
        moduleResolution?: ModuleResolutionKind | ts.ModuleResolutionKind;
        newLine?: NewLineKind | ts.NewLineKind;
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
        target?: ScriptTarget | ts.ScriptTarget;
        traceResolution?: boolean;
        types?: string[];
        /** Paths used to used to compute primary types search locations */
        typeRoots?: string[];
        [option: string]: CompilerOptionsValue | undefined;
    }
    namespace JsxEmit {
        type None = "None";
        type Preserve = "Preserve";
        type React = "React";
    }
    type JsxEmit = JsxEmit.None | JsxEmit.Preserve | JsxEmit.React;
    namespace ModuleKind {
        type None = "None";
        type CommonJS = "CommonJS";
        type AMD = "AMD";
        type UMD = "UMD";
        type System = "System";
        type ES6 = "ES6";
        type ES2015 = "ES2015";
    }
    type ModuleKind = ModuleKind.None | ModuleKind.CommonJS | ModuleKind.AMD | ModuleKind.UMD | ModuleKind.System | ModuleKind.ES6 | ModuleKind.ES2015;
    namespace ModuleResolutionKind {
        type Classic = "Classic";
        type Node = "Node";
    }
    type ModuleResolutionKind = ModuleResolutionKind.Classic | ModuleResolutionKind.Node;
    namespace NewLineKind {
        type Crlf = "Crlf";
        type Lf = "Lf";
    }
    type NewLineKind = NewLineKind.Crlf | NewLineKind.Lf;
    namespace ScriptTarget {
        type ES3 = "ES3";
        type ES5 = "ES5";
        type ES6 = "ES6";
        type ES2015 = "ES2015";
    }
    type ScriptTarget = ScriptTarget.ES3 | ScriptTarget.ES5 | ScriptTarget.ES6 | ScriptTarget.ES2015;
}
declare namespace ts.server.protocol {

    interface TextInsertion {
        newText: string;
        /** The position in newText the caret should point to after the insertion. */
        caretOffset: number;
    }

    interface TodoCommentDescriptor {
        text: string;
        priority: number;
    }

    interface TodoComment {
        descriptor: TodoCommentDescriptor;
        message: string;
        position: number;
    }

    interface TypingOptions {
        enableAutoDiscovery?: boolean;
        include?: string[];
        exclude?: string[];
        [option: string]: string[] | boolean | undefined;
    }

    interface MapLike<T> {
        [index: string]: T;
    }

    type CompilerOptionsValue = string | number | boolean | (string | number)[] | string[] | MapLike<string[]>;
}
declare namespace ts {
    // these types are empty stubs for types from services and should not be used directly
    export type ScriptKind = never;
    export type IndentStyle = never;
    export type JsxEmit = never;
    export type ModuleKind = never;
    export type ModuleResolutionKind = never;
    export type NewLineKind = never;
    export type ScriptTarget = never;
}
import protocol = ts.server.protocol;
export = protocol;
export as namespace protocol;