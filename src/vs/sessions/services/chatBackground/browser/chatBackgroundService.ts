/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as css from '../../../../base/browser/cssValue.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getMediaMime } from '../../../../base/common/mime.js';
import { Schemas } from '../../../../base/common/network.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { isEqual, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ConfigurationTarget, IConfigurationService, IConfigurationValue } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ColorScheme, isDark, isHighContrast } from '../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { SessionsChatBackgroundAvailableContext, SessionsChatBackgroundConfiguredContext, SessionsChatBackgroundImageConfiguredContext } from '../../../common/contextkeys.js';
import { AGENT_HOST_SCHEME } from '../../../../platform/agentHost/common/agentHostUri.js';

export const AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING = 'chat.agentSessions.preferredDarkBackgroundImage';
export const AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING = 'chat.agentSessions.preferredLightBackgroundImage';
export const AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING = 'chat.agentSessions.backgroundImageLayout';
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
	private loadedBackgroundImage: { readonly source: URI; readonly backgroundImage: string; readonly objectUrl: string } | undefined;
	private loadingBackgroundImage: URI | undefined;
	private failedBackgroundImage: URI | undefined;
	private backgroundImageLoadVersion = 0;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeService private readonly themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
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
			const backgroundImageLayoutChanged = event.affectsConfiguration(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING);
			let backgroundChanged = backgroundImageChanged;
			if (backgroundImageChanged) {
				this.resetLoadedBackgroundImage();
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
			this.resetLoadedBackgroundImage();
			updateContextKeys();
			this._onDidChangeBackground.fire();
		}));
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this.resetLoadedBackgroundImage();
			this.backgroundImageLayout = this.readConfiguredBackgroundImageLayout();
			updateContextKeys();
			this._onDidChangeBackground.fire();
		}));
		this._register(this.workspaceTrustManagementService.onDidChangeTrust(() => {
			this.resetLoadedBackgroundImage();
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
		const backgroundImage = configuredBackground ? this.getBackgroundImageCss(configuredBackground.image) : undefined;
		return configuredBackground ? {
			kind: 'image',
			backgroundImage: backgroundImage ?? css.asCSSUrl(undefined),
			...backgroundImageStyles[this.getBackgroundImageLayout()],
		} : undefined;
	}

	override dispose(): void {
		this.resetLoadedBackgroundImage();
		super.dispose();
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
		const resource = this.getWorkspaceResource();
		const target = this.getConfigurationTarget(setting, resource);
		const value = URI.isUri(background) ? this.toStoredBackgroundImage(background, target, resource) : background;
		await this.updateConfigurationValue(setting, value, target, resource);
		if (URI.isUri(background)) {
			this.storeRecentBackgroundImage(background);
		}
	}

	async clearBackground(): Promise<void> {
		const setting = this.getBackgroundImageSetting(this.themeService.getColorTheme().type);
		const resource = this.getWorkspaceResource();
		await this.updateConfigurationValue(setting, undefined, this.getConfigurationTarget(setting, resource), resource);
	}

	getBackgroundImageLayout(): ChatBackgroundImageLayout {
		return this.backgroundImageLayout;
	}

	async setBackgroundImageLayout(layout: ChatBackgroundImageLayout, persist = true): Promise<void> {
		if (layout !== this.backgroundImageLayout) {
			this.backgroundImageLayout = layout;
			this._onDidChangeBackground.fire();
		}
		if (persist) {
			const resource = this.getWorkspaceResource();
			try {
				await this.updateConfigurationValue(
					AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING,
					layout,
					this.getConfigurationTarget(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, resource),
					resource
				);
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
		const value = this.getConfigurationValue(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, this.getWorkspaceResource());
		return chatBackgroundImageLayoutValues.includes(value as ChatBackgroundImageLayout)
			? value as ChatBackgroundImageLayout
			: 'repeat';
	}

	private getBackgroundImageSetting(colorScheme: ColorScheme): string {
		return isDark(colorScheme)
			? AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING
			: AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING;
	}

	private getConfiguredBackground(): { readonly kind: 'codicons' } | { readonly kind: 'image'; readonly image: URI } | undefined {
		const setting = this.getBackgroundImageSetting(this.themeService.getColorTheme().type);
		const resource = this.getWorkspaceResource();
		const value = this.getConfigurationValue(setting, resource);
		if (value?.trim() === AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET) {
			return { kind: 'codicons' };
		}
		const image = this.resolveBackgroundImage(value, resource);
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

	private getWorkspaceResource(): URI | undefined {
		return this.workspaceContextService.getWorkspace().folders[0]?.uri;
	}

	private getConfigurationValue(setting: string, resource: URI | undefined): string | undefined {
		if (!this.workspaceTrustManagementService.isWorkspaceTrusted()) {
			return this.getTrustedConfigurationValue(this.configurationService.inspect<string>(setting));
		}
		return resource
			? this.configurationService.getValue<string>(setting, { resource })
			: this.configurationService.getValue<string>(setting);
	}

	private getConfigurationTarget(setting: string, resource: URI | undefined): ConfigurationTarget {
		if (!this.workspaceTrustManagementService.isWorkspaceTrusted()) {
			return ConfigurationTarget.USER;
		}
		const inspected = this.configurationService.inspect<string>(setting, resource ? { resource } : undefined);
		if (resource && inspected?.workspaceFolderValue !== undefined) {
			return ConfigurationTarget.WORKSPACE_FOLDER;
		}
		if (inspected?.workspaceValue !== undefined) {
			return ConfigurationTarget.WORKSPACE;
		}
		return ConfigurationTarget.USER;
	}

	private getTrustedConfigurationValue(inspected: IConfigurationValue<string> | undefined): string | undefined {
		return inspected?.policyValue
			?? inspected?.memoryValue
			?? inspected?.userValue
			?? inspected?.applicationValue
			?? inspected?.defaultValue;
	}

	private updateConfigurationValue(setting: string, value: unknown, target: ConfigurationTarget, resource: URI | undefined): Promise<void> {
		return resource
			? this.configurationService.updateValue(setting, value, { resource }, target)
			: this.configurationService.updateValue(setting, value, target);
	}

	private toStoredBackgroundImage(image: URI, target: ConfigurationTarget, resource: URI | undefined): string {
		if (
			resource
			&& (target === ConfigurationTarget.WORKSPACE || target === ConfigurationTarget.WORKSPACE_FOLDER)
			&& this.uriIdentityService.extUri.isEqualOrParent(image, resource)
		) {
			const relativePath = this.uriIdentityService.extUri.relativePath(resource, image);
			if (relativePath) {
				return relativePath;
			}
		}
		return image.scheme === Schemas.file ? image.fsPath : image.toString();
	}

	private resolveBackgroundImage(value: string | undefined, resource?: URI): URI | undefined {
		const candidate = value?.trim();
		if (!candidate) {
			return undefined;
		}

		if (isAbsolute(candidate)) {
			return URI.file(candidate);
		}

		if (/^[a-z][a-z\d+.-]*:/i.test(candidate)) {
			const uri = URI.parse(candidate);
			return this.isSupportedImageUri(uri) ? uri : undefined;
		}
		if (!resource || !this.isSupportedImageUri(resource)) {
			return undefined;
		}

		let relativePath: string;
		try {
			relativePath = decodeURIComponent(candidate).replaceAll('\\', '/');
		} catch {
			return undefined;
		}
		if (relativePath.includes('\0') || isAbsolute(relativePath)) {
			return undefined;
		}

		const resolved = joinPath(resource, relativePath);
		return this.uriIdentityService.extUri.isEqualOrParent(resolved, resource) ? resolved : undefined;
	}

	private isSupportedImageUri(uri: URI): boolean {
		return uri.scheme === Schemas.file || uri.scheme === Schemas.vscodeRemote || uri.scheme === AGENT_HOST_SCHEME;
	}

	private getBackgroundImageCss(image: URI): string | undefined {
		if (image.scheme !== AGENT_HOST_SCHEME) {
			if (this.loadedBackgroundImage || this.loadingBackgroundImage || this.failedBackgroundImage) {
				this.resetLoadedBackgroundImage();
			}
			return css.asCSSUrl(image);
		}
		if (this.loadedBackgroundImage && this.uriIdentityService.extUri.isEqual(this.loadedBackgroundImage.source, image)) {
			return this.loadedBackgroundImage.backgroundImage;
		}
		if (this.loadedBackgroundImage) {
			this.disposeLoadedBackgroundImage();
		}
		if (
			(!this.loadingBackgroundImage || !this.uriIdentityService.extUri.isEqual(this.loadingBackgroundImage, image))
			&& (!this.failedBackgroundImage || !this.uriIdentityService.extUri.isEqual(this.failedBackgroundImage, image))
		) {
			void this.loadAgentHostBackgroundImage(image);
		}
		return undefined;
	}

	private async loadAgentHostBackgroundImage(image: URI): Promise<void> {
		const loadVersion = ++this.backgroundImageLoadVersion;
		this.loadingBackgroundImage = image;
		this.failedBackgroundImage = undefined;
		try {
			const content = await this.fileService.readFile(image);
			const mime = getMediaMime(image.path);
			if (!mime?.startsWith('image/')) {
				throw new Error(`Unsupported chat background image type: ${image.path}`);
			}
			const objectUrl = URL.createObjectURL(new Blob([Uint8Array.from(content.value.buffer)], { type: mime }));
			if (
				loadVersion !== this.backgroundImageLoadVersion
				|| !this.uriIdentityService.extUri.isEqual(this.getConfiguredBackgroundImage(), image)
			) {
				if (loadVersion === this.backgroundImageLoadVersion) {
					this.loadingBackgroundImage = undefined;
				}
				URL.revokeObjectURL(objectUrl);
				return;
			}
			this.disposeLoadedBackgroundImage();
			this.loadedBackgroundImage = {
				source: image,
				backgroundImage: css.asCSSUrl(URI.parse(objectUrl)),
				objectUrl,
			};
			this.loadingBackgroundImage = undefined;
			this._onDidChangeBackground.fire();
		} catch (error) {
			if (loadVersion === this.backgroundImageLoadVersion) {
				this.loadingBackgroundImage = undefined;
				this.failedBackgroundImage = image;
				this.logService.error(`[SessionsChatBackgroundService] Failed to load background image ${image.toString()}`, error);
			}
		}
	}

	private disposeLoadedBackgroundImage(): void {
		if (this.loadedBackgroundImage) {
			URL.revokeObjectURL(this.loadedBackgroundImage.objectUrl);
			this.loadedBackgroundImage = undefined;
		}
	}

	private resetLoadedBackgroundImage(): void {
		this.backgroundImageLoadVersion++;
		this.loadingBackgroundImage = undefined;
		this.failedBackgroundImage = undefined;
		this.disposeLoadedBackgroundImage();
	}
}
