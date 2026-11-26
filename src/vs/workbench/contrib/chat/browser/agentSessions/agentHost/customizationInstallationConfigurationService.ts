/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IAgentCustomizationInstallationAnswers, IAgentCustomizationInstallationConfigurationRequest } from '../../../../../../platform/agentHost/common/agent.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';

export const ICustomizationInstallationConfigurationService = createDecorator<ICustomizationInstallationConfigurationService>('customizationInstallationConfigurationService');

/** Shows a configuration request to the user and collects the answers. */
export interface ICustomizationInstallationConfigurationPresenter {
	/** Resolves with the user's answers, or with `undefined` when the user cancels. */
	collect(request: IAgentCustomizationInstallationConfigurationRequest, token: CancellationToken): Promise<IAgentCustomizationInstallationAnswers | undefined>;
}

/**
 * Lets an installation that needs configuration ask for it in the surface the user installs from,
 * without the installation knowing that surface.
 */
export interface ICustomizationInstallationConfigurationService extends ICustomizationInstallationConfigurationPresenter {
	readonly _serviceBrand: undefined;
	/**
	 * Shows requests with {@link presenter} until the returned disposable is disposed. The most
	 * recently registered presenter is used; without one, a request counts as cancelled.
	 */
	registerPresenter(presenter: ICustomizationInstallationConfigurationPresenter): IDisposable;
}

export class CustomizationInstallationConfigurationService implements ICustomizationInstallationConfigurationService {
	declare readonly _serviceBrand: undefined;

	private readonly presenters: ICustomizationInstallationConfigurationPresenter[] = [];

	registerPresenter(presenter: ICustomizationInstallationConfigurationPresenter): IDisposable {
		this.presenters.push(presenter);
		return toDisposable(() => {
			const index = this.presenters.indexOf(presenter);
			if (index >= 0) {
				this.presenters.splice(index, 1);
			}
		});
	}

	async collect(request: IAgentCustomizationInstallationConfigurationRequest, token: CancellationToken): Promise<IAgentCustomizationInstallationAnswers | undefined> {
		return this.presenters.at(-1)?.collect(request, token);
	}
}

registerSingleton(ICustomizationInstallationConfigurationService, CustomizationInstallationConfigurationService, InstantiationType.Delayed);
