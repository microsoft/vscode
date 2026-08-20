/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILocalizedString, localize, localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, IViewsRegistry, Extensions as ViewsExtensions } from '../../../common/views.js';
import { VirtualMachinesViewPane } from './virtualMachinesView.js';
import { virtualMachinesViewIcon } from './virtualMachinesIcons.js';
import { IVirtualDesktopOpener, VirtualDesktopOpener } from './virtualDesktopPanel.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IVirtualMachinesService, VirtualMachinesConfig, WellKnownVirtualMachine } from '../../../../platform/virtualMachines/common/virtualMachines.js';

import './media/virtualMachines.css';

export const VIRTUAL_MACHINES_VIEWLET_ID = 'workbench.view.virtualMachines';

registerSingleton(IVirtualDesktopOpener, VirtualDesktopOpener, InstantiationType.Delayed);

// Register the activity bar container directly below Extensions (which is order: 4).
export const VIRTUAL_MACHINES_VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer(
	{
		id: VIRTUAL_MACHINES_VIEWLET_ID,
		title: localize2('virtualMachines', "Ordinateurs virtuels"),
		openCommandActionDescriptor: {
			id: VIRTUAL_MACHINES_VIEWLET_ID,
			mnemonicTitle: localize({ key: 'miViewVirtualMachines', comment: ['&& denotes a mnemonic'] }, "Ordinateurs &&virtuels"),
			order: 5,
		},
		ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VIRTUAL_MACHINES_VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }]),
		icon: virtualMachinesViewIcon,
		order: 5,
		rejectAddedViews: true,
		alwaysUseContainerInfo: true,
	}, ViewContainerLocation.Sidebar);

Registry.as<IViewsRegistry>(ViewsExtensions.ViewsRegistry).registerViews([{
	id: VirtualMachinesViewPane.ID,
	name: localize2('virtualMachinesView', "Ordinateurs virtuels"),
	ctorDescriptor: new SyncDescriptor(VirtualMachinesViewPane),
	canToggleVisibility: false,
	canMoveView: false,
	containerIcon: virtualMachinesViewIcon,
}], VIRTUAL_MACHINES_VIEW_CONTAINER);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		id: 'virtualMachines',
		order: 31,
		title: localize('virtualMachinesConfigurationTitle', "Ordinateurs virtuels"),
		type: 'object',
		properties: {
			[VirtualMachinesConfig.Acceleration]: {
				type: 'string',
				enum: ['auto', 'kvm', 'tcg'],
				enumDescriptions: [
					localize('virtualMachines.acceleration.auto', "Use KVM when available and refuse to start otherwise."),
					localize('virtualMachines.acceleration.kvm', "Require hardware acceleration through KVM. Starting a machine fails when /dev/kvm is missing or not accessible."),
					localize('virtualMachines.acceleration.tcg', "Allow slow software emulation (TCG). Useful on hosts without KVM, at a large performance cost."),
				],
				default: 'auto',
				description: localize('virtualMachines.acceleration', "Controls the acceleration mode used by QEMU for virtual machines."),
				scope: ConfigurationScope.MACHINE,
			},
			[VirtualMachinesConfig.QemuBinary]: {
				type: 'string',
				default: '',
				description: localize('virtualMachines.qemuBinary', "Absolute path to the qemu-system-x86_64 binary. Leave empty to search the PATH."),
				scope: ConfigurationScope.MACHINE,
			},
			[VirtualMachinesConfig.DataRoot]: {
				type: 'string',
				default: '',
				description: localize('virtualMachines.dataRoot', "Directory where virtual machine disks are stored. Leave empty to use the GitCortex user data directory."),
				scope: ConfigurationScope.MACHINE,
			},
			[VirtualMachinesConfig.NetworkMode]: {
				type: 'string',
				enum: ['user', 'restricted', 'none'],
				enumDescriptions: [
					localize('virtualMachines.networkMode.user', "User-mode networking with outbound access (recommended for development)."),
					localize('virtualMachines.networkMode.restricted', "Isolated networking: the guest cannot reach the host or other guests."),
					localize('virtualMachines.networkMode.none', "No network interface at all."),
				],
				default: 'user',
				description: localize('virtualMachines.networkMode', "Controls the network isolation of virtual machines."),
				scope: ConfigurationScope.MACHINE,
			},
			[VirtualMachinesConfig.AgentControl]: {
				type: 'boolean',
				default: false,
				description: localize('virtualMachines.agentControl', "Allow the GitCortex AI agent to control virtual machines. Requires explicit opt-in."),
				scope: ConfigurationScope.MACHINE,
			},
			[VirtualMachinesConfig.DeveloperCpus]: {
				type: 'number', default: 2, minimum: 1, maximum: 16,
				description: localize('virtualMachines.developerCpus', "Number of virtual CPUs for the Ubuntu Developer machine."),
				scope: ConfigurationScope.MACHINE,
			},
			[VirtualMachinesConfig.DeveloperMemoryMB]: {
				type: 'number', default: 4096, minimum: 512, maximum: 32768,
				description: localize('virtualMachines.developerMemoryMB', "Memory (in MB) for the Ubuntu Developer machine."),
				scope: ConfigurationScope.MACHINE,
			},
			[VirtualMachinesConfig.DeveloperDiskGB]: {
				type: 'number', default: 32, minimum: 4, maximum: 512,
				description: localize('virtualMachines.developerDiskGB', "Virtual disk size (in GB) for the Ubuntu Developer machine."),
				scope: ConfigurationScope.MACHINE,
			},
			[VirtualMachinesConfig.DeveloperInstallIso]: {
				type: 'string', default: '',
				description: localize('virtualMachines.developerInstallIso', "Absolute path to a bootable installer ISO attached when the Ubuntu Developer disk is empty. Leave empty to boot from the virtual disk only."),
				scope: ConfigurationScope.MACHINE,
			},
			[VirtualMachinesConfig.SandboxCpus]: {
				type: 'number', default: 2, minimum: 1, maximum: 16,
				description: localize('virtualMachines.sandboxCpus', "Number of virtual CPUs for the Ubuntu Sandbox machine."),
				scope: ConfigurationScope.MACHINE,
			},
			[VirtualMachinesConfig.SandboxMemoryMB]: {
				type: 'number', default: 2048, minimum: 512, maximum: 32768,
				description: localize('virtualMachines.sandboxMemoryMB', "Memory (in MB) for the Ubuntu Sandbox machine."),
				scope: ConfigurationScope.MACHINE,
			},
			[VirtualMachinesConfig.SandboxDiskGB]: {
				type: 'number', default: 16, minimum: 4, maximum: 512,
				description: localize('virtualMachines.sandboxDiskGB', "Virtual disk size (in GB) for the Ubuntu Sandbox machine."),
				scope: ConfigurationScope.MACHINE,
			},
			[VirtualMachinesConfig.SandboxInstallIso]: {
				type: 'string', default: '',
				description: localize('virtualMachines.sandboxInstallIso', "Absolute path to a bootable installer ISO attached when the Ubuntu Sandbox disk is empty. Leave empty to boot from the virtual disk only."),
				scope: ConfigurationScope.MACHINE,
			},
		}
	});

