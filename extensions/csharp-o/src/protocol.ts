/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export var GoToDefinition = '/gotoDefinition';

export var CodeCheck = '/codecheck';

export var AutoComplete = '/autocomplete';

export var CurrentFileMembersAsTree = '/currentfilemembersastree';

export var TypeLookup = '/typelookup';

export var AddToProject = '/addtoproject';

export var RemoveFromProject = '/removefromproject';

export var FindUsages = '/findusages';

export var FindSymbols = '/findsymbols';

export var CodeFormat = '/codeformat';

export var GetCodeActions = '/getcodeactions';

export var RunCodeAction = '/runcodeaction';

export var FormatAfterKeystroke = '/formatAfterKeystroke';

export var FormatRange = '/formatRange';

export var UpdateBuffer = '/updatebuffer';

export var ChangeBuffer = '/changebuffer';

export var Projects = '/projects';

export var Rename = '/rename';

export var FilesChanged = '/filesChanged';

export var SignatureHelp = '/signatureHelp';

export interface Request {
	Filename: string;
	Line?: number;
	Column?: number;
	Buffer?: string;
}

export interface ChangeBufferRequest {
	FileName: string;
	StartLine: number;
	StartColumn: number;
	EndLine: number;
	EndColumn: number;
	NewText: string;
}

export interface AddToProjectRequest extends Request {
	//?
}

export interface RemoveFromProjectRequest extends Request {
	//?
}

export interface FindUsagesRequest extends Request {
	//        MaxWidth: number; ?
	OnlyThisFile: boolean;
	ExcludeDefinition: boolean;
}

export interface FindSymbolsRequest extends Request {
	Filter: string;
}

export interface FormatRequest extends Request {
	ExpandTab: boolean;
}

export interface CodeActionRequest extends Request {
	CodeAction: number;
	WantsTextChanges?: boolean;
	SelectionStartColumn?: number;
	SelectionStartLine?: number;
	SelectionEndColumn?: number;
	SelectionEndLine?: number;
}

export interface FormatResponse {
	Buffer: string;
}

export interface TextChange {
	NewText: string;
	StartLine: number;
	StartColumn: number;
	EndLine: number;
	EndColumn: number;
}

export interface FormatAfterKeystrokeRequest extends Request {
	Character: string;
}

export interface FormatRangeRequest extends Request {
	EndLine: number;
	EndColumn: number;
}

export interface FormatRangeResponse {
	Changes: TextChange[];
}

export interface ResourceLocation {
	FileName: string;
	Line: number;
	Column: number;
}

export interface Error {
	Message: string;
	Line: number;
	Column: number;
	EndLine: number;
	EndColumn: number;
	FileName: string;
}

export interface ErrorResponse {
	Errors: Error[];
}

export interface QuickFix {
	LogLevel: string;
	FileName: string;
	Line: number;
	Column: number;
	EndLine: number;
	EndColumn: number;
	Text: string;
	Projects: string[];
}

export interface SymbolLocation extends QuickFix {
	Kind: string;
}

export interface QuickFixResponse {
	QuickFixes: QuickFix[];
}

export interface FindSymbolsResponse {
	QuickFixes: SymbolLocation[];
}

export interface TypeLookupRequest extends Request {
	IncludeDocumentation: boolean;
}

export interface TypeLookupResponse {
	Type: string;
	Documentation: string;
}

export interface RunCodeActionResponse {
	Text: string;
	Changes: TextChange[];
}

export interface GetCodeActionsResponse {
	CodeActions: string[];
}

export interface Node {
	ChildNodes: Node[];
	Location: QuickFix;
	Kind: string;
}

export interface CurrentFileMembersAsTreeResponse {
	TopLevelTypeDefinitions: Node[];
}

export interface AutoCompleteRequest extends Request {
	WordToComplete: string;
	WantDocumentationForEveryCompletionResult?: boolean;
	WantImportableTypes?: boolean;
	WantMethodHeader?: boolean;
	WantSnippet?: boolean;
	WantReturnType?: boolean;
	WantKind?: boolean;
}

export interface AutoCompleteResponse {
	CompletionText: string;
	Description: string;
	DisplayText: string;
	RequiredNamespaceImport: string;
	MethodHeader: string;
	ReturnType: string;
	Snippet: string;
	Kind: string;
}

export interface ProjectInformationResponse {
	MsBuildProject: MSBuildProject;
	DnxProject: DnxProject;
}

