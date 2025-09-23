/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useCallback } from 'react';
import { IPythonPackage, IRPackage } from '../../common/environmentTypes.js';

export interface PackageListProps {
	packages: (IPythonPackage | IRPackage)[];
	type: 'python' | 'r';
	onRefresh?: () => void;
	onInstall?: (packageName: string) => Promise<void>;
	onUninstall?: (packageName: string) => Promise<void>;
	isLoading?: boolean;
	hasActiveRuntime?: boolean;
}

export const PackageList: React.FC<PackageListProps> = ({ 
	packages, 
	type,
	onRefresh,
	onInstall,
	onUninstall,
	isLoading = false,
	hasActiveRuntime = true
}) => {
	const [searchTerm, setSearchTerm] = useState('');
	const [installPackageName, setInstallPackageName] = useState('');
	const [isInstalling, setIsInstalling] = useState(false);
	const [uninstallingPackage, setUninstallingPackage] = useState<string | null>(null);
	const [sortBy, setSortBy] = useState<'name' | 'version'>('name');
	const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
	
	// Filter packages based on search term
	const filteredPackages = packages.filter(pkg => 
		pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
		(pkg.description && pkg.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
		pkg.version.toLowerCase().includes(searchTerm.toLowerCase())
	);

	// Sort packages
	const sortedPackages = [...filteredPackages].sort((a, b) => {
		let compareValue = 0;
		
		if (sortBy === 'name') {
			compareValue = a.name.localeCompare(b.name);
		} else if (sortBy === 'version') {
			compareValue = a.version.localeCompare(b.version);
		}
		
		return sortOrder === 'asc' ? compareValue : -compareValue;
	});

	// Handle search input change
	const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setSearchTerm(event.target.value);
	}, []);

	// Clear search
	const handleClearSearch = useCallback(() => {
		setSearchTerm('');
	}, []);

	// Handle refresh
	const handleRefresh = useCallback(() => {
		onRefresh?.();
	}, [onRefresh]);

	// Handle install package
	const handleInstallPackage = useCallback(async () => {
		if (!installPackageName.trim() || isInstalling || !onInstall) {
			return;
		}

		setIsInstalling(true);
		try {
			await onInstall(installPackageName.trim());
			setInstallPackageName('');
		} catch (error) {
			console.error('Failed to install package:', error);
		} finally {
			setIsInstalling(false);
		}
	}, [installPackageName, isInstalling, onInstall]);

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

	// Handle install input key press
	const handleInstallKeyPress = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			handleInstallPackage();
		}
	}, [handleInstallPackage]);

	// Handle sort change
	const handleSortChange = useCallback((newSortBy: 'name' | 'version') => {
		if (sortBy === newSortBy) {
			setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
		} else {
			setSortBy(newSortBy);
			setSortOrder('asc');
		}
	}, [sortBy, sortOrder]);

	// Get package type icon
	const getPackageTypeIcon = (pkg: IPythonPackage | IRPackage): string => {
		if (type === 'python') {
			const pythonPkg = pkg as IPythonPackage;
			if (pythonPkg.editable) {
				return 'codicon codicon-edit';
			}
		} else if (type === 'r') {
			const rPkg = pkg as IRPackage;
			if (rPkg.isLoaded) {
				return 'codicon codicon-check-all';
			}
		}
		return 'codicon codicon-package';
	};

	// Get sort icon
	const getSortIcon = (column: 'name' | 'version'): string => {
		if (sortBy !== column) {
			return 'codicon codicon-chevron-down';
		}
		return sortOrder === 'asc' ? 'codicon codicon-chevron-up' : 'codicon codicon-chevron-down';
	};

	// Check if package is R and loaded
	const isRPackageLoaded = (pkg: IPythonPackage | IRPackage): boolean => {
		return type === 'r' && 'isLoaded' in pkg && pkg.isLoaded;
	};

	// Check if package is Python and editable
	const isPythonPackageEditable = (pkg: IPythonPackage | IRPackage): boolean => {
		return type === 'python' && 'editable' in pkg && (pkg.editable === true);
	};

	return (
		<div className="package-list">
			{/* No runtime message */}
			{!hasActiveRuntime ? (
				<div className="no-runtime">
					<span className="codicon codicon-info"></span>
					No active {type} runtime
				</div>
			) : (
				<>
					{/* Toolbar */}
					<div className="package-toolbar">
						<div className="search-container">
							<input
								type="text"
								className="package-search"
								placeholder={`Search ${type} packages...`}
								value={searchTerm}
								onChange={handleSearchChange}
							/>
							{searchTerm && (
								<button 
									className="clear-search-button codicon codicon-close"
									onClick={handleClearSearch}
									title="Clear search"
								/>
							)}
						</div>
						<button 
							className="refresh-button codicon codicon-refresh"
							onClick={handleRefresh}
							disabled={isLoading}
							title="Refresh Packages"
						/>
					</div>

					{/* Install package section */}
					<div className="install-package">
						<div className="install-input-container">
							<input
								type="text"
								className="install-input"
								placeholder={`Package name to install (e.g., ${type === 'python' ? 'numpy' : 'ggplot2'})`}
								value={installPackageName}
								onChange={(e) => setInstallPackageName(e.target.value)}
								onKeyDown={handleInstallKeyPress}
								disabled={isInstalling}
							/>
							<button 
								className="install-button"
								onClick={handleInstallPackage}
								disabled={!installPackageName.trim() || isInstalling}
								title={`Install ${type} package`}
							>
								{isInstalling ? (
									<>
										<span className="codicon codicon-loading codicon-modifier-spin"></span>
										Installing...
									</>
								) : (
									<>
										<span className="codicon codicon-add"></span>
										Install
									</>
								)}
							</button>
						</div>
					</div>

					{/* Package count and sort controls */}
					<div className="package-controls">
						<div className="package-count">
							{sortedPackages.length} of {packages.length} package{packages.length !== 1 ? 's' : ''}
							{isLoading && <span className="loading-indicator"> (Loading...)</span>}
						</div>
						<div className="sort-controls">
							<button 
								className={`sort-button ${sortBy === 'name' ? 'active' : ''}`}
								onClick={() => handleSortChange('name')}
								title="Sort by name"
							>
								Name <span className={getSortIcon('name')}></span>
							</button>
							<button 
								className={`sort-button ${sortBy === 'version' ? 'active' : ''}`}
								onClick={() => handleSortChange('version')}
								title="Sort by version"
							>
								Version <span className={getSortIcon('version')}></span>
							</button>
						</div>
					</div>

					{/* Package items */}
					<div className="package-items">
						{sortedPackages.length === 0 ? (
							<div className="no-packages">
								{packages.length === 0 ? (
									isLoading ? (
										<div className="loading-message">
											<span className="codicon codicon-loading codicon-modifier-spin"></span>
											Loading packages...
										</div>
									) : (
										<div className="empty-message">
											<span className="codicon codicon-info"></span>
											No {type} packages found
										</div>
									)
								) : (
									<div className="no-results-message">
										<span className="codicon codicon-search"></span>
										No packages match your search
									</div>
								)}
							</div>
						) : (
							sortedPackages.map(pkg => (
								<div 
									key={pkg.name}
									className={`package-item ${isRPackageLoaded(pkg) ? 'loaded' : ''} ${isPythonPackageEditable(pkg) ? 'editable' : ''}`}
								>
									<div className="package-info">
										<div className="package-header">
											<span className={getPackageTypeIcon(pkg)} />
											<div className="package-name">{pkg.name}</div>
											<div className="package-version">v{pkg.version}</div>
											<div className="package-badges">
												{isRPackageLoaded(pkg) && (
													<span className="badge loaded-badge" title="Package is loaded">
														<span className="codicon codicon-check"></span>
														Loaded
													</span>
												)}
												{isPythonPackageEditable(pkg) && (
													<span className="badge editable-badge" title="Editable package">
														<span className="codicon codicon-edit"></span>
														Editable
													</span>
												)}
												{type === 'r' && 'priority' in pkg && pkg.priority && (
													<span className="badge priority-badge" title={`Priority: ${pkg.priority}`}>
														{pkg.priority}
													</span>
												)}
											</div>
										</div>
										
										{pkg.description && (
											<div className="package-description" title={pkg.description}>
												{pkg.description}
											</div>
										)}
										
										{type === 'python' && 'location' in pkg && pkg.location && (
											<div className="package-location" title={pkg.location}>
												<span className="codicon codicon-folder"></span>
												{pkg.location}
											</div>
										)}
										
										{type === 'r' && 'depends' in pkg && pkg.depends && pkg.depends.length > 0 && (
											<div className="package-dependencies">
												<span className="codicon codicon-references"></span>
												Depends: {pkg.depends.join(', ')}
											</div>
										)}
									</div>
									
									<div className="package-actions">
										<button
											className="uninstall-button codicon codicon-trash"
											onClick={() => handleUninstallPackage(pkg.name)}
											disabled={uninstallingPackage === pkg.name}
											title={`${type === 'python' ? 'Uninstall' : 'Remove'} package`}
										>
											{uninstallingPackage === pkg.name && (
												<span className="codicon codicon-loading codicon-modifier-spin"></span>
											)}
										</button>
									</div>
								</div>
							))
						)}
					</div>
				</>
			)}
		</div>
	);
};

