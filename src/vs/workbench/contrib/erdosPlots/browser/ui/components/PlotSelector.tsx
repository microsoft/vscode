/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import '../styles/plotSelector.css';

// React.
import React, { useState, useRef, useEffect, useCallback } from 'react';

// Other dependencies.
import { localize } from '../../../../../../nls.js';
import { IErdosPlotClient } from '../../../common/erdosPlotsService.js';
import { useErdosReactServicesContext } from '../../../../../../base/browser/erdosReactRendererContext.js';
import { DropdownButton } from '../../../../../../base/browser/ui/erdosComponents/button/dropdownButton.js';

/**
 * Format a plot source name for display (file or console)
 */
function formatPlotName(plot: IErdosPlotClient): string {
	const metadata = plot.metadata;
	
	// If there's a source file, extract and show the filename
	if (metadata.source_file) {
		const fileName = metadata.source_file.split(/[\\/]/).pop() || metadata.source_file;
		return fileName;
	}
	
	// For console executions, include capitalized language name
	if (metadata.language) {
		const capitalizedLanguage = metadata.language.charAt(0).toUpperCase() + metadata.language.slice(1);
		return `${capitalizedLanguage} Console`;
	}
	
	// Fallback to just "Console"
	return localize('plots.console', "Console");
}

/**
 * PlotSelectorInner component - the actual selector UI (requires ActionBarContext)
 */