export interface WorkspaceInformationResponse {
	MSBuild: MsBuildWorkspaceInformation;
	Dnx: DnxWorkspaceInformation;
	ScriptCs: ScriptCsContext;
}

export interface MsBuildWorkspaceInformation {
	SolutionPath: string;
	Projects: MSBuildProject[];
}

export interface ScriptCsContext {
	CsxFiles: { [n: string]: string };
	References: { [n: string]: string };
	Usings: { [n: string]: string };
	ScriptPacks: { [n: string]: string };
	Path: string;
}

export interface MSBuildProject {
	ProjectGuid: string;
	Path: string;
	AssemblyName: string;
	TargetPath: string;
	TargetFramework: string;
	SourceFiles: string[];
}

export interface DnxWorkspaceInformation {
	RuntimePath: string;
	DesignTimeHostPort: number;
	Projects: DnxProject[];
}

export interface DnxProject {
	Path: string;
	Name: string;
	Commands: { [name: string]: string; };
	Configurations: string[];
	ProjectSearchPaths: string[];
	Frameworks: DnxFramework[];
	GlobalJsonPath: string;
	SourceFiles: string[];
}

export interface DnxFramework {
	Name: string;
	FriendlyName: string;
	ShortName: string;
}

export interface RenameRequest extends Request {
	RenameTo: string;
	WantsTextChanges?: boolean;
}

export interface ModifiedFileResponse {
	FileName: string;
	Buffer: string;
	Changes: TextChange[];
}

export interface RenameResponse {
	Changes: ModifiedFileResponse[];
}

export interface SignatureHelp {
	Signatures: SignatureHelpItem[];
	ActiveSignature: number;
	ActiveParameter: number;
}

export interface SignatureHelpItem {
	Name: string;
	Label: string;
	Documentation: string;
	Parameters: SignatureHelpParameter[];
}

export interface SignatureHelpParameter {
	Name: string;
	Label: string;
	Documentation: string;
}

export interface MSBuildProjectDiagnostics {
	FileName: string;
	Warnings: MSBuildDiagnosticsMessage[];
	Errors: MSBuildDiagnosticsMessage[];
}

export interface MSBuildDiagnosticsMessage {
	LogLevel: string;
	FileName: string;
	Text: string;
	StartLine: number;
	StartColumn: number;
	EndLine: number;
	EndColumn: number;
}

export interface ErrorMessage {
	Text: string;
	FileName: string;
	Line: number;
	Column: number;
}

export interface PackageRestoreMessage {
	FileName: string;
	Succeeded: boolean;
}

export interface UnresolvedDependenciesMessage {
	FileName: string;
	UnresolvedDependencies: PackageDependency[];
}

export interface PackageDependency {
	Name: string;
	Version: string;
}

export namespace V2 {

	export var GetCodeActions = '/v2/getcodeactions';
	export var RunCodeAction = '/v2/runcodeaction';

	export interface Point {
		Line: number;
		Column: number;
	}

	export interface Range {
		Start: Point;
		End: Point;
	}

	export interface GetCodeActionsRequest extends Request {
		Selection: Range
	}

	export interface OmniSharpCodeAction {
		Identifier: string;
		Name: string;
	}

	export interface GetCodeActionsResponse {
		CodeActions: OmniSharpCodeAction[];
	}

	export interface RunCodeActionRequest extends Request {
		Identifier: string;
		Selection: Range;
		WantsTextChanges: boolean;
	}

	export interface RunCodeActionResponse {
		Changes: ModifiedFileResponse[];
	}


	export interface MSBuildProjectDiagnostics {
		FileName: string;
		Warnings: MSBuildDiagnosticsMessage[];
		Errors: MSBuildDiagnosticsMessage[];
	}

	export interface MSBuildDiagnosticsMessage {
		LogLevel: string;
		FileName: string;
		Text: string;
		StartLine: number;
		StartColumn: number;
		EndLine: number;
		EndColumn: number;
	}

	export interface ErrorMessage {
		Text: string;
		FileName: string;
		Line: number;
		Column: number;
	}

	export interface PackageRestoreMessage {
		FileName: string;
		Succeeded: boolean;
	}

	export interface UnresolvedDependenciesMessage {
		FileName: string;
		UnresolvedDependencies: PackageDependency[];
	}

	export interface PackageDependency {
		Name: string;
		Version: string;
	}

}