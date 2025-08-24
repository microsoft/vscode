/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { IErdosAiService } from '../../common/erdosAiService.js';
import './settings.css';

export interface SettingsPanelProps {
	readonly erdosAiService: IErdosAiService;
	readonly onClose: () => void;
}

export const SettingsPanel = (props: SettingsPanelProps) => {
	// Authentication state
	const [hasApiKey, setHasApiKey] = useState(false);
	const [userProfile, setUserProfile] = useState<any>(null);
	const [subscriptionStatus, setSubscriptionStatus] = useState<any>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [profileError, setProfileError] = useState<string | null>(null);
	
	// API Key input state
	const [showApiKeyInput, setShowApiKeyInput] = useState(false);
	const [apiKeyValue, setApiKeyValue] = useState('');
	const [apiKeyError, setApiKeyError] = useState<string | null>(null);

	// Model settings
	const [availableModels, setAvailableModels] = useState<string[]>([]);
	const [selectedModel, setSelectedModel] = useState<string>('');
	const [temperature, setTemperature] = useState(0.5);

	// Other settings
	const [securityMode, setSecurityMode] = useState<string>('secure');
	const [webSearchEnabled, setWebSearchEnabled] = useState(false);

	// Load initial data
	useEffect(() => {
		loadSettings();
		
		// Set up a periodic refresh to catch OAuth completion
		const refreshInterval = setInterval(() => {
			loadSettings();
		}, 2000);
		
		return () => clearInterval(refreshInterval);
	}, []);

	const loadSettings = async () => {
		try {

			setProfileError(null);
			setApiKeyError(null);
			
			// Check API key status first
			const hasKey = await props.erdosAiService.getApiKeyStatus();

			setHasApiKey(hasKey);
			
			// Load all settings regardless of API key status
			const [
				models, model, temp, security, webSearch
			] = await Promise.all([
				props.erdosAiService.getAvailableModels().catch(() => []),
				props.erdosAiService.getSelectedModel().catch(() => ''),
				props.erdosAiService.getTemperature().catch(() => 0.5),
				props.erdosAiService.getSecurityMode().catch(() => 'secure'),
				props.erdosAiService.getWebSearchEnabled().catch(() => false)
			]);



			setAvailableModels(models);
			setSelectedModel(model || '');
			setTemperature(temp);
			setSecurityMode(security);
			setWebSearchEnabled(webSearch);

			// Load profile and subscription data if authenticated
			if (hasKey) {
				try {
					const profile = await props.erdosAiService.getUserProfile();
					setUserProfile(profile);
				} catch (error) {
					setProfileError(`Failed to load profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
				
				try {
					const subscription = await props.erdosAiService.getSubscriptionStatus();
					setSubscriptionStatus(subscription);
				} catch (error) {
					// Subscription status is non-critical, just log it
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
			await props.erdosAiService.signOut();
			await loadSettings();
		} catch (error) {
			console.error('Sign out failed:', error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleSignIn = async () => {
		setIsLoading(true);
		try {
			await props.erdosAiService.startOAuthFlow();
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
			const result = await props.erdosAiService.saveApiKey('rao', apiKeyValue);
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
			await props.erdosAiService.setSelectedModel(model);

		} catch (error) {
			console.error('[ErdosAI Settings] Failed to set model:', error);
		}
	};

	const handleTemperatureChange = async (newTemp: number) => {
		setTemperature(newTemp);
		try {
			await props.erdosAiService.setTemperature(newTemp);
		} catch (error) {
			console.error('Failed to set temperature:', error);
		}
	};

	const handleSecurityModeChange = async (mode: string) => {

		setSecurityMode(mode);
		try {
			await props.erdosAiService.setSecurityMode(mode as 'secure' | 'improve');

		} catch (error) {
			console.error('[ErdosAI Settings] Failed to set security mode:', error);
		}
	};

	const handleWebSearchChange = async (enabled: boolean) => {
		setWebSearchEnabled(enabled);
		try {
			await props.erdosAiService.setWebSearchEnabled(enabled);
		} catch (error) {
			console.error('Failed to set web search enabled:', error);
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
		<div className="settings-editor">
			{/* Header with back button matching VS Code pattern */}
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
						{/* Profile Section */}
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
										{/* Profile header with name on right and sign-out button */}
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
									{/* Security and Web Search Section */}
									<div className="settings-group-container">
										<div className="settings-group-content">
											<h3 className="settings-group-title-label">Security and Web Search</h3>
											
											{/* Security Mode Toggle */}
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
											
											{/* Web Search Toggle */}
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
																	{/* Model and Temperature Section */}
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