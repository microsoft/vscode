/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test-workbench_change - new file
// TSCode Welcome Page - Custom welcome page based on GettingStartedPage

import { GettingStartedPage } from './gettingStarted.js';
import { TscodeWelcomeInput } from './tscodeWelcomeInput.js';
import { IEditorSerializer, IEditorOpenContext } from '../../../common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { $ } from '../../../../base/browser/dom.js';
import { GettingStartedEditorOptions, GettingStartedInput } from './gettingStartedInput.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Memento } from '../../../common/memento.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IWalkthroughsService } from './gettingStartedService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IWorkbenchThemeService } from '../../../services/themes/common/workbenchThemeService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWebviewService } from '../../webview/browser/webview.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';

interface TscodeWelcomeMemento {
	hasShownAnimation?: boolean;
	lastFaceType?: string;
}

export class TscodeWelcomePage extends GettingStartedPage {
	// Note: Cannot override parent class static ID, so we use a different ID during registration
	private parentElement?: HTMLElement;
	private iconAdded = false;
	private animationShown = false; // test-workbench_change
	private tscodeMemento!: Memento<TscodeWelcomeMemento>; // test-workbench_change - Use different name to avoid conflict with parent
	private tscodeMementoData!: Partial<TscodeWelcomeMemento>; // test-workbench_change
	private readonly tscodeStorageService: IStorageService; // test-workbench_change

	// test-workbench_change start - Constructor to inject storage service
	constructor(
		group: any,
		@ICommandService commandService: any,
		@IProductService productService: any,
		@IKeybindingService keybindingService: any,
		@IWalkthroughsService gettingStartedService: any,
		@IConfigurationService configurationService: any,
		@ITelemetryService telemetryService: any,
		@ILanguageService languageService: any,
		@IFileService fileService: any,
		@IOpenerService openerService: any,
		@IWorkbenchThemeService themeService: any,
		@IStorageService storageService: IStorageService,
		@IExtensionService extensionService: any,
		@IInstantiationService instantiationService: any,
		@INotificationService notificationService: any,
		@IEditorGroupsService groupsService: any,
		@IContextKeyService contextService: any,
		@IQuickInputService quickInputService: any,
		@IWorkspacesService workspacesService: any,
		@ILabelService labelService: any,
		@IHostService hostService: any,
		@IWebviewService webviewService: any,
		@IWorkspaceContextService workspaceContextService: any,
		@IAccessibilityService accessibilityService: any,
		@IMarkdownRendererService markdownRendererService: any,
	) {
		super(
			group, commandService, productService, keybindingService, gettingStartedService,
			configurationService, telemetryService, languageService, fileService, openerService,
			themeService, storageService, extensionService, instantiationService, notificationService,
			groupsService, contextService, quickInputService, workspacesService, labelService,
			hostService, webviewService, workspaceContextService, accessibilityService, markdownRendererService
		);
		this.tscodeStorageService = storageService;
	}
	// test-workbench_change end

	protected override createEditor(parent: HTMLElement): void {
		super.createEditor(parent);
		this.parentElement = parent;
		// Add custom styling for TSCode welcome page
		parent.classList.add('tscode-welcome');

		// test-workbench_change start - Initialize memento for storing animation state
		this.tscodeMemento = new Memento('tscodeWelcome', this.tscodeStorageService);
		this.tscodeMementoData = this.tscodeMemento.getMemento(StorageScope.APPLICATION, StorageTarget.USER);
		// test-workbench_change end

		// test-workbench_change start - Show opening animation
		this.showOpeningAnimation(parent);
		// test-workbench_change end
	}

	override async setInput(newInput: GettingStartedInput, options: GettingStartedEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		// Call parent implementation first
		await super.setInput(newInput, options, context, token);

		// Add icon after categories slide is built
		if (!this.iconAdded && this.parentElement) {
			// Use setTimeout to ensure DOM is fully rendered
			setTimeout(() => this.addProductIconToDOM(), 50);
		}
	}

	private findProductNameElement(element: HTMLElement): HTMLElement | null {
		// Recursively search for h1 element with product-name class
		if (element.tagName === 'H1' && element.classList.contains('product-name')) {
			return element;
		}

		for (let i = 0; i < element.children.length; i++) {
			const child = element.children[i] as HTMLElement;
			const found = this.findProductNameElement(child);
			if (found) {
				return found;
			}
		}

		return null;
	}

	// test-workbench_change start - Opening animation
	private showOpeningAnimation(parent: HTMLElement): void {
		// test-workbench_change start - Check if animation has been shown before
		if (this.tscodeMementoData.hasShownAnimation) {
			// Skip animation if it has been shown before
			return;
		}

		if (this.animationShown) {
			return;
		}
		this.animationShown = true;
		// test-workbench_change end

		// Create animation overlay
		const overlay = $('div.tscode-animation-overlay');
		overlay.style.position = 'fixed';
		overlay.style.top = '0';
		overlay.style.left = '0';
		overlay.style.width = '100%';
		overlay.style.height = '100%';
		overlay.style.backgroundColor = '#dff0ff';
		overlay.style.zIndex = '10000';
		overlay.style.display = 'flex';
		overlay.style.alignItems = 'flex-end';
		overlay.style.justifyContent = 'flex-end';

		// Add animation styles
		this.addAnimationStyles(overlay);

		// Build animation DOM structure
		this.buildAnimationStructure(overlay);

		parent.appendChild(overlay);

		// Hide the main content initially
		const mainContent = parent.querySelector('.gettingStarted') as HTMLElement;
		if (mainContent) {
			mainContent.style.opacity = '0';
		}

		// Start animation sequence
		this.startAnimationSequence(overlay, mainContent);
	}

