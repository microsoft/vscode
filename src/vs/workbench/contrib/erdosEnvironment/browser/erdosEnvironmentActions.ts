/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { 
	IErdosEnvironmentService,
	ERDOS_PYTHON_ENVIRONMENTS_VIEW_ID,
	ERDOS_R_PACKAGES_VIEW_ID,
	ERDOS_PYTHON_PACKAGES_VIEW_ID
} from '../common/environmentTypes.js';
import { PythonEnvironmentsView } from './views/pythonEnvironmentsView.js';
import { RPackagesView } from './views/rPackagesView.js';
import { PythonPackagesView } from './views/pythonPackagesView.js';

// Python Environments Actions
registerAction2(class RefreshPythonEnvironmentsAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.environment.refreshPythonEnvironments',
			title: localize2('erdos.environment.refreshPythonEnvironments', 'Refresh Python Environments'),
			icon: Codicon.refresh,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ERDOS_PYTHON_ENVIRONMENTS_VIEW_ID),
				group: 'navigation',
				order: 1
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const environmentService = accessor.get(IErdosEnvironmentService);
		const progressService = accessor.get(IProgressService);
		
		return progressService.withProgress({
			location: ProgressLocation.Window,
			title: localize('refreshingPythonEnvironments', 'Refreshing Python environments...')
		}, async () => {
			await environmentService.refreshPythonEnvironments();
			
			const view = viewsService.getViewWithId(ERDOS_PYTHON_ENVIRONMENTS_VIEW_ID);
			if (view && view instanceof PythonEnvironmentsView) {
				await view.refresh();
			}
		});
	}
});

// R Packages Actions
registerAction2(class RefreshRPackagesAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.environment.refreshRPackages',
			title: localize2('erdos.environment.refreshRPackages', 'Refresh R Packages'),
			icon: Codicon.refresh,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ERDOS_R_PACKAGES_VIEW_ID),
				group: 'navigation',
				order: 1
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const environmentService = accessor.get(IErdosEnvironmentService);
		const progressService = accessor.get(IProgressService);
		
		return progressService.withProgress({
			location: ProgressLocation.Window,
			title: localize('refreshingRPackages', 'Refreshing R packages...')
		}, async () => {
			await environmentService.refreshRPackages();
			
			const view = viewsService.getViewWithId(ERDOS_R_PACKAGES_VIEW_ID);
			if (view && view instanceof RPackagesView) {
				await view.refresh();
			}
		});
	}
});

registerAction2(class InstallRPackageAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.environment.installRPackage',
			title: localize2('erdos.environment.installRPackage', 'Install R Package'),
			icon: Codicon.add,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ERDOS_R_PACKAGES_VIEW_ID),
				group: 'navigation',
				order: 2
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const environmentService = accessor.get(IErdosEnvironmentService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const progressService = accessor.get(IProgressService);
		const viewsService = accessor.get(IViewsService);
		
		const packageName = await quickInputService.input({
			prompt: localize('installRPackage.prompt', 'Enter R package name to install'),
			placeHolder: localize('installRPackage.placeholder', 'Package name (e.g., ggplot2)')
		});
		
		if (!packageName) {
			return;
		}
		
		return progressService.withProgress({
			location: ProgressLocation.Notification,
			title: localize('installingRPackage', 'Installing R package: {0}', packageName),
			cancellable: false
		}, async (progress) => {
			try {
				progress.report({ increment: 10, message: localize('startingInstallation', 'Starting installation...') });
				
				await environmentService.installRPackage(packageName);
				
				progress.report({ increment: 70, message: localize('refreshingPackageList', 'Refreshing package list...') });
				
				// Refresh the view
				const view = viewsService.getViewWithId(ERDOS_R_PACKAGES_VIEW_ID);
				if (view && view instanceof RPackagesView) {
					await view.refresh();
				}
				
				progress.report({ increment: 20, message: localize('installationComplete', 'Installation complete!') });
				
				notificationService.info(localize('installRPackage.success', 'Successfully installed R package: {0}', packageName));
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				notificationService.error(localize('installRPackage.error', 'Failed to install R package "{0}": {1}', packageName, errorMessage));
				throw error;
			}
		});
	}
});

