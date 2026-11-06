/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../platform/log/common/logService';
import { Disposable, isDisposable } from '../../util/vs/base/common/lifecycle';
import { StopWatch } from '../../util/vs/base/common/stopwatch';
import { IInstantiationService, ServicesAccessor } from '../../util/vs/platform/instantiation/common/instantiation';

export interface IExtensionContribution {

	id?: string;

	/**
	 * Dispose of the contribution.
	 */
	dispose?(): void;

	/**
	 * A promise that the extension `activate` method will wait on before completing.
	 * USE this carefully as it will delay startup of our extension.
	 */
	activationBlocker?: Promise<void>;
}

export interface IExtensionContributionFactory {
	create(accessor: ServicesAccessor): IExtensionContribution | void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asContributionFactory(ctor: { new(...args: any): any }): IExtensionContributionFactory {
	return {
		create(accessor: ServicesAccessor): IExtensionContribution {
			const instantiationService = accessor.get(IInstantiationService);
			return instantiationService.createInstance(ctor);
		}
	};
}

export class ContributionCollection extends Disposable {
	private readonly allActivationBlockers: Promise<void>[] = [];

	constructor(
		contribs: IExtensionContributionFactory[],
		@ILogService logService: ILogService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		super();

		for (const contribution of contribs) {
			let instance: IExtensionContribution | void | undefined;
			try {
				instance = instaService.invokeFunction(contribution.create);

				if (isDisposable(instance)) {
					this._register(instance);
				}

				if (instance?.activationBlocker) {
					const sw = StopWatch.create();
					const id = instance.id || 'UNKNOWN';
					this.allActivationBlockers.push(instance.activationBlocker.finally(() => {
						logService.info(`activationBlocker from '${id}' took for ${Math.round(sw.elapsed())}ms`);
					}));
				}
			} catch (error) {
				logService.error(error, `Error while loading contribution`);
			}
		}
	}

	async waitForActivationBlockers(): Promise<void> {
		// WAIT for all activation blockers to complete
		await Promise.allSettled(this.allActivationBlockers);
	}
}
