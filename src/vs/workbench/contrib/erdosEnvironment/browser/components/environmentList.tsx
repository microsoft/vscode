/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useCallback } from 'react';
import { IPythonEnvironment } from '../../common/environmentTypes.js';

export interface EnvironmentListProps {
	environments: IPythonEnvironment[];
	onEnvironmentSelect?: (environment: IPythonEnvironment) => void;
	onRefresh?: () => void;
	isLoading?: boolean;
}

export const EnvironmentList: React.FC<EnvironmentListProps> = ({ 
	environments, 
	onEnvironmentSelect,
	onRefresh,
	isLoading = false
}) => {
	const [searchTerm, setSearchTerm] = useState('');
	const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(null);

	// Filter environments based on search term
	const filteredEnvironments = environments.filter(env => 
		env.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
		env.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
		env.version.toLowerCase().includes(searchTerm.toLowerCase()) ||
		env.path.toLowerCase().includes(searchTerm.toLowerCase())
	);

	// Handle environment selection
	const handleEnvironmentClick = useCallback((environment: IPythonEnvironment) => {
		const envId = environment.runtimeId || environment.path;
		setSelectedEnvironmentId(envId);
		onEnvironmentSelect?.(environment);
	}, [onEnvironmentSelect]);

	// Handle refresh
	const handleRefresh = useCallback(() => {
		onRefresh?.();
	}, [onRefresh]);

	// Handle search input change
	const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setSearchTerm(event.target.value);
	}, []);

	// Clear search
	const handleClearSearch = useCallback(() => {
		setSearchTerm('');
	}, []);

	// Get environment type icon class
	const getEnvironmentTypeIcon = (type: string): string => {
		switch (type) {
			case 'conda': return 'codicon codicon-symbol-misc';
			case 'venv': return 'codicon codicon-folder';
			case 'system': return 'codicon codicon-gear';
			case 'pyenv': return 'codicon codicon-versions';
			case 'pipenv': return 'codicon codicon-package';
			default: return 'codicon codicon-folder';
		}
	};

	// Get environment status indicator
	const getStatusIndicator = (environment: IPythonEnvironment): React.ReactNode => {
		if (environment.isActive) {
			return <span className="status-indicator active" title="Active Environment">●</span>;
		}
		return <span className="status-indicator inactive" title="Inactive Environment">○</span>;
	};

	return (
		<div className="environment-list">
			{/* Toolbar */}
			<div className="environment-toolbar">
				<div className="search-container">
					<input
						type="text"
						className="environment-search"
						placeholder="Search environments..."
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
					title="Refresh Environments"
				/>
			</div>

			{/* Environment count */}
			<div className="environment-count">
				{filteredEnvironments.length} of {environments.length} environment{environments.length !== 1 ? 's' : ''}
				{isLoading && <span className="loading-indicator"> (Loading...)</span>}
			</div>

			{/* Environment items */}
			<div className="environment-items">
				{filteredEnvironments.length === 0 ? (
					<div className="no-environments">
						{environments.length === 0 ? (
							isLoading ? (
								<div className="loading-message">
									<span className="codicon codicon-loading codicon-modifier-spin"></span>
									Loading environments...
								</div>
							) : (
								<div className="empty-message">
									<span className="codicon codicon-info"></span>
									No Python environments found
								</div>
							)
						) : (
							<div className="no-results-message">
								<span className="codicon codicon-search"></span>
								No environments match your search
							</div>
						)}
					</div>
				) : (
					filteredEnvironments.map(env => {
						const envId = env.runtimeId || env.path;
						const isSelected = selectedEnvironmentId === envId;
						
						return (
							<div 
								key={envId}
								className={`environment-item ${env.isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
								onClick={() => handleEnvironmentClick(env)}
								role="button"
								tabIndex={0}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										handleEnvironmentClick(env);
									}
								}}
							>
								<div className="environment-header">
									<div className="environment-icon-and-name">
										<span className={getEnvironmentTypeIcon(env.type)} />
										<div className="environment-name">{env.name}</div>
										{getStatusIndicator(env)}
									</div>
									{env.isActive && (
										<div className="active-badge">
											<span className="codicon codicon-check"></span>
											Active
										</div>
									)}
								</div>
								
								<div className="environment-details">
									<div className="environment-type-version">
										<span className="environment-type">{env.type}</span>
										<span className="environment-version">v{env.version}</span>
									</div>
								</div>
								
								<div className="environment-path" title={env.path}>
									{env.path}
								</div>
								
								{env.packages && env.packages.length > 0 && (
									<div className="environment-packages-info">
										<span className="codicon codicon-package"></span>
										{env.packages.length} package{env.packages.length !== 1 ? 's' : ''}
									</div>
								)}
							</div>
						);
					})
				)}
			</div>
		</div>
	);
};

