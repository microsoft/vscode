/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { IReviewService } from '../../../platform/review/common/reviewService';
import { extractImageAttributes } from '../../../util/common/imageUtils';
import * as path from '../../../util/vs/base/common/path';
import { Intent } from '../../common/constants';

class AICodeAction extends vscode.CodeAction {
	override readonly isAI = true;
}

export interface ImageCodeAction extends AICodeAction {
	resolvedImagePath: string;
	type: 'generate' | 'refine';
	isUrl: boolean;
}

export class QuickFixesProvider implements vscode.CodeActionProvider {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@IReviewService private readonly reviewService: IReviewService,
	) {
	}

	private static readonly fixKind = vscode.CodeActionKind.QuickFix.append('copilot');
	private static readonly explainKind = vscode.CodeActionKind.QuickFix.append('explain').append('copilot');
	private static readonly reviewKind = vscode.CodeActionKind.RefactorRewrite.append('review').append('copilot');

	static readonly providedCodeActionKinds = [
		this.fixKind,
		this.explainKind,
		this.reviewKind,
	];

	static getWarningOrErrorDiagnostics(diagnostics: ReadonlyArray<vscode.Diagnostic>): vscode.Diagnostic[] {
		return diagnostics.filter(d => d.severity <= vscode.DiagnosticSeverity.Warning);
	}

	static getDiagnosticsAsText(diagnostics: ReadonlyArray<vscode.Diagnostic>): string {
		return diagnostics.map(d => d.message).join(', ');
	}

	async provideCodeActions(doc: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, cancellationToken: vscode.CancellationToken): Promise<vscode.CodeAction[] | undefined> {

		const copilotCodeActionsEnabled = this.configurationService.getConfig(ConfigKey.EnableCodeActions);
		if (!copilotCodeActionsEnabled) {
			return;
		}

		if (await this.ignoreService.isCopilotIgnored(doc.uri)) {
			return;
		}
		if (cancellationToken.isCancellationRequested) {
			return;
		}

		const codeActions: vscode.CodeAction[] = [];
		const activeTextEditor = vscode.window.activeTextEditor;
		if (!activeTextEditor) {
			return codeActions;
		}

		const altTextQuickFixes = this.provideAltTextQuickFix(doc, range);
		if (altTextQuickFixes) {
			altTextQuickFixes.command = {
				title: altTextQuickFixes.title,
				command: 'github.copilot.chat.generateAltText',
				arguments: [
					{
						type: altTextQuickFixes.type,
						resolvedImagePath: altTextQuickFixes.resolvedImagePath,
						isUrl: altTextQuickFixes.isUrl,
					}
				],
			};
			codeActions.push(altTextQuickFixes);
		}

		if (vscode.workspace.getConfiguration('inlineChat').get('affordance') !== 'off') {
			return codeActions;
		}

		if (this.reviewService.isCodeFeedbackEnabled() && !activeTextEditor.selection.isEmpty) {
			const reviewAction = new AICodeAction(vscode.l10n.t('Review'), QuickFixesProvider.reviewKind);
			reviewAction.command = {
				title: reviewAction.title,
				command: 'github.copilot.chat.review',
			};
			codeActions.push(reviewAction);
		}

		const severeDiagnostics = QuickFixesProvider.getWarningOrErrorDiagnostics(context.diagnostics);
		if (severeDiagnostics.length === 0) {
			return codeActions;
		}

		const initialRange = severeDiagnostics.map(d => d.range).reduce((a, b) => a.union(b));
		const initialSelection = new vscode.Selection(initialRange.start, initialRange.end);
		const diagnostics = QuickFixesProvider.getDiagnosticsAsText(severeDiagnostics);

		const fixAction = new AICodeAction(vscode.l10n.t('Fix'), QuickFixesProvider.fixKind);
		fixAction.diagnostics = severeDiagnostics;
		fixAction.command = {
			title: fixAction.title,
			command: 'vscode.editorChat.start',
			arguments: [
				{
					autoSend: true,
					message: `/fix ${diagnostics}`,
					position: initialRange.start,
					initialSelection: initialSelection,
					initialRange: initialRange
				},
			],
		};

		const explainAction = new AICodeAction(vscode.l10n.t('Explain'), QuickFixesProvider.explainKind);
		explainAction.diagnostics = severeDiagnostics;
		const query = `/${Intent.Explain} ${diagnostics}`;
		explainAction.command = {
			title: explainAction.title,
			command: 'github.copilot.chat.explain',
			arguments: [query],
		};

		codeActions.push(fixAction, explainAction);
		return codeActions;
	}

	private provideAltTextQuickFix(document: vscode.TextDocument, range: vscode.Range): ImageCodeAction | undefined {
		const currentLine = document.lineAt(range.start.line).text;
		const generateImagePath = extractImageAttributes(currentLine);
		const refineImagePath = extractImageAttributes(currentLine, true);
		if (!generateImagePath && !refineImagePath) {
			return;
		}

		if (generateImagePath) {
			const isUrl = this.isValidUrl(generateImagePath);
			const resolvedImagePath = isUrl ? generateImagePath : path.resolve(path.dirname(document.uri.fsPath), generateImagePath);
			return {
				title: vscode.l10n.t('Generate alt text'),
				kind: vscode.CodeActionKind.QuickFix,
				resolvedImagePath,
				type: 'generate',
				isUrl,
				isAI: true,
			};
		} else if (refineImagePath) {
			const isUrl = this.isValidUrl(refineImagePath);
			const resolvedImagePath = isUrl ? refineImagePath : path.resolve(path.dirname(document.uri.fsPath), refineImagePath);
			return {
				title: vscode.l10n.t('Refine alt text'),
				kind: vscode.CodeActionKind.QuickFix,
				resolvedImagePath,
				type: 'refine',
				isUrl,
				isAI: true,
			};
		}

	}

	private isValidUrl(imagePath: string): boolean {
		try {
			new URL(imagePath);
			return true;
		} catch (e) {
			return false;
		}
	}


}

