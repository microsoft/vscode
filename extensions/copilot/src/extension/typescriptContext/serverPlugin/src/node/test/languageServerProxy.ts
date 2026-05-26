/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type tt from 'typescript';

export class LanguageServiceProxy implements tt.LanguageService {

	constructor(private languageService: tt.LanguageService) {
	}

	getLanguageService(): tt.LanguageService {
		return this.languageService;
	}

	setLanguageService(languageService: tt.LanguageService): void {
		this.languageService = languageService;
	}

	cleanupSemanticCache(): void {
		return this.languageService.cleanupSemanticCache();
	}

	getSyntacticDiagnostics(fileName: string): tt.DiagnosticWithLocation[] {
		return this.languageService.getSyntacticDiagnostics(fileName);
	}

	getSemanticDiagnostics(fileName: string): tt.Diagnostic[] {
		return this.languageService.getSemanticDiagnostics(fileName);
	}

	getSuggestionDiagnostics(fileName: string): tt.DiagnosticWithLocation[] {
		return this.languageService.getSuggestionDiagnostics(fileName);
	}

	getCompilerOptionsDiagnostics(): tt.Diagnostic[] {
		return this.languageService.getCompilerOptionsDiagnostics();
	}

	getSyntacticClassifications(fileName: string, span: tt.TextSpan): tt.ClassifiedSpan[];
	getSyntacticClassifications(fileName: string, span: tt.TextSpan, format: tt.SemanticClassificationFormat): tt.ClassifiedSpan[] | tt.ClassifiedSpan2020[];
	getSyntacticClassifications(fileName: string, span: tt.TextSpan, format?: tt.SemanticClassificationFormat): tt.ClassifiedSpan[] | tt.ClassifiedSpan2020[] {
		if (format === undefined) {
			return this.languageService.getSyntacticClassifications(fileName, span);
		}
		return this.languageService.getSyntacticClassifications(fileName, span, format);
	}

	getSemanticClassifications(fileName: string, span: tt.TextSpan): tt.ClassifiedSpan[];
	getSemanticClassifications(fileName: string, span: tt.TextSpan, format: tt.SemanticClassificationFormat): tt.ClassifiedSpan[] | tt.ClassifiedSpan2020[];
	getSemanticClassifications(fileName: string, span: tt.TextSpan, format?: tt.SemanticClassificationFormat): tt.ClassifiedSpan[] | tt.ClassifiedSpan2020[] {
		if (format === undefined) {
			return this.languageService.getSemanticClassifications(fileName, span);
		}
		return this.languageService.getSemanticClassifications(fileName, span, format);
	}

	getEncodedSyntacticClassifications(fileName: string, span: tt.TextSpan): tt.Classifications {
		return this.languageService.getEncodedSyntacticClassifications(fileName, span);
	}

	getEncodedSemanticClassifications(fileName: string, span: tt.TextSpan, format?: tt.SemanticClassificationFormat): tt.Classifications {
		return this.languageService.getEncodedSemanticClassifications(fileName, span, format);
	}

	getCompletionsAtPosition(fileName: string, position: number, options: tt.GetCompletionsAtPositionOptions | undefined, formattingSettings?: tt.FormatCodeSettings): tt.WithMetadata<tt.CompletionInfo> | undefined {
		return this.languageService.getCompletionsAtPosition(fileName, position, options, formattingSettings);
	}

