/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IVirtualMachineInfo, IVirtualMachinesService, VirtualMachineState } from '../../../../platform/virtualMachines/common/virtualMachines.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IVirtualDesktopOpener } from './virtualDesktopPanel.js';

const $ = dom.$;

const STATE_LABELS: Record<VirtualMachineState, string> = {
	[VirtualMachineState.Stopped]: localize('vm.state.stopped', "Arrêté"),
	[VirtualMachineState.Starting]: localize('vm.state.starting', "Démarrage"),
	[VirtualMachineState.Running]: localize('vm.state.running', "En cours d'exécution"),
	[VirtualMachineState.Stopping]: localize('vm.state.stopping', "Arrêt en cours"),
	[VirtualMachineState.Error]: localize('vm.state.error', "Erreur"),
};

interface IVmCardElements {
	readonly root: HTMLElement;
	readonly stateDot: HTMLElement;
	readonly stateLabel: HTMLElement;
	readonly resources: HTMLElement;
	readonly error: HTMLElement;
	readonly buttons: DisposableStore;
	readonly buttonsContainer: HTMLElement;
}

export class VirtualMachinesViewPane extends ViewPane {

	static readonly ID = 'workbench.views.virtualMachines';

	private bodyContainer: HTMLElement | undefined;
	private bannerContainer: HTMLElement | undefined;
	private cardsContainer: HTMLElement | undefined;
	private readonly cards = new Map<string, IVmCardElements>();

	constructor(
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IVirtualMachinesService private readonly virtualMachinesService: IVirtualMachinesService,
		@IVirtualDesktopOpener private readonly virtualDesktopOpener: IVirtualDesktopOpener,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this._register(this.virtualMachinesService.onDidChangeVirtualMachines(vms => this.renderVms(vms)));
		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				this.refresh();
			}
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('virtual-machines-view');
		this.bodyContainer = container;
		this.bannerContainer = dom.append(container, $('.virtual-machines-banner-container'));
		this.cardsContainer = dom.append(container, $('.virtual-machines-cards'));
		this.refresh();
	}

	private async refresh(): Promise<void> {
		if (!this.bodyContainer) {
			return;
		}
		try {
			const [vms, environment] = await Promise.all([
				this.virtualMachinesService.getVirtualMachines(),
				this.virtualMachinesService.checkEnvironment(),
			]);
			this.renderEnvironmentBanner(environment.ok ? undefined : environment.problems.join('\n'));
			this.renderVms(vms);
		} catch (err) {
			this.renderEnvironmentBanner(err instanceof Error ? err.message : String(err));
		}
	}

	private renderEnvironmentBanner(message: string | undefined): void {
		if (!this.bannerContainer) {
			return;
		}
		dom.clearNode(this.bannerContainer);
		if (message) {
			const banner = dom.append(this.bannerContainer, $('.virtual-machines-environment-banner'));
			banner.textContent = message;
		}
	}

	private renderVms(vms: readonly IVirtualMachineInfo[]): void {
		if (!this.cardsContainer) {
			return;
		}
		for (const vm of vms) {
			let card = this.cards.get(vm.id);
			if (!card) {
				card = this.createCard(vm);
				this.cards.set(vm.id, card);
				dom.append(this.cardsContainer, card.root);
			}
			this.updateCard(card, vm);
		}
	}

	private createCard(vm: IVirtualMachineInfo): IVmCardElements {
		const root = $('.virtual-machine-card');
		const header = dom.append(root, $('.virtual-machine-card-header'));
		dom.append(header, $('span.virtual-machine-name', undefined, vm.name));
		const stateContainer = dom.append(root, $('.virtual-machine-state'));
		const stateDot = dom.append(stateContainer, $('span.virtual-machine-state-dot'));
		const stateLabel = dom.append(stateContainer, $('span.virtual-machine-state-label'));
		const description = dom.append(root, $('.virtual-machine-description'));
		description.textContent = vm.description;
		const resources = dom.append(root, $('.virtual-machine-resources'));
		const error = dom.append(root, $('.virtual-machine-error'));
		const buttonsContainer = dom.append(root, $('.virtual-machine-actions'));
		return { root, stateDot, stateLabel, resources, error, buttons: new DisposableStore(), buttonsContainer };
	}

	private updateCard(card: IVmCardElements, vm: IVirtualMachineInfo): void {
		card.stateDot.className = `virtual-machine-state-dot state-${vm.state}`;
		card.stateLabel.textContent = STATE_LABELS[vm.state] ?? vm.state;
		card.resources.textContent = localize('vm.resources', "{0} vCPU · {1} Mo RAM · {2} Go disque", vm.resources.cpus, vm.resources.memoryMB, vm.resources.diskGB);
		card.error.textContent = vm.error ?? '';
		card.error.style.display = vm.error ? '' : 'none';

		card.buttons.clear();
		const addButton = (label: string, enabled: boolean, action: () => void, secondary = false) => {
			const button = card.buttons.add(new Button(card.buttonsContainer, { ...defaultButtonStyles, secondary, title: label, ariaLabel: label }));
			button.label = label;
			button.enabled = enabled;
			card.buttons.add(button.onDidClick(() => action()));
		};

		const running = vm.state === VirtualMachineState.Running;
		const stopped = vm.state === VirtualMachineState.Stopped || vm.state === VirtualMachineState.Error;
		const busy = vm.state === VirtualMachineState.Starting || vm.state === VirtualMachineState.Stopping;

		addButton(localize('vm.open', "Ouvrir"), !busy, () => void this.virtualDesktopOpener.openDesktop(vm));
		if (stopped) {
			addButton(localize('vm.start', "Démarrer"), true, () => void this.virtualMachinesService.start(vm.id), true);
		}
		if (running) {
			addButton(localize('vm.restart', "Redémarrer"), true, () => void this.virtualMachinesService.restart(vm.id), true);
			addButton(localize('vm.stop', "Arrêt"), true, () => void this.virtualMachinesService.stop(vm.id), true);
		}
	}
}
