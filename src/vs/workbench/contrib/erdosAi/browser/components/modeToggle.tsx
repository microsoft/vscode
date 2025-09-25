/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect } from 'react';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

interface ModeToggleProps {
	configurationService: IConfigurationService;
	onModeChange?: (mode: 'ask' | 'agent') => void;
}

export const ModeToggle: React.FC<ModeToggleProps> = ({ configurationService, onModeChange }) => {
	const [currentMode, setCurrentMode] = useState<'ask' | 'agent'>('ask');
	const [showDropdown, setShowDropdown] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);

	// Load initial mode from configuration
	useEffect(() => {
		const mode = configurationService.getValue<string>('erdosAi.interactionMode') as 'ask' | 'agent';
		if (mode === 'ask' || mode === 'agent') {
			setCurrentMode(mode);
		}
	}, [configurationService]);

	// Handle clicks outside dropdown to close it
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current && 
				!dropdownRef.current.contains(event.target as Node) &&
				buttonRef.current &&
				!buttonRef.current.contains(event.target as Node)
			) {
				setShowDropdown(false);
			}
		};

		if (showDropdown) {
			document.addEventListener('mousedown', handleClickOutside);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [showDropdown]);

	const handleModeSelect = async (mode: 'ask' | 'agent') => {
		setCurrentMode(mode);
		setShowDropdown(false);
		
		// Update configuration
		await configurationService.updateValue('erdosAi.interactionMode', mode);
		
		// Notify parent component
		if (onModeChange) {
			onModeChange(mode);
		}
	};

	const toggleDropdown = () => {
		setShowDropdown(!showDropdown);
	};

	const getModeIcon = (mode: 'ask' | 'agent') => {
		return mode === 'agent' ? 'codicon-edit' : 'codicon-comment';
	};

	const getModeLabel = (mode: 'ask' | 'agent') => {
		return mode === 'agent' ? 'Agent' : 'Ask';
	};

	return (
		<div className="mode-toggle-container">
			<button
				ref={buttonRef}
				className="mode-toggle-button"
				onClick={toggleDropdown}
				title={`Current mode: ${getModeLabel(currentMode)}. Click to change mode.`}
				aria-label={`Current mode: ${getModeLabel(currentMode)}. Click to change mode.`}
			>
				<span className={`codicon ${getModeIcon(currentMode)}`}></span>
				<span className="mode-label-text">{getModeLabel(currentMode)}</span>
				<span className="codicon codicon-chevron-up"></span>
			</button>
			
			{showDropdown && (
				<div ref={dropdownRef} className="mode-toggle-dropdown">
					<button
						className={`mode-option ${currentMode === 'ask' ? 'active' : ''}`}
						onClick={() => handleModeSelect('ask')}
						title="Ask mode - for questions and conversations"
					>
						<span className="codicon codicon-comment"></span>
						<span className="mode-label">Ask</span>
					</button>
					<button
						className={`mode-option ${currentMode === 'agent' ? 'active' : ''}`}
						onClick={() => handleModeSelect('agent')}
						title="Agent mode - for autonomous task execution"
					>
						<span className="codicon codicon-edit"></span>
						<span className="mode-label">Agent</span>
					</button>
				</div>
			)}
		</div>
	);
};