	private addAnimationStyles(container: HTMLElement): void {
		const style = document.createElement('style');
		style.textContent = `
			.sticker-wrap { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: row; align-items: center; gap: 0; }
			.avatar-container { display: flex; flex-direction: column; align-items: center; position: relative; z-index: 10; }
			@keyframes shy-peek-side {
				0% { transform: scale(0.5) translateX(80px); opacity: 0; }
				12% { transform: scale(0.5) translateX(50px); opacity: 1; }
				28% { transform: scale(0.5) translateX(50px); opacity: 1; }
				35% { transform: scale(0.49) translateX(60px); opacity: 1; }
				45% { transform: scale(0.48) translateX(75px); opacity: 1; }
				52% { transform: scale(0.52) translateX(45px); opacity: 1; }
				64% { transform: scale(0.52) translateX(45px); opacity: 1; }
				75% { transform: scale(0.65) translateX(20px); opacity: 1; }
				88% { transform: scale(1.08) translateX(0); opacity: 1; }
				95% { transform: scale(0.96) translateX(0); opacity: 1; }
				100% { transform: scale(1) translateX(0); opacity: 1; }
			}
			.sticker { animation: shy-peek-side 2.6s cubic-bezier(0.34, 1.05, 0.64, 1) 0.3s both; transform-origin: center center; position: relative; width: 160px; height: 160px; }
			.wall { width: 80px; height: 180px; background: transparent; position: relative; flex-shrink: 0; margin-left: -20px; }
			.bubble { position: absolute; top: -50px; left: 50%; transform: translateX(-50%) scale(0.7) translateY(6px); background: #fff; border: 1.5px solid #b8d8f5; border-radius: 12px; padding: 5px 10px; font-size: 12px; color: #2979ff; white-space: nowrap; opacity: 0; transition: opacity 0.3s ease, transform 0.3s ease; z-index: 20; }
			.bubble::after { content: ''; position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); border: 5px solid transparent; border-top-color: #b8d8f5; }
			.bubble.show { opacity: 1; transform: translateX(-50%) scale(1) translateY(0); }
			.face { position: absolute; inset: 0; opacity: 0; transition: opacity 0.3s ease; }
			.face.active { opacity: 1; }
			@keyframes bounce {
				0% { transform: translateY(0) scaleX(1) scaleY(1); }
				18% { transform: translateY(-22px) scaleX(0.9) scaleY(1.1); }
				32% { transform: translateY(0) scaleX(1.1) scaleY(0.9); }
				46% { transform: translateY(-14px) scaleX(0.93) scaleY(1.07); }
				58% { transform: translateY(0) scaleX(1.06) scaleY(0.94); }
				70% { transform: translateY(-7px) scaleX(0.97) scaleY(1.03); }
				80% { transform: translateY(0) scaleX(1.02) scaleY(0.98); }
				88% { transform: translateY(-3px) scaleX(1) scaleY(1); }
				100% { transform: translateY(0) scaleX(1) scaleY(1); }
			}
			.sticker.bouncing { animation: bounce 1.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) forwards; transform-origin: center center; }
			@keyframes blink { 0%, 88%, 100% { ry: 2.62; } 93% { ry: 0.2; } }
			.can-blink { animation: blink 3.5s ease-in-out infinite; }
			@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
			.sticker.floating { animation: float 3s ease-in-out infinite; }
			@keyframes peek-eye-shy {
				0%, 8% { ry: 2.62; transform: translateX(0); }
				12% { ry: 2.62; transform: translateX(0); }
				20% { ry: 2.62; transform: translateX(-3px); }
				28% { ry: 2.62; transform: translateX(3px); }
				36% { ry: 2.62; transform: translateX(0); }
				40% { ry: 2.0; transform: translateX(0); }
				52% { ry: 2.4; transform: translateX(0); }
				60% { ry: 2.4; transform: translateX(-2.5px); }
				68% { ry: 2.4; transform: translateX(2.5px); }
				75% { ry: 2.62; transform: translateX(0); }
				100% { ry: 2.62; transform: translateX(0); }
			}
			.peek-eye { animation: peek-eye-shy 2.6s ease-in-out 0.3s both; }
			.enter-button-container {
				position: fixed;
				bottom: 15%;
				left: 50%;
				transform: translateX(calc(-50% - 30px)) translateY(20px);
				display: flex;
				justify-content: center;
				align-items: center;
				opacity: 0;
				transition: all 0.4s ease;
				z-index: 100;
			}
			.enter-button-container.show {
				opacity: 1;
				transform: translateX(calc(-50% - 30px)) translateY(0);
			}
			.enter-button {
				background: #ffffff;
				color: #2979ff;
				border: 2px solid #2979ff;
				border-radius: 8px;
				padding: 14px 48px;
				font-size: 16px;
				font-weight: 500;
				cursor: pointer;
				transition: all 0.2s ease;
				box-shadow: 0 2px 8px rgba(41, 121, 255, 0.15);
			}
			.enter-button:hover {
				background: #f0f7ff;
				border-color: #1565c0;
				color: #1565c0;
				box-shadow: 0 4px 12px rgba(41, 121, 255, 0.25);
				transform: translateY(-2px);
			}
			.enter-button:active {
				transform: translateY(0);
				box-shadow: 0 1px 4px rgba(41, 121, 255, 0.2);
			}
		`;
		container.appendChild(style);
	}