registerAction2(class RemoveRPackageAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.environment.removeRPackage',
			title: localize2('erdos.environment.removeRPackage', 'Remove R Package'),
			icon: Codicon.trash,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ERDOS_R_PACKAGES_VIEW_ID),
				group: 'navigation',
				order: 3
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const environmentService = accessor.get(IErdosEnvironmentService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const progressService = accessor.get(IProgressService);
		const viewsService = accessor.get(IViewsService);
		
		// Get current packages to show as options
		const packages = await environmentService.getRPackages();
		
		if (packages.length === 0) {
			notificationService.info(localize('noPackagesToRemove', 'No R packages available to remove.'));
			return;
		}
		
		// Create quick pick items for packages
		const packageItems: IQuickPickItem[] = packages.map(pkg => ({
			id: pkg.name,
			label: pkg.name,
			description: `v${pkg.version}`,
			detail: pkg.description || undefined
		}));
		
		const selectedPackage = await quickInputService.pick(packageItems, {
			placeHolder: localize('selectPackageToRemove', 'Select R package to remove'),
			matchOnDescription: true,
			matchOnDetail: true
		});
		
		if (!selectedPackage) {
			return;
		}
		
		const packageName = selectedPackage.id!;
		
		return progressService.withProgress({
			location: ProgressLocation.Notification,
			title: localize('removingRPackage', 'Removing R package: {0}', packageName),
			cancellable: false
		}, async (progress) => {
			try {
				progress.report({ increment: 10, message: localize('startingRemoval', 'Starting removal...') });
				
				await environmentService.removeRPackage(packageName);
				
				progress.report({ increment: 70, message: localize('refreshingPackageList', 'Refreshing package list...') });
				
				// Refresh the view
				const view = viewsService.getViewWithId(ERDOS_R_PACKAGES_VIEW_ID);
				if (view && view instanceof RPackagesView) {
					await view.refresh();
				}
				
				progress.report({ increment: 20, message: localize('removalComplete', 'Removal complete!') });
				
				notificationService.info(localize('removeRPackage.success', 'Successfully removed R package: {0}', packageName));
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				notificationService.error(localize('removeRPackage.error', 'Failed to remove R package "{0}": {1}', packageName, errorMessage));
				throw error;
			}
		});
	}
});

// Python Packages Actions
registerAction2(class RefreshPythonPackagesAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.environment.refreshPythonPackages',
			title: localize2('erdos.environment.refreshPythonPackages', 'Refresh Python Packages'),
			icon: Codicon.refresh,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ERDOS_PYTHON_PACKAGES_VIEW_ID),
				group: 'navigation',
				order: 1
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const environmentService = accessor.get(IErdosEnvironmentService);
		const progressService = accessor.get(IProgressService);
		
		return progressService.withProgress({
			location: ProgressLocation.Window,
			title: localize('refreshingPythonPackages', 'Refreshing Python packages...')
		}, async () => {
			await environmentService.refreshPythonPackages();
			
			const view = viewsService.getViewWithId(ERDOS_PYTHON_PACKAGES_VIEW_ID);
			if (view && view instanceof PythonPackagesView) {
				await view.refresh();
			}
		});
	}
});

