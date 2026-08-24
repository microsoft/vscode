/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as css from '../../../../base/browser/cssValue.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ColorScheme, isDark, isHighContrast } from '../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { SessionsChatBackgroundAvailableContext } from '../../../common/contextkeys.js';

export const AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING = 'chat.agentSessions.preferredDarkBackgroundImage';
export const AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING = 'chat.agentSessions.preferredLightBackgroundImage';
export const AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING = 'chat.agentSessions.backgroundImageLayout';

export const chatBackgroundImageLayoutValues = [
	'repeat',
	'stretch',
	'center',
	'top',
	'top-right',
	'top-left',
	'bottom',
	'bottom-right',
	'bottom-left',
	'left',
	'right',
] as const;

export type ChatBackgroundImageLayout = typeof chatBackgroundImageLayoutValues[number];

export interface ISessionsChatBackground {
	readonly backgroundImage: string;
	readonly backgroundRepeat: string;
	readonly backgroundSize: string;
	readonly backgroundPosition: string;
}

const backgroundImageStyles: Record<ChatBackgroundImageLayout, Omit<ISessionsChatBackground, 'backgroundImage'>> = {
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
};

export const ISessionsChatBackgroundService = createDecorator<ISessionsChatBackgroundService>('sessionsChatBackgroundService');

export interface ISessionsChatBackgroundService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeBackground: Event<void>;
	getBackground(): ISessionsChatBackground | undefined;
	getConfiguredBackgroundImage(): URI | undefined;
	setBackgroundImage(image: URI): Promise<void>;
}

export class SessionsChatBackgroundService extends Disposable implements ISessionsChatBackgroundService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeBackground = this._register(new Emitter<void>());
	readonly onDidChangeBackground = this._onDidChangeBackground.event;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeService private readonly themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const backgroundAvailableContext = SessionsChatBackgroundAvailableContext.bindTo(contextKeyService);
		backgroundAvailableContext.set(!isHighContrast(this.themeService.getColorTheme().type));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (
				event.affectsConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING)
				|| event.affectsConfiguration(AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING)
				|| event.affectsConfiguration(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING)
			) {
				this._onDidChangeBackground.fire();
			}
		}));
		this._register(this.themeService.onDidColorThemeChange(theme => {
			backgroundAvailableContext.set(!isHighContrast(theme.type));
			this._onDidChangeBackground.fire();
		}));
	}

	getBackground(): ISessionsChatBackground | undefined {
		if (isHighContrast(this.themeService.getColorTheme().type)) {
			return undefined;
		}
		const image = this.getConfiguredBackgroundImage();
		return image ? {
			backgroundImage: css.asCSSUrl(image),
			...backgroundImageStyles[this.getBackgroundImageLayout()],
		} : undefined;
	}

	getConfiguredBackgroundImage(): URI | undefined {
		const setting = this.getBackgroundImageSetting(this.themeService.getColorTheme().type);
		return this.resolveBackgroundImage(this.configurationService.getValue<string>(setting));
	}

	async setBackgroundImage(image: URI): Promise<void> {
		const setting = this.getBackgroundImageSetting(this.themeService.getColorTheme().type);
		await this.configurationService.updateValue(setting, image.toString(), ConfigurationTarget.USER);
	}

	private getBackgroundImageSetting(colorScheme: ColorScheme): string {
		return isDark(colorScheme)
			? AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING
			: AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING;
	}

	private getBackgroundImageLayout(): ChatBackgroundImageLayout {
		const value = this.configurationService.getValue<string>(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING);
		return chatBackgroundImageLayoutValues.includes(value as ChatBackgroundImageLayout)
			? value as ChatBackgroundImageLayout
			: 'repeat';
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
