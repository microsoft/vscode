/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode, getWindow, h } from '../../../../base/browser/dom.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { coalesce, shuffle } from '../../../../base/common/arrays.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isMacintosh, isWeb, OS } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
import { defaultKeybindingLabelStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { isDark } from '../../../../platform/theme/common/theme.js';

interface WatermarkEntry {
	readonly id: string;
	readonly text: string;
	readonly when?: {
		native?: ContextKeyExpression;
		web?: ContextKeyExpression;
	};
}

interface Star {
	x: number;
	y: number;
	size: number;
	opacity: number;
	baseOpacity: number;
	twinkleSpeed: number;
	twinklePhase: number;
}

const showChatContextKey = ContextKeyExpr.and(ContextKeyExpr.equals('chatSetupHidden', false), ContextKeyExpr.equals('chatSetupDisabled', false));

const openChat: WatermarkEntry = { text: localize('watermark.openChat', "Open Chat"), id: 'workbench.action.chat.open', when: { native: showChatContextKey, web: showChatContextKey } };
const showCommands: WatermarkEntry = { text: localize('watermark.showCommands', "Show All Commands"), id: 'workbench.action.showCommands' };
const gotoFile: WatermarkEntry = { text: localize('watermark.quickAccess', "Go to File"), id: 'workbench.action.quickOpen' };
const openFile: WatermarkEntry = { text: localize('watermark.openFile', "Open File"), id: 'workbench.action.files.openFile' };
const openFolder: WatermarkEntry = { text: localize('watermark.openFolder', "Open Folder"), id: 'workbench.action.files.openFolder' };
const openFileOrFolder: WatermarkEntry = { text: localize('watermark.openFileFolder', "Open File or Folder"), id: 'workbench.action.files.openFileFolder' };
const openRecent: WatermarkEntry = { text: localize('watermark.openRecent', "Open Recent"), id: 'workbench.action.openRecent' };
const newUntitledFile: WatermarkEntry = { text: localize('watermark.newUntitledFile', "New Untitled Text File"), id: 'workbench.action.files.newUntitledFile' };
const findInFiles: WatermarkEntry = { text: localize('watermark.findInFiles', "Find in Files"), id: 'workbench.action.findInFiles' };
const toggleTerminal: WatermarkEntry = { text: localize({ key: 'watermark.toggleTerminal', comment: ['toggle is a verb here'] }, "Toggle Terminal"), id: 'workbench.action.terminal.toggleTerminal', when: { web: ContextKeyExpr.equals('terminalProcessSupported', true) } };
const startDebugging: WatermarkEntry = { text: localize('watermark.startDebugging', "Start Debugging"), id: 'workbench.action.debug.start', when: { web: ContextKeyExpr.equals('terminalProcessSupported', true) } };
const openSettings: WatermarkEntry = { text: localize('watermark.openSettings', "Open Settings"), id: 'workbench.action.openSettings' };

const baseEntries: WatermarkEntry[] = [
	openChat,
	showCommands,
];

const emptyWindowEntries: WatermarkEntry[] = coalesce([
	...baseEntries,
	...(isMacintosh && !isWeb ? [openFileOrFolder] : [openFile, openFolder]),
	openRecent,
	isMacintosh && !isWeb ? newUntitledFile : undefined, // fill in one more on macOS to get to 5 entries
]);

const workspaceEntries: WatermarkEntry[] = [
	...baseEntries,
];

const otherEntries: WatermarkEntry[] = [
	gotoFile,
	findInFiles,
	startDebugging,
	toggleTerminal,
	openSettings,
];

export class EditorGroupWatermark extends Disposable {

	private static readonly CACHED_WHEN = 'editorGroupWatermark.whenConditions';
	private static readonly SETTINGS_KEY = 'workbench.tips.enabled';
	private static readonly MINIMUM_ENTRIES = 3;

	private readonly cachedWhen: { [when: string]: boolean };

	private readonly shortcuts: HTMLElement;
	private readonly transientDisposables = this._register(new DisposableStore());
	private readonly keybindingLabels = this._register(new DisposableStore());

	private enabled = false;
	private workbenchState: WorkbenchState;

	private starCanvas: HTMLCanvasElement | undefined;
	private starCtx: CanvasRenderingContext2D | undefined;
	private stars: Star[] = [];
	private animationFrameId: number | undefined;

	constructor(
		container: HTMLElement,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IEditorService private readonly editorService: IEditorService,
		@ICommandService private readonly commandService: ICommandService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();

		this.cachedWhen = this.storageService.getObject(EditorGroupWatermark.CACHED_WHEN, StorageScope.PROFILE, Object.create(null));
		this.workbenchState = this.contextService.getWorkbenchState();

		// Create and append starry background canvas directly to container
		const canvas = document.createElement('canvas');
		canvas.className = 'star-canvas';
		append(container, canvas);
		this.starCanvas = canvas;
		this.starCtx = canvas.getContext('2d') ?? undefined;

		const elements = h('.editor-group-watermark', [
			h('.watermark-container', [
				h('.branding', [
					h('.letterpress'),
					h('.welcome', [localize('watermark.welcomeToDSpace', "Welcome to DSpace")]),
					h('.subtitle', [localize('watermark.yourResearchSpace', "Your Research Space")]),
					h('.example-prompt', [
						h('span.example-text', [localize('watermark.showExample', "Show me an example in ")]),
						h('a.example-link@typstLink', [localize('watermark.typst', "Typst")]),
						h('span.separator', [', ']),
						h('a.example-link@mystLink', [localize('watermark.myst', "MyST")]),
						h('span.separator', [' or ']),
						h('a.example-link@markdownLink', [localize('watermark.markdown', "Markdown")]),
						h('span.period', ['.'])
					]),
					h('.ai-prompt', [
						h('span.ai-text', [localize('watermark.startConversation', "Start a conversation with ")]),
						h('a.ai-link@aiLink', [localize('watermark.dspaceAI', "DSpace AI")]),
						h('span.period', ['.'])
					])
				]),
				h('.shortcuts@shortcuts'),
			])
		]);

		append(container, elements.root);
		this.shortcuts = elements.shortcuts;

		this.registerListeners();
		this.registerExampleLinks(elements);

		this.render();

		// Initialize starry background after a delay to ensure canvas is in DOM and sized
		setTimeout(() => this.initializeStarryBackground(), 0);
	}

	override dispose(): void {
		this.stopStarryBackground();
		super.dispose();
	}

	private registerExampleLinks(elements: Record<string, HTMLElement>): void {
		const typstExample = `= Research Paper Title

#set text(font: "Latin Modern Roman", size: 11pt)
#set page(paper: "a4", margin: 2.5cm)

== Introduction

This is an example document written in *Typst*, a modern markup-based typesetting system. Typst is designed for scientific and academic writing.

== Key Features

- Clean, readable syntax
- Fast compilation
- Built-in support for math: $integral_0^infinity e^(-x^2) dif x = sqrt(pi)/2$
- Advanced layout capabilities

== Conclusion

Start exploring Typst for your research writing!
`;

		const mystExample = `---
title: Research Paper Title
author: Your Name
date: ${new Date().toISOString().split('T')[0]}
---

## Introduction

This is an example document written in **MyST Markdown** (Markedly Structured Text). MyST extends CommonMark with powerful features for scientific writing.

## Key Features

- All the power of Markdown
- Support for cross-references
- Directives and roles from reStructuredText
- Math support: $\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$

\`\`\`{note}
MyST is perfect for computational notebooks and scientific documentation.
\`\`\`

## Conclusion

Start exploring MyST for your research writing!
`;

		const markdownExample = `# Research Paper Title

*Your Name* | ${new Date().toISOString().split('T')[0]}

## Introduction

This is an example document written in **Markdown**, a lightweight markup language. Markdown is widely used for documentation, notes, and writing.

## Key Features

- Simple, readable syntax
- Easy to learn and use
- Widely supported across platforms
- Great for quick notes and documentation

### Example Code

\`\`\`javascript
function greet(name) { return \`Hello, \${name}!\`; }
\`\`\`

## Conclusion

Start exploring Markdown for your writing!
`;

		elements.typstLink.addEventListener('click', (e: MouseEvent) => {
			e.preventDefault();
			this.editorService.openEditor({
				resource: undefined,
				contents: typstExample,
				languageId: 'typst',
				options: { pinned: true }
			});
		});

		elements.mystLink.addEventListener('click', (e: MouseEvent) => {
			e.preventDefault();
			this.editorService.openEditor({
				resource: undefined,
				contents: mystExample,
				languageId: 'markdown',
				options: { pinned: true }
			});
		});

		elements.markdownLink.addEventListener('click', (e: MouseEvent) => {
			e.preventDefault();
			this.editorService.openEditor({
				resource: undefined,
				contents: markdownExample,
				languageId: 'markdown',
				options: { pinned: true }
			});
		});

		elements.aiLink.addEventListener('click', (e: MouseEvent) => {
			e.preventDefault();
			this.commandService.executeCommand('workbench.action.chat.open');
		});
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(EditorGroupWatermark.SETTINGS_KEY) &&
				this.enabled !== this.configurationService.getValue<boolean>(EditorGroupWatermark.SETTINGS_KEY)
			) {
				this.render();
			}
		}));

		this._register(this.contextService.onDidChangeWorkbenchState(workbenchState => {
			if (this.workbenchState !== workbenchState) {
				this.workbenchState = workbenchState;
				this.render();
			}
		}));

		this._register(this.storageService.onWillSaveState(e => {
			if (e.reason === WillSaveStateReason.SHUTDOWN) {
				const entries = [...emptyWindowEntries, ...workspaceEntries, ...otherEntries];
				for (const entry of entries) {
					const when = isWeb ? entry.when?.web : entry.when?.native;
					if (when) {
						this.cachedWhen[entry.id] = this.contextKeyService.contextMatchesRules(when);
					}
				}

				this.storageService.store(EditorGroupWatermark.CACHED_WHEN, JSON.stringify(this.cachedWhen), StorageScope.PROFILE, StorageTarget.MACHINE);
			}
		}));
	}

	private render(): void {
		this.enabled = this.configurationService.getValue<boolean>(EditorGroupWatermark.SETTINGS_KEY);

		clearNode(this.shortcuts);
		this.transientDisposables.clear();

		if (!this.enabled) {
			return;
		}

		const entries = this.filterEntries(this.workbenchState !== WorkbenchState.EMPTY ? workspaceEntries : emptyWindowEntries);
		if (entries.length < EditorGroupWatermark.MINIMUM_ENTRIES) {
			const additionalEntries = this.filterEntries(otherEntries);
			shuffle(additionalEntries);
			entries.push(...additionalEntries.slice(0, EditorGroupWatermark.MINIMUM_ENTRIES - entries.length));
		}

		const box = append(this.shortcuts, $('.watermark-box'));

		const update = () => {
			clearNode(box);
			this.keybindingLabels.clear();

			for (const entry of entries) {
				const keys = this.keybindingService.lookupKeybinding(entry.id);
				if (!keys) {
					continue;
				}

				const dl = append(box, $('dl'));
				const dt = append(dl, $('dt'));
				dt.textContent = entry.text;

				const dd = append(dl, $('dd'));

				const label = this.keybindingLabels.add(new KeybindingLabel(dd, OS, { renderUnboundKeybindings: true, ...defaultKeybindingLabelStyles }));
				label.set(keys);
			}
		};

		update();
		this.transientDisposables.add(this.keybindingService.onDidUpdateKeybindings(update));
	}

	private filterEntries(entries: WatermarkEntry[]): WatermarkEntry[] {
		const filteredEntries = entries
			.filter(entry => {
				if (this.cachedWhen[entry.id]) {
					return true; // cached from previous session
				}

				const contextKey = isWeb ? entry.when?.web : entry.when?.native;
				return !contextKey /* works without context */ || this.contextKeyService.contextMatchesRules(contextKey);
			})
			.filter(entry => !!CommandsRegistry.getCommand(entry.id))
			.filter(entry => !!this.keybindingService.lookupKeybinding(entry.id));

		return filteredEntries;
	}

	private initializeStarryBackground(): void {
		console.log('[Starry Background] Initializing...', { hasCanvas: !!this.starCanvas, hasCtx: !!this.starCtx });
		if (!this.starCanvas || !this.starCtx) {
			console.log('[Starry Background] Missing canvas or context, aborting');
			return;
		}

		// Get the window object for the canvas element
		const targetWindow = getWindow(this.starCanvas);

		// Set canvas size to match container
		const updateCanvasSize = () => {
			if (!this.starCanvas) {
				return;
			}
			const rect = this.starCanvas.getBoundingClientRect();
			console.log('[Starry Background] Canvas size:', rect.width, 'x', rect.height);
			this.starCanvas.width = rect.width;
			this.starCanvas.height = rect.height;

			// Reinitialize stars when canvas size changes
			this.createStars();
		};

		updateCanvasSize();
		targetWindow.addEventListener('resize', updateCanvasSize);
		this._register({ dispose: () => targetWindow.removeEventListener('resize', updateCanvasSize) });

		// Listen to theme changes
		this._register(this.themeService.onDidColorThemeChange(() => {
			console.log('[Starry Background] Theme changed, restarting animation');
			this.animateStars();
		}));

		this.createStars();
		this.animateStars();
		console.log('[Starry Background] Initialization complete, stars created:', this.stars.length);
	}

	private createStars(): void {
		if (!this.starCanvas) {
			return;
		}

		const width = this.starCanvas.width;
		const height = this.starCanvas.height;
		const starCount = Math.floor((width * height) / 8000); // Density: 1 star per 8000 pixels

		this.stars = [];
		for (let i = 0; i < starCount; i++) {
			this.stars.push({
				x: Math.random() * width,
				y: Math.random() * height,
				size: Math.random() * 1.5 + 0.5, // Size between 0.5 and 2
				baseOpacity: Math.random() * 0.3 + 0.15, // Base opacity between 0.15 and 0.45
				opacity: 0,
				twinkleSpeed: Math.random() * 0.02 + 0.005, // Slow twinkle
				twinklePhase: Math.random() * Math.PI * 2
			});
		}
	}

	private animateStars(): void {
		if (!this.starCanvas || !this.starCtx || this.stars.length === 0) {
			console.log('[Starry Background] Cannot animate:', { hasCanvas: !!this.starCanvas, hasCtx: !!this.starCtx, starCount: this.stars.length });
			return;
		}

		// Get the window object for the canvas element
		const targetWindow = getWindow(this.starCanvas);
		const ctx = this.starCtx;
		const canvas = this.starCanvas;

		// Determine star color based on theme
		const theme = this.themeService.getColorTheme();
		const isLightTheme = !isDark(theme.type);
		const starColor = isLightTheme ? 'rgba(79, 80, 117, ' : 'rgba(255, 255, 255, '; // Dark blue (#4f5075) for light, white for dark
		console.log('[Starry Background] Starting animation with color:', starColor, 'theme:', theme.type);

		let frameCount = 0;
		const animate = () => {
			frameCount++;
			if (frameCount % 60 === 0) {
				// console.log('[Starry Background] Animation running, frame:', frameCount);
			}

			// Get current canvas dimensions on each frame to handle resizing
			const width = canvas.width;
			const height = canvas.height;

			// Clear canvas
			ctx.clearRect(0, 0, width, height);

			// Move at 30-degree angle (cos(30 degrees) = 0.866, sin(30 degrees) = 0.5)
			const speed = 0.15; // Slow movement
			const dx = -Math.cos(Math.PI / 6) * speed; // Move left
			const dy = -Math.sin(Math.PI / 6) * speed; // Move up

			for (const star of this.stars) {
				// Update position
				star.x += dx;
				star.y += dy;

				// Wrap around when stars move off screen
				if (star.x < -10) {
					star.x = width + 10;
				}
				if (star.y < -10) {
					star.y = height + 10;
				}

				// Update twinkle
				star.twinklePhase += star.twinkleSpeed;
				const twinkleFactor = Math.sin(star.twinklePhase) * 0.3 + 0.7; // Oscillate between 0.4 and 1.0
				star.opacity = star.baseOpacity * twinkleFactor;

				// Draw star
				ctx.fillStyle = starColor + star.opacity + ')';
				ctx.beginPath();
				ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
				ctx.fill();
			}

			this.animationFrameId = targetWindow.requestAnimationFrame(animate);
		};

		// Stop any existing animation
		this.stopStarryBackground();

		// Start animation
		this.animationFrameId = targetWindow.requestAnimationFrame(animate);
	}

	private stopStarryBackground(): void {
		if (this.animationFrameId !== undefined && this.starCanvas) {
			const targetWindow = getWindow(this.starCanvas);
			targetWindow.cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = undefined;
		}
	}
}
