/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import './plotDropdown.css';

// React.
import React, { useState, useRef, useEffect, useReducer } from 'react';

// Other dependencies.
import { localize } from '../../../../../nls.js';
import { IErdosPlotClient } from '../../../../services/erdosPlots/common/erdosPlots.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

/**
 * PlotDropdownProps interface.
 */
export interface PlotDropdownProps {
	readonly plots: IErdosPlotClient[];
	readonly selectedPlotId: string | undefined;
}

/**
 * Format a plot name based on its metadata.
 * @param plot The plot client instance
 * @returns Formatted plot name
 */
function formatPlotName(plot: IErdosPlotClient): string {
	const metadata = plot.metadata;
	
	// If there's a custom suggested_file_name that doesn't look like a default generated name, use it
	if (metadata.suggested_file_name && 
		!metadata.suggested_file_name.match(/^(plot-\d+|python-plot-\d+|r-plot-\d+)$/)) {
		return metadata.suggested_file_name;
	}
	
	// Otherwise, use the default format with language and timestamp
	const language = metadata.language || 'Unknown';
	
	// Format timestamp if available
	let timeString = '';
	if (metadata.created) {
		try {
			const date = new Date(metadata.created);
			const month = date.toLocaleDateString('en-US', { month: 'short' });
			const day = date.getDate();
			const time = date.toLocaleTimeString('en-US', { 
				hour12: false, 
				hour: '2-digit', 
				minute: '2-digit', 
				second: '2-digit' 
			});
			timeString = ` (${month} ${day} ${time})`;
		} catch {
			// If timestamp parsing fails, use a fallback
			timeString = '';
		}
	}
	
	return `[${language}] plot${timeString}`;
}

/**
 * PlotDropdown component.
 * @param props A PlotDropdownProps that contains the component properties.
 * @returns The rendered component.
 */
export const PlotDropdown = (props: PlotDropdownProps) => {
	// Hooks.
	const services = useErdosReactServicesContext();
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const [, forceUpdate] = useReducer(x => x + 1, 0);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingName, setEditingName] = useState('');

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, []);

	// Listen for plot metadata updates to force re-render
	useEffect(() => {
		const disposable = services.erdosPlotsService.onDidUpdatePlotMetadata(() => {
			forceUpdate(); // Force re-render when any plot metadata changes
		});
		
		return () => disposable.dispose();
	}, [services.erdosPlotsService, forceUpdate]);

	// Get current plot name
	const selectedPlot = props.plots.find(plot => plot.id === props.selectedPlotId);
	const currentPlotName = selectedPlot ? formatPlotName(selectedPlot) : localize('erdos.plots.noPlotSelected', 'No plot selected');

	// Handle plot selection
	const handlePlotSelect = (plotId: string) => {
		services.erdosPlotsService.selectPlot(plotId);
		setIsOpen(false);
	};

	// Handle remove all plots
	const handleRemoveAll = () => {
		services.erdosPlotsService.removeAllPlots();
		setIsOpen(false);
	};

	// Start editing a plot name
	const startEditing = (plot: IErdosPlotClient) => {
		setEditingId(plot.id);
		setEditingName(formatPlotName(plot));
	};

	// Handle rename plot - inline rename
	const handleRename = async (plotId: string, newName: string) => {
		if (newName.trim() && newName !== formatPlotName(props.plots.find(p => p.id === plotId)!)) {
			try {
				// Update plot metadata directly through the service
				services.erdosPlotsService.updatePlotMetadata(plotId, {
					suggested_file_name: newName.trim()
				});
			} catch (error) {
				console.error('Failed to rename plot:', error);
			}
		}
		setEditingId(null);
		setEditingName('');
	};

	// Handle delete plot
	const handleDelete = (plotId: string) => {
		services.erdosPlotsService.removePlot(plotId);
	};

	// Don't render if no plots
	if (props.plots.length === 0) {
		return null;
	}

	return (
		<div className="plot-dropdown" ref={dropdownRef}>
			<button 
				className="plot-dropdown-button"
				onClick={() => setIsOpen(!isOpen)}
				title={localize('erdos.plots.selectPlot', 'Select plot')}
			>
				<span className="plot-dropdown-text">{currentPlotName}</span>
				<span className={`plot-dropdown-chevron ${isOpen ? 'open' : ''}`}>
					▼
				</span>
			</button>
			
			{isOpen && (
				<div className="plot-dropdown-menu">
					<div className="plot-dropdown-list">
						{props.plots.map((plot, index) => (
							<div
								key={plot.id}
								className={`plot-dropdown-item ${plot.id === props.selectedPlotId ? 'selected' : ''}`}
								title={formatPlotName(plot)}
							>
								{editingId === plot.id ? (
									<input
										type="text"
										className="plot-dropdown-edit-input"
										value={editingName}
										onChange={(e) => setEditingName(e.target.value)}
										onBlur={() => handleRename(plot.id, editingName)}
										onKeyDown={(e) => {
											if (e.key === 'Enter') {
												handleRename(plot.id, editingName);
											} else if (e.key === 'Escape') {
												setEditingId(null);
												setEditingName('');
											}
										}}
										autoFocus
									/>
								) : (
									<>
										<div 
											className="plot-dropdown-item-name"
											onClick={() => handlePlotSelect(plot.id)}
										>
											{formatPlotName(plot)}
										</div>
										<div className="plot-dropdown-item-actions">
											<button
												className="plot-dropdown-action-btn"
												onClick={(e) => {
													e.stopPropagation();
													startEditing(plot);
												}}
												title={localize('erdos.plots.rename', 'Rename plot')}
											>
												<span className="codicon codicon-edit"></span>
											</button>
											<button
												className="plot-dropdown-action-btn plot-dropdown-delete-btn"
												onClick={(e) => {
													e.stopPropagation();
													handleDelete(plot.id);
												}}
												title={localize('erdos.plots.delete', 'Delete plot')}
											>
												<span className="codicon codicon-trash"></span>
											</button>
										</div>
									</>
								)}
							</div>
						))}
					</div>
					
					{props.plots.length > 0 && (
						<div className="plot-dropdown-separator"></div>
					)}
					
					<div 
						className="plot-dropdown-remove-all"
						onClick={handleRemoveAll}
						title={localize('erdos.plots.removeAll', 'Remove all plots')}
					>
						{localize('erdos.plots.removeAll', 'Remove all')}
					</div>
				</div>
			)}
		</div>
	);
};
