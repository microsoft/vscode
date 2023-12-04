/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService, IConstructorSignature, ServicesAccessor, BrandedService } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IdleDeadline, DeferredPromise, runWhenGlobalIdle } from 'vs/base/common/async';
import { mark } from 'vs/base/common/performance';
import { ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

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

export interface IWorkbenchContributionsRegistry {

	/**
	 * Registers a workbench contribution to the platform that will
	 * be loaded when the workbench starts and disposed when the
	 * workbench shuts down.
	 *
	 * The parameter `phase` controls when the contribution is instantiated.
	 * Phases `Starting` and `Ready` are synchronous, all other phases are
	 * delayed until the workbench is idle. Contributions are guaranteed to
	 * be created in the order of their phases, even when delayed to idle.
	 *
	 * @param phase the lifecycle phase when to instantiate the contribution.
	 */
	registerWorkbenchContribution<Services extends BrandedService[]>(contribution: IWorkbenchContributionSignature<Services>, phase: LifecyclePhase): void;

	/**
	 * Starts the registry by providing the required services.
	 */
	start(accessor: ServicesAccessor): void;

	/**
	 * A promise that resolves when all contributions up to the `Restored`
	 * phase have been instantiated.
	 */
	readonly whenRestored: Promise<void>;
}

class WorkbenchContributionsRegistry implements IWorkbenchContributionsRegistry {

	private instantiationService: IInstantiationService | undefined;
	private lifecycleService: ILifecycleService | undefined;
	private logService: ILogService | undefined;
	private environmentService: IEnvironmentService | undefined;

	private readonly contributions = new Map<LifecyclePhase, IConstructorSignature<IWorkbenchContribution>[]>();

	private readonly pendingRestoredContributions = new DeferredPromise<void>();
	readonly whenRestored = this.pendingRestoredContributions.p;

	registerWorkbenchContribution(contribution: IConstructorSignature<IWorkbenchContribution>, phase: LifecyclePhase = LifecyclePhase.Starting): void {

		// Instantiate directly if we are already matching the provided phase
		if (this.instantiationService && this.lifecycleService && this.logService && this.environmentService && this.lifecycleService.phase >= phase) {
			this.safeCreateContribution(this.instantiationService, this.logService, this.environmentService, contribution, phase);
		}

		// Otherwise keep contributions by lifecycle phase
		else {
			let contributions = this.contributions.get(phase);
			if (!contributions) {
				contributions = [];
				this.contributions.set(phase, contributions);
			}

			contributions.push(contribution);
		}
	}

	start(accessor: ServicesAccessor): void {
		const instantiationService = this.instantiationService = accessor.get(IInstantiationService);
		const lifecycleService = this.lifecycleService = accessor.get(ILifecycleService);
		const logService = this.logService = accessor.get(ILogService);
		const environmentService = this.environmentService = accessor.get(IEnvironmentService);

		for (const phase of [LifecyclePhase.Starting, LifecyclePhase.Ready, LifecyclePhase.Restored, LifecyclePhase.Eventually]) {
			this.instantiateByPhase(instantiationService, lifecycleService, logService, environmentService, phase);
		}
	}

	private instantiateByPhase(instantiationService: IInstantiationService, lifecycleService: ILifecycleService, logService: ILogService, environmentService: IEnvironmentService, phase: LifecyclePhase): void {

		// Instantiate contributions directly when phase is already reached
		if (lifecycleService.phase >= phase) {
			this.doInstantiateByPhase(instantiationService, logService, environmentService, phase);
		}

		// Otherwise wait for phase to be reached
		else {
			lifecycleService.when(phase).then(() => this.doInstantiateByPhase(instantiationService, logService, environmentService, phase));
		}
	}

	private async doInstantiateByPhase(instantiationService: IInstantiationService, logService: ILogService, environmentService: IEnvironmentService, phase: LifecyclePhase): Promise<void> {
		const contributions = this.contributions.get(phase);
		if (contributions) {
			this.contributions.delete(phase);

			switch (phase) {
				case LifecyclePhase.Starting:
				case LifecyclePhase.Ready: {

					// instantiate everything synchronously and blocking
					// measure the time it takes as perf marks for diagnosis

					mark(`code/willCreateWorkbenchContributions/${phase}`);

					for (const contribution of contributions) {
						this.safeCreateContribution(instantiationService, logService, environmentService, contribution, phase);
					}

					mark(`code/didCreateWorkbenchContributions/${phase}`);

					break;
				}

				case LifecyclePhase.Restored:
				case LifecyclePhase.Eventually: {

					// for the Restored/Eventually-phase we instantiate contributions
					// only when idle. this might take a few idle-busy-cycles but will
					// finish within the timeouts
					// given that, we must ensure to await the contributions from the
					// Restored-phase before we instantiate the Eventually-phase

					if (phase === LifecyclePhase.Eventually) {
						await this.pendingRestoredContributions.p;
					}

					this.doInstantiateWhenIdle(contributions, instantiationService, logService, environmentService, phase);

					break;
				}
			}
		}
	}

	private doInstantiateWhenIdle(contributions: IConstructorSignature<IWorkbenchContribution>[], instantiationService: IInstantiationService, logService: ILogService, environmentService: IEnvironmentService, phase: LifecyclePhase): void {
		mark(`code/willCreateWorkbenchContributions/${phase}`);

		let i = 0;
		const forcedTimeout = phase === LifecyclePhase.Eventually ? 3000 : 500;

		const instantiateSome = (idle: IdleDeadline) => {
			while (i < contributions.length) {
				const contribution = contributions[i++];
				this.safeCreateContribution(instantiationService, logService, environmentService, contribution, phase);
				if (idle.timeRemaining() < 1) {
					// time is up -> reschedule
					runWhenGlobalIdle(instantiateSome, forcedTimeout);
					break;
				}
			}

			if (i === contributions.length) {
				mark(`code/didCreateWorkbenchContributions/${phase}`);

				if (phase === LifecyclePhase.Restored) {
					this.pendingRestoredContributions.complete();
				}
			}
		};

		runWhenGlobalIdle(instantiateSome, forcedTimeout);
	}

	private safeCreateContribution(instantiationService: IInstantiationService, logService: ILogService, environmentService: IEnvironmentService, contribution: IConstructorSignature<IWorkbenchContribution>, phase: LifecyclePhase): void {
		const now: number | undefined = phase < LifecyclePhase.Restored ? Date.now() : undefined;

		try {
			instantiationService.createInstance(contribution);
		} catch (error) {
			logService.error(`Unable to create workbench contribution ${contribution.name}.`, error);
		}

		if (typeof now === 'number' && !environmentService.isBuilt /* only log out of sources where we have good ctor names */) {
			const time = Date.now() - now;
			if (time > 20) {
				logService.warn(`Workbench contribution ${contribution.name} blocked restore phase by ${time}ms.`);
			}
		}
	}
}

Registry.add(Extensions.Workbench, new WorkbenchContributionsRegistry());
