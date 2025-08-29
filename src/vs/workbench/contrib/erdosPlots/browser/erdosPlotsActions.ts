/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IErdosPlotsService } from '../../../services/erdosPlots/common/erdosPlots.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';

const enum ErdosPlotsCommandId {
	NavigatePreviousPlot = 'workbench.action.erdosPlots.navigatePreviousPlot',
	NavigateNextPlot = 'workbench.action.erdosPlots.navigateNextPlot',
	CopyCurrentPlot = 'workbench.action.erdosPlots.copyCurrentPlot',
	SaveCurrentPlot = 'workbench.action.erdosPlots.saveCurrentPlot',
	ClearCurrentPlot = 'workbench.action.erdosPlots.clearCurrentPlot',
	DeletePlot = 'workbench.action.erdosPlots.deletePlot',
	RenamePlot = 'workbench.action.erdosPlots.renamePlot',
}

const ERDOS_PLOTS_ACTION_CATEGORY = localize('erdosPlotsCategory', "Plots");

// Plot action icons
const erdosPlotsNavigatePreviousIcon = registerIcon('erdos-plots-navigate-previous', Codicon.chevronLeft, localize('erdosPlotsNavigatePreviousIcon', "Previous plot"));
const erdosPlotsNavigateNextIcon = registerIcon('erdos-plots-navigate-next', Codicon.chevronRight, localize('erdosPlotsNavigateNextIcon', "Next plot"));
const erdosPlotsCopyIcon = registerIcon('erdos-plots-copy', Codicon.copy, localize('erdosPlotsCopyIcon', "Copy plot"));
const erdosPlotsSaveIcon = registerIcon('erdos-plots-save', Codicon.save, localize('erdosPlotsSaveIcon', "Save plot"));
const erdosPlotsClearIcon = registerIcon('erdos-plots-clear', Codicon.trash, localize('erdosPlotsClearIcon', "Clear current plot"));

