/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as css from '../../../../base/browser/cssValue.js';
import { Sequencer } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
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

/** File extensions of the image formats a chat background can display. */
export const chatBackgroundImageExtensions: readonly string[] = ['avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'];

/** The configured background, whether or not the theme shows it. */
export type ISessionsChatConfiguredBackground = { readonly kind: 'codicons' } | { readonly kind: 'image'; readonly image: URI };

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

/**
 * What changed the chat background: the Set Chat Background tool of an agent, or the background or
 * layout quick pick of the Agents window. Changes from anywhere else are reported as `settings`.
 */
export type ChatBackgroundChangeSource = 'agent' | 'backgroundPicker' | 'layoutPicker';

type ChatBackgroundChangedEvent = {
	source: ChatBackgroundChangeSource | 'settings';
	change: 'background' | 'layout';
	background: 'userImage' | 'builtin' | 'none';
	layout: ChatBackgroundImageLayout | undefined;
	colorScheme: 'dark' | 'light';
};

type ChatBackgroundChangedClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What made the change: agent for the Set Chat Background tool, backgroundPicker or layoutPicker for the Agents window quick picks, or settings for anything else, such as the Settings editor, settings.json, or Settings Sync.' };
	change: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the background changed, or only the layout of its image.' };
	background: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The background after the change: userImage for an image file from the user or an agent, builtin for the built-in Codicons pattern, or none when the background was removed.' };
	layout: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The image layout after the change, when the background is an image.' };
	colorScheme: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the background of dark or light themes changed.' };
	owner: 'benibenj';
	comment: 'Tracks changes of the Agents window chat background and what made them.';
};

interface IReportedChatBackground {
	readonly background: ISessionsChatConfiguredBackground | undefined;
	readonly layout: ChatBackgroundImageLayout;
}

const reportedColorSchemes = [ColorScheme.DARK, ColorScheme.LIGHT];

export const ISessionsChatBackgroundService = createDecorator<ISessionsChatBackgroundService>('sessionsChatBackgroundService');

export interface ISessionsChatBackgroundService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeBackground: Event<void>;
	/** The background to render, or `undefined` when none is configured or the theme hides backgrounds. */
	getBackground(): ISessionsChatBackground | undefined;
	/** The background configured for the given or active color scheme, including while a high contrast theme hides it. */
	getConfiguredBackground(colorScheme?: ColorScheme): ISessionsChatConfiguredBackground | undefined;
	getConfiguredBackgroundImage(): URI | undefined;
	getRecentBackgroundImages(): readonly URI[];
	/** Every image a preference or the recently used list refers to, across both color schemes. */
	getReferencedBackgroundImages(): readonly URI[];
	getBackgroundImageLayout(colorScheme?: ColorScheme): ChatBackgroundImageLayout;
	setBackground(background: URI | SessionsChatBackgroundPreset, source: ChatBackgroundChangeSource, colorScheme?: ColorScheme): Promise<void>;
	clearBackground(source: ChatBackgroundChangeSource, colorScheme?: ColorScheme): Promise<void>;
	/** Shows the layout, and saves it unless `persist` is false, which previews it without reporting a change. */
	setBackgroundImageLayout(layout: ChatBackgroundImageLayout, source: ChatBackgroundChangeSource, persist?: boolean, colorScheme?: ColorScheme): Promise<void>;
}

