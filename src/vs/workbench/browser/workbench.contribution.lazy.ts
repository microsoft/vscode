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

		load(() => import('../services/policies/browser/accountPolicyGate.contribution.js'));
		load(() => import('../contrib/meteredConnection/browser/meteredConnection.contribution.js'));
		load(() => import('../contrib/welcomeOnboarding/browser/welcomeOnboarding.contribution.js'));
		load(() => import('../contrib/surveys/browser/nps.contribution.js'));
		load(() => import('../contrib/surveys/browser/languageSurveys.contribution.js'));

		load(() => import('../contrib/bracketPairColorizer2Telemetry/browser/bracketPairColorizer2Telemetry.contribution.js'));
		load(() => import('../contrib/scrollLocking/browser/scrollLocking.contribution.js'));
		load(() => import('../contrib/dropOrPasteInto/browser/dropOrPasteInto.contribution.js'));
		load(() => import('../contrib/opener/browser/opener.contribution.js'));
		load(() => import('../contrib/relauncher/browser/relauncher.contribution.js'));
		load(() => import('../contrib/update/browser/update.contribution.js'));
		load(() => import('../contrib/sash/browser/sash.contribution.js'));
		load(() => import('../contrib/languageDetection/browser/languageDetection.contribution.js'));
	}
}

registerWorkbenchContribution2(LazyWorkbenchContributionsLoader.ID, LazyWorkbenchContributionsLoader, WorkbenchPhase.Eventually);
