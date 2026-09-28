/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, getWindow } from '../../../../../base/browser/dom.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { ChatConfiguration, ChatProgressAnimation } from '../../common/constants.js';
import { chatWorkingProgressInsidersIconForeground, chatWorkingProgressStableIconForeground } from '../../common/widget/chatColors.js';
import { CHAT_WORKING_LOGO_RIBBON_PAINT_ORDER, ChatWorkingLogoRibbonBand, getChatWorkingLogoRibbonFrame } from './chatWorkingLogoRibbon.js';
import './media/chatWorkingLogo.css';

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

let ribbonMaskIdPool = 0;

/** Animates the fixed product mark or the same mark assembled as one continuous ribbon. */
export class ChatWorkingLogo extends Disposable {
	readonly domNode: HTMLElement;
	readonly durationMs = 2400;
	readonly ribbonDurationMs = 7600;

	private animationFrame: MutableDisposable<IDisposable> | undefined;
	private ribbonPaths: Map<ChatWorkingLogoRibbonBand, SVGPathElement> | undefined;
	private ribbonPathData: Map<ChatWorkingLogoRibbonBand, string> | undefined;
	private readonly now: () => number;
	private readonly scheduleFrame: (targetWindow: Window, runner: () => void) => IDisposable;
	private readonly isMotionReducedOverride: (() => boolean) | undefined;
	private animation = ChatProgressAnimation.Off;
	private active = false;
	private animationStartedAt = 0;

	constructor(
		animation: ChatProgressAnimation,
		quality: 'stable' | 'insider' = 'stable',
		animationOptions: {
			readonly now?: () => number;
			readonly scheduleFrame?: (targetWindow: Window, runner: () => void) => IDisposable;
			readonly isMotionReduced?: () => boolean;
		} = {},
	) {
		super();
		this.domNode = $('span.chat-working-logo', { 'aria-hidden': 'true' });
		this.domNode.style.animationDuration = `${this.durationMs}ms`;
		this.domNode.style.color = asCssVariable(quality === 'insider' ? chatWorkingProgressInsidersIconForeground : chatWorkingProgressStableIconForeground);
		this.now = animationOptions.now ?? (() => getWindow(this.domNode).performance.now());
		this.scheduleFrame = animationOptions.scheduleFrame ?? ((targetWindow, runner) => {
			const handle = targetWindow.requestAnimationFrame(runner);
			return toDisposable(() => targetWindow.cancelAnimationFrame(handle));
		});
		this.isMotionReducedOverride = animationOptions.isMotionReduced;

		for (const face of faces) {
			const wrapper = append(this.domNode, $(`span.chat-working-logo-face.chat-working-logo-${face.name}`));
			wrapper.appendChild($.SVG<SVGSVGElement>('svg', { viewBox: '6 6 84 84', width: '100%', height: '100%', focusable: 'false' },
				$.SVG<SVGPathElement>('path', { d: face.path, fill: 'currentColor' })));
		}
		this.setAnimation(animation);
		this.setActive(true);
	}

	setAnimation(animation: ChatProgressAnimation): void {
		const noIcon = animation === ChatProgressAnimation.DrawMonochromeNoIcon;
		const draw = animation === ChatProgressAnimation.Draw || animation === ChatProgressAnimation.DrawMonochrome;
		if (animation === ChatProgressAnimation.Ribbon) {
			this.ensureRibbonArtwork();
		}
		this.animation = animation;
		this.domNode.classList.toggle('chat-working-logo-static', animation === ChatProgressAnimation.Off || noIcon);
		this.domNode.classList.toggle('chat-working-logo-draw', draw);
		this.domNode.classList.toggle('chat-working-logo-ribbon', animation === ChatProgressAnimation.Ribbon);
		this.domNode.classList.toggle('chat-working-logo-monochrome', animation === ChatProgressAnimation.DrawMonochrome || noIcon);
		this.domNode.classList.toggle('chat-working-logo-no-icon', noIcon);
		this.domNode.dataset.animation = animation;
		this.restartRibbonAnimation();
	}

	setActive(active: boolean): void {
		if (this.active === active) {
			return;
		}
		this.active = active;
		this.domNode.classList.toggle('chat-working-logo-active', active);
		this.restartRibbonAnimation();
	}

	protected refreshMotion(): void {
		this.restartRibbonAnimation();
	}

	override dispose(): void {
		this.domNode.remove();
		super.dispose();
	}

