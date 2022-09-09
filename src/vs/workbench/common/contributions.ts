/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService, IConstructorSignature, ServicesAccessor, BrandedService } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { runWhenIdle, IdleDeadline } from 'vs/base/common/async';
import { mark } from 'vs/base/common/performance';
import { ILogService } from 'vs/platform/log/common/log';

/**
 * A workbench contribution that will be loaded when the workbench starts and disposed when the workbench shuts down.
 */
export interface IWorkbenchContribution {
	// Marker Interface
}

export namespace Extensions {
	export const Workbench = 'workbench.contributions.kind';
}

type IWorkbenchContributionSignature<Service extends BrandedService[]> = new (...services: Service) => IWorkbenchContribution;

interface IWorkbenchContributionRegistration {
	readonly id: string;
	readonly ctor: IConstructorSignature<IWorkbenchContribution>;
}

export interface IWorkbenchContributionsRegistry {

	/**
	 * Registers a workbench contribution to the platform that will be loaded when the workbench starts and disposed when
	 * the workbench shuts down.
	 *
	 * @param id the identifier of the contribution.
	 * @param phase the lifecycle phase when to instantiate the contribution.
	 */
	registerWorkbenchContribution<Services extends BrandedService[]>(contribution: IWorkbenchContributionSignature<Services>, id: string, phase: LifecyclePhase): void;

	/**
	 * Starts the registry by providing the required services.
	 */
	start(accessor: ServicesAccessor): void;
}

class WorkbenchContributionsRegistry implements IWorkbenchContributionsRegistry {

	private instantiationService: IInstantiationService | undefined;
	private lifecycleService: ILifecycleService | undefined;
	private logService: ILogService | undefined;

	private readonly toBeInstantiated = new Map<LifecyclePhase, IWorkbenchContributionRegistration[]>();

	registerWorkbenchContribution(ctor: IConstructorSignature<IWorkbenchContribution>, id: string, phase: LifecyclePhase = LifecyclePhase.Starting): void {
		const contribution = { id, ctor };

		// Instantiate directly if we are already matching the provided phase
		if (this.instantiationService && this.lifecycleService && this.logService && this.lifecycleService.phase >= phase) {
			this.safeCreateInstance(this.instantiationService, this.logService, contribution, phase);
		}

		// Otherwise keep contributions by lifecycle phase
		else {
			let toBeInstantiated = this.toBeInstantiated.get(phase);
			if (!toBeInstantiated) {
				toBeInstantiated = [];
				this.toBeInstantiated.set(phase, toBeInstantiated);
			}

			toBeInstantiated.push(contribution);
		}
	}

	start(accessor: ServicesAccessor): void {
		const instantiationService = this.instantiationService = accessor.get(IInstantiationService);
		const lifecycleService = this.lifecycleService = accessor.get(ILifecycleService);
		const logService = this.logService = accessor.get(ILogService);

		for (const phase of [LifecyclePhase.Starting, LifecyclePhase.Ready, LifecyclePhase.Restored, LifecyclePhase.Eventually]) {
			this.instantiateByPhase(instantiationService, lifecycleService, logService, phase);
		}
	}

	private instantiateByPhase(instantiationService: IInstantiationService, lifecycleService: ILifecycleService, logService: ILogService, phase: LifecyclePhase): void {

		// Instantiate contributions directly when phase is already reached
		if (lifecycleService.phase >= phase) {
			this.doInstantiateByPhase(instantiationService, logService, phase);
		}

		// Otherwise wait for phase to be reached
		else {
			lifecycleService.when(phase).then(() => this.doInstantiateByPhase(instantiationService, logService, phase));
		}
	}

	private doInstantiateByPhase(instantiationService: IInstantiationService, logService: ILogService, phase: LifecyclePhase): void {
		const toBeInstantiated = this.toBeInstantiated.get(phase);
		if (toBeInstantiated) {
			this.toBeInstantiated.delete(phase);
			if (phase !== LifecyclePhase.Eventually) {

				// instantiate everything synchronously and blocking
				// measure the time it takes as perf marks for diagnosis

				mark(`code/willCreateWorkbenchContributions/${phase}`);

				for (const ctor of toBeInstantiated) {
					this.safeCreateInstance(instantiationService, logService, ctor, phase); // catch error so that other contributions are still considered
				}

				mark(`code/didCreateWorkbenchContributions/${phase}`);
			} else {

				// for the Eventually-phase we instantiate contributions
				// only when idle. this might take a few idle-busy-cycles
				// but will finish within the timeouts

				const forcedTimeout = 3000;
				let i = 0;
				const instantiateSome = (idle: IdleDeadline) => {
					while (i < toBeInstantiated.length) {
						const ctor = toBeInstantiated[i++];
						this.safeCreateInstance(instantiationService, logService, ctor, phase); // catch error so that other contributions are still considered
						if (idle.timeRemaining() < 1) {
							// time is up -> reschedule
							runWhenIdle(instantiateSome, forcedTimeout);
							break;
						}
					}
				};
				runWhenIdle(instantiateSome, forcedTimeout);
			}
		}
	}

	private safeCreateInstance(instantiationService: IInstantiationService, logService: ILogService, contribution: IWorkbenchContributionRegistration, phase: LifecyclePhase): void {
		const now: number | undefined = phase < LifecyclePhase.Restored ? Date.now() : undefined;

		try {
			instantiationService.createInstance(contribution.ctor);
		} catch (error) {
			logService.error(`Unable to instantiate workbench contribution ${contribution.id}.`, error);
		}

		if (typeof now === 'number') {
			const time = Date.now() - now;
			if (time > 5) {
				logService.warn(`Workbench contribution ${contribution.id} blocked restore phase by ${time}ms.`);
			}
		}
	}
}

Registry.add(Extensions.Workbench, new WorkbenchContributionsRegistry());
