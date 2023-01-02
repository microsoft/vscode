/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as languages from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/common/types';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { DocumentationExtensionPoint } from 'vs/workbench/contrib/codeActions/common/documentationExtensionPoint';
import { IExtensionPoint } from 'vs/workbench/services/extensions/common/extensionsRegistry';


export class CodeActionDocumentationContribution extends Disposable implements IWorkbenchContribution, languages.CodeActionProvider {

	private contributions: {
		title: string;
		when: ContextKeyExpression;
		command: string;
	}[] = [];

	private readonly emptyCodeActionsList = {
		actions: [],
		dispose: () => { }
	};

	constructor(
		extensionPoint: IExtensionPoint<DocumentationExtensionPoint>,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super();

		this._register(languageFeaturesService.codeActionProvider.register('*', this));

		extensionPoint.setHandler(points => {
			this.contributions = [];
			for (const documentation of points) {
				if (!documentation.value.refactoring) {
					continue;
				}

				for (const contribution of documentation.value.refactoring) {
					const precondition = ContextKeyExpr.deserialize(contribution.when);
					if (!precondition) {
						continue;
					}

					this.contributions.push({
						title: contribution.title,
						when: precondition,
						command: contribution.command
					});

				}
			}
		});
	}

	async provideCodeActions(_model: ITextModel, _range: Range | Selection, context: languages.CodeActionContext, _token: CancellationToken): Promise<languages.CodeActionList> {
		return this.emptyCodeActionsList;
	}

	public _getAdditionalMenuItems(context: languages.CodeActionContext, actions: readonly languages.CodeAction[]): languages.Command[] {
		if (context.only !== CodeActionKind.Refactor.value) {
			if (!actions.some(action => action.kind && CodeActionKind.Refactor.contains(new CodeActionKind(action.kind)))) {
				return [];
			}
		}

		return this.contributions
			.filter(contribution => this.contextKeyService.contextMatchesRules(contribution.when))
			.map(contribution => {
				return {
					id: contribution.command,
					title: contribution.title
				};
			});
	}
}