	private ensureRibbonArtwork(): void {
		if (this.ribbonPaths) {
			return;
		}
		this.animationFrame = this._register(new MutableDisposable());
		this.ribbonPaths = new Map();
		this.ribbonPathData = new Map();
		const maskId = ++ribbonMaskIdPool;
		const defs = $.SVG<SVGDefsElement>('defs');
		const artwork = $.SVG<SVGGElement>('g', { class: 'chat-working-logo-ribbon-artwork' });
		for (let index = 0; index < CHAT_WORKING_LOGO_RIBBON_PAINT_ORDER.length; index++) {
			const band = CHAT_WORKING_LOGO_RIBBON_PAINT_ORDER[index];
			const maskPath = $.SVG<SVGPathElement>('path', {
				class: `chat-working-logo-ribbon-band chat-working-logo-ribbon-band-${band}`,
				fill: '#fff',
				stroke: '#fff',
				'stroke-width': '4',
				'stroke-linejoin': 'round',
				transform: 'translate(6 6) scale(0.84)',
			});
			const mask = $.SVG<SVGMaskElement>('mask', {
				id: `chat-working-logo-ribbon-mask-${maskId}-${band}`,
				x: '0',
				y: '0',
				width: '96',
				height: '96',
				maskUnits: 'userSpaceOnUse',
				'mask-type': 'alpha',
			}, maskPath);
			const face = faces[index];
			const renderedFace = $.SVG<SVGPathElement>('path', {
				class: `chat-working-logo-ribbon-face chat-working-logo-ribbon-face-${band}`,
				d: face.path,
				fill: 'currentColor',
				mask: `url(#chat-working-logo-ribbon-mask-${maskId}-${band})`,
			});
			defs.appendChild(mask);
			artwork.appendChild(renderedFace);
			this.ribbonPaths.set(band, maskPath);
		}
		const wrapper = append(this.domNode, $('span.chat-working-logo-ribbon-container'));
		wrapper.appendChild($.SVG<SVGSVGElement>('svg', {
			viewBox: '6 6 84 84',
			width: '100%',
			height: '100%',
			focusable: 'false',
			'shape-rendering': 'geometricPrecision',
		}, defs, artwork));
		this.renderRibbonFrame(0.5);
	}

	private restartRibbonAnimation(): void {
		this.animationFrame?.clear();
		if (this.animation !== ChatProgressAnimation.Ribbon) {
			return;
		}
		if (!this.active || this.isMotionReduced()) {
			this.renderRibbonFrame(0.5);
			return;
		}
		this.animationStartedAt = this.now();
		this.renderRibbonFrame(0);
		this.queueAnimationFrame();
	}

	private queueAnimationFrame(): void {
		const animationFrame = this.animationFrame;
		if (!animationFrame || animationFrame.value || !this.active || this.animation !== ChatProgressAnimation.Ribbon) {
			return;
		}
		animationFrame.value = this.scheduleFrame(getWindow(this.domNode), () => {
			animationFrame.clear();
			this.renderNextRibbonFrame();
		});
	}

	private renderNextRibbonFrame(): void {
		if (!this.active || this.animation !== ChatProgressAnimation.Ribbon) {
			return;
		}
		if (this.isMotionReduced()) {
			this.renderRibbonFrame(0.5);
			return;
		}
		this.renderRibbonFrame(((this.now() - this.animationStartedAt) % this.ribbonDurationMs) / this.ribbonDurationMs);
		this.queueAnimationFrame();
	}

	private renderRibbonFrame(progress: number): void {
		if (!this.ribbonPaths) {
			return;
		}
		const frame = getChatWorkingLogoRibbonFrame(progress);
		for (const band of CHAT_WORKING_LOGO_RIBBON_PAINT_ORDER) {
			const pathData = frame.paths[band];
			if (this.ribbonPathData?.get(band) === pathData) {
				continue;
			}
			this.ribbonPaths.get(band)?.setAttribute('d', pathData);
			this.ribbonPathData?.set(band, pathData);
		}
	}

	private isMotionReduced(): boolean {
		if (this.domNode.closest('.monaco-enable-motion')) {
			return false;
		}
		if (this.domNode.closest('.monaco-reduce-motion, .disable-animations')) {
			return true;
		}
		return this.isMotionReducedOverride?.() ?? getWindow(this.domNode).matchMedia('(prefers-reduced-motion: reduce)').matches;
	}
}

export class ChatWorkingProgressLogo extends ChatWorkingLogo {
	constructor(
		quality: 'stable' | 'insider',
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super(getConfiguredProgressAnimation(configurationService, logService), quality, {
			isMotionReduced: () => accessibilityService.isMotionReduced(),
		});
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.PersistentProgress)) {
				this.setAnimation(getConfiguredProgressAnimation(configurationService, logService));
			}
		}));
		this._register(accessibilityService.onDidChangeReducedMotion(() => this.refreshMotion()));
	}
}

const warnedUnsupportedAnimations = new Set<string>();

export function getConfiguredProgressAnimation(configurationService: IConfigurationService, logService: ILogService): ChatProgressAnimation {
	const animation = configurationService.getValue<string | undefined>(ChatConfiguration.PersistentProgress);
	switch (animation) {
		case undefined:
			return ChatProgressAnimation.Off;
		case ChatProgressAnimation.Off:
		case ChatProgressAnimation.Draw:
		case ChatProgressAnimation.DrawMonochrome:
		case ChatProgressAnimation.DrawMonochromeNoIcon:
		case ChatProgressAnimation.Ribbon:
			return animation;
		case 'weave':
		case 'orbit':
		case 'accordion':
		case 'dial':
			return ChatProgressAnimation.Draw;
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