	private buildAnimationStructure(container: HTMLElement): void {
		const stickerWrap = $('div.sticker-wrap');
		const avatarContainer = $('div.avatar-container');
		const sticker = $('div.sticker');
		sticker.id = 'anime-sticker';

		const bubble = $('div.bubble');
		bubble.id = 'anime-bubble';
		sticker.appendChild(bubble);

		// Create all face SVGs
		sticker.appendChild(this.createFaceSVG('face-peek', 'active', true));
		sticker.appendChild(this.createFaceSVG('face-welcome', '', false));
		sticker.appendChild(this.createFaceSVG('face-happy', '', false));
		sticker.appendChild(this.createFaceSVG('face-default', '', false));

		avatarContainer.appendChild(sticker);
		stickerWrap.appendChild(avatarContainer);
		stickerWrap.appendChild($('div.wall'));
		container.appendChild(stickerWrap);

		// Create enter button container at the bottom of the page
		const buttonContainer = $('div.enter-button-container');
		buttonContainer.id = 'anime-button-container';
		const enterButton = document.createElement('button');
		enterButton.className = 'enter-button';
		enterButton.id = 'anime-enter-button';
		// allow-any-unicode-next-line
		enterButton.textContent = '进入工作台';
		buttonContainer.appendChild(enterButton);
		container.appendChild(buttonContainer);
	}

	private createFaceSVG(id: string, activeClass: string, isPeek: boolean): HTMLElement {
		const face = $(`div.face${activeClass ? '.' + activeClass : ''}`);
		face.id = id;

		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('viewBox', '-4 -4 32 32');
		svg.setAttribute('width', '160');
		svg.setAttribute('height', '160');

		const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
		const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
		gradient.setAttribute('id', `rg-${id}`);
		gradient.setAttribute('x1', '0%');
		gradient.setAttribute('y1', '0%');
		gradient.setAttribute('x2', '100%');
		gradient.setAttribute('y2', '100%');

		['#4fc3f7', '#2979ff', '#69f0ae'].forEach((color, i) => {
			const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
			stop.setAttribute('offset', `${i * 50}%`);
			stop.setAttribute('stop-color', color);
			gradient.appendChild(stop);
		});
		defs.appendChild(gradient);
		svg.appendChild(defs);

		const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		bgCircle.setAttribute('cx', '12');
		bgCircle.setAttribute('cy', '12');
		bgCircle.setAttribute('r', '12');
		bgCircle.setAttribute('fill', '#e8f4ff');
		svg.appendChild(bgCircle);

		const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		ring.setAttribute('cx', '12');
		ring.setAttribute('cy', '12');
		ring.setAttribute('r', '12.75');
		ring.setAttribute('fill', 'none');
		ring.setAttribute('stroke', `url(#rg-${id})`);
		ring.setAttribute('stroke-width', '1.5');
		svg.appendChild(ring);

		if (id === 'face-peek') {
			const eye1 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
			eye1.setAttribute('class', 'peek-eye');
			eye1.setAttribute('cx', '8');
			eye1.setAttribute('cy', '8.8');
			eye1.setAttribute('rx', '1.63');
			eye1.setAttribute('ry', '2.62');
			eye1.setAttribute('fill', '#2979ff');
			svg.appendChild(eye1);

			const eye2 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
			eye2.setAttribute('class', 'peek-eye');
			eye2.setAttribute('cx', '16');
			eye2.setAttribute('cy', '8.8');
			eye2.setAttribute('rx', '1.63');
			eye2.setAttribute('ry', '2.62');
			eye2.setAttribute('fill', '#2979ff');
			svg.appendChild(eye2);

			[{ cx: '8.7', cy: '7.8' }, { cx: '16.7', cy: '7.8' }].forEach(pos => {
				const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				highlight.setAttribute('cx', pos.cx);
				highlight.setAttribute('cy', pos.cy);
				highlight.setAttribute('r', '0.6');
				highlight.setAttribute('fill', 'rgba(255,255,255,0.7)');
				svg.appendChild(highlight);
			});

			[{ cx: '6', cy: '13' }, { cx: '18', cy: '13' }].forEach(pos => {
				const blush = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
				blush.setAttribute('cx', pos.cx);
				blush.setAttribute('cy', pos.cy);
				blush.setAttribute('rx', '2.0');
				blush.setAttribute('ry', '1.0');
				blush.setAttribute('fill', 'rgba(100,180,255,0.25)');
				svg.appendChild(blush);
			});
		} else if (id === 'face-welcome') {
			[{ cx: '8', cy: '9.5' }, { cx: '16', cy: '9.5' }].forEach(pos => {
				const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				eye.setAttribute('cx', pos.cx);
				eye.setAttribute('cy', pos.cy);
				eye.setAttribute('r', '2.4');
				eye.setAttribute('fill', '#2979ff');
				svg.appendChild(eye);
			});
			[{ cx: '8.9', cy: '8.6' }, { cx: '16.9', cy: '8.6' }].forEach(pos => {
				const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				highlight.setAttribute('cx', pos.cx);
				highlight.setAttribute('cy', pos.cy);
				highlight.setAttribute('r', '0.85');
				highlight.setAttribute('fill', 'rgba(255,255,255,0.75)');
				svg.appendChild(highlight);
			});
		} else if (id === 'face-happy') {
			['M6.5 10.5 Q8 8.2 9.5 10.5', 'M14.5 10.5 Q16 8.2 17.5 10.5'].forEach(d => {
				const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				path.setAttribute('d', d);
				path.setAttribute('stroke', '#2979ff');
				path.setAttribute('stroke-width', '1.4');
				path.setAttribute('fill', 'none');
				path.setAttribute('stroke-linecap', 'round');
				svg.appendChild(path);
			});
		} else if (id === 'face-default') {
			[{ cx: '8', cy: '9.33' }, { cx: '16', cy: '9.33' }].forEach(pos => {
				const eye = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
				eye.setAttribute('class', 'can-blink');
				eye.setAttribute('cx', pos.cx);
				eye.setAttribute('cy', pos.cy);
				eye.setAttribute('rx', '1.63');
				eye.setAttribute('ry', '2.62');
				eye.setAttribute('fill', '#2979ff');
				svg.appendChild(eye);
			});
		}

		face.appendChild(svg);
		return face;
	}