	getCompletionEntryDetails(fileName: string, position: number, entryName: string, formatOptions: tt.FormatCodeOptions | tt.FormatCodeSettings | undefined, source: string | undefined, preferences: tt.UserPreferences | undefined, data: tt.CompletionEntryData | undefined): tt.CompletionEntryDetails | undefined {
		return this.languageService.getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data);
	}

	getCompletionEntrySymbol(fileName: string, position: number, name: string, source: string | undefined): tt.Symbol | undefined {
		return this.languageService.getCompletionEntrySymbol(fileName, position, name, source);
	}

	getQuickInfoAtPosition(fileName: string, position: number): tt.QuickInfo | undefined {
		return this.languageService.getQuickInfoAtPosition(fileName, position);
	}

	getNameOrDottedNameSpan(fileName: string, startPos: number, endPos: number): tt.TextSpan | undefined {
		return this.languageService.getNameOrDottedNameSpan(fileName, startPos, endPos);
	}

	getBreakpointStatementAtPosition(fileName: string, position: number): tt.TextSpan | undefined {
		return this.languageService.getBreakpointStatementAtPosition(fileName, position);
	}

	getSignatureHelpItems(fileName: string, position: number, options: tt.SignatureHelpItemsOptions | undefined): tt.SignatureHelpItems | undefined {
		return this.languageService.getSignatureHelpItems(fileName, position, options);
	}

	getRenameInfo(fileName: string, position: number, preferences: tt.UserPreferences): tt.RenameInfo;
	getRenameInfo(fileName: string, position: number, options?: tt.RenameInfoOptions): tt.RenameInfo;
	getRenameInfo(fileName: string, position: number, preferencesOrOptions?: tt.UserPreferences | tt.RenameInfoOptions): tt.RenameInfo {
		if (preferencesOrOptions === undefined) {
			return this.languageService.getRenameInfo(fileName, position);
		}
		return this.languageService.getRenameInfo(fileName, position, preferencesOrOptions);
	}

	findRenameLocations(fileName: string, position: number, findInStrings: boolean, findInComments: boolean, preferences: tt.UserPreferences): readonly tt.RenameLocation[] | undefined;
	findRenameLocations(fileName: string, position: number, findInStrings: boolean, findInComments: boolean, providePrefixAndSuffixTextForRename?: boolean): readonly tt.RenameLocation[] | undefined;
	findRenameLocations(fileName: string, position: number, findInStrings: boolean, findInComments: boolean, preferencesOrProvidePrefix?: tt.UserPreferences | boolean): readonly tt.RenameLocation[] | undefined {
		if (preferencesOrProvidePrefix === undefined) {
			return this.languageService.findRenameLocations(fileName, position, findInStrings, findInComments);
		}
		if (typeof preferencesOrProvidePrefix === 'boolean') {
			return this.languageService.findRenameLocations(fileName, position, findInStrings, findInComments, preferencesOrProvidePrefix);
		}
		return this.languageService.findRenameLocations(fileName, position, findInStrings, findInComments, preferencesOrProvidePrefix);
	}

	getSmartSelectionRange(fileName: string, position: number): tt.SelectionRange {
		return this.languageService.getSmartSelectionRange(fileName, position);
	}

	getDefinitionAtPosition(fileName: string, position: number): readonly tt.DefinitionInfo[] | undefined {
		return this.languageService.getDefinitionAtPosition(fileName, position);
	}

	getDefinitionAndBoundSpan(fileName: string, position: number): tt.DefinitionInfoAndBoundSpan | undefined {
		return this.languageService.getDefinitionAndBoundSpan(fileName, position);
	}

	getTypeDefinitionAtPosition(fileName: string, position: number): readonly tt.DefinitionInfo[] | undefined {
		return this.languageService.getTypeDefinitionAtPosition(fileName, position);
	}

	getImplementationAtPosition(fileName: string, position: number): readonly tt.ImplementationLocation[] | undefined {
		return this.languageService.getImplementationAtPosition(fileName, position);
	}

	getReferencesAtPosition(fileName: string, position: number): tt.ReferenceEntry[] | undefined {
		return this.languageService.getReferencesAtPosition(fileName, position);
	}

	findReferences(fileName: string, position: number): tt.ReferencedSymbol[] | undefined {
		return this.languageService.findReferences(fileName, position);
	}

	getDocumentHighlights(fileName: string, position: number, filesToSearch: string[]): tt.DocumentHighlights[] | undefined {
		return this.languageService.getDocumentHighlights(fileName, position, filesToSearch);
	}

	getFileReferences(fileName: string): tt.ReferenceEntry[] {
		return this.languageService.getFileReferences(fileName);
	}

	getNavigateToItems(searchValue: string, maxResultCount?: number, fileName?: string, excludeDtsFiles?: boolean, excludeLibFiles?: boolean): tt.NavigateToItem[] {
		return this.languageService.getNavigateToItems(searchValue, maxResultCount, fileName, excludeDtsFiles, excludeLibFiles);
	}

	getNavigationBarItems(fileName: string): tt.NavigationBarItem[] {
		return this.languageService.getNavigationBarItems(fileName);
	}

	getNavigationTree(fileName: string): tt.NavigationTree {
		return this.languageService.getNavigationTree(fileName);
	}

	prepareCallHierarchy(fileName: string, position: number): tt.CallHierarchyItem | tt.CallHierarchyItem[] | undefined {
		return this.languageService.prepareCallHierarchy(fileName, position);
	}

	provideCallHierarchyIncomingCalls(fileName: string, position: number): tt.CallHierarchyIncomingCall[] {
		return this.languageService.provideCallHierarchyIncomingCalls(fileName, position);
	}

	provideCallHierarchyOutgoingCalls(fileName: string, position: number): tt.CallHierarchyOutgoingCall[] {
		return this.languageService.provideCallHierarchyOutgoingCalls(fileName, position);
	}

	provideInlayHints(fileName: string, span: tt.TextSpan, preferences: tt.UserPreferences | undefined): tt.InlayHint[] {
		return this.languageService.provideInlayHints(fileName, span, preferences);
	}

	getOutliningSpans(fileName: string): tt.OutliningSpan[] {
		return this.languageService.getOutliningSpans(fileName);
	}

	getTodoComments(fileName: string, descriptors: tt.TodoCommentDescriptor[]): tt.TodoComment[] {
		return this.languageService.getTodoComments(fileName, descriptors);
	}

	getBraceMatchingAtPosition(fileName: string, position: number): tt.TextSpan[] {
		return this.languageService.getBraceMatchingAtPosition(fileName, position);
	}

	getIndentationAtPosition(fileName: string, position: number, options: tt.EditorOptions | tt.EditorSettings): number {
		return this.languageService.getIndentationAtPosition(fileName, position, options);
	}

	getFormattingEditsForRange(fileName: string, start: number, end: number, options: tt.FormatCodeOptions | tt.FormatCodeSettings): tt.TextChange[] {
		return this.languageService.getFormattingEditsForRange(fileName, start, end, options);
	}

	getFormattingEditsForDocument(fileName: string, options: tt.FormatCodeOptions | tt.FormatCodeSettings): tt.TextChange[] {
		return this.languageService.getFormattingEditsForDocument(fileName, options);
	}

	getFormattingEditsAfterKeystroke(fileName: string, position: number, key: string, options: tt.FormatCodeOptions | tt.FormatCodeSettings): tt.TextChange[] {
		return this.languageService.getFormattingEditsAfterKeystroke(fileName, position, key, options);
	}

	getDocCommentTemplateAtPosition(fileName: string, position: number, options?: tt.DocCommentTemplateOptions, formatOptions?: tt.FormatCodeSettings): tt.TextInsertion | undefined {
		return this.languageService.getDocCommentTemplateAtPosition(fileName, position, options, formatOptions);
	}

	isValidBraceCompletionAtPosition(fileName: string, position: number, openingBrace: number): boolean {
		return this.languageService.isValidBraceCompletionAtPosition(fileName, position, openingBrace);
	}

	getJsxClosingTagAtPosition(fileName: string, position: number): tt.JsxClosingTagInfo | undefined {
		return this.languageService.getJsxClosingTagAtPosition(fileName, position);
	}

	getLinkedEditingRangeAtPosition(fileName: string, position: number): tt.LinkedEditingInfo | undefined {
		return this.languageService.getLinkedEditingRangeAtPosition(fileName, position);
	}

	getSpanOfEnclosingComment(fileName: string, position: number, onlyMultiLine: boolean): tt.TextSpan | undefined {
		return this.languageService.getSpanOfEnclosingComment(fileName, position, onlyMultiLine);
	}

	toLineColumnOffset?(fileName: string, position: number): tt.LineAndCharacter {
		return this.languageService.toLineColumnOffset?.(fileName, position)!;
	}

	getCodeFixesAtPosition(fileName: string, start: number, end: number, errorCodes: readonly number[], formatOptions: tt.FormatCodeSettings, preferences: tt.UserPreferences): readonly tt.CodeFixAction[] {
		return this.languageService.getCodeFixesAtPosition(fileName, start, end, errorCodes, formatOptions, preferences);
	}

	getCombinedCodeFix(scope: tt.CombinedCodeFixScope, fixId: {}, formatOptions: tt.FormatCodeSettings, preferences: tt.UserPreferences): tt.CombinedCodeActions {
		return this.languageService.getCombinedCodeFix(scope, fixId, formatOptions, preferences);
	}

	applyCodeActionCommand(action: tt.CodeActionCommand, formatSettings?: tt.FormatCodeSettings): Promise<tt.ApplyCodeActionCommandResult>;
	applyCodeActionCommand(action: tt.CodeActionCommand[], formatSettings?: tt.FormatCodeSettings): Promise<tt.ApplyCodeActionCommandResult[]>;
	applyCodeActionCommand(action: tt.CodeActionCommand | tt.CodeActionCommand[], formatSettings?: tt.FormatCodeSettings): Promise<tt.ApplyCodeActionCommandResult | tt.ApplyCodeActionCommandResult[]>;
	applyCodeActionCommand(fileName: string, action: tt.CodeActionCommand): Promise<tt.ApplyCodeActionCommandResult>;
	applyCodeActionCommand(fileName: string, action: tt.CodeActionCommand[]): Promise<tt.ApplyCodeActionCommandResult[]>;
	applyCodeActionCommand(fileName: string, action: tt.CodeActionCommand | tt.CodeActionCommand[]): Promise<tt.ApplyCodeActionCommandResult | tt.ApplyCodeActionCommandResult[]>;
	applyCodeActionCommand(actionOrFileName: tt.CodeActionCommand | tt.CodeActionCommand[] | string, formatSettingsOrAction?: tt.FormatCodeSettings | tt.CodeActionCommand | tt.CodeActionCommand[]): Promise<tt.ApplyCodeActionCommandResult | tt.ApplyCodeActionCommandResult[]> {
		if (typeof actionOrFileName === 'string') {
			return this.languageService.applyCodeActionCommand(actionOrFileName, formatSettingsOrAction as tt.CodeActionCommand | tt.CodeActionCommand[]);
		}
		return this.languageService.applyCodeActionCommand(actionOrFileName, formatSettingsOrAction as tt.FormatCodeSettings | undefined);
	}

	getApplicableRefactors(fileName: string, positionOrRange: number | tt.TextRange, preferences: tt.UserPreferences | undefined, triggerReason?: tt.RefactorTriggerReason, kind?: string, includeInteractiveActions?: boolean): tt.ApplicableRefactorInfo[] {
		return this.languageService.getApplicableRefactors(fileName, positionOrRange, preferences, triggerReason, kind, includeInteractiveActions);
	}

	getEditsForRefactor(fileName: string, formatOptions: tt.FormatCodeSettings, positionOrRange: number | tt.TextRange, refactorName: string, actionName: string, preferences: tt.UserPreferences | undefined, interactiveRefactorArguments?: tt.InteractiveRefactorArguments): tt.RefactorEditInfo | undefined {
		return this.languageService.getEditsForRefactor(fileName, formatOptions, positionOrRange, refactorName, actionName, preferences, interactiveRefactorArguments);
	}

	getMoveToRefactoringFileSuggestions(fileName: string, positionOrRange: number | tt.TextRange, preferences: tt.UserPreferences | undefined, triggerReason?: tt.RefactorTriggerReason, kind?: string): { newFileName: string; files: string[] } {
		return this.languageService.getMoveToRefactoringFileSuggestions(fileName, positionOrRange, preferences, triggerReason, kind);
	}

	organizeImports(args: tt.OrganizeImportsArgs, formatOptions: tt.FormatCodeSettings, preferences: tt.UserPreferences | undefined): readonly tt.FileTextChanges[] {
		return this.languageService.organizeImports(args, formatOptions, preferences);
	}

	getEditsForFileRename(oldFilePath: string, newFilePath: string, formatOptions: tt.FormatCodeSettings, preferences: tt.UserPreferences | undefined): readonly tt.FileTextChanges[] {
		return this.languageService.getEditsForFileRename(oldFilePath, newFilePath, formatOptions, preferences);
	}

	getEmitOutput(fileName: string, emitOnlyDtsFiles?: boolean, forceDtsEmit?: boolean): tt.EmitOutput {
		return this.languageService.getEmitOutput(fileName, emitOnlyDtsFiles, forceDtsEmit);
	}

	getProgram(): tt.Program | undefined {
		return this.languageService.getProgram();
	}

	toggleLineComment(fileName: string, textRange: tt.TextRange): tt.TextChange[] {
		return this.languageService.toggleLineComment(fileName, textRange);
	}

	toggleMultilineComment(fileName: string, textRange: tt.TextRange): tt.TextChange[] {
		return this.languageService.toggleMultilineComment(fileName, textRange);
	}

	commentSelection(fileName: string, textRange: tt.TextRange): tt.TextChange[] {
		return this.languageService.commentSelection(fileName, textRange);
	}

	uncommentSelection(fileName: string, textRange: tt.TextRange): tt.TextChange[] {
		return this.languageService.uncommentSelection(fileName, textRange);
	}

	getSupportedCodeFixes(fileName?: string): readonly string[] {
		return this.languageService.getSupportedCodeFixes(fileName);
	}

	preparePasteEditsForFile(fileName: string, copiedTextRanges: tt.TextRange[]): boolean {
		return this.languageService.preparePasteEditsForFile(fileName, copiedTextRanges);
	}

	getPasteEdits(args: tt.PasteEditsArgs, formatOptions: tt.FormatCodeSettings): tt.PasteEdits {
		return this.languageService.getPasteEdits(args, formatOptions);
	}

	dispose(): void {
		return this.languageService.dispose();
	}
}
