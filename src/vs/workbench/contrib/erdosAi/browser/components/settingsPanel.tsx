/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from 'react';
import { IErdosAiAuthService } from '../../../../services/erdosAi/common/erdosAiAuthService.js';
import { IErdosAiServiceCore } from '../../../../services/erdosAi/common/erdosAiServiceCore.js';
import { IErdosAiSettingsService } from '../../../../services/erdosAiSettings/common/settingsService.js';
import { IErdosHelpSearchService } from '../../../erdosHelp/browser/erdosHelpSearchService.js';
import { isWindows } from '../../../../../base/common/platform.js';

// Helper function to calculate and set textarea height (from MessageRenderer.tsx)
const calculateAndSetTextareaHeight = (textarea: HTMLTextAreaElement, content: string) => {
	// Reset height to auto to get accurate scrollHeight measurement
	textarea.style.height = 'auto';
	
	// Use the actual scrollHeight from the DOM, which accounts for text wrapping
	// This is more accurate than just counting newline characters
	const actualScrollHeight = textarea.scrollHeight;
	const maxHeight = 120; // Match CSS max-height
	const minHeight = 18.2; // At least 1 line (13px * 1.4)
	
	// Use the browser-calculated scroll height, clamped to our min/max bounds
	const newHeight = Math.max(minHeight, Math.min(actualScrollHeight, maxHeight));
	
	textarea.style.height = `${newHeight}px`;
	textarea.style.setProperty('height', `${newHeight}px`, 'important');
};

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

	// User rules settings
	const [userRules, setUserRules] = useState<string[]>([]);
	const [newRuleInput, setNewRuleInput] = useState('');
	const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
	const [editingRuleText, setEditingRuleText] = useState('');

	// BYOK settings
	const [byokAnthropicEnabled, setBYOKAnthropicEnabled] = useState(false);
	const [byokOpenAiEnabled, setBYOKOpenAiEnabled] = useState(false);
	const [byokAnthropicKey, setBYOKAnthropicKey] = useState('');
	const [byokOpenAiKey, setBYOKOpenAiKey] = useState('');
	const [byokAnthropicKeyStored, setBYOKAnthropicKeyStored] = useState(false);
	const [byokOpenAiKeyStored, setBYOKOpenAiKeyStored] = useState(false);

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
				autoAcceptCons, consoleMode, consoleLanguage, consoleAllowList, consoleDenyList,
				rules, byokAnthropicEn, byokOpenAiEn
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
				props.erdosAiSettingsService.getConsoleDenyList().catch(() => []),
				props.erdosAiSettingsService.getUserRules().catch(() => []),
				props.erdosAiSettingsService.getBYOKAnthropicEnabled().catch(() => false),
				props.erdosAiSettingsService.getBYOKOpenAiEnabled().catch(() => false)
			]);

			// Check for stored BYOK keys
			const [anthropicKeyStored, openAiKeyStored] = await Promise.all([
				props.erdosAiAuthService.hasBYOKKey('anthropic').catch(() => false),
				props.erdosAiAuthService.hasBYOKKey('openai').catch(() => false)
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
			setUserRules(rules);
			setBYOKAnthropicEnabled(byokAnthropicEn);
			setBYOKOpenAiEnabled(byokOpenAiEn);
			setBYOKAnthropicKeyStored(anthropicKeyStored);
			setBYOKOpenAiKeyStored(openAiKeyStored);

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

	// User rules handlers
	const handleAddRule = async () => {
		const rule = newRuleInput.trim();
		if (!rule) return;

		try {
			const success = await props.erdosAiSettingsService.addUserRule(rule);
			if (success) {
				setUserRules(prev => [...prev, rule]);
				setNewRuleInput('');
			}
		} catch (error) {
			console.error('Failed to add rule:', error);
		}
	};

	const handleStartEditRule = (index: number) => {
		setEditingRuleIndex(index);
		setEditingRuleText(userRules[index]);
	};

	// Auto-resize textarea when editing starts
	useEffect(() => {
		if (editingRuleIndex !== null) {
			// Use setTimeout to ensure the textarea is rendered before trying to resize it
			setTimeout(() => {
				const textarea = document.querySelector('.command-tag textarea') as HTMLTextAreaElement;
				if (textarea) {
					calculateAndSetTextareaHeight(textarea, editingRuleText);
				}
			}, 0);
		}
	}, [editingRuleIndex, editingRuleText]);

	const handleSaveEditRule = async () => {
		if (editingRuleIndex === null) return;
		
		const rule = editingRuleText.trim();
		if (!rule) return;

		try {
			const success = await props.erdosAiSettingsService.editUserRule(editingRuleIndex, rule);
			if (success) {
				setUserRules(prev => prev.map((r, i) => i === editingRuleIndex ? rule : r));
				setEditingRuleIndex(null);
				setEditingRuleText('');
			}
		} catch (error) {
			console.error('Failed to edit rule:', error);
		}
	};

	const handleCancelEditRule = () => {
		setEditingRuleIndex(null);
		setEditingRuleText('');
	};

	const handleDeleteRule = async (index: number) => {
		try {
			const success = await props.erdosAiSettingsService.deleteUserRule(index);
			if (success) {
				setUserRules(prev => prev.filter((_, i) => i !== index));
			}
		} catch (error) {
			console.error('Failed to delete rule:', error);
		}
	};

	// BYOK handlers
	const handleBYOKAnthropicToggle = async (enabled: boolean) => {
		setBYOKAnthropicEnabled(enabled);
		try {
			await props.erdosAiSettingsService.setBYOKAnthropicEnabled(enabled);
			if (!enabled) {
				// When disabled, also clear the key input
				setBYOKAnthropicKey('');
			}
			
			// Reload available models and selected model when BYOK settings change
			const [newModels, newSelectedModel] = await Promise.all([
				props.erdosAiSettingsService.getAvailableModels(),
				props.erdosAiSettingsService.getSelectedModel()
			]);
			setAvailableModels(newModels);
			setSelectedModel(newSelectedModel);
		} catch (error) {
			console.error('Failed to set BYOK Anthropic enabled:', error);
		}
	};

	const handleBYOKOpenAiToggle = async (enabled: boolean) => {
		setBYOKOpenAiEnabled(enabled);
		try {
			await props.erdosAiSettingsService.setBYOKOpenAiEnabled(enabled);
			if (!enabled) {
				// When disabled, also clear the key input
				setBYOKOpenAiKey('');
			}
			
			// Reload available models and selected model when BYOK settings change
			const [newModels, newSelectedModel] = await Promise.all([
				props.erdosAiSettingsService.getAvailableModels(),
				props.erdosAiSettingsService.getSelectedModel()
			]);
			setAvailableModels(newModels);
			setSelectedModel(newSelectedModel);
		} catch (error) {
			console.error('Failed to set BYOK OpenAI enabled:', error);
		}
	};

	const handleSaveBYOKAnthropicKey = async () => {
		if (!byokAnthropicKey.trim()) {
			return;
		}
		try {
			const result = await props.erdosAiAuthService.saveBYOKKey('anthropic', byokAnthropicKey);
			if (result.success) {
				setBYOKAnthropicKeyStored(true);
				setBYOKAnthropicKey('');
			} else {
				console.error('Failed to save Anthropic key:', result.message);
			}
		} catch (error) {
			console.error('Failed to save Anthropic key:', error);
		}
	};

	const handleSaveBYOKOpenAiKey = async () => {
		if (!byokOpenAiKey.trim()) {
			return;
		}
		try {
			const result = await props.erdosAiAuthService.saveBYOKKey('openai', byokOpenAiKey);
			if (result.success) {
				setBYOKOpenAiKeyStored(true);
				setBYOKOpenAiKey('');
			} else {
				console.error('Failed to save OpenAI key:', result.message);
			}
		} catch (error) {
			console.error('Failed to save OpenAI key:', error);
		}
	};

	const handleDeleteBYOKAnthropicKey = async () => {
		try {
			const result = await props.erdosAiAuthService.deleteBYOKKey('anthropic');
			if (result.success) {
				setBYOKAnthropicKeyStored(false);
				setBYOKAnthropicKey('');
			} else {
				console.error('Failed to delete Anthropic key:', result.message);
			}
		} catch (error) {
			console.error('Failed to delete Anthropic key:', error);
		}
	};

	const handleDeleteBYOKOpenAiKey = async () => {
		try {
			const result = await props.erdosAiAuthService.deleteBYOKKey('openai');
			if (result.success) {
				setBYOKOpenAiKeyStored(false);
				setBYOKOpenAiKey('');
			} else {
				console.error('Failed to delete OpenAI key:', result.message);
			}
		} catch (error) {
			console.error('Failed to delete OpenAI key:', error);
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
									<div className="error-text">
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
													<div className="error-text-small">
														{apiKeyError}
													</div>
												)}
												<button 
													className="settings-button primary api-key-save-button"
													onClick={handleSaveApiKey}
													disabled={isLoading}
												>
													{isLoading ? 'Saving...' : 'Save API Key'}
												</button>
											</div>
										)}
									</div>
								) : (
									<div>
										<div className="profile-header">
											<div className="profile-name">{getUserDisplayName()}</div>
											<button 
												className="settings-button small-button"
												onClick={handleSignOut}
												disabled={isLoading}
											>
												{isLoading ? 'Signing out...' : 'Sign out'}
											</button>
										</div>
										
										{subscriptionStatus && (
											<div>
												<div className="subscription-item">
													<strong>Subscription:</strong> {formatSubscriptionStatus(subscriptionStatus.subscription_status)}
												</div>
												
												{usageData && (
													<div className="usage-section">
														<div className="usage-text">
															<strong>Monthly usage:</strong> {usageData.used} / {usageData.total} queries
														</div>
														<div className="usage-bar">
															<div 
																className="usage-bar-fill"
																style={{ 
																	width: `${Math.min(100, Math.max(0, (usageData.used / usageData.total) * 100))}%`
																}} 
															/>
														</div>
													</div>
												)}
											</div>
										)}
									</div>
								)}
							</div>
						</div>


						{(hasApiKey || byokAnthropicEnabled || byokOpenAiEnabled) && (
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
																	className="settings-button primary command-add-button"
																	onClick={handleAddCommand}
																	disabled={!newCommandInput.trim()}
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
													<span className="unavailable-text">
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
																className="settings-button primary console-add-button"
																onClick={handleAddConsoleFunction}
																disabled={!newConsoleFunctionInput.trim()}
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
									<h3 className="settings-group-title-label">Rules</h3>
									
									<div className="setting-item">
										<div className="setting-item-description">
											These rules are provided to the AI on each query to guide its response.
										</div>

										<div className="command-list-section">
											<div className="command-input-section">
												<div className="command-input-row">
													<textarea
														className="settings-input command-list-input rules-textarea"
														placeholder="Enter a rule"
														value={newRuleInput}
														onChange={(e) => {
															const newValue = e.target.value;
															setNewRuleInput(newValue);
															// Use the same height calculation function as MessageRenderer
															const textarea = e.currentTarget as HTMLTextAreaElement;
															calculateAndSetTextareaHeight(textarea, newValue);
														}}
														rows={1}
													/>
													<button 
														className="settings-button primary rules-add-button"
														onClick={handleAddRule}
														disabled={!newRuleInput.trim()}
													>
														Add
													</button>
												</div>
												<div className="command-tags-container">
													{userRules.map((rule, index) => (
														<div key={index} className="command-tag rules-command-tag">
															{editingRuleIndex === index ? (
																<div className="rules-edit-container">
																	<textarea
																		className="settings-input rules-edit-textarea"
																		value={editingRuleText}
																		onChange={(e) => {
																			const newValue = e.target.value;
																			setEditingRuleText(newValue);
																			// Use the same height calculation function as MessageRenderer
																			const textarea = e.currentTarget as HTMLTextAreaElement;
																			calculateAndSetTextareaHeight(textarea, newValue);
																		}}
																		rows={1}
																	/>
																	<div className="rules-buttons-container">
																		<button 
																			className="command-tag-remove"
																			onClick={handleSaveEditRule}
																			disabled={!editingRuleText.trim()}
																			title="Save rule"
																		>
																			<span className="codicon codicon-check"></span>
																		</button>
																		<button 
																			className="command-tag-remove"
																			onClick={handleCancelEditRule}
																			title="Cancel edit"
																		>
																			<span className="codicon codicon-x"></span>
																		</button>
																	</div>
																</div>
															) : (
																<>
																	<span className="command-tag-text rules-text-content">
																		{rule}
																	</span>
																	<div className="rules-buttons-container">
																		<button 
																			className="command-tag-remove"
																			onClick={() => handleStartEditRule(index)}
																			title="Edit rule"
																		>
																			<span className="codicon codicon-edit"></span>
																		</button>
																		<button 
																			className="command-tag-remove"
																			onClick={() => handleDeleteRule(index)}
																			title="Remove rule"
																		>
																			<span className="codicon codicon-trash"></span>
																		</button>
																	</div>
																</>
															)}
														</div>
													))}
												</div>
											</div>
										</div>
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

						{/* BYOK Section - Always visible at the bottom */}
						<div className="settings-group-container">
							<div className="settings-group-content">
								<h3 className="settings-group-title-label">Bring Your Own Key</h3>
								<div className="settings-group-description">
									Use your own API keys to connect directly to AI providers. When enabled, requests will use your keys instead of routing through Lotas servers.
								</div>
								
								{/* Anthropic BYOK */}
								<div className="setting-item setting-item-toggle">
									<div className="setting-item-contents">
										<div className="setting-item-title">
											<span className="setting-item-label">Anthropic</span>
										</div>
										<div className="setting-item-value setting-item-toggle-value">
											<label className="toggle-switch">
												<input
													type="checkbox"
													checked={byokAnthropicEnabled}
													onChange={(e) => handleBYOKAnthropicToggle(e.target.checked)}
												/>
												<span className="toggle-slider"></span>
											</label>
											<span className="toggle-label">
												{byokAnthropicEnabled ? 'On' : 'Off'}
											</span>
										</div>
									</div>
									<div className="setting-item-description">
										Use your own Anthropic API key. Your key is stored securely in your secret manager.
									</div>

									{byokAnthropicEnabled && (
										<div className="command-list-section">
											{byokAnthropicKeyStored ? (
												<div className="key-stored-section">
													<span className="key-stored-text">Key stored</span>
													<button 
														className="key-delete-button"
														onClick={handleDeleteBYOKAnthropicKey}
														title="Remove stored key"
													>
														<span className="codicon codicon-trash"></span>
													</button>
												</div>
											) : (
												<div className="command-input-section">
													<div className="command-input-row">
														<input
															type="password"
															className="settings-input command-list-input"
															placeholder="Enter your Anthropic API key"
															value={byokAnthropicKey}
															onChange={(e) => setBYOKAnthropicKey(e.target.value)}
															onKeyDown={(e) => e.key === 'Enter' && handleSaveBYOKAnthropicKey()}
														/>
														<button 
															className="settings-button primary command-add-button"
															onClick={handleSaveBYOKAnthropicKey}
															disabled={!byokAnthropicKey.trim()}
														>
															Save
														</button>
													</div>
												</div>
											)}
										</div>
									)}
								</div>

								{/* OpenAI BYOK */}
								<div className="setting-item setting-item-toggle">
									<div className="setting-item-contents">
										<div className="setting-item-title">
											<span className="setting-item-label">OpenAI</span>
										</div>
										<div className="setting-item-value setting-item-toggle-value">
											<label className="toggle-switch">
												<input
													type="checkbox"
													checked={byokOpenAiEnabled}
													onChange={(e) => handleBYOKOpenAiToggle(e.target.checked)}
												/>
												<span className="toggle-slider"></span>
											</label>
											<span className="toggle-label">
												{byokOpenAiEnabled ? 'On' : 'Off'}
											</span>
										</div>
									</div>
									<div className="setting-item-description">
										Use your own OpenAI API key. Your key is stored securely in your secret manager.
									</div>

									{byokOpenAiEnabled && (
										<div className="command-list-section">
											{byokOpenAiKeyStored ? (
												<div className="key-stored-section">
													<span className="key-stored-text">Key stored</span>
													<button 
														className="key-delete-button"
														onClick={handleDeleteBYOKOpenAiKey}
														title="Remove stored key"
													>
														<span className="codicon codicon-trash"></span>
													</button>
												</div>
											) : (
												<div className="command-input-section">
													<div className="command-input-row">
														<input
															type="password"
															className="settings-input command-list-input"
															placeholder="Enter your OpenAI API key"
															value={byokOpenAiKey}
															onChange={(e) => setBYOKOpenAiKey(e.target.value)}
															onKeyDown={(e) => e.key === 'Enter' && handleSaveBYOKOpenAiKey()}
														/>
														<button 
															className="settings-button primary command-add-button"
															onClick={handleSaveBYOKOpenAiKey}
															disabled={!byokOpenAiKey.trim()}
														>
															Save
														</button>
													</div>
												</div>
											)}
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};