export class SessionsChatBackgroundService extends Disposable implements ISessionsChatBackgroundService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeBackground = this._register(new Emitter<void>());
	readonly onDidChangeBackground = this._onDidChangeBackground.event;
	private backgroundImageLayout: ChatBackgroundImageLayout;
	/** The source of each setting this service is writing, which the resulting configuration change is attributed to. */
	private readonly pendingChangeSources = new Map<string, ChatBackgroundChangeSource>();
	/** Serializes writes, so that overlapping writes of a setting cannot replace or remove each other's source. */
	private readonly writeSequencer = new Sequencer();
	/** The last reported background of each color scheme, so that only changes of what is shown are reported. */
	private readonly reportedBackgrounds = new Map<ColorScheme, IReportedChatBackground>();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeService private readonly themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this.backgroundImageLayout = this.readConfiguredBackgroundImageLayout();
		for (const colorScheme of reportedColorSchemes) {
			this.reportedBackgrounds.set(colorScheme, this.readReportedBackground(colorScheme));
		}
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
			this.reportChanges(event);
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

	getReferencedBackgroundImages(): readonly URI[] {
		const images = this.getStoredRecentBackgroundImages();
		for (const setting of [AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING]) {
			const background = this.readConfiguredBackground(setting);
			if (background?.kind === 'image' && !images.some(image => isEqual(image, background.image))) {
				images.push(background.image);
			}
		}
		return images;
	}

	async setBackground(background: URI | SessionsChatBackgroundPreset, source: ChatBackgroundChangeSource, colorScheme = this.themeService.getColorTheme().type): Promise<void> {
		await this.updateSetting(this.getBackgroundImageSetting(colorScheme), URI.isUri(background) ? background.fsPath : background, source);
		if (URI.isUri(background)) {
			this.storeRecentBackgroundImage(background);
		}
	}

	async clearBackground(source: ChatBackgroundChangeSource, colorScheme = this.themeService.getColorTheme().type): Promise<void> {
		await this.updateSetting(this.getBackgroundImageSetting(colorScheme), undefined, source);
	}

	getBackgroundImageLayout(colorScheme = this.themeService.getColorTheme().type): ChatBackgroundImageLayout {
		return isDark(colorScheme) === isDark(this.themeService.getColorTheme().type)
			? this.backgroundImageLayout
			: this.readConfiguredBackgroundImageLayout(colorScheme);
	}

	async setBackgroundImageLayout(layout: ChatBackgroundImageLayout, source: ChatBackgroundChangeSource, persist = true, colorScheme = this.themeService.getColorTheme().type): Promise<void> {
		const setting = this.getBackgroundImageLayoutSetting(colorScheme);
		if (isDark(colorScheme) === isDark(this.themeService.getColorTheme().type) && layout !== this.backgroundImageLayout) {
			this.backgroundImageLayout = layout;
			this._onDidChangeBackground.fire();
		}
		if (persist) {
			try {
				await this.updateSetting(setting, layout, source);
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

	private updateSetting(setting: string, value: string | undefined, source: ChatBackgroundChangeSource): Promise<void> {
		return this.writeSequencer.queue(async () => {
			// The configuration service reports the change before the update resolves.
			this.pendingChangeSources.set(setting, source);
			try {
				await this.configurationService.updateValue(setting, value, ConfigurationTarget.USER);
			} finally {
				this.pendingChangeSources.delete(setting);
			}
		});
	}

	/** Reports each change of a shown background, including changes made outside this service, such as in settings.json. */
	private reportChanges(event: IConfigurationChangeEvent): void {
		for (const colorScheme of reportedColorSchemes) {
			const backgroundSetting = this.getBackgroundImageSetting(colorScheme);
			const layoutSetting = this.getBackgroundImageLayoutSetting(colorScheme);
			if (!event.affectsConfiguration(backgroundSetting) && !event.affectsConfiguration(layoutSetting)) {
				continue;
			}
			// A setting can change without changing what is shown, for example when the layout
			// that is used by default is selected, or a path replaces a `file` URI of the same image.
			const previous = this.reportedBackgrounds.get(colorScheme);
			const current = this.readReportedBackground(colorScheme);
			this.reportedBackgrounds.set(colorScheme, current);
			const { background, layout } = current;
			const backgroundChanged = !isSameConfiguredBackground(previous?.background, background);
			// Only images have a layout.
			if (!backgroundChanged && (background?.kind !== 'image' || layout === previous?.layout)) {
				continue;
			}
			this.telemetryService.publicLog2<ChatBackgroundChangedEvent, ChatBackgroundChangedClassification>('vscodeAgents.chatBackground/changed', {
				source: this.pendingChangeSources.get(backgroundChanged ? backgroundSetting : layoutSetting) ?? 'settings',
				change: backgroundChanged ? 'background' : 'layout',
				background: background?.kind === 'image' ? 'userImage' : background?.kind === 'codicons' ? 'builtin' : 'none',
				layout: background?.kind === 'image' ? layout : undefined,
				colorScheme: colorScheme === ColorScheme.DARK ? 'dark' : 'light',
			});
		}
	}

	private readReportedBackground(colorScheme: ColorScheme): IReportedChatBackground {
		return {
			background: this.readConfiguredBackground(this.getBackgroundImageSetting(colorScheme)),
			layout: this.readConfiguredBackgroundImageLayout(colorScheme),
		};
	}

	private readConfiguredBackgroundImageLayout(colorScheme = this.themeService.getColorTheme().type): ChatBackgroundImageLayout {
		const colorSchemeSetting = this.getBackgroundImageLayoutSetting(colorScheme);
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

	getConfiguredBackground(colorScheme = this.themeService.getColorTheme().type): ISessionsChatConfiguredBackground | undefined {
		return this.readConfiguredBackground(this.getBackgroundImageSetting(colorScheme));
	}

	private readConfiguredBackground(setting: string): ISessionsChatConfiguredBackground | undefined {
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

function isSameConfiguredBackground(a: ISessionsChatConfiguredBackground | undefined, b: ISessionsChatConfiguredBackground | undefined): boolean {
	return a?.kind === 'image' && b?.kind === 'image' ? isEqual(a.image, b.image) : a?.kind === b?.kind;
}
