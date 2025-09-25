/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { IPythonPackage, IRPackage } from '../../common/environmentTypes.js';

export interface PackageListProps {
	packages: (IPythonPackage | IRPackage)[];
	type: 'python' | 'r';
	isLoading?: boolean;
	hasActiveRuntime?: boolean;
	onRefresh?: () => void;
	onUninstall?: (packageName: string) => Promise<void>;
	onInstall?: () => void;
}

export const PackageList: React.FC<PackageListProps> = ({ 
	packages, 
	type,
	isLoading = false,
	hasActiveRuntime = true,
	onRefresh,
	onUninstall,
	onInstall
}) => {
	const [searchTerm, setSearchTerm] = useState('');
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
	const [uninstallingPackage, setUninstallingPackage] = useState<string | null>(null);
	
	// Column width state for resizable columns (using percentages)
	const [columnWidths, setColumnWidths] = useState<{[key: string]: string}>({
		name: '55%',
		version: '25%',
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

	// Filter packages based on search term
	const filteredPackages = useMemo(() => {
		if (!searchTerm.trim()) {
			return packages;
		}
		
		const searchLower = searchTerm.toLowerCase();
		return packages.filter(pkg => 
			pkg.name.toLowerCase().includes(searchLower) ||
			(pkg.description && pkg.description.toLowerCase().includes(searchLower))
		);
	}, [packages, searchTerm]);

	// Sort packages by name only
	const sortedPackages = useMemo(() => {
		return [...filteredPackages].sort((a, b) => {
			const compareValue = a.name.localeCompare(b.name);
			return sortDirection === 'asc' ? compareValue : -compareValue;
		});
	}, [filteredPackages, sortDirection]);

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

	// Handle uninstall package
	const handleUninstallPackage = useCallback(async (packageName: string) => {
		if (uninstallingPackage || !onUninstall) {
			return;
		}

		setUninstallingPackage(packageName);
		try {
			await onUninstall(packageName);
		} catch (error) {
			console.error('Failed to uninstall package:', error);
		} finally {
			setUninstallingPackage(null);
		}
	}, [uninstallingPackage, onUninstall]);

	// Get sort indicator for name column
	const getSortIndicator = () => {
		return (
			<div className="sort-indicators">
				<i className={`codicon codicon-chevron-up sort-chevron ${sortDirection === 'asc' ? 'active' : 'hidden'}`}></i>
				<i className={`codicon codicon-chevron-down sort-chevron ${sortDirection === 'desc' ? 'active' : 'hidden'}`}></i>
			</div>
		);
	};

	if (!hasActiveRuntime) {
		return (
			<div className="empty-state-container">
				<div className="empty-state">
					<div className="empty-state-icon codicon codicon-package"></div>
					<div className="empty-state-title">No Active {type === 'python' ? 'Python' : 'R'} Runtime</div>
					<div className="empty-state-description">Start a {type} session to view installed packages</div>
				</div>
			</div>
		);
	}

	return (
		<div className="package-list-container">
			{/* Search Bar with Toolbar Buttons */}
			<div className="table-actions-toolbar">
				<div className="toolbar-left">
					<input
						type="text"
						className="search-input"
						placeholder={`Search ${type} packages...`}
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
							title={`Refresh ${type} packages`}
						>
							<i className="codicon codicon-refresh"></i>
						</button>
					)}
					{onInstall && (
						<button 
							className="btn btn-icon"
							onClick={onInstall}
							disabled={isLoading}
							title={`Install ${type} package`}
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
						Loading packages...
					</div>
				) : sortedPackages.length === 0 ? (
					packages.length === 0 ? (
						<div className="empty-state">
							<i className="codicon codicon-info"></i>
							<p>No {type} packages found</p>
						</div>
					) : (
						<div className="empty-state">
							<i className="codicon codicon-search"></i>
							<p>No packages match your search</p>
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
								<th className="column-header version-column" style={{ width: columnWidths.version, position: 'relative' }}>
									<div className="column-header-content">
										<span className="column-name">Version</span>
									</div>
									<div 
										className="column-resize-handle"
										onMouseDown={(e) => handleResizeStart('version', e)}
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
							{sortedPackages.map((pkg) => (
								<tr key={pkg.name}>
									<td className="data-cell name-cell" style={{ width: columnWidths.name }}>
										{pkg.name}
									</td>
									<td className="data-cell version-cell" style={{ width: columnWidths.version }}>
										{pkg.version}
									</td>
									<td className="data-cell actions-cell" style={{ width: columnWidths.actions }}>
										{onUninstall && (
											<button
												className="uninstall-button codicon codicon-trash"
												onClick={() => handleUninstallPackage(pkg.name)}
												disabled={uninstallingPackage === pkg.name}
												title={`Uninstall ${pkg.name}`}
											>
												{uninstallingPackage === pkg.name && (
													<i className="codicon codicon-sync codicon-modifier-spin"></i>
												)}
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>

			{/* Package Count */}
			{!isLoading && packages.length > 0 && (
				<div className="results-info-toolbar">
					<div className="toolbar-right">
						<span>{sortedPackages.length} of {packages.length} package{packages.length !== 1 ? 's' : ''}</span>
					</div>
				</div>
			)}
		</div>
	);
};