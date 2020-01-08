/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ITextModel } from 'vs/editor/common/model';
import { CodeAction, CodeActionContext, CodeActionList, CodeActionProvider, CodeActionProviderRegistry } from 'vs/editor/common/modes';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/types';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IExtensionPoint } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { DocumentationExtensionPoint } from './documentationExtensionPoint';


export class CodeActionDocumentationContribution extends Disposable implements IWorkbenchContribution, CodeActionProvider {

	private contributions: {
		title: string;
		when: ContextKeyExpr;
		command: string;
	}[] = [];

	constructor(
		extensionPoint: IExtensionPoint<DocumentationExtensionPoint>,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		CodeActionProviderRegistry.register('*', this);

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

	async provideCodeActions(_model: ITextModel, _range: Range | Selection, context: CodeActionContext, _token: CancellationToken): Promise<CodeActionList> {
		if (!context.only || !CodeActionKind.Refactor.contains(new CodeActionKind(context.only))) {
			return {
				actions: [],
				dispose: () => { }
			};
		}

		const actions: CodeAction[] = [];

		for (const contribution of this.contributions) {
			if (!this.contextKeyService.contextMatchesRules(contribution.when)) {
				continue;
			}

			actions.push({
				title: contribution.title,
				kind: CodeActionKind.RefactorDocumentation.value,
				command: {
					id: contribution.command,
					title: contribution.title
				}
			});
		}

		return {
			actions,
			dispose: () => { }
		};
	}

	public readonly providedCodeActionKinds = [CodeActionKind.RefactorDocumentation.value] as const;
}