	private startAnimationSequence(overlay: HTMLElement, mainContent: HTMLElement | null): void {
		const sticker = overlay.querySelector('#anime-sticker') as HTMLElement;
		const bubble = overlay.querySelector('#anime-bubble') as HTMLElement;
		const buttonContainer = overlay.querySelector('#anime-button-container') as HTMLElement;
		const enterButton = overlay.querySelector('#anime-enter-button') as HTMLElement;
		const facePeek = overlay.querySelector('#face-peek') as HTMLElement;
		const faceWelcome = overlay.querySelector('#face-welcome') as HTMLElement;
		const faceHappy = overlay.querySelector('#face-happy') as HTMLElement;
		const faceDefault = overlay.querySelector('#face-default') as HTMLElement;

		if (!sticker || !bubble || !enterButton || !buttonContainer) { return; }

		let bubbleTimer: any = null;
		let autoEnterTimer: any = null;

		const showFace = (el: HTMLElement) => {
			[facePeek, faceWelcome, faceHappy, faceDefault].forEach(f => f?.classList.remove('active'));
			el?.classList.add('active');
		};

		const showBubble = (text: string, duration: number) => {
			// allow-any-unicode-next-line
			// 清除之前的定时器
			if (bubbleTimer) {
				clearTimeout(bubbleTimer);
				bubbleTimer = null;
			}

			bubble.textContent = text;
			bubble.classList.add('show');

			if (duration > 0) {
				bubbleTimer = setTimeout(() => {
					bubble.classList.remove('show');
					bubbleTimer = null;
				}, duration);
			}
		};

		const enterWorkbench = () => {
			// allow-any-unicode-next-line
			// 清除自动进入定时器
			if (autoEnterTimer) {
				clearTimeout(autoEnterTimer);
				autoEnterTimer = null;
			}

			// test-workbench_change start - Mark animation as shown
			this.tscodeMementoData.hasShownAnimation = true;
			this.tscodeMemento.saveMemento();
			// test-workbench_change end

			overlay.style.transition = 'opacity 0.5s ease-out';
			overlay.style.opacity = '0';

			if (mainContent) {
				mainContent.style.transition = 'opacity 0.5s ease-in';
				mainContent.style.opacity = '1';
			}

			setTimeout(() => {
				overlay.remove();
			}, 500);
		};

		// allow-any-unicode-next-line
		// 按钮点击事件
		enterButton.addEventListener('click', enterWorkbench);

		setTimeout(() => {
			showFace(faceWelcome);
			sticker.classList.add('bouncing');
			// allow-any-unicode-next-line
			showBubble('你好呀！ヾ(≧▽≦*)o', 1400);
			sticker.addEventListener('animationend', () => sticker.classList.remove('bouncing'), { once: true });
		}, 3100);

		setTimeout(() => {
			showFace(faceHappy);
			sticker.classList.add('floating');
			// allow-any-unicode-next-line
			showBubble('我是测小智，希望可以帮助到你', 10000);
			// allow-any-unicode-next-line
			// 在笑脸出现时显示进入按钮
			buttonContainer.classList.add('show');
		}, 4500);

		setTimeout(() => {
			showFace(faceDefault);
		}, 14500);

		// allow-any-unicode-next-line
		// 自动进入工作台（20秒后，给用户足够时间看到按钮）
		autoEnterTimer = setTimeout(() => {
			enterWorkbench();
		}, 20500);
	}
	// test-workbench_change end

