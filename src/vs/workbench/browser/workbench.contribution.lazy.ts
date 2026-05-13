/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../base/common/lifecycle.js';
import { onUnexpectedError } from '../../base/common/errors.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../common/contributions.js';

class LazyWorkbenchContributionsLoader extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.lazyContributions';

	constructor() {
		super();

		const load = (loader: () => Promise<unknown>) => loader().catch(onUnexpectedError);

		load(() => import('../contrib/chat/browser/chat.view.contribution.js'));
		load(() => import('../contrib/mcp/browser/mcp.view.contribution.js'));
		load(() => import('../contrib/chat/browser/promptSyntax/promptCodingAgentActionContribution.js'));
		load(() => import('../contrib/chat/browser/promptSyntax/promptToolsCodeLensProvider.js'));
		load(() => import('../contrib/chat/browser/planReviewFeedback/planReviewFeedbackEditorContribution.js'));

		load(() => import('../services/policies/browser/accountPolicyGate.contribution.js'));
		load(() => import('../contrib/meteredConnection/browser/meteredConnection.contribution.js'));
		load(() => import('../contrib/welcomeOnboarding/browser/welcomeOnboarding.contribution.js'));
		load(() => import('../contrib/surveys/browser/nps.contribution.js'));
		load(() => import('../contrib/surveys/browser/languageSurveys.contribution.js'));
	}
}

registerWorkbenchContribution2(LazyWorkbenchContributionsLoader.ID, LazyWorkbenchContributionsLoader, WorkbenchPhase.Eventually);
