/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { reportNewChatPickerClosed } from '../../../chat/browser/newChatPickerTelemetry.js';
import { BranchPicker as SharedBranchPicker } from '../../../chat/browser/branchPicker.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { CopilotChatSessionsProvider, ICopilotChatSession } from './copilotChatSessionsProvider.js';

/**
 * A widget for selecting a git branch.
 * Reads branch list and selected branch from the active session,
 * which is the source of truth for branch state.
 */
export class BranchPicker extends Disposable {
	private readonly _picker: SharedBranchPicker;

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._picker = this._register(instantiationService.createInstance(SharedBranchPicker, {
			user: 'branchPicker',
			onSelectBranch: branch => {
				const session = this._getSession();
				const selectedBranch = session?.branch.get();
				reportNewChatPickerClosed(this.telemetryService, {
					id: 'NewChatBranchPicker',
					name: 'NewChatBranchPicker',
					optionIdBefore: selectedBranch,
					optionIdAfter: branch,
					optionLabelBefore: selectedBranch,
					optionLabelAfter: branch,
					isPII: true,
				});
				session?.setBranch(branch);
			},
		}));
		this._register(autorun(reader => {
			const session = this._session.read(reader);
			const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
			const providerSession = provider instanceof CopilotChatSessionsProvider ? provider.getSession(session!.sessionId) : undefined;
			if (providerSession) {
				providerSession.loading.read(reader);
				providerSession.branches.read(reader);
				providerSession.branch.read(reader);
				providerSession.isolationMode.read(reader);
			}
			this._update();
		}));
	}

	private _getSession(): ICopilotChatSession | undefined {
		const session = this._session.get();
		if (!session) {
			return undefined;
		}
		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		return provider instanceof CopilotChatSessionsProvider ? provider.getSession(session.sessionId) : undefined;
	}

	render(container: HTMLElement): void {
		this._picker.render(container);
		this._update();
	}

	showPicker(): void {
		this._picker.showPicker();
	}

	private _update(): void {
		const session = this._getSession();
		const branches = session?.branches.get() ?? [];
		const selectedBranch = session?.branch.get();
		const isLoading = session?.loading.get() ?? false;
		const isWorkspace = session?.isolationMode.get() === 'workspace';
		this._picker.update({
			label: selectedBranch ?? localize('branchPicker.select', "Branch"),
			branches: branches.map(branch => ({ name: branch, selected: branch === selectedBranch })),
			status: isLoading ? 'loading' : branches.length > 0 ? 'ready' : 'empty',
			canOpen: !isLoading && !isWorkspace && branches.length > 0,
		});
	}
}