	private addProductIconToDOM(): void {
		if (!this.parentElement || this.iconAdded) {
			return;
		}

		const productNameElement = this.findProductNameElement(this.parentElement);

		if (productNameElement && !productNameElement.classList.contains('icon-added')) {
			productNameElement.classList.add('icon-added');
			this.iconAdded = true;

			// Randomly select a face type with timestamp-based seed for better randomness
			const faceTypes = ['default', 'happy', 'surprised', 'shy', 'confused', 'smug', 'thinking', 'bounce', 'love'];
			const randomIndex = Math.floor((Math.random() * Date.now()) % faceTypes.length);
			let currentFaceIndex = randomIndex;
			const randomFace = faceTypes[currentFaceIndex];

			console.log('TSCode Welcome: Selected random face:', randomFace, 'from index:', currentFaceIndex);

			// Create wrapper with floating animation
			const iconWrapper = $('span.product-icon-wrapper');
			iconWrapper.style.display = 'inline-flex';
			iconWrapper.style.cursor = 'pointer';
			iconWrapper.style.transition = 'transform 0.2s ease';
			iconWrapper.style.pointerEvents = 'auto';
			iconWrapper.style.userSelect = 'none';
			iconWrapper.style.overflow = 'visible'; // Allow glow to overflow

			// Special filter for thinking face (stronger glow effect)
			// allow-any-unicode-next-line
			// Reference: face-test.html line with "思考中"
			// Use padding + content-box to increase container size while keeping SVG at 80px
			if (randomFace === 'thinking') {
				iconWrapper.style.filter = 'drop-shadow(0 0 8px rgba(41,121,255,0.7)) drop-shadow(0 0 16px rgba(79,195,247,0.5))';
				iconWrapper.style.padding = '12px'; // Increase padding to give more space for glow
				iconWrapper.style.boxSizing = 'content-box'; // Important: padding adds to size (80px + 12px*2 = 104px container)
			} else {
				iconWrapper.style.filter = 'drop-shadow(0 4px 12px rgba(30, 100, 220, 0.2))';
				iconWrapper.style.padding = '0';
				iconWrapper.style.boxSizing = 'border-box';
			}

			iconWrapper.style.animation = 'float-tscode 3.2s ease-in-out infinite';

			// Create SVG element using DOM API
			const svg = this.createRandomFaceSVG(randomFace);
			svg.style.pointerEvents = 'none'; // Let clicks pass through to wrapper
			iconWrapper.appendChild(svg);

			// Add click event to cycle through faces
			iconWrapper.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();

				currentFaceIndex = (currentFaceIndex + 1) % faceTypes.length;
				const newFace = faceTypes[currentFaceIndex];
				console.log('TSCode Welcome: Clicked! Switched to face:', newFace);

				// Clear existing content using DOM API (not innerHTML for security)
				while (iconWrapper.firstChild) {
					iconWrapper.removeChild(iconWrapper.firstChild);
				}

				// Update filter for thinking face
				// Use padding + content-box to increase container size while keeping SVG at 80px
				if (newFace === 'thinking') {
					iconWrapper.style.filter = 'drop-shadow(0 0 8px rgba(41,121,255,0.7)) drop-shadow(0 0 16px rgba(79,195,247,0.5))';
					iconWrapper.style.padding = '12px'; // Increase padding to give more space for glow
					iconWrapper.style.boxSizing = 'content-box'; // Important: padding adds to size (80px + 12px*2 = 104px container)
				} else {
					iconWrapper.style.filter = 'drop-shadow(0 4px 12px rgba(30, 100, 220, 0.2))';
					iconWrapper.style.padding = '0';
					iconWrapper.style.boxSizing = 'border-box';
				}

				// Create new SVG
				const newSvg = this.createRandomFaceSVG(newFace);
				newSvg.style.pointerEvents = 'none';
				iconWrapper.appendChild(newSvg);
			}, true); // Use capture phase

			// Add hover effect
			iconWrapper.addEventListener('mouseenter', () => {
				iconWrapper.style.transform = 'scale(1.1)';
			});

			iconWrapper.addEventListener('mouseleave', () => {
				iconWrapper.style.transform = 'scale(1)';
			});

			// Add floating animation style to document
			this.addFloatingAnimationStyle();

			// Create icon container
			const iconSpan = $('span.product-icon');
			iconSpan.appendChild(iconWrapper);

			// Insert icon before the text content
			const textContent = productNameElement.textContent;
			productNameElement.textContent = '';
			productNameElement.appendChild(iconSpan);
			productNameElement.appendChild(document.createTextNode(textContent || ''));