const PlotSelectorInner: React.FC = () => {
	const services = useErdosReactServicesContext();
	const [isOpen, setIsOpen] = useState(false);
	const [plots, setPlots] = useState(services.erdosPlotsService.allPlots);
	const [selectedPlotId, setSelectedPlotId] = useState(services.erdosPlotsService.activePlotId);
	const [searchQuery, setSearchQuery] = useState('');
	const [filteredPlots, setFilteredPlots] = useState(plots);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Subscribe to plot changes - only set up once
	useEffect(() => {
		const disposables = [
			services.erdosPlotsService.onPlotCreated(() => {
				setPlots([...services.erdosPlotsService.allPlots]);
			}),
			services.erdosPlotsService.onPlotDeleted(() => {
				setPlots([...services.erdosPlotsService.allPlots]);
			}),
			services.erdosPlotsService.onPlotActivated((id: string) => {
				setSelectedPlotId(id);
			})
		];
		
		return () => {
			disposables.forEach((d: { dispose: () => void }) => d.dispose());
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []); // Only run once on mount

	// Filter plots based on search query and sort by most recent first
	useEffect(() => {
		const filtered = plots.filter((plot: IErdosPlotClient) => 
			formatPlotName(plot).toLowerCase().includes(searchQuery.toLowerCase())
		);
		// Sort by created timestamp in reverse order (most recent first)
		const sorted = filtered.sort((a: IErdosPlotClient, b: IErdosPlotClient) => 
			(b.metadata.created || 0) - (a.metadata.created || 0)
		);
		setFilteredPlots(sorted);
	}, [plots, searchQuery]);

	// Click outside handler
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
				buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			const timeoutId = setTimeout(() => {
				document.addEventListener('mousedown', handleClickOutside);
				document.addEventListener('keydown', handleEscape);
			}, 100);

			return () => {
				clearTimeout(timeoutId);
				document.removeEventListener('mousedown', handleClickOutside);
				document.removeEventListener('keydown', handleEscape);
			};
		}

		return undefined;
	}, [isOpen]);

	useEffect(() => {
		if (isOpen && dropdownRef.current && buttonRef.current) {
			const buttonRect = buttonRef.current.getBoundingClientRect();
			const dropdown = dropdownRef.current;

			dropdown.style.position = 'fixed';
			dropdown.style.top = `${buttonRect.bottom + 4}px`;
			dropdown.style.right = '8px';
			dropdown.style.minWidth = `${Math.max(buttonRect.width, 280)}px`;
		}
	}, [isOpen]);

	// ALL useCallback hooks must also be before conditional returns
	const handlePlotSelect = useCallback((plotId: string) => {
		services.erdosPlotsService.activatePlot(plotId);
		setIsOpen(false);
		setSearchQuery('');
	}, [services.erdosPlotsService]);

	const handleDeletePlot = useCallback((plotId: string, event: React.MouseEvent) => {
		event.stopPropagation();
		
		// Find the index of the plot being deleted
		const plotIndex = plots.findIndex((p: IErdosPlotClient) => p.id === plotId);
		
		// If this is the selected plot, navigate to the next or previous plot
		if (plotId === selectedPlotId && plots.length > 1) {
			// Try to select the next plot (after the one being deleted)
			if (plotIndex < plots.length - 1) {
				// There's a plot after this one, select it
				const nextPlotId = plots[plotIndex + 1].id;
				services.erdosPlotsService.activatePlot(nextPlotId);
			} else if (plotIndex > 0) {
				// This is the last plot, select the previous one
				const prevPlotId = plots[plotIndex - 1].id;
				services.erdosPlotsService.activatePlot(prevPlotId);
			}
		}
		
		// Now remove the plot
		services.erdosPlotsService.deletePlot(plotId);
	}, [services.erdosPlotsService, plots, selectedPlotId]);

	const clearAllPlots = useCallback(() => {
		services.erdosPlotsService.deleteAllPlots();
		setIsOpen(false);
		setSearchQuery('');
	}, [services.erdosPlotsService]);
	
	const toggleOpen = useCallback(() => {
		setIsOpen(prev => !prev);
	}, []);

	// NOW we can do conditional logic and early returns
	const selectedPlot = plots.find((p: IErdosPlotClient) => p.id === selectedPlotId);
	const currentPlotName = selectedPlot ? formatPlotName(selectedPlot) : localize('plots.noPlotSelected', "No plot selected");

	if (plots.length === 0) {
		return null;
	}

	return (
		<>
			<DropdownButton
				ref={buttonRef}
				ariaLabel={localize('plots.currentPlot', "Current plot")}
				label={currentPlotName}
				tooltip={localize('plots.plotHistory', "Plot history")}
				dropdownIndicator="enabled"
				onPressed={toggleOpen}
		/>
		{isOpen && (
			<div ref={dropdownRef} className="plot-selector-dropdown">
				<div className="plot-selector-header">
					<input
						type="text"
						className="plot-selector-search"
						placeholder={localize('plots.searchPlaceholder', "Search plots...")}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						autoFocus
					/>
				</div>
				
				<div className="plot-selector-list">
					{filteredPlots.length === 0 ? (
						<div className="plot-selector-item plot-selector-empty">
							{searchQuery ? localize('plots.noMatch', "No plots match your search.") : localize('plots.noPlots', "No plots found.")}
						</div>
					) : (
						filteredPlots.map((plot: IErdosPlotClient) => {
							const displayText = formatPlotName(plot);
							const isCurrentPlot = plot.id === selectedPlotId;
							
						// Format timestamp like conversation history
						const timestamp = plot.metadata?.created || Date.now();
						const dateStr = new Date(timestamp).toLocaleString(undefined, {
								month: 'short',
								day: 'numeric',
								hour: 'numeric',
								minute: '2-digit',
								hour12: true
							});

							return (
								<div
									key={plot.id}
									className={`plot-selector-item ${isCurrentPlot ? 'active' : ''}`}
								>
									<div 
										className="plot-selector-name"
										onClick={() => handlePlotSelect(plot.id)}
									>
										{displayText}
									</div>
									<div className="plot-selector-date">
										{dateStr}
									</div>
									<div className="plot-selector-actions">
										<button
											className="plot-selector-action-btn plot-selector-delete-btn"
											onClick={(e) => handleDeletePlot(plot.id, e)}
											title={localize('plots.delete', "Delete plot")}
										>
											<span className="codicon codicon-trash"></span>
										</button>
									</div>
								</div>
							);
						})
					)}
				</div>
				
				{plots.length > 0 && (
					<div className="plot-selector-footer">
						<button
							className="plot-selector-delete-all-btn"
							onClick={clearAllPlots}
							title={localize('plots.deleteAll', "Delete all plots")}
						>
							{localize('plots.deleteAllButton', "Delete All Plots")}
						</button>
					</div>
				)}
			</div>
		)}
	</>
);
};

/**
 * PlotSelector component
 */
export const PlotSelector: React.FC = React.memo(PlotSelectorInner);