//#region Commands

function registerVmCommand(id: string, title: ILocalizedString, vmId: WellKnownVirtualMachine, run: (service: IVirtualMachinesService, vmId: string) => Promise<void>): void {
	registerAction2(class extends Action2 {
		constructor() {
			super({ id, title, f1: true });
		}
		run(accessor: ServicesAccessor): Promise<void> {
			return run(accessor.get(IVirtualMachinesService), vmId);
		}
	});
}

registerVmCommand('virtualMachines.startUbuntuDeveloper', localize2('virtualMachines.startUbuntuDeveloper', 'Démarrer Ubuntu Developer'), WellKnownVirtualMachine.UbuntuDeveloper, (s, id) => s.start(id));
registerVmCommand('virtualMachines.stopUbuntuDeveloper', localize2('virtualMachines.stopUbuntuDeveloper', 'Arrêter Ubuntu Developer'), WellKnownVirtualMachine.UbuntuDeveloper, (s, id) => s.stop(id));
registerVmCommand('virtualMachines.restartUbuntuDeveloper', localize2('virtualMachines.restartUbuntuDeveloper', 'Redémarrer Ubuntu Developer'), WellKnownVirtualMachine.UbuntuDeveloper, (s, id) => s.restart(id));
registerVmCommand('virtualMachines.startUbuntuSandbox', localize2('virtualMachines.startUbuntuSandbox', 'Démarrer Ubuntu Sandbox'), WellKnownVirtualMachine.UbuntuSandbox, (s, id) => s.start(id));
registerVmCommand('virtualMachines.stopUbuntuSandbox', localize2('virtualMachines.stopUbuntuSandbox', 'Arrêter Ubuntu Sandbox'), WellKnownVirtualMachine.UbuntuSandbox, (s, id) => s.stop(id));
registerVmCommand('virtualMachines.restartUbuntuSandbox', localize2('virtualMachines.restartUbuntuSandbox', 'Redémarrer Ubuntu Sandbox'), WellKnownVirtualMachine.UbuntuSandbox, (s, id) => s.restart(id));

//#endregion
