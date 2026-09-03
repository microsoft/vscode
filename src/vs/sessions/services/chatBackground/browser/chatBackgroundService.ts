/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as css from '../../../../base/browser/cssValue.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ColorScheme, isDark, isHighContrast } from '../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { SessionsChatBackgroundAvailableContext, SessionsChatBackgroundConfiguredContext, SessionsChatBackgroundImageConfiguredContext } from '../../../common/contextkeys.js';

export const AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING = 'chat.agentSessions.preferredDarkBackgroundImage';
export const AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING = 'chat.agentSessions.preferredLightBackgroundImage';
export const AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING = 'chat.agentSessions.preferredDarkBackgroundImageLayout';
export const AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING = 'chat.agentSessions.preferredLightBackgroundImageLayout';
export const AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET = 'codicons';
export type SessionsChatBackgroundPreset = typeof AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET;
const RECENT_BACKGROUND_IMAGES_STORAGE_KEY = 'chat.agentSessions.recentBackgroundImages';
const MAX_RECENT_BACKGROUND_IMAGES = 5;

export interface ISessionsChatImageBackground {
	readonly kind: 'image';
	readonly backgroundImage: string;
	readonly backgroundRepeat: string;
	readonly backgroundSize: string;
	readonly backgroundPosition: string;
}

export interface ISessionsChatCodiconsBackground {
	readonly kind: 'codicons';
}

export type ISessionsChatBackground = ISessionsChatImageBackground | ISessionsChatCodiconsBackground;

const backgroundImageStyles = {
	repeat: { backgroundRepeat: 'repeat', backgroundSize: 'auto', backgroundPosition: 'left top' },
	stretch: { backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', backgroundPosition: 'center center' },
	center: { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'center center' },
	top: { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'center top' },
	'top-right': { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'right top' },
	'top-left': { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'left top' },
	bottom: { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'center bottom' },
	'bottom-right': { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'right bottom' },
	'bottom-left': { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'left bottom' },
	left: { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'left center' },
	right: { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'right center' },
} as const satisfies Record<string, Omit<ISessionsChatImageBackground, 'kind' | 'backgroundImage'>>;

export type ChatBackgroundImageLayout = keyof typeof backgroundImageStyles;

export const chatBackgroundImageLayoutValues = Object.keys(backgroundImageStyles) as ChatBackgroundImageLayout[];

export const ISessionsChatBackgroundService = createDecorator<ISessionsChatBackgroundService>('sessionsChatBackgroundService');

export interface ISessionsChatBackgroundService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeBackground: Event<void>;
	getBackground(): ISessionsChatBackground | undefined;
	getConfiguredBackgroundImage(): URI | undefined;
	getRecentBackgroundImages(): readonly URI[];
	getBackgroundImageLayout(): ChatBackgroundImageLayout;
	setBackground(background: URI | SessionsChatBackgroundPreset): Promise<void>;
	clearBackground(): Promise<void>;
	setBackgroundImageLayout(layout: ChatBackgroundImageLayout, persist?: boolean): Promise<void>;
}

