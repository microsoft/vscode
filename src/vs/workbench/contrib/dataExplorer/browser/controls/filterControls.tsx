/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';

interface FilterDropdownProps {
	isOpen: boolean;
	columnIndex: number;
	availableValues: string[];
	selectedValues: Set<string>;
	position: { x: number; y: number };
	onSelectionChange: (selectedValues: Set<string>) => void;
	onClose: () => void;
	onApply: (selectedValues: Set<string>) => void;
	onClearFilter: () => void;
}

export const FilterDropdown: React.FC<FilterDropdownProps> = ({
	isOpen,
	columnIndex,
	availableValues,
	selectedValues,
	position,
	onSelectionChange,
	onClose,
	onApply,
	onClearFilter
}) => {
	const [searchTerm, setSearchTerm] = useState('');
	const [filteredValues, setFilteredValues] = useState<string[]>([]);
	// Initialize with current selected values or all values if none selected (default behavior)
	const [localSelectedValues, setLocalSelectedValues] = useState<Set<string>>(
		new Set(selectedValues.size > 0 ? selectedValues : availableValues)
	);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);

	// Sync local state with props when dropdown opens or selectedValues change
	useEffect(() => {
		if (isOpen) {
			setLocalSelectedValues(new Set(selectedValues.size > 0 ? selectedValues : availableValues));
			// Don't reset search term - let user keep their search active while filtering
		}
	}, [isOpen, selectedValues, availableValues]);

	// Filter available values based on search term
	useEffect(() => {
		if (!searchTerm.trim()) {
			setFilteredValues(availableValues);
		} else {
			const filtered = availableValues.filter(value => 
				value.toLowerCase().startsWith(searchTerm.toLowerCase())
			);
			setFilteredValues(filtered);
		}
	}, [searchTerm, availableValues]);

	// Focus search input when dropdown opens - longer delay and more robust
	useEffect(() => {
		if (isOpen && searchInputRef.current) {
			const timeoutId = setTimeout(() => {
				if (searchInputRef.current && dropdownRef.current) {
					searchInputRef.current.focus();
				}
			}, 200);
			return () => clearTimeout(timeoutId);
		}
		return undefined;
	}, [isOpen]);

	// Handle clicks outside dropdown to close - but not when clicking inside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (dropdownRef.current && !dropdownRef.current.contains(target)) {
				onClose();
			}
		};

		if (isOpen) {
			// Longer delay to ensure dropdown is fully rendered
			const timeoutId = setTimeout(() => {
				document.addEventListener('mousedown', handleClickOutside);
			}, 300);
			
			return () => {
				clearTimeout(timeoutId);
				document.removeEventListener('mousedown', handleClickOutside);
			};
		}
		
		return undefined;
	}, [isOpen, onClose]);

	// Handle Escape key to close
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener('keydown', handleKeyDown);
			return () => {
				document.removeEventListener('keydown', handleKeyDown);
			};
		}
		
		return undefined;
	}, [isOpen, onClose]);

	const handleSelectAll = () => {
		const newSelection = new Set(filteredValues);
		setLocalSelectedValues(newSelection);
		onSelectionChange(newSelection);
		onApply(newSelection);
	};

	const handleDeselectAll = () => {
		const newSelection = new Set<string>();
		setLocalSelectedValues(newSelection);
		onSelectionChange(newSelection);
		onApply(newSelection);
	};

	const handleValueToggle = (value: string) => {
		const newSelection = new Set(localSelectedValues);
		if (newSelection.has(value)) {
			newSelection.delete(value);
		} else {
			newSelection.add(value);
		}
		
		setLocalSelectedValues(newSelection);
		onSelectionChange(newSelection);
		onApply(newSelection);
	};



	const handleClear = () => {
		onClearFilter();
		onClose();
	};

	if (!isOpen) {
		return null;
	}

	const allFilteredSelected = filteredValues.length > 0 && filteredValues.every(value => localSelectedValues.has(value));

	return (
		<div
			ref={dropdownRef}
			className="context-view fixed"
			style={{
				position: 'fixed',
				left: `${position.x}px`,
				top: `${position.y}px`,
				zIndex: 1000
			}}
		>
			<div 
				className="monaco-select-box-dropdown-container visible"
				style={{
					minWidth: '200px',
					maxWidth: '320px',
					background: 'var(--vscode-dropdown-background)',
					border: '1px solid var(--vscode-dropdown-border)',
					borderRadius: '3px',
					boxShadow: '0 2px 8px rgba(0, 0, 0, 0.16)',
					fontFamily: 'var(--monaco-font-family)',
					fontSize: '13px'
				}}
			>
				{/* Search input section */}
				<div style={{
					padding: '2px 8px',
					borderBottom: '1px solid var(--vscode-widget-border)',
					height: '22px',
					display: 'flex',
					alignItems: 'center'
				}}>
					<input
						ref={searchInputRef}
						type="text"
						placeholder="Search values..."
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
								onMouseDown={(e) => {
								e.stopPropagation();
							}}
							onClick={(e) => {
								e.stopPropagation();
							}}
							onFocus={(e) => {
								e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)';
							}}
							onBlur={(e) => {
								e.currentTarget.style.borderColor = 'var(--vscode-input-border)';
							}}
						style={{
							width: '100%',
							padding: '2px 6px',
							border: '1px solid var(--vscode-input-border)',
							background: 'var(--vscode-input-background)',
							color: 'var(--vscode-input-foreground)',
							borderRadius: '2px',
							fontSize: '12px',
							fontFamily: 'inherit',
							outline: 'none',
							boxSizing: 'border-box',
							textAlign: 'left'
						}}
					/>
				</div>

				{/* Select/Deselect All clickable area */}
				<div 
					style={{
						padding: '2px 8px',
						borderBottom: '1px solid var(--vscode-widget-border)',
						cursor: 'pointer',
						background: 'transparent',
						height: '22px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontSize: '12px',
						color: 'var(--vscode-foreground)'
					}}
					onClick={allFilteredSelected ? handleDeselectAll : handleSelectAll}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = 'transparent';
					}}
				>
					{allFilteredSelected ? 'Deselect All' : 'Select All'}
				</div>

				{/* Values list */}
				<div 
					style={{
						maxHeight: '250px',
						overflow: 'auto',
						padding: '2px'
					}}
				>
					{filteredValues.map((value) => (
						<div
							key={value}
							style={{
								height: '22px',
								display: 'flex',
								alignItems: 'center',
								padding: '0 4px',
								cursor: 'pointer',
								fontSize: '13px',
								color: 'var(--vscode-foreground)',
								borderRadius: '2px',
								background: 'transparent',
								gap: '6px'
							}}
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								handleValueToggle(value);
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = 'transparent';
							}}
						>
							<input
								type="checkbox"
								checked={localSelectedValues.has(value)}
								onChange={() => {}} // Handled by parent onClick
								onClick={(e) => {
									e.stopPropagation();
									handleValueToggle(value);
								}}
								style={{
									margin: 0,
									cursor: 'pointer',
									flexShrink: 0
								}}
							/>
							<span style={{ 
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
								flex: 1
							}}>
								{value || '(blank)'}
							</span>
						</div>
					))}
					
					{filteredValues.length === 0 && (
						<div style={{
							padding: '8px',
							textAlign: 'center',
							color: 'var(--vscode-descriptionForeground)',
							fontSize: '12px'
						}}>
							No values match search
						</div>
					)}
				</div>

				{/* Footer with Clear Filter as clickable area */}
				<div 
					style={{
						padding: '2px 8px',
						borderTop: '1px solid var(--vscode-widget-border)',
						cursor: 'pointer',
						background: 'transparent',
						height: '22px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontSize: '12px',
						color: 'var(--vscode-foreground)'
					}}
					onClick={handleClear}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = 'transparent';
					}}
				>
					Clear Filter
				</div>
			</div>
		</div>
	);
};

