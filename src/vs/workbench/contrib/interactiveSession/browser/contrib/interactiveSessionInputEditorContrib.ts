/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { editorForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IInteractiveSessionWidget } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSession';
import { IInteractiveSessionWidgetService, InteractiveSessionWidget } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { InteractiveSessionInputPart } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionInputPart';

const decorationDescription = 'interactive session';
const slashCommandPlaceholderDecorationType = 'interactive-session-detail';
const slashCommandTextDecorationType = 'interactive-session-text';

class InputEditorDecorations extends Disposable {

	constructor(
		private readonly widget: IInteractiveSessionWidget,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();

		this.codeEditorService.registerDecorationType(decorationDescription, slashCommandPlaceholderDecorationType, {});

		this._register(this.themeService.onDidColorThemeChange(() => this.updateRegisteredDecorationTypes()));
		this.updateRegisteredDecorationTypes();

		this.updateInputEditorDecorations();
		this._register(this.widget.inputEditor.onDidChangeModelContent(() => this.updateInputEditorDecorations()));
		this._register(this.widget.onDidChangeViewModel(() => this.updateInputEditorDecorations()));
	}

	private updateRegisteredDecorationTypes() {
		const theme = this.themeService.getColorTheme();
		this.codeEditorService.removeDecorationType(slashCommandTextDecorationType);
		this.codeEditorService.registerDecorationType(decorationDescription, slashCommandTextDecorationType, {
			color: theme.getColor(textLinkForeground)?.toString()
		});
		this.updateInputEditorDecorations();
	}

	private getPlaceholderColor(): string | undefined {
		const theme = this.themeService.getColorTheme();
		const transparentForeground = theme.getColor(editorForeground)?.transparent(0.4);
		return transparentForeground?.toString();
	}

	private async updateInputEditorDecorations() {
		const value = this.widget.inputEditor.getValue();
		const slashCommands = await this.widget.getSlashCommands(); // TODO this async call can lead to a flicker of the placeholder text when switching editor tabs

		if (!value) {
			const extensionPlaceholder = this.widget.viewModel?.inputPlaceholder;
			const defaultPlaceholder = slashCommands?.length ?
				localize('interactive.input.placeholderWithCommands', "Ask a question or type '/' for topics") :
				localize('interactive.input.placeholderNoCommands', "Ask a question");
			const placeholder = extensionPlaceholder ?? defaultPlaceholder;
			const decoration: IDecorationOptions[] = [
				{
					range: {
						startLineNumber: 1,
						endLineNumber: 1,
						startColumn: 1,
						endColumn: 1000
					},
					renderOptions: {
						after: {
							contentText: placeholder,
							color: this.getPlaceholderColor()
						}
					}
				}
			];
			this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandPlaceholderDecorationType, decoration);
			return;
		}

		const command = value && slashCommands?.find(c => value.startsWith(`/${c.command} `));
		if (command && command.detail && value === `/${command.command} `) {
			const decoration: IDecorationOptions[] = [
				{
					range: {
						startLineNumber: 1,
						endLineNumber: 1,
						startColumn: command.command.length + 2,
						endColumn: 1000
					},
					renderOptions: {
						after: {
							contentText: command.detail,
							color: this.getPlaceholderColor()
						}
					}
				}
			];
			this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandPlaceholderDecorationType, decoration);
		} else {
			this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandPlaceholderDecorationType, []);
		}

		if (command && command.detail) {
			const textDecoration: IDecorationOptions[] = [
				{
					range: {
						startLineNumber: 1,
						endLineNumber: 1,
						startColumn: 1,
						endColumn: command.command.length + 2
					}
				}
			];
			this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandTextDecorationType, textDecoration);
		} else {
			this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandTextDecorationType, []);
		}
	}
}

InteractiveSessionWidget.CONTRIBS.push(InputEditorDecorations);

class SlashCommandCompletions extends Disposable {
	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IInteractiveSessionWidgetService private readonly interactiveSessionWidgetService: IInteractiveSessionWidgetService,
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: InteractiveSessionInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			triggerCharacters: ['/'],
			provideCompletionItems: async (model: ITextModel, _position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.interactiveSessionWidgetService.getWidgetByInputUri(model.uri);
				if (!widget) {
					return null;
				}

				if (model.getValueInRange(new Range(1, 1, 1, 2)) !== '/' && model.getValueLength() > 0) {
					return null;
				}

				const slashCommands = await widget.getSlashCommands();
				if (!slashCommands) {
					return null;
				}

				return <CompletionList>{
					suggestions: slashCommands.map(c => {
						const withSlash = `/${c.command}`;
						return <CompletionItem>{
							label: withSlash,
							insertText: `${withSlash} `,
							detail: c.detail,
							range: new Range(1, 1, 1, 1),
							sortText: c.sortText ?? c.command,
							kind: CompletionItemKind.Text // The icons are disabled here anyway
						};
					})
				};
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SlashCommandCompletions, LifecyclePhase.Eventually);