			// Add flex display to align icon and text
			productNameElement.style.display = 'flex';
			productNameElement.style.alignItems = 'center';
		}
	}

	private addFloatingAnimationStyle(): void {
		// Check if style already exists
		if (document.getElementById('tscode-float-animation')) {
			return;
		}

		const style = document.createElement('style');
		style.id = 'tscode-float-animation';
		style.textContent = `
			@keyframes float-tscode {
				0%, 100% { transform: translateY(0px); }
				50% { transform: translateY(-4px); }
			}
		`;
		document.head.appendChild(style);
	}

	private createRandomFaceSVG(faceType: string): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('viewBox', '-2 -2 28 28');
		svg.setAttribute('style', 'width:80px;height:80px;overflow:visible;vertical-align:middle;margin-right:12px;display:inline-block;');

		// Create defs
		const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

		// Create gradient
		const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
		gradient.setAttribute('id', 'bg-tscode-' + faceType);
		gradient.setAttribute('x1', '0%');
		gradient.setAttribute('y1', '0%');
		gradient.setAttribute('x2', '100%');
		gradient.setAttribute('y2', '100%');

		const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
		stop1.setAttribute('offset', '0%');
		stop1.setAttribute('stop-color', '#4fc3f7');
		gradient.appendChild(stop1);

		const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
		stop2.setAttribute('offset', '50%');
		stop2.setAttribute('stop-color', '#2979ff');
		gradient.appendChild(stop2);

		const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
		stop3.setAttribute('offset', '100%');
		stop3.setAttribute('stop-color', '#69f0ae');
		gradient.appendChild(stop3);

		defs.appendChild(gradient);

		// Add blink animation for default face
		if (faceType === 'default') {
			const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
			style.textContent = `
				@keyframes blink-tscode {
					0%, 88%, 100% { ry: 2.62; }
					93% { ry: 0.2; }
				}
				.can-blink-tscode { animation: blink-tscode 4s ease-in-out infinite; }
			`;
			defs.appendChild(style);
		}

		svg.appendChild(defs);

		// Create background circle
		const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		bgCircle.setAttribute('cx', '12');
		bgCircle.setAttribute('cy', '12');
		bgCircle.setAttribute('r', '12');
		bgCircle.setAttribute('fill', '#e8f4ff');
		svg.appendChild(bgCircle);

		// Create border ring
		const borderRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		borderRing.setAttribute('cx', '12');
		borderRing.setAttribute('cy', '12');
		borderRing.setAttribute('r', '12.75');
		borderRing.setAttribute('fill', 'none');
		borderRing.setAttribute('stroke', 'url(#bg-tscode-' + faceType + ')');
		borderRing.setAttribute('stroke-width', '1.5');
		svg.appendChild(borderRing);

		// Add face-specific features
		switch (faceType) {
			case 'default':
				// Default: vertical ellipse eyes with blink
				const leftEyeDefault = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
				leftEyeDefault.setAttribute('class', 'can-blink-tscode');
				leftEyeDefault.setAttribute('cx', '8');
				leftEyeDefault.setAttribute('cy', '9.33');
				leftEyeDefault.setAttribute('rx', '1.63');
				leftEyeDefault.setAttribute('ry', '2.62');
				leftEyeDefault.setAttribute('fill', '#2979ff');
				svg.appendChild(leftEyeDefault);

				const rightEyeDefault = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
				rightEyeDefault.setAttribute('class', 'can-blink-tscode');
				rightEyeDefault.setAttribute('cx', '16');
				rightEyeDefault.setAttribute('cy', '9.33');
				rightEyeDefault.setAttribute('rx', '1.63');
				rightEyeDefault.setAttribute('ry', '2.62');
				rightEyeDefault.setAttribute('fill', '#2979ff');
				svg.appendChild(rightEyeDefault);
				break;

			case 'happy':
				// Happy: curved arc eyes (^_^)
				const leftArcHappy = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				leftArcHappy.setAttribute('d', 'M6.5 10.5 Q8 8.2 9.5 10.5');
				leftArcHappy.setAttribute('stroke', '#2979ff');
				leftArcHappy.setAttribute('stroke-width', '1.4');
				leftArcHappy.setAttribute('fill', 'none');
				leftArcHappy.setAttribute('stroke-linecap', 'round');
				svg.appendChild(leftArcHappy);

				const rightArcHappy = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				rightArcHappy.setAttribute('d', 'M14.5 10.5 Q16 8.2 17.5 10.5');
				rightArcHappy.setAttribute('stroke', '#2979ff');
				rightArcHappy.setAttribute('stroke-width', '1.4');
				rightArcHappy.setAttribute('fill', 'none');
				rightArcHappy.setAttribute('stroke-linecap', 'round');
				svg.appendChild(rightArcHappy);
				break;

			case 'surprised':
				// Surprised: large round eyes with highlights
				const leftEyeSurprised = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				leftEyeSurprised.setAttribute('cx', '8');
				leftEyeSurprised.setAttribute('cy', '9.5');
				leftEyeSurprised.setAttribute('r', '2.2');
				leftEyeSurprised.setAttribute('fill', '#2979ff');
				svg.appendChild(leftEyeSurprised);

				const rightEyeSurprised = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				rightEyeSurprised.setAttribute('cx', '16');
				rightEyeSurprised.setAttribute('cy', '9.5');
				rightEyeSurprised.setAttribute('r', '2.2');
				rightEyeSurprised.setAttribute('fill', '#2979ff');
				svg.appendChild(rightEyeSurprised);

				// Highlights
				const leftHighlight = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				leftHighlight.setAttribute('cx', '9.7');
				leftHighlight.setAttribute('cy', '8.8');
				leftHighlight.setAttribute('r', '0.7');
				leftHighlight.setAttribute('fill', 'rgba(255,255,255,0.7)');
				svg.appendChild(leftHighlight);

				const rightHighlight = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				rightHighlight.setAttribute('cx', '15.7');
				rightHighlight.setAttribute('cy', '8.8');
				rightHighlight.setAttribute('r', '0.7');
				rightHighlight.setAttribute('fill', 'rgba(255,255,255,0.7)');
				svg.appendChild(rightHighlight);
				break;

			case 'thinking':
				// allow-any-unicode-next-line
				// Thinking: eyes shift left and right with glowing ring (思考中)
				// Update viewBox for this special case
				svg.setAttribute('viewBox', '-4 -4 32 32');

				// Add glow filter
				const glowFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
				glowFilter.setAttribute('id', 'glow-tscode-thinking');
				const feGaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
				feGaussianBlur.setAttribute('stdDeviation', '0.8');
				feGaussianBlur.setAttribute('result', 'blur');
				glowFilter.appendChild(feGaussianBlur);
				const feMerge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
				const feMergeNode1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
				feMergeNode1.setAttribute('in', 'blur');
				const feMergeNode2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
				feMergeNode2.setAttribute('in', 'SourceGraphic');
				feMerge.appendChild(feMergeNode1);
				feMerge.appendChild(feMergeNode2);
				glowFilter.appendChild(feMerge);
				defs.appendChild(glowFilter);

				// Add animations
				const thinkingStyle = document.createElementNS('http://www.w3.org/2000/svg', 'style');
				thinkingStyle.textContent = `
					@keyframes eye-shift-tscode {
						0% { transform: translateX(-3px); }
						30% { transform: translateX(-3px); }
						50% { transform: translateX(3px); }
						80% { transform: translateX(3px); }
						100% { transform: translateX(-3px); }
					}
					@keyframes ring-pulse-tscode {
						0%, 100% { r: 12.75; opacity: 0.6; stroke-width: 1.5; }
						50% { r: 14; opacity: 1; stroke-width: 1.5; }
					}
					@keyframes ring-pulse-bg-tscode {
						0%, 100% { r: 12.75; opacity: 0.2; stroke-width: 3; }
						50% { r: 14.5; opacity: 0.5; stroke-width: 3; }
					}
					.thinking-eye-tscode { animation: eye-shift-tscode 2.0s ease-in-out infinite; }
					.glow-ring-tscode { animation: ring-pulse-tscode 2.0s ease-in-out infinite; filter: url(#glow-tscode-thinking); }
					.glow-ring-bg-tscode { animation: ring-pulse-bg-tscode 2.0s ease-in-out infinite; }
				`;
				defs.appendChild(thinkingStyle);

				// allow-any-unicode-next-line
				// Glow ring background (多层叠加)
				const glowRingBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				glowRingBg.setAttribute('class', 'glow-ring-bg-tscode');
				glowRingBg.setAttribute('cx', '12');
				glowRingBg.setAttribute('cy', '12');
				glowRingBg.setAttribute('r', '12.75');
				glowRingBg.setAttribute('fill', 'none');
				glowRingBg.setAttribute('stroke', 'url(#bg-tscode-' + faceType + ')');
				glowRingBg.setAttribute('stroke-width', '2');
				glowRingBg.setAttribute('opacity', '0.2');
				svg.appendChild(glowRingBg);

				// Glow ring
				const glowRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				glowRing.setAttribute('class', 'glow-ring-tscode');
				glowRing.setAttribute('cx', '12');
				glowRing.setAttribute('cy', '12');
				glowRing.setAttribute('r', '12.75');
				glowRing.setAttribute('fill', 'none');
				glowRing.setAttribute('stroke', 'url(#bg-tscode-' + faceType + ')');
				glowRing.setAttribute('stroke-width', '1.5');
				svg.appendChild(glowRing);

				// allow-any-unicode-next-line
				// 左右移动的眼睛
				const eyesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
				eyesGroup.setAttribute('class', 'thinking-eye-tscode');

				const leftEyeThinking = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
				leftEyeThinking.setAttribute('cx', '9');
				leftEyeThinking.setAttribute('cy', '9.33');
				leftEyeThinking.setAttribute('rx', '1.63');
				leftEyeThinking.setAttribute('ry', '2.62');
				leftEyeThinking.setAttribute('fill', '#2979ff');
				eyesGroup.appendChild(leftEyeThinking);

				const rightEyeThinking = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
				rightEyeThinking.setAttribute('cx', '15');
				rightEyeThinking.setAttribute('cy', '9.33');
				rightEyeThinking.setAttribute('rx', '1.63');
				rightEyeThinking.setAttribute('ry', '2.62');
				rightEyeThinking.setAttribute('fill', '#2979ff');
				eyesGroup.appendChild(rightEyeThinking);

				svg.appendChild(eyesGroup);
				break;

			case 'bounce':
				// allow-any-unicode-next-line
				// Bounce: happy face (欢跳表情)
				const leftArcBounce = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				leftArcBounce.setAttribute('d', 'M6.5 10.5 Q8 8.2 9.5 10.5');
				leftArcBounce.setAttribute('stroke', '#2979ff');
				leftArcBounce.setAttribute('stroke-width', '1.4');
				leftArcBounce.setAttribute('fill', 'none');
				leftArcBounce.setAttribute('stroke-linecap', 'round');
				svg.appendChild(leftArcBounce);

				const rightArcBounce = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				rightArcBounce.setAttribute('d', 'M14.5 10.5 Q16 8.2 17.5 10.5');
				rightArcBounce.setAttribute('stroke', '#2979ff');
				rightArcBounce.setAttribute('stroke-width', '1.4');
				rightArcBounce.setAttribute('fill', 'none');
				rightArcBounce.setAttribute('stroke-linecap', 'round');
				svg.appendChild(rightArcBounce);
				break;

			case 'love':
				// allow-any-unicode-next-line
				// Love: smiling eyes with blush and floating hearts (爱你表情)
				const leftArcLove = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				leftArcLove.setAttribute('d', 'M6.5 10.5 Q8 8.2 9.5 10.5');
				leftArcLove.setAttribute('stroke', '#2979ff');
				leftArcLove.setAttribute('stroke-width', '1.4');
				leftArcLove.setAttribute('fill', 'none');
				leftArcLove.setAttribute('stroke-linecap', 'round');
				svg.appendChild(leftArcLove);

				const rightArcLove = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				rightArcLove.setAttribute('d', 'M14.5 10.5 Q16 8.2 17.5 10.5');
				rightArcLove.setAttribute('stroke', '#2979ff');
				rightArcLove.setAttribute('stroke-width', '1.4');
				rightArcLove.setAttribute('fill', 'none');
				rightArcLove.setAttribute('stroke-linecap', 'round');
				svg.appendChild(rightArcLove);

				// Blush
				const leftBlushLove = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
				leftBlushLove.setAttribute('cx', '7');
				leftBlushLove.setAttribute('cy', '13');
				leftBlushLove.setAttribute('rx', '2.2');
				leftBlushLove.setAttribute('ry', '1.2');
				leftBlushLove.setAttribute('fill', 'rgba(255,107,157,0.4)');
				svg.appendChild(leftBlushLove);

				const rightBlushLove = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
				rightBlushLove.setAttribute('cx', '17');
				rightBlushLove.setAttribute('cy', '13');
				rightBlushLove.setAttribute('rx', '2.2');
				rightBlushLove.setAttribute('ry', '1.2');
				rightBlushLove.setAttribute('fill', 'rgba(255,107,157,0.4)');
				svg.appendChild(rightBlushLove);

				// Heart gradient
				const heartGrad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
				heartGrad.setAttribute('id', 'heartGrad-tscode');
				heartGrad.setAttribute('x1', '0%');
				heartGrad.setAttribute('y1', '0%');
				heartGrad.setAttribute('x2', '100%');
				heartGrad.setAttribute('y2', '100%');
				const heartStop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
				heartStop1.setAttribute('offset', '0%');
				heartStop1.setAttribute('stop-color', '#ff6b9d');
				const heartStop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
				heartStop2.setAttribute('offset', '100%');
				heartStop2.setAttribute('stop-color', '#ff1744');
				heartGrad.appendChild(heartStop1);
				heartGrad.appendChild(heartStop2);
				defs.appendChild(heartGrad);

				// Heart animation
				const heartStyle = document.createElementNS('http://www.w3.org/2000/svg', 'style');
				heartStyle.textContent = `
					@keyframes heart-float-tscode {
						0% { transform: translate(0, 0) scale(0.8); opacity: 0; }
						20% { opacity: 1; }
						100% { transform: translate(2px, -12px) scale(1.1); opacity: 0; }
					}
					.love-heart-tscode { animation: heart-float-tscode 2s ease-out infinite; transform-origin: 20px 6px; }
				`;
				defs.appendChild(heartStyle);

				// Floating heart
				const heartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
				heartGroup.setAttribute('class', 'love-heart-tscode');
				const heartPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				heartPath.setAttribute('d', 'M20 6 Q20 4.5 21.2 4.5 Q22.4 4.5 22.4 6 Q22.4 7.5 20 9 Q17.6 7.5 17.6 6 Q17.6 4.5 18.8 4.5 Q20 4.5 20 6 Z');
				heartPath.setAttribute('fill', 'url(#heartGrad-tscode)');
				heartGroup.appendChild(heartPath);
				svg.appendChild(heartGroup);
				break;

			case 'shy':
				// Shy: small dot eyes with blush
				const leftEyeShy = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				leftEyeShy.setAttribute('cx', '8');
				leftEyeShy.setAttribute('cy', '10');
				leftEyeShy.setAttribute('r', '1.4');
				leftEyeShy.setAttribute('fill', '#2979ff');
				svg.appendChild(leftEyeShy);

				const rightEyeShy = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				rightEyeShy.setAttribute('cx', '16');
				rightEyeShy.setAttribute('cy', '10');
				rightEyeShy.setAttribute('r', '1.4');
				rightEyeShy.setAttribute('fill', '#2979ff');
				svg.appendChild(rightEyeShy);

				// Blush
				const leftBlush = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
				leftBlush.setAttribute('cx', '7');
				leftBlush.setAttribute('cy', '13');
				leftBlush.setAttribute('rx', '2.2');
				leftBlush.setAttribute('ry', '1.2');
				leftBlush.setAttribute('fill', 'rgba(100,180,255,0.35)');
				svg.appendChild(leftBlush);

				const rightBlush = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
				rightBlush.setAttribute('cx', '17');
				rightBlush.setAttribute('cy', '13');
				rightBlush.setAttribute('rx', '2.2');
				rightBlush.setAttribute('ry', '1.2');
				rightBlush.setAttribute('fill', 'rgba(100,180,255,0.35)');
				svg.appendChild(rightBlush);
				break;

			case 'confused':
				// Confused: one eye large, one eye small
				const leftEyeConfused = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
				leftEyeConfused.setAttribute('cx', '8');
				leftEyeConfused.setAttribute('cy', '9.33');
				leftEyeConfused.setAttribute('rx', '2.1');
				leftEyeConfused.setAttribute('ry', '2.9');
				leftEyeConfused.setAttribute('fill', '#2979ff');
				svg.appendChild(leftEyeConfused);

				const rightEyeConfused = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
				rightEyeConfused.setAttribute('cx', '16');
				rightEyeConfused.setAttribute('cy', '9.33');
				rightEyeConfused.setAttribute('rx', '1.0');
				rightEyeConfused.setAttribute('ry', '1.6');
				rightEyeConfused.setAttribute('fill', '#2979ff');
				svg.appendChild(rightEyeConfused);
				break;

			case 'smug':
				// Smug: squinting eyes (horizontal lines)
				const leftLineSmug = document.createElementNS('http://www.w3.org/2000/svg', 'line');
				leftLineSmug.setAttribute('x1', '6.2');
				leftLineSmug.setAttribute('y1', '9.33');
				leftLineSmug.setAttribute('x2', '9.8');
				leftLineSmug.setAttribute('y2', '9.33');
				leftLineSmug.setAttribute('stroke', '#2979ff');
				leftLineSmug.setAttribute('stroke-width', '1.5');
				leftLineSmug.setAttribute('stroke-linecap', 'round');
				svg.appendChild(leftLineSmug);

				const rightLineSmug = document.createElementNS('http://www.w3.org/2000/svg', 'line');
				rightLineSmug.setAttribute('x1', '14.2');
				rightLineSmug.setAttribute('y1', '9.33');
				rightLineSmug.setAttribute('x2', '17.8');
				rightLineSmug.setAttribute('y2', '9.33');
				rightLineSmug.setAttribute('stroke', '#2979ff');
				rightLineSmug.setAttribute('stroke-width', '1.5');
				rightLineSmug.setAttribute('stroke-linecap', 'round');
				svg.appendChild(rightLineSmug);
				break;
		}

		return svg;
	}
}

export class TscodeWelcomeInputSerializer implements IEditorSerializer {
	public canSerialize(_editorInput: TscodeWelcomeInput): boolean {
		return true;
	}

	public serialize(editorInput: TscodeWelcomeInput): string {
		return JSON.stringify({ selectedCategory: editorInput.selectedCategory, selectedStep: editorInput.selectedStep });
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): TscodeWelcomeInput {
		return instantiationService.invokeFunction(_accessor => {
			try {
				const { selectedCategory, selectedStep } = JSON.parse(serializedEditorInput);
				return new TscodeWelcomeInput({ selectedCategory, selectedStep });
			} catch { }
			return new TscodeWelcomeInput({});
		});
	}
}
