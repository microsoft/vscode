/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IErdosPlotsService } from '../../common/erdosPlotsService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { decodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { StaticPlotInstance } from '../../common/erdosPlotsService.js';
import { PlotClientInstance } from '../../../../services/languageRuntime/common/languageRuntimePlotClient.js';
import { AbstractWebviewClient } from '../clients/base/abstractWebviewClient.js';

/**
 * Navigate to the plot preceding the current selection.
 */
export async function executePreviousPlotNavigation(accessor: ServicesAccessor): Promise<void> {
	const orchestrator = accessor.get(IErdosPlotsService);
	const clientCollection = orchestrator.allPlots;
	const currentPosition = clientCollection.findIndex(c => c.id === orchestrator.activePlotId);
	if (currentPosition > 0) {
		orchestrator.activatePreviousPlot();
	}
}

/**
 * Navigate to the plot following the current selection.
 */
export async function executeNextPlotNavigation(accessor: ServicesAccessor): Promise<void> {
	const orchestrator = accessor.get(IErdosPlotsService);
	const clientCollection = orchestrator.allPlots;
	const currentPosition = clientCollection.findIndex(c => c.id === orchestrator.activePlotId);
	if (currentPosition < clientCollection.length - 1) {
		orchestrator.activateNextPlot();
	}
}

/**
 * Duplicate the currently selected plot to the system clipboard.
 */
export async function executeCurrentPlotCopy(accessor: ServicesAccessor): Promise<void> {
	const orchestrator = accessor.get(IErdosPlotsService);
	const notifier = accessor.get(INotificationService);

	const activeIdentifier = orchestrator.activePlotId;
	if (!activeIdentifier) {
		notifier.notify({
			severity: Severity.Info,
			message: localize('erdos.copyPlot.noSelection', "No plot selected to copy."),
			sticky: false
		});
		return;
	}

	try {
		const targetClient = orchestrator.allPlots.find(client => client.id === activeIdentifier);
		if (!targetClient) {
			throw new Error('Selected plot not found');
		}

	let imageDataUri: string | undefined;
	if (targetClient instanceof StaticPlotInstance) {
		imageDataUri = targetClient.dataUri;
	} else if (targetClient instanceof PlotClientInstance) {
		imageDataUri = targetClient.lastRender?.uri;
	}

		if (!imageDataUri) {
			throw new Error('Plot image not available');
		}

		const clipboardManager = accessor.get(IClipboardService);
		await clipboardManager.writeImage(imageDataUri);

		notifier.notify({
			severity: Severity.Info,
			message: localize('erdos.copyPlot.success', "Plot copied to clipboard."),
			sticky: false
		});
	} catch (error) {
		notifier.notify({
			severity: Severity.Error,
			message: localize('erdos.copyPlot.error', "Failed to copy plot: {0}", String(error)),
			sticky: false
		});
	}
}

/**
 * Export the currently selected plot to a file on disk.
 */