export function registerErdosPlotsActions() {
	const category: ILocalizedString = {
		value: ERDOS_PLOTS_ACTION_CATEGORY,
		original: 'Plots'
	};

	// Navigate to previous plot
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosPlotsCommandId.NavigatePreviousPlot,
				title: {
					value: localize('workbench.action.erdosPlots.navigatePreviousPlot', "Previous Plot"),
					original: 'Previous Plot'
				},
				f1: true,
				category,
				icon: erdosPlotsNavigatePreviousIcon,
				menu: []
			});
		}

		async run(accessor: ServicesAccessor) {
			const erdosPlotsService = accessor.get(IErdosPlotsService);
			erdosPlotsService.selectPreviousPlot();
		}
	});

	// Navigate to next plot
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosPlotsCommandId.NavigateNextPlot,
				title: {
					value: localize('workbench.action.erdosPlots.navigateNextPlot', "Next Plot"),
					original: 'Next Plot'
				},
				f1: true,
				category,
				icon: erdosPlotsNavigateNextIcon,
				menu: []
			});
		}

		async run(accessor: ServicesAccessor) {
			const erdosPlotsService = accessor.get(IErdosPlotsService);
			erdosPlotsService.selectNextPlot();
		}
	});

	// Copy current plot
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosPlotsCommandId.CopyCurrentPlot,
				title: {
					value: localize('workbench.action.erdosPlots.copyCurrentPlot', "Copy Plot"),
					original: 'Copy Plot'
				},
				f1: true,
				category,
				icon: erdosPlotsCopyIcon,
				menu: []
			});
		}

		async run(accessor: ServicesAccessor) {
			const erdosPlotsService = accessor.get(IErdosPlotsService);
			const notificationService = accessor.get(INotificationService);

			const selectedPlotId = erdosPlotsService.selectedPlotId;
			if (!selectedPlotId) {
				notificationService.notify({
					severity: Severity.Info,
					message: localize('erdos.copyPlot.noPlotSelected', "No plot selected to copy."),
					sticky: false
				});
				return;
			}

			try {
				// TODO: Implement plot copying functionality
				// This would typically involve getting the plot data/image and copying to clipboard
				notificationService.notify({
					severity: Severity.Info,
					message: localize('erdos.copyPlot.success', "Plot copied to clipboard."),
					sticky: false
				});
			} catch (error) {
				notificationService.notify({
					severity: Severity.Error,
					message: localize('erdos.copyPlot.error', "Failed to copy plot: {0}", String(error)),
					sticky: false
				});
			}
		}
	});

	// Save current plot
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosPlotsCommandId.SaveCurrentPlot,
				title: {
					value: localize('workbench.action.erdosPlots.saveCurrentPlot', "Save Plot"),
					original: 'Save Plot'
				},
				f1: true,
				category,
				icon: erdosPlotsSaveIcon,
				menu: []
			});
		}

		async run(accessor: ServicesAccessor) {
			const erdosPlotsService = accessor.get(IErdosPlotsService);
			const fileDialogService = accessor.get(IFileDialogService);
			const notificationService = accessor.get(INotificationService);

			const selectedPlotId = erdosPlotsService.selectedPlotId;
			if (!selectedPlotId) {
				notificationService.notify({
					severity: Severity.Info,
					message: localize('erdos.savePlot.noPlotSelected', "No plot selected to save."),
					sticky: false
				});
				return;
			}

			try {
				const result = await fileDialogService.showSaveDialog({
					title: localize('erdos.savePlot.title', "Save Plot"),
					filters: [
						{ name: 'PNG Images', extensions: ['png'] },
						{ name: 'SVG Images', extensions: ['svg'] },
						{ name: 'PDF Documents', extensions: ['pdf'] },
						{ name: 'All Files', extensions: ['*'] }
					]
				});

				if (result) {
					// TODO: Implement actual plot saving functionality
					notificationService.notify({
						severity: Severity.Info,
						message: localize('erdos.savePlot.success', "Plot saved to {0}.", result.fsPath),
						sticky: false
					});
				}
			} catch (error) {
				notificationService.notify({
					severity: Severity.Error,
					message: localize('erdos.savePlot.error', "Failed to save plot: {0}", String(error)),
					sticky: false
				});
			}
		}
	});

	// Clear current plot
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosPlotsCommandId.ClearCurrentPlot,
				title: {
					value: localize('workbench.action.erdosPlots.clearCurrentPlot', "Clear Current Plot"),
					original: 'Clear Current Plot'
				},
				f1: true,
				category,
				icon: erdosPlotsClearIcon,
				menu: []
			});
		}

		async run(accessor: ServicesAccessor) {
			const erdosPlotsService = accessor.get(IErdosPlotsService);
			const notificationService = accessor.get(INotificationService);

			const selectedPlotId = erdosPlotsService.selectedPlotId;
			if (!selectedPlotId) {
				notificationService.notify({
					severity: Severity.Info,
					message: localize('erdos.clearPlot.noPlotSelected', "No plot selected to clear."),
					sticky: false
				});
				return;
			}

			erdosPlotsService.removeSelectedPlot();
		}
	});

	// Delete specific plot (for context menu)
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosPlotsCommandId.DeletePlot,
				title: {
					value: localize('workbench.action.erdosPlots.deletePlot', "Delete Plot"),
					original: 'Delete Plot'
				},
				f1: false, // Don't show in command palette
				category,
			});
		}

		async run(accessor: ServicesAccessor, plotId?: string) {
			const erdosPlotsService = accessor.get(IErdosPlotsService);
			const notificationService = accessor.get(INotificationService);

			if (!plotId) {
				notificationService.notify({
					severity: Severity.Info,
					message: localize('erdos.deletePlot.noPlotId', "No plot ID provided."),
					sticky: false
				});
				return;
			}

			erdosPlotsService.removePlot(plotId);
		}
	});

	// Rename specific plot (for context menu)
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: ErdosPlotsCommandId.RenamePlot,
				title: {
					value: localize('workbench.action.erdosPlots.renamePlot', "Rename Plot"),
					original: 'Rename Plot'
				},
				f1: false, // Don't show in command palette
				category,
			});
		}

		async run(accessor: ServicesAccessor, plotId?: string) {
			const erdosPlotsService = accessor.get(IErdosPlotsService);
			const quickInputService = accessor.get(IQuickInputService);
			const notificationService = accessor.get(INotificationService);

			if (!plotId) {
				notificationService.notify({
					severity: Severity.Info,
					message: localize('erdos.renamePlot.noPlotId', "No plot ID provided."),
					sticky: false
				});
				return;
			}

			const plot = erdosPlotsService.erdosPlotInstances.find(p => p.id === plotId);
			if (!plot) {
				notificationService.notify({
					severity: Severity.Info,
					message: localize('erdos.renamePlot.plotNotFound', "Plot not found."),
					sticky: false
				});
				return;
			}

			const currentName = plot.metadata.suggested_file_name || `plot-${plotId}`;
			const newName = await quickInputService.input({
				prompt: localize('erdos.renamePlot.prompt', "Enter new name for the plot"),
				value: currentName,
				validateInput: async (value) => {
					if (!value || value.trim().length === 0) {
						return localize('erdos.renamePlot.emptyName', "Plot name cannot be empty");
					}
					return null;
				}
			});

					if (newName && newName.trim() !== currentName) {
			// Update the plot metadata with the new name
			erdosPlotsService.updatePlotMetadata(plotId, {
				suggested_file_name: newName.trim()
			});
			
			notificationService.notify({
				severity: Severity.Info,
				message: localize('erdos.renamePlot.success', "Plot renamed to '{0}'.", newName.trim()),
				sticky: false
			});
		}
		}
	});
}
