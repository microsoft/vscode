/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useCallback } from 'react';
import { IPythonEnvironment, IPythonPackage, IRPackage } from '../../common/environmentTypes.js';

export interface EnvironmentStatusProps {
	pythonEnvironments: IPythonEnvironment[];
	rPackages: IRPackage[];
	pythonPackages: IPythonPackage[];
	activePythonEnvironment?: IPythonEnvironment;
	hasActiveRRuntime: boolean;
	hasActivePythonRuntime: boolean;
	onRefreshEnvironments?: () => void;
	onRefreshRPackages?: () => void;
	onRefreshPythonPackages?: () => void;
	isLoading?: {
		environments?: boolean;
		rPackages?: boolean;
		pythonPackages?: boolean;
	};
}

export const EnvironmentStatus: React.FC<EnvironmentStatusProps> = ({
	pythonEnvironments,
	rPackages,
	pythonPackages,
	activePythonEnvironment,
	hasActiveRRuntime,
	hasActivePythonRuntime,
	onRefreshEnvironments,
	onRefreshRPackages,
	onRefreshPythonPackages,
	isLoading = {}
}) => {
	const [expandedSections, setExpandedSections] = useState<{
		python: boolean;
		r: boolean;
		pythonPackages: boolean;
	}>({
		python: true,
		r: true,
		pythonPackages: true
	});

	// Toggle section expansion
	const toggleSection = useCallback((section: 'python' | 'r' | 'pythonPackages') => {
		setExpandedSections(prev => ({
			...prev,
			[section]: !prev[section]
		}));
	}, []);

	// Get environment type summary
	const getEnvironmentTypeSummary = (): { [key: string]: number } => {
		const summary: { [key: string]: number } = {};
		pythonEnvironments.forEach(env => {
			summary[env.type] = (summary[env.type] || 0) + 1;
		});
		return summary;
	};

	// Get R packages summary
	const getRPackagesSummary = (): { loaded: number; total: number; priority: { [key: string]: number } } => {
		const loaded = rPackages.filter(pkg => pkg.isLoaded).length;
		const priority: { [key: string]: number } = {};
		
		rPackages.forEach(pkg => {
			if (pkg.priority) {
				priority[pkg.priority] = (priority[pkg.priority] || 0) + 1;
			}
		});
		
		return { loaded, total: rPackages.length, priority };
	};

	// Get Python packages summary
	const getPythonPackagesSummary = (): { editable: number; total: number } => {
		const editable = pythonPackages.filter(pkg => pkg.editable).length;
		return { editable, total: pythonPackages.length };
	};

	const environmentTypeSummary = getEnvironmentTypeSummary();
	const rPackagesSummary = getRPackagesSummary();
	const pythonPackagesSummary = getPythonPackagesSummary();

	return (
		<div className="environment-status">
			<div className="status-header">
				<h3>Environment Overview</h3>
				<div className="global-actions">
					<button 
						className="refresh-all-button codicon codicon-refresh"
						onClick={() => {
							onRefreshEnvironments?.();
							onRefreshRPackages?.();
							onRefreshPythonPackages?.();
						}}
						title="Refresh all"
					/>
				</div>
			</div>

			{/* Python Environments Section */}
			<div className="status-section">
				<div 
					className="section-header"
					onClick={() => toggleSection('python')}
					role="button"
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							toggleSection('python');
						}
					}}
				>
					<span className={`expand-icon codicon ${expandedSections.python ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
					<span className="codicon codicon-symbol-misc section-icon" />
					<h4>Python Environments</h4>
					<div className="section-summary">
						<span className="count-badge">{pythonEnvironments.length}</span>
						{isLoading.environments && (
							<span className="codicon codicon-loading codicon-modifier-spin loading-icon" />
						)}
					</div>
					<button 
						className="section-refresh-button codicon codicon-refresh"
						onClick={(e) => {
							e.stopPropagation();
							onRefreshEnvironments?.();
						}}
						title="Refresh Python environments"
					/>
				</div>

				{expandedSections.python && (
					<div className="section-content">
						{pythonEnvironments.length === 0 ? (
							<div className="empty-section">
								{isLoading.environments ? (
									<span>Loading environments...</span>
								) : (
									<span>No Python environments found</span>
								)}
							</div>
						) : (
							<>
								{/* Active Environment */}
								{activePythonEnvironment && (
									<div className="active-environment">
										<div className="environment-info">
											<span className="codicon codicon-check active-indicator" />
											<strong>{activePythonEnvironment.name}</strong>
											<span className="environment-type-badge">{activePythonEnvironment.type}</span>
											<span className="environment-version">v{activePythonEnvironment.version}</span>
										</div>
										<div className="environment-path" title={activePythonEnvironment.path}>
											{activePythonEnvironment.path}
										</div>
									</div>
								)}

								{/* Environment Type Summary */}
								<div className="environment-types">
									{Object.entries(environmentTypeSummary).map(([type, count]) => (
										<div key={type} className="type-summary">
											<span className={`type-icon codicon ${
												type === 'conda' ? 'codicon-symbol-misc' :
												type === 'venv' ? 'codicon-folder' :
												type === 'system' ? 'codicon-gear' :
												type === 'pyenv' ? 'codicon-versions' :
												type === 'pipenv' ? 'codicon-package' :
												'codicon-folder'
											}`} />
											<span className="type-name">{type}</span>
											<span className="type-count">{count}</span>
										</div>
									))}
								</div>
							</>
						)}
					</div>
				)}
			</div>

			{/* R Packages Section */}
			<div className="status-section">
				<div 
					className="section-header"
					onClick={() => toggleSection('r')}
					role="button"
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							toggleSection('r');
						}
					}}
				>
					<span className={`expand-icon codicon ${expandedSections.r ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
					<span className="codicon codicon-package section-icon" />
					<h4>R Packages</h4>
					<div className="section-summary">
						<span className="count-badge">{rPackagesSummary.total}</span>
						{rPackagesSummary.loaded > 0 && (
							<span className="loaded-badge">{rPackagesSummary.loaded} loaded</span>
						)}
						{!hasActiveRRuntime && (
							<span className="no-runtime-badge">No runtime</span>
						)}
						{isLoading.rPackages && (
							<span className="codicon codicon-loading codicon-modifier-spin loading-icon" />
						)}
					</div>
					<button 
						className="section-refresh-button codicon codicon-refresh"
						onClick={(e) => {
							e.stopPropagation();
							onRefreshRPackages?.();
						}}
						disabled={!hasActiveRRuntime}
						title="Refresh R packages"
					/>
				</div>

				{expandedSections.r && (
					<div className="section-content">
						{!hasActiveRRuntime ? (
							<div className="no-runtime-message">
								<span className="codicon codicon-info" />
								No active R runtime
							</div>
						) : rPackagesSummary.total === 0 ? (
							<div className="empty-section">
								{isLoading.rPackages ? (
									<span>Loading packages...</span>
								) : (
									<span>No R packages found</span>
								)}
							</div>
						) : (
							<>
								{/* Package Status Summary */}
								<div className="package-status-summary">
									<div className="status-item">
										<span className="codicon codicon-check-all" />
										<span>{rPackagesSummary.loaded} loaded</span>
									</div>
									<div className="status-item">
										<span className="codicon codicon-package" />
										<span>{rPackagesSummary.total - rPackagesSummary.loaded} not loaded</span>
									</div>
								</div>

								{/* Priority Summary */}
								{Object.keys(rPackagesSummary.priority).length > 0 && (
									<div className="priority-summary">
										<h5>By Priority:</h5>
										{Object.entries(rPackagesSummary.priority).map(([priority, count]) => (
											<div key={priority} className="priority-item">
												<span className="priority-name">{priority}</span>
												<span className="priority-count">{count}</span>
											</div>
										))}
									</div>
								)}
							</>
						)}
					</div>
				)}
			</div>

			{/* Python Packages Section */}
			<div className="status-section">
				<div 
					className="section-header"
					onClick={() => toggleSection('pythonPackages')}
					role="button"
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							toggleSection('pythonPackages');
						}
					}}
				>
					<span className={`expand-icon codicon ${expandedSections.pythonPackages ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
					<span className="codicon codicon-package section-icon" />
					<h4>Python Packages</h4>
					<div className="section-summary">
						<span className="count-badge">{pythonPackagesSummary.total}</span>
						{pythonPackagesSummary.editable > 0 && (
							<span className="editable-badge">{pythonPackagesSummary.editable} editable</span>
						)}
						{!hasActivePythonRuntime && (
							<span className="no-runtime-badge">No runtime</span>
						)}
						{isLoading.pythonPackages && (
							<span className="codicon codicon-loading codicon-modifier-spin loading-icon" />
						)}
					</div>
					<button 
						className="section-refresh-button codicon codicon-refresh"
						onClick={(e) => {
							e.stopPropagation();
							onRefreshPythonPackages?.();
						}}
						disabled={!hasActivePythonRuntime}
						title="Refresh Python packages"
					/>
				</div>

				{expandedSections.pythonPackages && (
					<div className="section-content">
						{!hasActivePythonRuntime ? (
							<div className="no-runtime-message">
								<span className="codicon codicon-info" />
								No active Python runtime
							</div>
						) : pythonPackagesSummary.total === 0 ? (
							<div className="empty-section">
								{isLoading.pythonPackages ? (
									<span>Loading packages...</span>
								) : (
									<span>No Python packages found</span>
								)}
							</div>
						) : (
							<div className="package-status-summary">
								<div className="status-item">
									<span className="codicon codicon-edit" />
									<span>{pythonPackagesSummary.editable} editable</span>
								</div>
								<div className="status-item">
									<span className="codicon codicon-package" />
									<span>{pythonPackagesSummary.total - pythonPackagesSummary.editable} regular</span>
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

