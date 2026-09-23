/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { ChatConfiguration, ChatProgressAnimation } from '../../common/constants.js';
import { chatWorkingProgressInsidersIconForeground, chatWorkingProgressStableIconForeground } from '../../common/widget/chatColors.js';
import './media/chatWorkingLogo.css';

export type ChatWorkingLogoMotion =
	| 'fold' | 'weave' | 'weave-v' | 'draw' | 'relay' | 'stack' | 'orbit' | 'shutter'
	| 'aperture' | 'accordion' | 'dial' | 'magnet' | 'trace' | 'pendulum' | 'prism'
	| 'ladder' | 'carousel' | 'piston' | 'bridge' | 'fan' | 'comb' | 'braid' | 'sling' | 'folio' | 'helix';

const durations: Record<ChatWorkingLogoMotion, number> = {
	fold: 2800,
	weave: 1200,
	'weave-v': 1200,
	draw: 2400,
	relay: 3000,
	stack: 3200,
	orbit: 3000,
	shutter: 2800,
	aperture: 1600,
	accordion: 1500,
	dial: 1600,
	magnet: 1600,
	trace: 1800,
	pendulum: 1800,
	prism: 2000,
	ladder: 1800,
	carousel: 1800,
	piston: 1600,
	bridge: 1900,
	fan: 1700,
	comb: 1800,
	braid: 1800,
	sling: 1700,
	folio: 2000,
	helix: 1800,
};

const faces = [
	{
		name: 'ascending',
		path: 'M87.0275 15.0688L69.7198 6.73546C67.7164 5.77087 65.3223 6.17776 63.75 7.75L7.09081 59.4099C5.56682 60.7994 5.56857 63.1987 7.09459 64.586L11.7227 68.7934C12.9703 69.9275 14.8491 70.011 16.1924 68.992L84.4232 17.2307C86.7122 15.4942 90 17.1268 90 20V19.7991C90 17.7823 88.8447 15.9437 87.0275 15.0688Z',
	},
	{
		name: 'descending',
		path: 'M87.0275 80.9312L69.7198 89.2646C67.7164 90.2292 65.3223 89.8223 63.75 88.25L7.09081 36.5902C5.56682 35.2007 5.56857 32.8013 7.09459 31.414L11.7227 27.2067C12.9703 26.0725 14.8491 25.989 16.1924 27.008L84.4232 78.7693C86.7122 80.5058 90 78.8732 90 76V76.201C90 78.2178 88.8447 80.0563 87.0275 80.9312Z',
	},
	{
		name: 'spine',
		path: 'M69.7206 89.2661C67.7166 90.2298 65.3224 89.8223 63.75 88.25C65.6874 90.1873 69 88.8152 69 86.0753V9.92459C69 7.18472 65.6874 5.81259 63.75 7.74996C65.3224 6.17757 67.7166 5.77012 69.7206 6.73385L87.0253 15.0558C88.8437 15.9302 90 17.7694 90 19.7871V76.2131C90 78.2309 88.8436 80.07 87.0253 80.9445L69.7206 89.2661Z',
	},
] as const;

/** Animates HTML wrappers around fixed SVG faces instead of changing SVG geometry per frame. */
export class ChatWorkingLogo extends Disposable {
	readonly domNode: HTMLElement;

	get durationMs(): number {
		return durations[this.motion];
	}

	constructor(private motion: ChatWorkingLogoMotion, quality: 'stable' | 'insider' = 'stable') {
		super();
		this.domNode = $('span.chat-working-logo', { 'aria-hidden': 'true', 'data-motion': motion });
		this.domNode.classList.add(`chat-working-logo-${motion}`);
		this.domNode.style.animationDuration = `${this.durationMs}ms`;
		this.domNode.style.color = asCssVariable(quality === 'insider' ? chatWorkingProgressInsidersIconForeground : chatWorkingProgressStableIconForeground);

		for (const face of faces) {
			const wrapper = append(this.domNode, $(`span.chat-working-logo-face.chat-working-logo-${face.name}`));
			wrapper.appendChild($.SVG<SVGSVGElement>('svg', { viewBox: '6 6 84 84', width: '100%', height: '100%', focusable: 'false' },
				$.SVG<SVGPathElement>('path', { d: face.path, fill: 'currentColor' })));
		}
		this.setActive(true);
	}

	setMotion(motion: ChatWorkingLogoMotion): void {
		if (this.motion === motion) {
			return;
		}
		this.domNode.classList.remove(`chat-working-logo-${this.motion}`);
		this.motion = motion;
		this.domNode.classList.add(`chat-working-logo-${motion}`);
		this.domNode.dataset.motion = motion;
		this.domNode.style.animationDuration = `${this.durationMs}ms`;
	}

	setActive(active: boolean): void {
		this.domNode.classList.toggle('chat-working-logo-active', active);
	}

	override dispose(): void {
		this.domNode.remove();
		super.dispose();
	}
}

export class ChatWorkingProgressLogo extends ChatWorkingLogo {
	constructor(
		quality: 'stable' | 'insider',
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService,
	) {
		const animation = getConfiguredProgressAnimation(configurationService, logService);
		super(animation === ChatProgressAnimation.Off ? ChatProgressAnimation.Weave : animation, quality);
		this.updateAnimation(animation);
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.PersistentProgress)) {
				this.updateAnimation(getConfiguredProgressAnimation(configurationService, logService));
			}
		}));
	}

	private updateAnimation(animation: ChatProgressAnimation): void {
		this.setMotion(animation === ChatProgressAnimation.Off ? ChatProgressAnimation.Weave : animation);
		this.domNode.classList.toggle('chat-working-logo-static', animation === ChatProgressAnimation.Off);
		this.domNode.dataset.animation = animation;
	}
}

const warnedUnsupportedAnimations = new Set<string>();

export function getConfiguredProgressAnimation(configurationService: IConfigurationService, logService: ILogService): ChatProgressAnimation {
	const animation = configurationService.getValue<ChatProgressAnimation | undefined>(ChatConfiguration.PersistentProgress);
	switch (animation) {
		case undefined:
			return ChatProgressAnimation.Off;
		case ChatProgressAnimation.Off:
		case ChatProgressAnimation.Weave:
		case ChatProgressAnimation.Draw:
		case ChatProgressAnimation.Orbit:
		case ChatProgressAnimation.Accordion:
		case ChatProgressAnimation.Dial:
			return animation;
		default: {
			// Resolved on render hot paths, so an unknown value (e.g. from an experiment targeting a newer
			// client) must not warn on every call.
			const key = String(animation);
			if (!warnedUnsupportedAnimations.has(key)) {
				warnedUnsupportedAnimations.add(key);
				logService.warn('ChatWorkingProgressLogo: unsupported progress animation, using Off', animation);
			}
			return ChatProgressAnimation.Off;
		}
	}
}
