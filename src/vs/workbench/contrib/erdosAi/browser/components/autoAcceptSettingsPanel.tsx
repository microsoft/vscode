/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { AutoAcceptSettings, IAutoAcceptService } from '../../../../services/erdosAiAutomation/common/autoAcceptService.js';

interface AutoAcceptSettingsPanelProps {
	autoAcceptService: IAutoAcceptService;
}

/**
 * Settings panel for configuring auto-accept behavior
 * Similar to Rao's AI settings but focused on auto-accept functionality
 */
export const AutoAcceptSettingsPanel: React.FC<AutoAcceptSettingsPanelProps> = ({
	autoAcceptService
}) => {
	const [settings, setSettings] = useState<AutoAcceptSettings>(() => autoAcceptService.getSettings());
	const [newAllowFunction, setNewAllowFunction] = useState('');
	const [newDenyFunction, setNewDenyFunction] = useState('');

	useEffect(() => {
		const disposable = autoAcceptService.onDidChangeSettings((newSettings) => {
			setSettings(newSettings);
		});

		return () => disposable.dispose();
	}, [autoAcceptService]);

	const handleToggleSetting = (key: keyof AutoAcceptSettings) => {
		const newValue = !settings[key];
		autoAcceptService.updateSettings({ [key]: newValue });
	};

	const handleAddToAllowList = () => {
		const functionName = newAllowFunction.trim();
		if (functionName) {
			autoAcceptService.addToConsoleAllowList(functionName);
			setNewAllowFunction('');
		}
	};

	const handleAddToDenyList = () => {
		const functionName = newDenyFunction.trim();
		if (functionName) {
			autoAcceptService.addToConsoleDenyList(functionName);
			setNewDenyFunction('');
		}
	};

	const handleRemoveFromAllowList = (functionName: string) => {
		autoAcceptService.removeFromConsoleAllowList(functionName);
	};

	const handleRemoveFromDenyList = (functionName: string) => {
		autoAcceptService.removeFromConsoleDenyList(functionName);
	};

	const handleKeyPress = (event: React.KeyboardEvent, action: () => void) => {
		if (event.key === 'Enter') {
			action();
		}
	};

	return (
		<div className="auto-accept-settings-panel">
			<div className="settings-section">
				<h3>Auto-Accept Settings</h3>
				<p className="settings-description">
					Configure automatic acceptance of commands based on function allow/deny lists.
					This feature helps speed up workflows while maintaining security.
				</p>
			</div>

			{/* Enable/Disable Toggles */}
			<div className="settings-section">
				<h4>Enable Auto-Accept</h4>
				
				<div className="setting-item">
					<label className="setting-label">
						<input
							type="checkbox"
							checked={settings.autoAcceptConsole}
							onChange={() => handleToggleSetting('autoAcceptConsole')}
						/>
						<span className="setting-title">R Console Commands</span>
					</label>
					<p className="setting-description">
						Automatically accept R console commands if all functions are in the allow list
					</p>
				</div>

				<div className="setting-item">
					<label className="setting-label">
						<input
							type="checkbox"
							checked={settings.autoAcceptTerminal}
							onChange={() => handleToggleSetting('autoAcceptTerminal')}
						/>
						<span className="setting-title">Terminal Commands</span>
					</label>
					<p className="setting-description">
						Automatically accept terminal commands if all commands are in the allow list (Coming Soon)
					</p>
				</div>

				<div className="setting-item">
					<label className="setting-label">
						<input
							type="checkbox"
							checked={settings.autoAcceptFileOperations}
							onChange={() => handleToggleSetting('autoAcceptFileOperations')}
						/>
						<span className="setting-title">File Operations</span>
					</label>
					<p className="setting-description">
						Automatically accept file operations for trusted file patterns (Coming Soon)
					</p>
				</div>
			</div>

			{/* R Console Function Lists */}
			<div className="settings-section">
				<h4>R Console Function Lists</h4>
				
				{/* Allow List */}
				<div className="function-list-section">
					<h5>Allow List ({settings.consoleAllowList.length} functions)</h5>
					<p className="list-description">
						Functions in this list will be automatically accepted. Only functions in this list can be auto-accepted.
					</p>
					
					<div className="add-function-row">
						<input
							type="text"
							className="function-input"
							placeholder="Enter function name (e.g., plot, summary, head)"
							value={newAllowFunction}
							onChange={(e) => setNewAllowFunction(e.target.value)}
							onKeyPress={(e) => handleKeyPress(e, handleAddToAllowList)}
						/>
						<button 
							className="add-function-button allow"
							onClick={handleAddToAllowList}
							disabled={!newAllowFunction.trim()}
						>
							Add to Allow List
						</button>
					</div>

					<div className="function-list">
						{settings.consoleAllowList.map((func, index) => (
							<div key={index} className="function-tag allow">
								<span className="function-name">{func}</span>
								<button 
									className="remove-function-button"
									onClick={() => handleRemoveFromAllowList(func)}
									title={`Remove ${func} from allow list`}
								>
									×
								</button>
							</div>
						))}
						{settings.consoleAllowList.length === 0 && (
							<p className="empty-list-message">No functions in allow list</p>
						)}
					</div>
				</div>

				{/* Deny List */}
				<div className="function-list-section">
					<h5>Deny List ({settings.consoleDenyList.length} functions)</h5>
					<p className="list-description">
						Functions in this list will never be auto-accepted, even if they're in the allow list. Deny list takes precedence.
					</p>
					
					<div className="add-function-row">
						<input
							type="text"
							className="function-input"
							placeholder="Enter function name (e.g., system, unlink, install.packages)"
							value={newDenyFunction}
							onChange={(e) => setNewDenyFunction(e.target.value)}
							onKeyPress={(e) => handleKeyPress(e, handleAddToDenyList)}
						/>
						<button 
							className="add-function-button deny"
							onClick={handleAddToDenyList}
							disabled={!newDenyFunction.trim()}
						>
							Add to Deny List
						</button>
					</div>

					<div className="function-list">
						{settings.consoleDenyList.map((func, index) => (
							<div key={index} className="function-tag deny">
								<span className="function-name">{func}</span>
								<button 
									className="remove-function-button"
									onClick={() => handleRemoveFromDenyList(func)}
									title={`Remove ${func} from deny list`}
								>
									×
								</button>
							</div>
						))}
						{settings.consoleDenyList.length === 0 && (
							<p className="empty-list-message">No functions in deny list</p>
						)}
					</div>
				</div>
			</div>

			{/* Safety Notice */}
			<div className="settings-section safety-notice">
				<h4>Safety Notice</h4>
				<p>
					Auto-accept is a powerful feature that can save time, but should be used carefully:
				</p>
				<ul>
					<li>Only add functions you completely trust to the allow list</li>
					<li>Functions like <code>system()</code>, <code>unlink()</code>, <code>install.packages()</code> should generally be in the deny list</li>
					<li>Review the function analysis dialog before accepting commands with unknown functions</li>
					<li>You can always manually accept/deny commands even with auto-accept enabled</li>
				</ul>
			</div>
		</div>
	);
};