export class RefactorsProvider implements vscode.CodeActionProvider {


	private static readonly generateOrModifyKind = vscode.CodeActionKind.RefactorRewrite.append('copilot');

	static readonly providedCodeActionKinds = [
		this.generateOrModifyKind,
	];

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
	) { }

	async provideCodeActions(
		doc: vscode.TextDocument,
		range: vscode.Range,
		_ctx: vscode.CodeActionContext,
		cancellationToken: vscode.CancellationToken
	): Promise<vscode.CodeAction[] | undefined> {

		const copilotCodeActionsEnabled = this.configurationService.getConfig(ConfigKey.EnableCodeActions);
		if (!copilotCodeActionsEnabled) {
			return;
		}

		if (await this.ignoreService.isCopilotIgnored(doc.uri)) {
			return;
		}

		if (cancellationToken.isCancellationRequested) {
			return;
		}

		return this.provideGenerateUsingCopilotCodeAction(doc, range);
	}

	/**
	 * Provides code action `Generate using Copilot` or `Modify using Copilot`.
	 * - `Generate using Copilot` is shown when the selection is empty and the line of the selection contains only white-space characters or tabs.
	 * - `Modify using Copilot` is shown when the selection is not empty and the selection does not contain only white-space characters or tabs.
	 */
	private provideGenerateUsingCopilotCodeAction(doc: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] | undefined {

		if (vscode.workspace.getConfiguration('inlineChat').get('affordance') !== 'off') {
			return undefined;
		}

		let codeActionTitle: string | undefined;

		if (range.isEmpty) {
			const textAtLine = doc.lineAt(range.start.line).text;
			if (range.end.character === textAtLine.length && /^\s*$/g.test(textAtLine)) {
				codeActionTitle = vscode.l10n.t('Generate');
			}
		} else {
			const textInSelection = doc.getText(range);
			if (!/^\s*$/g.test(textInSelection)) {
				codeActionTitle = vscode.l10n.t('Modify');
			}
		}

		if (codeActionTitle === undefined) {
			return undefined;
		}

		const codeAction = new AICodeAction(codeActionTitle, RefactorsProvider.generateOrModifyKind);

		codeAction.command = {
			title: codeAction.title,
			command: 'vscode.editorChat.start',
			arguments: [
				{
					position: range.start,
					initialSelection: new vscode.Selection(range.start, range.end),
					initialRange: range
				},
			],
		};

		return [codeAction];
	}
}