export class SessionsChatBackgroundService extends Disposable implements ISessionsChatBackgroundService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeBackground = this._register(new Emitter<void>());
	readonly onDidChangeBackground = this._onDidChangeBackground.event;
	private backgroundImageLayout: ChatBackgroundImageLayout;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeService private readonly themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this.backgroundImageLayout = this.readConfiguredBackgroundImageLayout();
		const backgroundAvailableContext = SessionsChatBackgroundAvailableContext.bindTo(contextKeyService);
		const backgroundConfiguredContext = SessionsChatBackgroundConfiguredContext.bindTo(contextKeyService);
		const backgroundImageConfiguredContext = SessionsChatBackgroundImageConfiguredContext.bindTo(contextKeyService);
		const updateContextKeys = () => {
			const background = this.getConfiguredBackground();
			backgroundAvailableContext.set(!isHighContrast(this.themeService.getColorTheme().type));
			backgroundConfiguredContext.set(!!background);
			backgroundImageConfiguredContext.set(background?.kind === 'image');
		};
		updateContextKeys();
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			const backgroundImageChanged = event.affectsConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING)
				|| event.affectsConfiguration(AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING);
			const backgroundImageLayoutChanged = event.affectsConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING)
				|| event.affectsConfiguration(AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING);
			let backgroundChanged = backgroundImageChanged;
			if (backgroundImageChanged) {
				updateContextKeys();
			}
			if (backgroundImageLayoutChanged) {
				const layout = this.readConfiguredBackgroundImageLayout();
				if (layout !== this.backgroundImageLayout) {
					this.backgroundImageLayout = layout;
					backgroundChanged = true;
				}
			}
			if (backgroundChanged) {
				this._onDidChangeBackground.fire();
			}
		}));
		this._register(this.themeService.onDidColorThemeChange(() => {
			this.backgroundImageLayout = this.readConfiguredBackgroundImageLayout();
			updateContextKeys();
			this._onDidChangeBackground.fire();
		}));
	}

	getBackground(): ISessionsChatBackground | undefined {
		if (isHighContrast(this.themeService.getColorTheme().type)) {
			return undefined;
		}
		const configuredBackground = this.getConfiguredBackground();
		if (configuredBackground?.kind === 'codicons') {
			return configuredBackground;
		}
		return configuredBackground ? {
			kind: 'image',
			backgroundImage: css.asCSSUrl(configuredBackground.image),
			...backgroundImageStyles[this.getBackgroundImageLayout()],
		} : undefined;
	}

	getConfiguredBackgroundImage(): URI | undefined {
		const background = this.getConfiguredBackground();
		return background?.kind === 'image' ? background.image : undefined;
	}

	getRecentBackgroundImages(): readonly URI[] {
		const images = this.getStoredRecentBackgroundImages();
		const current = this.getConfiguredBackgroundImage();
		if (current && !images.some(image => isEqual(image, current))) {
			images.unshift(current);
		}
		return images.slice(0, MAX_RECENT_BACKGROUND_IMAGES);
	}

	async setBackground(background: URI | SessionsChatBackgroundPreset): Promise<void> {
		const setting = this.getBackgroundImageSetting(this.themeService.getColorTheme().type);
		await this.configurationService.updateValue(setting, URI.isUri(background) ? background.fsPath : background, ConfigurationTarget.USER);
		if (URI.isUri(background)) {
			this.storeRecentBackgroundImage(background);
		}
	}

	async clearBackground(): Promise<void> {
		const setting = this.getBackgroundImageSetting(this.themeService.getColorTheme().type);
		await this.configurationService.updateValue(setting, undefined, ConfigurationTarget.USER);
	}

	getBackgroundImageLayout(): ChatBackgroundImageLayout {
		return this.backgroundImageLayout;
	}

	async setBackgroundImageLayout(layout: ChatBackgroundImageLayout, persist = true): Promise<void> {
		const setting = this.getBackgroundImageLayoutSetting(this.themeService.getColorTheme().type);
		if (layout !== this.backgroundImageLayout) {
			this.backgroundImageLayout = layout;
			this._onDidChangeBackground.fire();
		}
		if (persist) {
			try {
				await this.configurationService.updateValue(setting, layout, ConfigurationTarget.USER);
			} catch (error) {
				const configuredLayout = this.readConfiguredBackgroundImageLayout();
				if (configuredLayout !== this.backgroundImageLayout) {
					this.backgroundImageLayout = configuredLayout;
					this._onDidChangeBackground.fire();
				}
				throw error;
			}
		}
	}

	private readConfiguredBackgroundImageLayout(): ChatBackgroundImageLayout {
		const colorSchemeSetting = this.getBackgroundImageLayoutSetting(this.themeService.getColorTheme().type);
		const value = this.configurationService.getValue<string>(colorSchemeSetting);
		return chatBackgroundImageLayoutValues.includes(value as ChatBackgroundImageLayout)
			? value as ChatBackgroundImageLayout
			: 'repeat';
	}

	private getBackgroundImageSetting(colorScheme: ColorScheme): string {
		return isDark(colorScheme)
			? AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING
			: AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING;
	}

	private getBackgroundImageLayoutSetting(colorScheme: ColorScheme): string {
		return isDark(colorScheme)
			? AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING
			: AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING;
	}

	private getConfiguredBackground(): { readonly kind: 'codicons' } | { readonly kind: 'image'; readonly image: URI } | undefined {
		const setting = this.getBackgroundImageSetting(this.themeService.getColorTheme().type);
		const value = this.configurationService.getValue<string>(setting);
		if (value?.trim() === AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET) {
			return { kind: 'codicons' };
		}
		const image = this.resolveBackgroundImage(value);
		return image ? { kind: 'image', image } : undefined;
	}

	private getStoredRecentBackgroundImages(): URI[] {
		const stored = this.storageService.getObject<string[]>(RECENT_BACKGROUND_IMAGES_STORAGE_KEY, StorageScope.PROFILE, []);
		if (!Array.isArray(stored)) {
			return [];
		}
		const images: URI[] = [];
		for (const value of stored) {
			if (typeof value !== 'string') {
				continue;
			}
			const image = this.resolveBackgroundImage(value);
			if (image && !images.some(existing => isEqual(existing, image))) {
				images.push(image);
			}
		}
		return images.slice(0, MAX_RECENT_BACKGROUND_IMAGES);
	}

	private storeRecentBackgroundImage(image: URI): void {
		const images = [
			image,
			...this.getStoredRecentBackgroundImages().filter(existing => !isEqual(existing, image)),
		].slice(0, MAX_RECENT_BACKGROUND_IMAGES);
		this.storageService.store(
			RECENT_BACKGROUND_IMAGES_STORAGE_KEY,
			JSON.stringify(images.map(recent => recent.toString())),
			StorageScope.PROFILE,
			StorageTarget.MACHINE
		);
	}

	private resolveBackgroundImage(value: string | undefined): URI | undefined {
		const candidate = value?.trim();
		if (!candidate) {
			return undefined;
		}

		if (isAbsolute(candidate)) {
			return URI.file(candidate);
		}

		const uri = URI.parse(candidate);
		return uri.scheme === Schemas.file ? uri : undefined;
	}
}
