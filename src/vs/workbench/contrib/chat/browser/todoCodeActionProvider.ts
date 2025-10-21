/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { CodeAction, CodeActionList, CodeActionProvider } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CodeActionKind } from '../../../../editor/contrib/codeAction/common/types.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ITodoDetectionService } from '../../../services/todoDetection/common/todoDetectionService.js';

export const DELEGATE_TODO_TO_AGENT_COMMAND_ID = 'chat.delegateTodoToAgent';

class TodoCodeActionProvider implements CodeActionProvider {

	constructor(
		@ITodoDetectionService private readonly todoDetectionService: ITodoDetectionService
	) { }

	async provideCodeActions(model: ITextModel, range: Range | Selection): Promise<CodeActionList | undefined> {
		const position = Selection.isISelection(range) ? range.getPosition() : range.getStartPosition();
		const lineNumber = position.lineNumber;

		const todo = this.todoDetectionService.detectTodoAtLine(model, lineNumber);
		if (!todo) {
			return undefined;
		}

		const action: CodeAction = {
			title: localize('delegateToAgent', "Delegate to Agent"),
			kind: CodeActionKind.QuickFix.value,
			command: {
				id: DELEGATE_TODO_TO_AGENT_COMMAND_ID,
				title: localize('delegateToAgent', "Delegate to Agent"),
				arguments: [model.uri, todo]
			}
		};

		return {
			actions: [action],
			dispose() { }
		};
	}
}

export class TodoCodeActions implements IWorkbenchContribution {

	private readonly _store = new DisposableStore();

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IConfigurationService configService: IConfigurationService,
	) {
		const setting = 'chat.delegation.enabled';
		const sessionStore = new DisposableStore();
		const update = () => {
			sessionStore.clear();
			if (configService.getValue(setting)) {
				sessionStore.add(languageFeaturesService.codeActionProvider.register('*', instantiationService.createInstance(TodoCodeActionProvider)));
			}
		};

		update();
		this._store.add(configService.onDidChangeConfiguration(e => e.affectsConfiguration(setting) && update()));
		this._store.add(sessionStore);
	}

	dispose(): void {
		this._store.dispose();
	}
}
