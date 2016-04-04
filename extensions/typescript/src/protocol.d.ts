/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

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
  * A request to get the project information of the current file
  */
export interface ProjectInfoRequest extends Request {
    arguments: ProjectInfoRequestArgs;
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
}

/**
  * Go to type request; value of command field is
  * "typeDefinition". Return response giving the file locations that
  * define the type for the symbol found in file at location line, col.
  */
export interface TypeDefinitionRequest extends FileLocationRequest {
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
  * Get occurrences request; value of command field is
  * "occurrences". Return response giving spans that are relevant
  * in the file at a given line and column.
  */
export interface OccurrencesRequest extends FileLocationRequest {
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
    arguments: DocumentHighlightsRequestArgs;
}

export interface HighlightSpan extends TextSpan {
    kind: string;
}

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

export interface DocumentHighlightsResponse extends Response {
    body?: DocumentHighlightsItem[];
}

/**
  * Find references request; value of command field is
  * "references". Return response giving the file locations that
  * reference the symbol found in file at location line, col.
  */
export interface ReferencesRequest extends FileLocationRequest {
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

export interface RenameRequestArgs extends FileLocationRequestArgs {
    findInComments?: boolean;
    findInStrings?: boolean;
}


/**
  * Rename request; value of command field is "rename". Return
  * response giving the file locations that reference the symbol
  * found in file at location line, col. Also return full display
  * name of the symbol so that client can print it unambiguously.
  */
export interface RenameRequest extends FileLocationRequest {
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
 * Editor options
 */
export interface EditorOptions {

    /** Number of spaces for each tab. Default value is 4. */
    tabSize?: number;

    /** Number of spaces to indent during formatting. Default value is 4. */
    indentSize?: number;

    /** The new line character to be used. Default value is the OS line delimiter. */
    newLineCharacter?: string;

    /** Whether tabs should be converted to spaces. Default value is true. */
    convertTabsToSpaces?: boolean;
}

/**
 * Format options
 */
export interface FormatOptions extends EditorOptions {

    /** Defines space handling after a comma delimiter. Default value is true. */
    insertSpaceAfterCommaDelimiter?: boolean;

    /** Defines space handling after a semicolon in a for statemen. Default value is true */
    insertSpaceAfterSemicolonInForStatements?: boolean;

    /** Defines space handling after a binary operator. Default value is true. */
    insertSpaceBeforeAndAfterBinaryOperators?: boolean;

    /** Defines space handling after keywords in control flow statement. Default value is true. */
    insertSpaceAfterKeywordsInControlFlowStatements?: boolean;

    /** Defines space handling after function keyword for anonymous functions. Default value is false. */
    insertSpaceAfterFunctionKeywordForAnonymousFunctions?: boolean;

    /** Defines space handling after opening and before closing non empty parenthesis. Default value is false. */
    insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis?: boolean;

    /** Defines space handling after opening and before closing non empty brackets. Default value is false. */
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets?: boolean;

    /** Defines whether an open brace is put onto a new line for functions or not. Default value is false. */
    placeOpenBraceOnNewLineForFunctions?: boolean;

    /** Defines whether an open brace is put onto a new line for control blocks or not. Default value is false. */
    placeOpenBraceOnNewLineForControlBlocks?: boolean;

    /** Index operator */
    [key: string]: string | number | boolean;
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
    formatOptions?: FormatOptions;
}

/**
  *  Configure request; value of command field is "configure".  Specifies
  *  host information, such as host type, tab size, and indent size.
  */
export interface ConfigureRequest extends Request {
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
    arguments: OpenRequestArgs;
}

/**
  *  Exit request; value of command field is "exit".  Ask the server process
  *  to exit.
  */
export interface ExitRequest extends Request {
}

/**
  * Close request; value of command field is "close". Notify the
  * server that the client has closed a previously open file.  If
  * file is still referenced by open files, the server will resume
  * monitoring the filesystem for changes to file.  Server does not
  * currently send a response to a close request.
  */
export interface CloseRequest extends FileRequest {
}

/**
  * Quickinfo request; value of command field is
  * "quickinfo". Return response giving a quick type and
  * documentation string for the symbol found in file at location
  * line, col.
  */
export interface QuickInfoRequest extends FileLocationRequest {
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
}

/**
  * Format request; value of command field is "format".  Return
  * response giving zero or more edit instructions.  The edit
  * instructions will be sorted in file order.  Applying the edit
  * instructions in reverse to file will result in correctly
  * reformatted text.
  */
export interface FormatRequest extends FileLocationRequest {
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
     * The suffix disaply parts.
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
    arguments: SignatureHelpRequestArgs;
}

/**
 * Repsonse object for a SignatureHelpRequest.
 */
export interface SignatureHelpResponse extends Response {
    body?: SignatureHelpItems;
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
    arguments: GeterrRequestArgs;
}

/**
  * Item of diagnostic information found in a DiagnosticEvent message.
  */
export interface Diagnostic {
    /**
      * Starting file location at which text appies.
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
    arguments: ReloadRequestArgs;
}

/**
  * Response to "reload" request.  This is just an acknowledgement, so
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
}

/**
  * Navto request message; value of command field is "navto".
  * Return list of objects giving file locations and symbols that
  * match the search term given in argument 'searchTerm'.  The
  * context for the search is given by the named file.
  */
export interface NavtoRequest extends FileRequest {
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
}

/**
  * NavBar itesm request; value of command field is "navbar".
  * Return response giving the list of navigation bar entries
  * extracted from the requested file.
  */
export interface NavBarRequest extends FileRequest {
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
}

export interface NavBarResponse extends Response {
    body?: NavigationBarItem[];
}
