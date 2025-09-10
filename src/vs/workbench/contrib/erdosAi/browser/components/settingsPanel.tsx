/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { IErdosAiAuthService } from '../../../../services/erdosAi/common/erdosAiAuthService.js';
import { IErdosAiServiceCore } from '../../../../services/erdosAi/common/erdosAiServiceCore.js';
import { IErdosAiSettingsService } from '../../../../services/erdosAiSettings/common/settingsService.js';
import { IErdosHelpSearchService } from '../../../erdosHelp/browser/erdosHelpSearchService.js';
import { isWindows } from '../../../../../base/common/platform.js';

export interface SettingsPanelProps {
	readonly erdosAiAuthService: IErdosAiAuthService;
	readonly erdosAiService: IErdosAiServiceCore;
	readonly erdosAiSettingsService: IErdosAiSettingsService;
	readonly erdosHelpSearchService: IErdosHelpSearchService;
	readonly onClose: () => void;
}

/**
 * Settings panel component for configuring Erdos AI preferences
 */
export const SettingsPanel = (props: SettingsPanelProps) => {
	const { erdosHelpSearchService } = props;
	const [hasApiKey, setHasApiKey] = useState(false);
	const [userProfile, setUserProfile] = useState<any>(null);
	const [subscriptionStatus, setSubscriptionStatus] = useState<any>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [profileError, setProfileError] = useState<string | null>(null);
	
	const [showApiKeyInput, setShowApiKeyInput] = useState(false);
	const [apiKeyValue, setApiKeyValue] = useState('');
	const [apiKeyError, setApiKeyError] = useState<string | null>(null);

	const [availableModels, setAvailableModels] = useState<string[]>([]);
	const [selectedModel, setSelectedModel] = useState<string>('');
	const [temperature, setTemperature] = useState(0.5);

	const [securityMode, setSecurityMode] = useState<string>('secure');
	const [webSearchEnabled, setWebSearchEnabled] = useState(false);
	const [autoAcceptEdits, setAutoAcceptEdits] = useState(false);
	const [autoAcceptDeletes, setAutoAcceptDeletes] = useState(false);

	// Terminal auto-accept settings
	const [autoAcceptTerminal, setAutoAcceptTerminal] = useState(false);
	const [terminalAutoAcceptMode, setTerminalAutoAcceptMode] = useState<'allow-list' | 'deny-list'>('allow-list');
	const [terminalAllowList, setTerminalAllowList] = useState<string[]>([]);
	const [terminalDenyList, setTerminalDenyList] = useState<string[]>([]);
	const [newCommandInput, setNewCommandInput] = useState('');

	// Console auto-accept settings
	const [autoAcceptConsole, setAutoAcceptConsole] = useState(false);
	const [consoleAutoAcceptMode, setConsoleAutoAcceptMode] = useState<'allow-list' | 'deny-list'>('allow-list');
	const [consoleLanguageFilter, setConsoleLanguageFilter] = useState<'both' | 'python' | 'r'>('both');
	const [consoleAllowList, setConsoleAllowList] = useState<Array<{function: string, language: 'python' | 'r'}>>([]);
	const [consoleDenyList, setConsoleDenyList] = useState<Array<{function: string, language: 'python' | 'r'}>>([]);
	const [newConsoleFunctionInput, setNewConsoleFunctionInput] = useState('');
	const [newConsoleFunctionLanguage, setNewConsoleFunctionLanguage] = useState<'python' | 'r'>('python');

	const [oauthStarted, setOauthStarted] = useState(false);
	
	useEffect(() => {
		loadSettings();
		
		let refreshInterval: any = null;
		let pollStartTime = Date.now();
		const POLL_DURATION = 60000;
		const POLL_INTERVAL = 2000;
		
		if (!hasApiKey && oauthStarted) {
			refreshInterval = setInterval(async () => {
				try {
					if (Date.now() - pollStartTime > POLL_DURATION) {
						clearInterval(refreshInterval);
						return;
					}
					
					const hasKey = await props.erdosAiAuthService.getApiKeyStatus();
					if (hasKey) {
						clearInterval(refreshInterval);
						loadSettings();
					}
				} catch (error) {
					console.warn('Error checking API key status during polling:', error);
				}
			}, POLL_INTERVAL);
		}
		
		return () => {
			if (refreshInterval) {
				clearInterval(refreshInterval);
			}
		};
	}, [hasApiKey, oauthStarted]);

	const loadSettings = async () => {
		try {

			setProfileError(null);
			setApiKeyError(null);
			
			const hasKey = await props.erdosAiAuthService.getApiKeyStatus();

			setHasApiKey(hasKey);
				
			const [
				models, model, temp, security, webSearch, autoAcceptEdit, autoAcceptDelete,
				autoAcceptTerm, terminalMode, allowList, denyList,
				autoAcceptCons, consoleMode, consoleLanguage, consoleAllowList, consoleDenyList
			] = await Promise.all([
				props.erdosAiSettingsService.getAvailableModels().catch(() => []),
				props.erdosAiSettingsService.getSelectedModel().catch(() => ''),
				props.erdosAiSettingsService.getTemperature().catch(() => 0.5),
				props.erdosAiSettingsService.getSecurityMode().catch(() => 'secure'),
				props.erdosAiSettingsService.getWebSearchEnabled().catch(() => false),
				props.erdosAiSettingsService.getAutoAcceptEdits().catch(() => false),
				props.erdosAiSettingsService.getAutoAcceptDeletes().catch(() => false),
				props.erdosAiSettingsService.getAutoAcceptTerminal().catch(() => false),
				props.erdosAiSettingsService.getTerminalAutoAcceptMode().catch(() => 'allow-list' as const),
				props.erdosAiSettingsService.getTerminalAllowList().catch(() => []),
				props.erdosAiSettingsService.getTerminalDenyList().catch(() => []),
				props.erdosAiSettingsService.getAutoAcceptConsole().catch(() => false),
				props.erdosAiSettingsService.getConsoleAutoAcceptMode().catch(() => 'allow-list' as const),
				props.erdosAiSettingsService.getConsoleLanguageFilter().catch(() => 'both' as const),
				props.erdosAiSettingsService.getConsoleAllowList().catch(() => []),
				props.erdosAiSettingsService.getConsoleDenyList().catch(() => [])
			]);

			setAvailableModels(models);
			setSelectedModel(model || '');
			setTemperature(temp);
			setSecurityMode(security);
			setWebSearchEnabled(webSearch);
			setAutoAcceptEdits(autoAcceptEdit);
			setAutoAcceptDeletes(autoAcceptDelete);
			setAutoAcceptTerminal(autoAcceptTerm);
			setTerminalAutoAcceptMode(terminalMode);
			setTerminalAllowList(allowList);
			setTerminalDenyList(denyList);
			setAutoAcceptConsole(autoAcceptCons);
			setConsoleAutoAcceptMode(consoleMode);
			setConsoleLanguageFilter(consoleLanguage);
			setConsoleAllowList(consoleAllowList);
			setConsoleDenyList(consoleDenyList);

			if (hasKey) {
				try {
					const profile = await props.erdosAiAuthService.getUserProfile();
					setUserProfile(profile);
				} catch (error) {
					setProfileError(`Failed to load profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
				
				try {
					const subscription = await props.erdosAiAuthService.getSubscriptionStatus();
					setSubscriptionStatus(subscription);
				} catch (error) {
					console.warn('Failed to load subscription status:', error);
				}
			}
		} catch (error) {
			console.error('Failed to load settings:', error);
			setProfileError('Failed to load settings');
		}
	};

	const handleSignOut = async () => {
		if (isLoading) return;
		
		setIsLoading(true);
		try {
			await props.erdosAiAuthService.signOut();
			await loadSettings();
		} catch (error) {
			console.error('Sign out failed:', error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleSignIn = async () => {
		setIsLoading(true);
		setOauthStarted(true);
		try {
			await props.erdosAiAuthService.startOAuthFlow();
		} catch (error) {
			console.error('Failed to start OAuth flow:', error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleSaveApiKey = async () => {
		if (!apiKeyValue.trim()) {
			setApiKeyError('Please enter an API key');
			return;
		}

		setIsLoading(true);
		setApiKeyError(null);
		
		try {
			const result = await props.erdosAiAuthService.saveApiKey('rao', apiKeyValue);
			if (result.success) {
				setApiKeyValue('');
				setShowApiKeyInput(false);
				await loadSettings();
			} else {
				setApiKeyError(result.message || 'Failed to save API key');
			}
		} catch (error) {
			setApiKeyError(error instanceof Error ? error.message : 'Failed to save API key');
		} finally {
			setIsLoading(false);
		}
	};

	const handleModelChange = async (model: string) => {

		setSelectedModel(model);
		try {
			await props.erdosAiSettingsService.setSelectedModel(model);

		} catch (error) {
			console.error('[ErdosAI Settings] Failed to set model:', error);
		}
	};

	const handleTemperatureChange = async (newTemp: number) => {
		setTemperature(newTemp);
		try {
			await props.erdosAiSettingsService.setTemperature(newTemp);
		} catch (error) {
			console.error('Failed to set temperature:', error);
		}
	};

	const handleSecurityModeChange = async (mode: string) => {
		setSecurityMode(mode);
		
		try {
			await props.erdosAiSettingsService.setSecurityMode(mode as 'secure' | 'improve');
		} catch (error) {
			console.error('Failed to update security mode:', error);
		}
	};

	const handleWebSearchChange = async (enabled: boolean) => {
		setWebSearchEnabled(enabled);
		try {
			await props.erdosAiSettingsService.setWebSearchEnabled(enabled);
		} catch (error) {
			console.error('Failed to set web search enabled:', error);
		}
	};

	const handleAutoAcceptEditsChange = async (enabled: boolean) => {
		setAutoAcceptEdits(enabled);
		try {
			await props.erdosAiSettingsService.setAutoAcceptEdits(enabled);
		} catch (error) {
			console.error('Failed to set auto-accept edits:', error);
		}
	};

	const handleAutoAcceptDeletesChange = async (enabled: boolean) => {
		setAutoAcceptDeletes(enabled);
		try {
			await props.erdosAiSettingsService.setAutoAcceptDeletes(enabled);
		} catch (error) {
			console.error('Failed to set auto-accept deletes:', error);
		}
	};

	const handleAutoAcceptTerminalChange = async (enabled: boolean) => {
		setAutoAcceptTerminal(enabled);
		try {
			await props.erdosAiSettingsService.setAutoAcceptTerminal(enabled);
		} catch (error) {
			console.error('Failed to set auto-accept terminal:', error);
		}
	};

	const handleTerminalAutoAcceptModeChange = async (mode: 'allow-list' | 'deny-list') => {
		setTerminalAutoAcceptMode(mode);
		try {
			await props.erdosAiSettingsService.setTerminalAutoAcceptMode(mode);
		} catch (error) {
			console.error('Failed to set terminal auto-accept mode:', error);
		}
	};

	const handleAddCommand = async () => {
		const command = newCommandInput.trim();
		if (!command) return;

		try {
			if (terminalAutoAcceptMode === 'allow-list') {
				// Check for duplicates before adding
				if (!terminalAllowList.includes(command)) {
					await props.erdosAiSettingsService.addToTerminalAllowList(command);
					setTerminalAllowList(prev => [...prev, command]);
				}
			} else {
				// Check for duplicates before adding
				if (!terminalDenyList.includes(command)) {
					await props.erdosAiSettingsService.addToTerminalDenyList(command);
					setTerminalDenyList(prev => [...prev, command]);
				}
			}
			setNewCommandInput('');
		} catch (error) {
			console.error('Failed to add command:', error);
		}
	};

	const handleRemoveCommand = async (command: string) => {
		try {
			if (terminalAutoAcceptMode === 'allow-list') {
				await props.erdosAiSettingsService.removeFromTerminalAllowList(command);
				setTerminalAllowList(prev => prev.filter(cmd => cmd !== command));
			} else {
				await props.erdosAiSettingsService.removeFromTerminalDenyList(command);
				setTerminalDenyList(prev => prev.filter(cmd => cmd !== command));
			}
		} catch (error) {
			console.error('Failed to remove command:', error);
		}
	};

	// Console auto-accept handlers
	const handleAutoAcceptConsoleChange = async (enabled: boolean) => {
		setAutoAcceptConsole(enabled);
		try {
			await props.erdosAiSettingsService.setAutoAcceptConsole(enabled);
		} catch (error) {
			console.error('Failed to set auto-accept console:', error);
		}
	};

	const handleConsoleAutoAcceptModeChange = async (mode: 'allow-list' | 'deny-list') => {
		setConsoleAutoAcceptMode(mode);
		try {
			await props.erdosAiSettingsService.setConsoleAutoAcceptMode(mode);
		} catch (error) {
			console.error('Failed to set console auto-accept mode:', error);
		}
	};

	const handleConsoleLanguageFilterChange = async (filter: 'both' | 'python' | 'r') => {
		setConsoleLanguageFilter(filter);
		try {
			await props.erdosAiSettingsService.setConsoleLanguageFilter(filter);
		} catch (error) {
			console.error('Failed to set console language filter:', error);
		}
	};

	const handleAddConsoleFunction = async () => {
		const functionCall = newConsoleFunctionInput.trim();
		if (!functionCall) return;

		try {
			const newItem = { function: functionCall, language: newConsoleFunctionLanguage };
			
			if (consoleAutoAcceptMode === 'allow-list') {
				// Check for duplicates before adding
				const isDuplicate = consoleAllowList.some(item => 
					item.function === functionCall && item.language === newConsoleFunctionLanguage
				);
				if (!isDuplicate) {
					await props.erdosAiSettingsService.addToConsoleAllowList(functionCall, newConsoleFunctionLanguage);
					setConsoleAllowList(prev => [...prev, newItem]);
				}
			} else {
				// Check for duplicates before adding
				const isDuplicate = consoleDenyList.some(item => 
					item.function === functionCall && item.language === newConsoleFunctionLanguage
				);
				if (!isDuplicate) {
					await props.erdosAiSettingsService.addToConsoleDenyList(functionCall, newConsoleFunctionLanguage);
					setConsoleDenyList(prev => [...prev, newItem]);
				}
			}
			setNewConsoleFunctionInput('');
		} catch (error) {
			console.error('Failed to add console function:', error);
		}
	};

	const handleRemoveConsoleFunction = async (functionCall: string, language: 'python' | 'r') => {
		try {
			if (consoleAutoAcceptMode === 'allow-list') {
				await props.erdosAiSettingsService.removeFromConsoleAllowList(functionCall, language);
				setConsoleAllowList(prev => prev.filter(item => !(item.function === functionCall && item.language === language)));
			} else {
				await props.erdosAiSettingsService.removeFromConsoleDenyList(functionCall, language);
				setConsoleDenyList(prev => prev.filter(item => !(item.function === functionCall && item.language === language)));
			}
		} catch (error) {
			console.error('Failed to remove console function:', error);
		}
	};

	const formatSubscriptionStatus = (status: string): string => {
		switch (status) {
			case 'trial': return 'Trial';
			case 'active': return 'Active';
			case 'cancelled': return 'Cancelled';
			case 'past_due': return 'Past Due';
			default: return status || 'Unknown';
		}
	};

	const getUserDisplayName = (): string => {
		if (userProfile?.name) return userProfile.name;
		if (userProfile?.email) return userProfile.email;
		if (userProfile?.username) return userProfile.username;
		return 'User';
	};

	const getUsageData = () => {
		if (!subscriptionStatus) return null;
		
		const queriesLimit = subscriptionStatus.queries_limit || 0;
		const queriesRemaining = subscriptionStatus.queries_remaining || 0;
		const queriesUsed = queriesLimit - queriesRemaining;
		
		return {
			used: Math.max(0, queriesUsed),
			total: Math.max(1, queriesLimit),
			remaining: Math.max(0, queriesRemaining)
		};
	};

	const usageData = getUsageData();

	return (
		<div className="erdos-ai-settings-editor">
			<div className="settings-header-container">
				<div className="settings-header">
					<button 
						className="settings-back-button"
						onClick={props.onClose}
						title="Back to chat"
					>
						<span className="codicon codicon-arrow-left"></span>
					</button>
					<h1 className="settings-title">Erdos AI Settings</h1>
				</div>
			</div>
			
			<div className="settings-body">
				<div className="settings-content-container">
					<div className="settings-content">
						<div className="settings-group-container">
							<div className="settings-group-content">
								<h3 className="settings-group-title-label">Profile</h3>
								{profileError && (
									<div style={{ color: 'var(--vscode-errorForeground)', marginBottom: '12px' }}>
										{profileError}
									</div>
								)}
								
								{!hasApiKey ? (
									<div>
										<div className="auth-buttons">
											<button 
												className="settings-button primary"
												onClick={handleSignIn}
												disabled={isLoading}
											>
												{isLoading ? 'Signing in...' : 'Sign up/Sign in'}
											</button>
											
											<button 
												className="settings-button secondary"
												onClick={() => setShowApiKeyInput(!showApiKeyInput)}
												disabled={isLoading}
											>
												Use API key
											</button>
										</div>

										{showApiKeyInput && (
											<div className="api-key-section">
												<label className="settings-label">API Key</label>
												<input
													type="password"
													className="settings-input"
													placeholder="Enter your Rao API key from www.lotas.ai/account"
													value={apiKeyValue}
													onChange={(e) => setApiKeyValue(e.target.value)}
													onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
												/>
												{apiKeyError && (
													<div style={{ color: 'var(--vscode-errorForeground)', fontSize: '12px' }}>
														{apiKeyError}
													</div>
												)}
												<button 
													className="settings-button primary"
													onClick={handleSaveApiKey}
													disabled={isLoading}
													style={{ marginTop: '8px' }}
												>
													{isLoading ? 'Saving...' : 'Save API Key'}
												</button>
											</div>
										)}
									</div>
								) : (
									<div>
										<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
											<div style={{ fontWeight: '600' }}>{getUserDisplayName()}</div>
											<button 
												className="settings-button"
												onClick={handleSignOut}
												disabled={isLoading}
												style={{ fontSize: '12px', padding: '4px 12px' }}
											>
												{isLoading ? 'Signing out...' : 'Sign out'}
											</button>
										</div>
										
										{subscriptionStatus && (
											<div>
												<div style={{ marginBottom: '8px' }}>
													<strong>Subscription:</strong> {formatSubscriptionStatus(subscriptionStatus.subscription_status)}
												</div>
												
												{usageData && (
													<div style={{ marginBottom: '12px' }}>
														<div style={{ marginBottom: '4px' }}>
															<strong>Monthly usage:</strong> {usageData.used} / {usageData.total} queries
														</div>
														<div style={{ 
															width: '100%', 
															height: '8px', 
															backgroundColor: '#ccc', 
															borderRadius: '4px',
															overflow: 'hidden'
														}}>
															<div style={{ 
																width: `${Math.min(100, Math.max(0, (usageData.used / usageData.total) * 100))}%`,
																height: '100%',
																backgroundColor: '#28a745',
																transition: 'width 0.3s ease'
															}} />
														</div>
													</div>
												)}
											</div>
										)}
									</div>
								)}
							</div>
						</div>

						{hasApiKey && (
							<>
								<div className="settings-group-container">
									<div className="settings-group-content">
										<h3 className="settings-group-title-label">Security and Web Search</h3>
										
										<div className="setting-item setting-item-toggle">
											<div className="setting-item-contents">
												<div className="setting-item-title">
													<span className="setting-item-label">Secure mode</span>
												</div>
												<div className="setting-item-value setting-item-toggle-value">
													<label className="toggle-switch">
														<input
															type="checkbox"
															checked={securityMode === 'secure'}
															onChange={(e) => handleSecurityModeChange(e.target.checked ? 'secure' : 'improve')}
														/>
														<span className="toggle-slider"></span>
													</label>
													<span className="toggle-label">
														{securityMode === 'secure' ? 'Secure' : 'Improve Rao for everyone'}
													</span>
												</div>
											</div>
											<div className="setting-item-description">
												On secure mode, no analytics are collected and zero data is retained by the model providers. This must be used for any sensitive data like PHI. On "Improve Rao for everyone," user analytics are collected to improve the experience. Still, zero data is retained by the model providers. Your current mode is: {securityMode === 'secure' ? 'Secure' : 'Improve Rao for everyone'}
											</div>
										</div>
										
										<div className="setting-item setting-item-toggle">
											<div className="setting-item-contents">
												<div className="setting-item-title">
													<span className="setting-item-label">Web search</span>
												</div>
												<div className="setting-item-value setting-item-toggle-value">
													<label className="toggle-switch">
														<input
															type="checkbox"
															checked={webSearchEnabled}
															onChange={(e) => handleWebSearchChange(e.target.checked)}
														/>
														<span className="toggle-slider"></span>
													</label>
													<span className="toggle-label">
														{webSearchEnabled ? 'On' : 'Off'}
													</span>
												</div>
											</div>
											<div className="setting-item-description">
												When web search is on, the model may choose to search the web. Such searches could involve information from the conversation history and should be disabled for sensitive data like PHI. Web search is currently: {webSearchEnabled ? 'on' : 'off'}
											</div>
										</div>
										
									</div>
								</div>
								<div className="settings-group-container">
									<div className="settings-group-content">
										<h3 className="settings-group-title-label">Auto-accept</h3>
										
										<div className="setting-item setting-item-toggle">
											<div className="setting-item-contents">
												<div className="setting-item-title">
													<span className="setting-item-label">Auto-accept edits</span>
												</div>
												<div className="setting-item-value setting-item-toggle-value">
													<label className="toggle-switch">
														<input
															type="checkbox"
															checked={autoAcceptEdits}
															onChange={(e) => handleAutoAcceptEditsChange(e.target.checked)}
														/>
														<span className="toggle-slider"></span>
													</label>
													<span className="toggle-label">
														{autoAcceptEdits ? 'On' : 'Off'}
													</span>
												</div>
											</div>
											<div className="setting-item-description">
												When auto-accept edits is on, AI-proposed file edits will be automatically applied without requiring manual confirmation. Auto-accept edits is currently: {autoAcceptEdits ? 'on' : 'off'}
											</div>
										</div>
										
										<div className="setting-item setting-item-toggle">
											<div className="setting-item-contents">
												<div className="setting-item-title">
													<span className="setting-item-label">Auto-accept deletes</span>
												</div>
												<div className="setting-item-value setting-item-toggle-value">
													<label className="toggle-switch">
														<input
															type="checkbox"
															checked={autoAcceptDeletes}
															onChange={(e) => handleAutoAcceptDeletesChange(e.target.checked)}
														/>
														<span className="toggle-slider"></span>
													</label>
													<span className="toggle-label">
														{autoAcceptDeletes ? 'On' : 'Off'}
													</span>
												</div>
											</div>
										<div className="setting-item-description">
											When auto-accept deletes is on, AI-proposed file deletions will be automatically executed without requiring manual confirmation. Use with caution. Auto-accept deletes is currently: {autoAcceptDeletes ? 'on' : 'off'}
										</div>
									</div>

									{!isWindows ? (
										<div className="setting-item setting-item-toggle terminal-auto-accept-container">
											<div className="setting-item-contents">
												<div className="setting-item-title">
													<span className="setting-item-label">Auto-accept terminal</span>
												</div>
												<div className="setting-item-value setting-item-toggle-value">
													<label className="toggle-switch">
														<input
															type="checkbox"
															checked={autoAcceptTerminal}
															onChange={(e) => handleAutoAcceptTerminalChange(e.target.checked)}
														/>
														<span className="toggle-slider"></span>
													</label>
													<span className="toggle-label">
														{autoAcceptTerminal ? 'On' : 'Off'}
													</span>
												</div>
											</div>
											<div className="setting-item-description">
												When auto-accept terminal is on, AI-proposed terminal commands will be automatically executed based on your allow/deny list settings. Auto-accept terminal is currently: {autoAcceptTerminal ? 'on' : 'off'}
											</div>

											{autoAcceptTerminal && (
												<div className="terminal-auto-accept-nested-settings">
													<div className="terminal-mode-toggle-section">
														<div className="terminal-mode-label">Mode:</div>
														<div className="custom-mode-slider">
															<div className={`mode-slider-track ${terminalAutoAcceptMode === 'deny-list' ? 'deny-mode' : 'allow-mode'}`} onClick={() => handleTerminalAutoAcceptModeChange(terminalAutoAcceptMode === 'allow-list' ? 'deny-list' : 'allow-list')}>
																<span className={`mode-option ${terminalAutoAcceptMode === 'allow-list' ? 'active' : ''}`}>Allow list</span>
																<span className={`mode-option ${terminalAutoAcceptMode === 'deny-list' ? 'active' : ''}`}>Deny list</span>
															</div>
														</div>
													</div>

													<div className="command-list-section">
														<div className="command-input-section">
															<div className="command-input-row">
																<input
																	type="text"
																	className="settings-input command-list-input"
																	placeholder={`Add command to ${terminalAutoAcceptMode === 'allow-list' ? 'allow' : 'deny'} list`}
																	value={newCommandInput}
																	onChange={(e) => setNewCommandInput(e.target.value)}
																	onKeyDown={(e) => e.key === 'Enter' && handleAddCommand()}
																/>
																<button 
																	className="settings-button primary"
																	onClick={handleAddCommand}
																	disabled={!newCommandInput.trim()}
																	style={{ marginLeft: '8px', padding: '6px 12px' }}
																>
																	Add
																</button>
															</div>
															<div className="command-tags-container">
																{(terminalAutoAcceptMode === 'allow-list' ? terminalAllowList : terminalDenyList).map(command => (
																	<div key={command} className="command-tag" title={`Click to remove ${command}`}>
																		<span className="command-tag-text">{command}</span>
																		<button 
																			className="command-tag-remove"
																			onClick={() => handleRemoveCommand(command)}
																			title={`Remove ${command}`}
																		>
																			<span className="codicon codicon-x"></span>
																		</button>
																	</div>
																))}
															</div>
														</div>
													</div>
												</div>
											)}
										</div>
									) : (
										<div className="setting-item">
											<div className="setting-item-contents">
												<div className="setting-item-title">
													<span className="setting-item-label">Auto-accept terminal</span>
												</div>
												<div className="setting-item-value">
													<span style={{ color: 'var(--vscode-descriptionForeground)' }}>
														Not yet available for Windows
													</span>
												</div>
											</div>
											<div className="setting-item-description">
												Terminal auto-accept is currently only supported on macOS and Linux systems.
											</div>
										</div>
									)}

									<div className="setting-item setting-item-toggle console-auto-accept-container">
										<div className="setting-item-contents">
											<div className="setting-item-title">
												<span className="setting-item-label">Auto-accept console</span>
											</div>
											<div className="setting-item-value setting-item-toggle-value">
												<label className="toggle-switch">
													<input
														type="checkbox"
														checked={autoAcceptConsole}
														onChange={(e) => handleAutoAcceptConsoleChange(e.target.checked)}
													/>
													<span className="toggle-slider"></span>
												</label>
												<span className="toggle-label">
													{autoAcceptConsole ? 'On' : 'Off'}
												</span>
											</div>
										</div>
										<div className="setting-item-description">
											When auto-accept console is on, AI-proposed Python/R console commands will be automatically executed based on your allow/deny list and language filter settings. Auto-accept console is currently: {autoAcceptConsole ? 'on' : 'off'}
										</div>

										{autoAcceptConsole && (
											<div className="console-auto-accept-nested-settings">
												<div className="console-mode-toggle-section">
													<div className="console-mode-left">
														<div className="console-mode-label">Mode:</div>
														<div className="custom-mode-slider">
															<div className={`mode-slider-track ${consoleAutoAcceptMode === 'deny-list' ? 'deny-mode' : 'allow-mode'}`} onClick={() => handleConsoleAutoAcceptModeChange(consoleAutoAcceptMode === 'allow-list' ? 'deny-list' : 'allow-list')}>
																<span className={`mode-option ${consoleAutoAcceptMode === 'allow-list' ? 'active' : ''}`}>Allow list</span>
																<span className={`mode-option ${consoleAutoAcceptMode === 'deny-list' ? 'active' : ''}`}>Deny list</span>
															</div>
														</div>
													</div>
													<div className="console-language-icons">
														{erdosHelpSearchService?.getActiveHelpRuntimes().map(language => {
															const isActive = newConsoleFunctionLanguage === language.languageId;
															return (
																<button
																	key={language.languageId}
																	className={`language-icon-button ${isActive ? 'active' : 'inactive'}`}
																	onClick={() => {
																		// Set the language for adding new functions
																		setNewConsoleFunctionLanguage(language.languageId as 'python' | 'r');
																		// Also update the filter to show functions of this language
																		handleConsoleLanguageFilterChange(language.languageId as 'python' | 'r');
																	}}
																	title={`Add functions as ${language.languageName}`}
																	aria-label={`Add functions as ${language.languageName}`}
																>
																	{language.base64EncodedIconSvg ? (
																		<img 
																			className="language-icon"
																			src={`data:image/svg+xml;base64,${language.base64EncodedIconSvg}`}
																			alt={`${language.languageName} icon`}
																		/>
																	) : (
																		<span className="codicon codicon-circle" />
																	)}
																</button>
															);
														})}
													</div>
												</div>

												<div className="command-list-section">
													<div className="command-input-section">
														<div className="command-input-row">
															<input
																type="text"
																className="settings-input command-list-input"
																placeholder={`Add function to ${consoleAutoAcceptMode === 'allow-list' ? 'allow' : 'deny'} list`}
																value={newConsoleFunctionInput}
																onChange={(e) => setNewConsoleFunctionInput(e.target.value)}
																onKeyDown={(e) => e.key === 'Enter' && handleAddConsoleFunction()}
															/>
															<button 
																className="settings-button primary"
																onClick={handleAddConsoleFunction}
																disabled={!newConsoleFunctionInput.trim()}
																style={{ marginLeft: '8px', padding: '5px 12px' }}
															>
																Add
															</button>
														</div>
														<div className="command-tags-container">
															{(consoleAutoAcceptMode === 'allow-list' ? consoleAllowList : consoleDenyList)
																.filter(item => {
																	// Filter based on language selection
																	if (consoleLanguageFilter === 'both') return true;
																	return item.language === consoleLanguageFilter;
																})
																.sort((a, b) => a.function.localeCompare(b.function))
																.map(item => {
																	const key = `${item.function}-${item.language}`;
																	return (
																	<div key={key} className="command-tag" title={`Click to remove ${item.function}`}>
																		<span className="command-tag-text">{item.function}</span>
																		<button 
																			className="command-tag-remove"
																			onClick={() => handleRemoveConsoleFunction(item.function, item.language)}
																			title={`Remove ${item.function}`}
																		>
																			<span className="codicon codicon-x"></span>
																		</button>
																	</div>
																	);
																})}
														</div>
													</div>
												</div>
											</div>
										)}
									</div>
									
								</div>
							</div>
								<div className="settings-group-container">
									<div className="settings-group-content">
										<h3 className="settings-group-title-label">Model Settings</h3>
										
										<div className="setting-item setting-item-enum">
											<div className="setting-item-contents">
												<div className="setting-item-title">
													<span className="setting-item-label">Selected Model</span>
												</div>
												<div className="setting-item-value">
													<div className="setting-item-control dropdown-control">
														<select 
															className="monaco-select-box"
															value={selectedModel}
															onChange={(e) => handleModelChange(e.target.value)}
														>
															{availableModels.map(model => (
																<option key={model} value={model}>{model}</option>
															))}
														</select>
														<span className="dropdown-chevron codicon codicon-chevron-down"></span>
													</div>
												</div>
											</div>
										</div>
										
										<div className="setting-item setting-item-number">
											<div className="setting-item-contents">
												<div className="setting-item-title">
													<span className="setting-item-label">Temperature: {temperature}</span>
												</div>
												<div className="setting-item-value">
													<input
														type="range"
														min="0"
														max="1"
														step="0.1"
														value={temperature}
														onChange={(e) => handleTemperatureChange(parseFloat(e.target.value))}
														className="temperature-slider"
													/>
												</div>
											</div>
										</div>
									</div>
								</div>
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};