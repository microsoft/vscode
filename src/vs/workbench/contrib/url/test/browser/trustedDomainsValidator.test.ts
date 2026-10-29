/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullOpenerService } from '../../../../../platform/opener/test/common/nullOpenerService.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { OpenerValidatorContributions } from '../../browser/trustedDomainsValidator.js';

suite('OpenerValidatorContributions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createValidator(isWorkspaceTrusted: boolean, trustRequestResult: boolean | undefined) {
		let trustRequestCount = 0;
		const workspaceTrustManagementService = {
			isWorkspaceTrusted: () => isWorkspaceTrusted
		} as IWorkspaceTrustManagementService;
		const workspaceTrustRequestService = {
			requestWorkspaceTrust: async () => {
				trustRequestCount++;
				return trustRequestResult;
			}
		} as IWorkspaceTrustRequestService;

		const validator = new OpenerValidatorContributions(
			NullOpenerService,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			workspaceTrustManagementService,
			workspaceTrustRequestService,
			undefined!,
		);

		return { validator, getTrustRequestCount: () => trustRequestCount };
	}

	test('requires workspace trust for command URIs from the workspace', async () => {
		const trusted = createValidator(true, undefined);
		const accepted = createValidator(false, true);
		const cancelled = createValidator(false, undefined);
		const notFromWorkspace = createValidator(false, undefined);
		const commandsDisabled = createValidator(false, undefined);
		const commandNotAllowlisted = createValidator(false, undefined);

		assert.deepStrictEqual({
			trusted: await trusted.validator.validateLink('command:workbench.action.openSettings?%22security.workspace.trust.enabled%22', { fromWorkspace: true, allowCommands: true }),
			trustedRequestCount: trusted.getTrustRequestCount(),
			accepted: await accepted.validator.validateLink('command:workbench.action.openSettings?%22security.workspace.trust.enabled%22', { fromWorkspace: true, allowCommands: true }),
			acceptedRequestCount: accepted.getTrustRequestCount(),
			cancelled: await cancelled.validator.validateLink('command:workbench.action.openSettings?%22security.workspace.trust.enabled%22', { fromWorkspace: true, allowCommands: true }),
			cancelledRequestCount: cancelled.getTrustRequestCount(),
			notFromWorkspace: await notFromWorkspace.validator.validateLink('command:workbench.action.openSettings?%22security.workspace.trust.enabled%22'),
			notFromWorkspaceRequestCount: notFromWorkspace.getTrustRequestCount(),
			commandsDisabled: await commandsDisabled.validator.validateLink('command:workbench.action.openSettings?%22security.workspace.trust.enabled%22', { fromWorkspace: true, allowCommands: false }),
			commandsDisabledRequestCount: commandsDisabled.getTrustRequestCount(),
			commandNotAllowlisted: await commandNotAllowlisted.validator.validateLink('command:workbench.action.openSettings?%22security.workspace.trust.enabled%22', { fromWorkspace: true, allowCommands: ['workbench.action.closeWindow'] }),
			commandNotAllowlistedRequestCount: commandNotAllowlisted.getTrustRequestCount(),
		}, {
			trusted: true,
			trustedRequestCount: 0,
			accepted: true,
			acceptedRequestCount: 1,
			cancelled: false,
			cancelledRequestCount: 1,
			notFromWorkspace: true,
			notFromWorkspaceRequestCount: 0,
			commandsDisabled: true,
			commandsDisabledRequestCount: 0,
			commandNotAllowlisted: true,
			commandNotAllowlistedRequestCount: 0,
		});
	});
});