registerAction2(class InstallPythonPackageAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.environment.installPythonPackage',
			title: localize2('erdos.environment.installPythonPackage', 'Install Python Package'),
			icon: Codicon.add,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ERDOS_PYTHON_PACKAGES_VIEW_ID),
				group: 'navigation',
				order: 2
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const environmentService = accessor.get(IErdosEnvironmentService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const progressService = accessor.get(IProgressService);
		const viewsService = accessor.get(IViewsService);
		
		const packageName = await quickInputService.input({
			prompt: localize('installPythonPackage.prompt', 'Enter Python package name to install'),
			placeHolder: localize('installPythonPackage.placeholder', 'Package name (e.g., numpy, pandas==1.5.0)')
		});
		
		if (!packageName) {
			return;
		}
		
		return progressService.withProgress({
			location: ProgressLocation.Notification,
			title: localize('installingPythonPackage', 'Installing Python package: {0}', packageName),
			cancellable: false
		}, async (progress) => {
			try {
				progress.report({ increment: 10, message: localize('startingInstallation', 'Starting installation...') });
				
				await environmentService.installPythonPackage(packageName);
				
				progress.report({ increment: 70, message: localize('refreshingPackageList', 'Refreshing package list...') });
				
				// Refresh the view
				const view = viewsService.getViewWithId(ERDOS_PYTHON_PACKAGES_VIEW_ID);
				if (view && view instanceof PythonPackagesView) {
					await view.refresh();
				}
				
				progress.report({ increment: 20, message: localize('installationComplete', 'Installation complete!') });
				
				notificationService.info(localize('installPythonPackage.success', 'Successfully installed Python package: {0}', packageName));
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				notificationService.error(localize('installPythonPackage.error', 'Failed to install Python package "{0}": {1}', packageName, errorMessage));
				throw error;
			}
		});
	}
});

registerAction2(class UninstallPythonPackageAction extends Action2 {
	constructor() {
		super({
			id: 'erdos.environment.uninstallPythonPackage',
			title: localize2('erdos.environment.uninstallPythonPackage', 'Uninstall Python Package'),
			icon: Codicon.trash,
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', ERDOS_PYTHON_PACKAGES_VIEW_ID),
				group: 'navigation',
				order: 3
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const environmentService = accessor.get(IErdosEnvironmentService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const progressService = accessor.get(IProgressService);
		const viewsService = accessor.get(IViewsService);
		
		// Get current packages to show as options
		const packages = await environmentService.getPythonPackages();
		
		if (packages.length === 0) {
			notificationService.info(localize('noPythonPackagesToUninstall', 'No Python packages available to uninstall.'));
			return;
		}
		
		// Create quick pick items for packages
		const packageItems: IQuickPickItem[] = packages.map(pkg => ({
			id: pkg.name,
			label: pkg.name,
			description: `v${pkg.version}`,
			detail: pkg.description || pkg.location || undefined
		}));
		
		const selectedPackage = await quickInputService.pick(packageItems, {
			placeHolder: localize('selectPythonPackageToUninstall', 'Select Python package to uninstall'),
			matchOnDescription: true,
			matchOnDetail: true
		});
		
		if (!selectedPackage) {
			return;
		}
		
		const packageName = selectedPackage.id!;
		
		return progressService.withProgress({
			location: ProgressLocation.Notification,
			title: localize('uninstallingPythonPackage', 'Uninstalling Python package: {0}', packageName),
			cancellable: false
		}, async (progress) => {
			try {
				progress.report({ increment: 10, message: localize('startingUninstallation', 'Starting uninstallation...') });
				
				await environmentService.uninstallPythonPackage(packageName);
				
				progress.report({ increment: 70, message: localize('refreshingPackageList', 'Refreshing package list...') });
				
				// Refresh the view
				const view = viewsService.getViewWithId(ERDOS_PYTHON_PACKAGES_VIEW_ID);
				if (view && view instanceof PythonPackagesView) {
					await view.refresh();
				}
				
				progress.report({ increment: 20, message: localize('uninstallationComplete', 'Uninstallation complete!') });
				
				notificationService.info(localize('uninstallPythonPackage.success', 'Successfully uninstalled Python package: {0}', packageName));
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				notificationService.error(localize('uninstallPythonPackage.error', 'Failed to uninstall Python package "{0}": {1}', packageName, errorMessage));
				throw error;
			}
		});
	}
});
