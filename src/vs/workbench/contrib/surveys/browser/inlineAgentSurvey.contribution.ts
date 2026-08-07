/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

const InlineAgentSurveyDebugAvailableContext = new RawContextKey<boolean>('inlineAgentSurveyDebugAvailable', false, localize('inlineAgentSurveyDebugAvailable', "Whether the most recently focused chat has an open session for showing the inline agent survey"));
const SHOW_INLINE_AGENT_SURVEY_COMMAND_ID = 'workbench.action.showInlineAgentSurvey';

class InlineAgentSurveyDebugContribution extends Disposable implements IWorkbenchContribution {

	private readonly availableContext: IContextKey<boolean>;

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IProductService productService: IProductService,
	) {
		super();
		this.availableContext = InlineAgentSurveyDebugAvailableContext.bindTo(contextKeyService);
		if (productService.quality === 'stable') {
			return;
		}

		this.updateAvailability();
		this._register(this.chatWidgetService.onDidChangeFocusedSession(() => this.updateAvailability()));

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: SHOW_INLINE_AGENT_SURVEY_COMMAND_ID,
					title: localize2('showInlineAgentSurvey', "Show Inline Agent Survey"),
					category: Categories.Developer,
					f1: true,
					precondition: InlineAgentSurveyDebugAvailableContext,
				});
			}

			override run(): void {
				chatWidgetService.lastFocusedWidget?.showInlineAgentSurveyForLatestResponse();
			}
		}));
	}

	private updateAvailability(): void {
		this.availableContext.set(!!this.chatWidgetService.lastFocusedWidget?.viewModel);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(InlineAgentSurveyDebugContribution, LifecyclePhase.Restored);
