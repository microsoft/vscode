/**
 * ModeSelector - UI component for selecting Aria modes
 *
 * Displays current mode and provides a dropdown for switching between
 * Agent, Plan, Debug, Ask, Research, and Code Review modes.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useModeRegistry } from './modes/useModeRegistry';
import type { AriaModeId, AriaModeConfig } from './modes/types';

import './ModeSelector.css';

export interface ModeSelectorProps {
  className?: string;
  disabled?: boolean;
  onModeChange?: (modeId: AriaModeId) => void;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  className,
  disabled = false,
  onModeChange,
}) => {
  const { modes, currentMode, switchMode } = useModeRegistry();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (disabled) return;

      switch (event.key) {
        case 'Enter':
        case ' ':
          event.preventDefault();
          setIsOpen(!isOpen);
          break;
        case 'Escape':
          setIsOpen(false);
          break;
        case 'ArrowDown':
          if (isOpen) {
            event.preventDefault();
            const currentIndex = modes.findIndex(
              (m) => m.id === currentMode.id
            );
            const nextIndex = (currentIndex + 1) % modes.length;
            handleModeSelect(modes[nextIndex].id);
          }
          break;
        case 'ArrowUp':
          if (isOpen) {
            event.preventDefault();
            const currentIndex = modes.findIndex(
              (m) => m.id === currentMode.id
            );
            const prevIndex = (currentIndex - 1 + modes.length) % modes.length;
            handleModeSelect(modes[prevIndex].id);
          }
          break;
      }
    },
    [disabled, isOpen, modes, currentMode]
  );

  const handleModeSelect = useCallback(
    (modeId: AriaModeId) => {
      switchMode(modeId, 'user');
      setIsOpen(false);
      onModeChange?.(modeId);
    },
    [switchMode, onModeChange]
  );

  const toggleDropdown = useCallback(() => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  }, [disabled, isOpen]);

  return (
    <div
      className={`logos-mode-selector ${className || ''} ${
        disabled ? 'disabled' : ''
      }`}
      ref={dropdownRef}
    >
      {/* Current Mode Button */}
      <button
        className="mode-selector-trigger"
        onClick={toggleDropdown}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={`Current mode: ${currentMode.displayName} (${currentMode.shortcut || 'No shortcut'})`}
      >
        <span
          className="mode-icon"
          style={{ color: currentMode.color }}
        >
          {currentMode.icon}
        </span>
        <span className="mode-name">{currentMode.displayName}</span>
        <span className="mode-chevron">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="mode-selector-dropdown" role="listbox">
          {modes.map((mode) => (
            <ModeOption
              key={mode.id}
              mode={mode}
              isSelected={mode.id === currentMode.id}
              onSelect={() => handleModeSelect(mode.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface ModeOptionProps {
  mode: AriaModeConfig;
  isSelected: boolean;
  onSelect: () => void;
}

const ModeOption: React.FC<ModeOptionProps> = ({
  mode,
  isSelected,
  onSelect,
}) => {
  return (
    <button
      className={`mode-option ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
      role="option"
      aria-selected={isSelected}
    >
      <span className="mode-option-icon" style={{ color: mode.color }}>
        {mode.icon}
      </span>
      <div className="mode-option-content">
        <span className="mode-option-name">{mode.displayName}</span>
        <span className="mode-option-description">{mode.description}</span>
      </div>
      {mode.shortcut && (
        <span className="mode-option-shortcut">{mode.shortcut}</span>
      )}
      {isSelected && <span className="mode-option-check">✓</span>}
    </button>
  );
};

/**
 * Compact mode indicator for space-constrained layouts
 */
export const ModeIndicator: React.FC<{
  className?: string;
  onClick?: () => void;
}> = ({ className, onClick }) => {
  const { currentMode } = useModeRegistry();

  return (
    <div
      className={`logos-mode-indicator ${className || ''}`}
      onClick={onClick}
      style={{ borderColor: currentMode.color }}
      title={`Mode: ${currentMode.displayName}`}
    >
      <span className="indicator-icon" style={{ color: currentMode.color }}>
        {currentMode.icon}
      </span>
      <span className="indicator-label">{currentMode.displayName}</span>
    </div>
  );
};

export default ModeSelector;


