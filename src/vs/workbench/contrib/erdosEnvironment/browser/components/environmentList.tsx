/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { IPythonEnvironment, PythonEnvironmentType } from '../../common/environmentTypes.js';

export interface EnvironmentListProps {
	environments: IPythonEnvironment[];
	onEnvironmentSelect?: (environment: IPythonEnvironment) => void;
	onSwitchEnvironment?: (environment: IPythonEnvironment) => Promise<void>;
	onRefresh?: () => void;
	onAddEnvironment?: () => void;
	isLoading?: boolean;
}

export const EnvironmentList: React.FC<EnvironmentListProps> = ({ 
	environments, 
	onEnvironmentSelect,
	onSwitchEnvironment,
	onRefresh,
	onAddEnvironment,
	isLoading = false
}) => {
	const [searchTerm, setSearchTerm] = useState('');
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
	const [switchingEnvironment, setSwitchingEnvironment] = useState<string | null>(null);
	
	// Column width state for resizable columns (using percentages)
	const [columnWidths, setColumnWidths] = useState<{[key: string]: string}>({
		name: '30%',
		type: '15%',
		version: '15%',
		location: '20%',
		actions: '20%'
	});
	
	// Resize state
	const [isResizing, setIsResizing] = useState<{
		column: string | null;
		startX: number;
		startWidth: number;
		containerWidth: number;
	}>({
		column: null,
		startX: 0,
		startWidth: 0,
		containerWidth: 800
	});

	// Filter environments based on search term
	const filteredEnvironments = useMemo(() => {
		if (!searchTerm.trim()) {
			return environments;
		}
		
		const searchLower = searchTerm.toLowerCase();
		return environments.filter(env => 
			env.name.toLowerCase().includes(searchLower) ||
			env.type.toLowerCase().includes(searchLower) ||
			env.version.toLowerCase().includes(searchLower) ||
			env.path.toLowerCase().includes(searchLower)
		);
	}, [environments, searchTerm]);

	// Sort environments by name
	const sortedEnvironments = useMemo(() => {
		return [...filteredEnvironments].sort((a, b) => {
			const compareValue = a.name.localeCompare(b.name);
			return sortDirection === 'asc' ? compareValue : -compareValue;
		});
	}, [filteredEnvironments, sortDirection]);

	// Handle search input change
	const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setSearchTerm(event.target.value);
	}, []);

	// Handle name column click for sorting
	const handleSort = useCallback(() => {
		setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
	}, [sortDirection]);

	// Resize handlers
	const handleResizeStart = useCallback((column: string, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		
		// Get the table container width for percentage calculations
		const table = e.currentTarget.closest('table');
		const containerWidth = table?.parentElement?.clientWidth || 800;
		
		// Convert current percentage to pixels for calculation
		const currentPercentage = parseFloat(columnWidths[column]) || 15;
		const startWidth = (currentPercentage / 100) * containerWidth;
		
		setIsResizing({
			column,
			startX: e.clientX,
			startWidth,
			containerWidth
		});
	}, [columnWidths]);

	const handleResizeMove = useCallback((e: MouseEvent) => {
		if (!isResizing.column) return;
		
		e.preventDefault();
		const deltaX = e.clientX - isResizing.startX;
		const newWidthPx = Math.max(50, isResizing.startWidth + deltaX);
		
		// Convert back to percentage
		const newWidthPercent = Math.max(5, Math.min(80, (newWidthPx / isResizing.containerWidth) * 100));
		
		setColumnWidths(prev => ({
			...prev,
			[isResizing.column!]: `${newWidthPercent.toFixed(1)}%`
		}));
	}, [isResizing]);

	const handleResizeEnd = useCallback(() => {
		setIsResizing({
			column: null,
			startX: 0,
			startWidth: 0,
			containerWidth: 800
		});
	}, []);

	// Mouse event listeners for resizing
	useEffect(() => {
		if (isResizing.column) {
			document.addEventListener('mousemove', handleResizeMove);
			document.addEventListener('mouseup', handleResizeEnd);
			
			return () => {
				document.removeEventListener('mousemove', handleResizeMove);
				document.removeEventListener('mouseup', handleResizeEnd);
			};
		}
		return undefined;
	}, [isResizing.column, handleResizeMove, handleResizeEnd]);

	// Handle environment selection
	const handleEnvironmentClick = useCallback((environment: IPythonEnvironment) => {
		onEnvironmentSelect?.(environment);
	}, [onEnvironmentSelect]);

	// Handle environment switching
	const handleSwitchEnvironment = useCallback(async (environment: IPythonEnvironment, event: React.MouseEvent) => {
		event.stopPropagation(); // Prevent row click from triggering
		
		if (switchingEnvironment || !onSwitchEnvironment || environment.isActive) {
			return;
		}

		const envId = environment.runtimeId || environment.path;
		
		setSwitchingEnvironment(envId);
		await onSwitchEnvironment(environment);
		setSwitchingEnvironment(null);
	}, [switchingEnvironment, onSwitchEnvironment]);

	// Get sort indicator for name column
	const getSortIndicator = () => {
		return (
			<div className="sort-indicators">
				<i className={`codicon codicon-chevron-up sort-chevron ${sortDirection === 'asc' ? 'active' : 'hidden'}`}></i>
				<i className={`codicon codicon-chevron-down sort-chevron ${sortDirection === 'desc' ? 'active' : 'hidden'}`}></i>
			</div>
		);
	};

	// Get user-friendly environment type name
	const getEnvironmentTypeName = (type: PythonEnvironmentType): string => {
		switch (type) {
			case PythonEnvironmentType.Conda:
				return 'Conda';
			case PythonEnvironmentType.VirtualEnv:
				return 'Virtual Environment';
			case PythonEnvironmentType.Unknown:
				return 'Unknown';
			default:
				return type;
		}
	};

	// Get environment display name using actual environment data
	const getEnvironmentDisplayName = (env: IPythonEnvironment): string => {
		// Use the actual environment name if available, otherwise fall back to display name
		return env.name && env.name !== env.displayName ? env.name : env.displayName || `Python ${env.version}`;
	};

	return (
		<div className="environment-list-container">
			{/* Search Bar with Toolbar Buttons */}
			<div className="table-actions-toolbar">
				<div className="toolbar-left">
					<input
						type="text"
						className="search-input"
						placeholder="Search environments..."
						value={searchTerm}
						onChange={handleSearchChange}
						disabled={isLoading}
					/>
				</div>
				<div className="toolbar-right">
					{onRefresh && (
						<button 
							className="btn btn-icon"
							onClick={onRefresh}
							disabled={isLoading}
							title="Refresh environments"
						>
							<i className="codicon codicon-refresh"></i>
						</button>
					)}
					{onAddEnvironment && (
						<button 
							className="btn btn-icon"
							onClick={onAddEnvironment}
							disabled={isLoading}
							title="Add environment"
						>
							<i className="codicon codicon-add"></i>
						</button>
					)}
				</div>
			</div>

			{/* Data Table Container */}
			<div className="data-table-container">
				{isLoading ? (
					<div className="loading-spinner">
						<span className="codicon codicon-sync codicon-modifier-spin"></span>
						Loading environments...
					</div>
				) : sortedEnvironments.length === 0 ? (
					environments.length === 0 ? (
						<div className="empty-state">
							<i className="codicon codicon-info"></i>
							<p>No Python environments found</p>
						</div>
					) : (
						<div className="empty-state">
							<i className="codicon codicon-search"></i>
							<p>No environments match your search</p>
						</div>
					)
				) : (
					<table className="results-table">
						<thead>
							<tr>
								<th 
									className="sortable column-header name-column"
									onClick={handleSort}
									title="Click to sort by name"
									style={{ width: columnWidths.name, position: 'relative' }}
								>
									<div className="column-header-content">
										<span className="column-name">Name</span>
										{getSortIndicator()}
									</div>
									<div 
										className="column-resize-handle"
										onMouseDown={(e) => handleResizeStart('name', e)}
									/>
								</th>
								<th className="column-header type-column" style={{ width: columnWidths.type, position: 'relative' }}>
									<div className="column-header-content">
										<span className="column-name">Type</span>
									</div>
									<div 
										className="column-resize-handle"
										onMouseDown={(e) => handleResizeStart('type', e)}
									/>
								</th>
								<th className="column-header version-column" style={{ width: columnWidths.version, position: 'relative' }}>
									<div className="column-header-content">
										<span className="column-name">Version</span>
									</div>
									<div 
										className="column-resize-handle"
										onMouseDown={(e) => handleResizeStart('version', e)}
									/>
								</th>
								<th className="column-header location-column" style={{ width: columnWidths.location, position: 'relative' }}>
									<div className="column-header-content">
										<span className="column-name">Location</span>
									</div>
									<div 
										className="column-resize-handle"
										onMouseDown={(e) => handleResizeStart('location', e)}
									/>
								</th>
								<th className="column-header actions-column" style={{ width: columnWidths.actions, position: 'relative' }}>
									<div className="column-header-content">
										<span className="column-name">Actions</span>
									</div>
								</th>
							</tr>
						</thead>
						<tbody>
							{sortedEnvironments.map((env) => {
								const envId = env.runtimeId || env.path;
								return (
									<tr key={envId} onClick={() => handleEnvironmentClick(env)} className={env.isActive ? 'active-row' : ''}>
										<td className="data-cell name-cell" style={{ width: columnWidths.name }}>
											<div className="environment-name-cell">
												{getEnvironmentDisplayName(env)}
												{env.isActive && (
													<span className="active-indicator" title="Active Environment">
														<i className="codicon codicon-check"></i>
													</span>
												)}
											</div>
										</td>
										<td className="data-cell type-cell" style={{ width: columnWidths.type }}>
											{getEnvironmentTypeName(env.type)}
										</td>
										<td className="data-cell version-cell" style={{ width: columnWidths.version }}>
											{env.version}
										</td>
										<td className="data-cell location-cell" style={{ width: columnWidths.location }} title={env.environmentPath || env.path}>
											{env.environmentPath || env.path}
										</td>
									<td className="data-cell actions-cell" style={{ width: columnWidths.actions }}>
										{!env.isActive && onSwitchEnvironment && (
											<button
												className={`switch-button codicon ${switchingEnvironment === envId ? 'codicon-sync codicon-modifier-spin' : 'codicon-play'}`}
												onClick={(e) => handleSwitchEnvironment(env, e)}
												disabled={switchingEnvironment !== null}
												title={switchingEnvironment === envId ? 'Switching...' : `Switch to ${getEnvironmentDisplayName(env)}`}
											>
											</button>
										)}
									</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</div>

			{/* Environment Count */}
			{!isLoading && environments.length > 0 && (
				<div className="results-info-toolbar">
					<div className="toolbar-right">
						<span>{sortedEnvironments.length} of {environments.length} environment{environments.length !== 1 ? 's' : ''}</span>
					</div>
				</div>
			)}
		</div>
	);
};