export async function executeCurrentPlotSave(accessor: ServicesAccessor): Promise<void> {
	const orchestrator = accessor.get(IErdosPlotsService);
	const dialogService = accessor.get(IFileDialogService);
	const notifier = accessor.get(INotificationService);
	const fileManager = accessor.get(IFileService);

	const activeIdentifier = orchestrator.activePlotId;
	if (!activeIdentifier) {
		notifier.notify({
			severity: Severity.Info,
			message: localize('erdos.savePlot.noSelection', "No plot selected to save."),
			sticky: false
		});
		return;
	}

	const targetClient = orchestrator.allPlots.find(c => c.id === activeIdentifier);
	if (!targetClient) {
		notifier.notify({
			severity: Severity.Error,
			message: localize('erdos.savePlot.notFound', "Selected plot not found."),
			sticky: false
		});
		return;
	}

	try {
		const destination = await dialogService.showSaveDialog({
			title: localize('erdos.savePlot.title', "Save Plot"),
			filters: [
				{ name: 'PNG Images', extensions: ['png'] },
				{ name: 'SVG Images', extensions: ['svg'] },
				{ name: 'PDF Documents', extensions: ['pdf'] },
				{ name: 'All Files', extensions: ['*'] }
			]
		});

		if (destination) {
		let dataUri: string | undefined;
		let contentBuffer: VSBuffer;

			if (targetClient instanceof StaticPlotInstance) {
				dataUri = targetClient.dataUri;
			} else if (targetClient instanceof PlotClientInstance) {
				if (targetClient.lastRender && targetClient.lastRender.uri) {
					dataUri = targetClient.lastRender.uri;
				} else {
					notifier.notify({
						severity: Severity.Warning,
						message: localize('erdos.savePlot.notRendered', "This dynamic plot has not been rendered yet. Please wait for the plot to display, then try saving again."),
						sticky: false
					});
					return;
				}
			} else if (targetClient instanceof AbstractWebviewClient) {
				dataUri = targetClient.snapshotImageUri;
				if (!dataUri) {
					notifier.notify({
						severity: Severity.Warning,
						message: localize('erdos.savePlot.webviewNotReady', "This interactive plot has not been rendered yet. Please wait for the plot to display, then try saving again."),
						sticky: false
					});
					return;
				}
			} else {
				notifier.notify({
					severity: Severity.Warning,
					message: localize('erdos.savePlot.unsupportedType', "This plot type cannot be saved directly."),
					sticky: false
				});
				return;
			}

			if (dataUri.startsWith('data:image/svg+xml;utf8,')) {
				const svgExtraction = dataUri.match(/^data:image\/svg\+xml;utf8,(.+)$/);
				if (svgExtraction) {
					const decodedSvg = decodeURIComponent(svgExtraction[1]);
					contentBuffer = VSBuffer.fromString(decodedSvg);
				} else {
					throw new Error('Invalid SVG data URI format');
				}
			} else {
				const base64Extraction = dataUri.match(/^data:[^;]+;base64,(.+)$/);
				if (base64Extraction) {
					contentBuffer = decodeBase64(base64Extraction[1]);
				} else {
					throw new Error('Invalid base64 data URI format');
				}
			}

			await fileManager.writeFile(destination, contentBuffer);

			notifier.notify({
				severity: Severity.Info,
				message: localize('erdos.savePlot.success', "Plot saved to {0}.", destination.fsPath),
				sticky: false
			});
		}
	} catch (error) {
		notifier.notify({
			severity: Severity.Error,
			message: localize('erdos.savePlot.error', "Failed to save plot: {0}", String(error)),
			sticky: false
		});
	}
}

/**
 * Remove the currently selected plot from the display.
 */
export async function executeCurrentPlotClear(accessor: ServicesAccessor): Promise<void> {
	const orchestrator = accessor.get(IErdosPlotsService);
	const notifier = accessor.get(INotificationService);

	const activeIdentifier = orchestrator.activePlotId;
	if (!activeIdentifier) {
		notifier.notify({
			severity: Severity.Info,
			message: localize('erdos.clearPlot.noSelection', "No plot selected to clear."),
			sticky: false
		});
		return;
	}

	const clientCollection = orchestrator.allPlots;
	if (clientCollection.length > 1) {
		const currentPosition = clientCollection.findIndex(c => c.id === activeIdentifier);
		if (currentPosition !== -1) {
			if (currentPosition < clientCollection.length - 1) {
				orchestrator.activatePlot(clientCollection[currentPosition + 1].id);
			} else if (currentPosition > 0) {
				orchestrator.activatePlot(clientCollection[currentPosition - 1].id);
			}
		}
	}

	orchestrator.deletePlot(activeIdentifier);
}

/**
 * Placeholder for plot selector action (UI handled in React).
 */
export async function executePlotSelectorAction(accessor: ServicesAccessor): Promise<void> {
	// React component handles all interaction
}

