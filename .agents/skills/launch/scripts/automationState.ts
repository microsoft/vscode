/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Locator, Page } from 'playwright';

export interface IApplicationSnapshotOptions {
	readonly maxControlsPerSection?: number;
	readonly maxTextLength?: number;
}

export interface IUISettleOptions {
	/** Scope activity tracking to this subtree. Defaults to the document body. */
	readonly root?: Locator;
	/** Required period without relevant activity. Defaults to 150ms. */
	readonly quietPeriodMs?: number;
	/** Deadlock ceiling, not the primary synchronization mechanism. Defaults to 5s. */
	readonly timeoutMs?: number;
	/** Wait for finite CSS and Web Animations in the subtree. Defaults to true. */
	readonly waitForAnimations?: boolean;
}

export interface IUISettleResult {
	readonly durationMs: number;
	readonly animationFrames: number;
	readonly mutationCount: number;
	readonly focusChangeCount: number;
}

export interface IVirtualizedCollectionOptions<T> {
	readonly page: Page;
	readonly scrollContainer: Locator;
	/** Element that receives wheel input. Defaults to `scrollContainer`. */
	readonly interactionTarget?: Locator;
	readonly items: Locator;
	readonly readItem: (item: Locator) => Promise<T>;
	readonly key?: (item: Locator, value: T) => Promise<string>;
	readonly maxItems?: number;
	readonly maxPasses?: number;
	readonly settleMs?: number;
	readonly restoreScrollPosition?: boolean;
}

export interface IVirtualizedCollectionResult<T> {
	readonly items: T[];
	readonly keys: string[];
	readonly passes: number;
	readonly truncated: boolean;
	readonly startScrollTop: number;
	readonly endScrollTop: number;
	readonly scrollHeight: number;
	readonly clientHeight: number;
	readonly reachedStart: boolean;
	readonly reachedEnd: boolean;
	readonly restored: boolean;
}

interface IScrollMetrics {
	readonly scrollTop: number;
	readonly scrollHeight: number;
	readonly clientHeight: number;
	readonly customScrollRatio?: number;
}

/**
 * Waits until a UI subtree has remained quiet across animation frames. Semantic
 * page-object completion signals remain preferable when a surface exposes one.
 */
export async function settleUI(page: Page, options: IUISettleOptions = {}): Promise<IUISettleResult> {
	const {
		root = page.locator('body'),
		quietPeriodMs = 150,
		timeoutMs = 5_000,
		waitForAnimations = true
	} = options;

	if (!Number.isFinite(quietPeriodMs) || quietPeriodMs < 0) {
		throw new Error(`settleUI(): quietPeriodMs must be a non-negative finite number, got ${quietPeriodMs}.`);
	}
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new Error(`settleUI(): timeoutMs must be a positive finite number, got ${timeoutMs}.`);
	}

	return root.evaluate(async (element, settleOptions) => {
		const startedAt = performance.now();
		let lastActivityAt = startedAt;
		let animationFrames = 0;
		let mutationCount = 0;
		let focusChangeCount = 0;
		let activeAnimationCount = 0;

		const observer = new MutationObserver(records => {
			mutationCount += records.length;
			lastActivityAt = performance.now();
		});
		observer.observe(element, {
			attributes: true,
			characterData: true,
			childList: true,
			subtree: true
		});

		const onFocusIn = (event: FocusEvent): void => {
			if (event.target instanceof Node && (event.target === element || element.contains(event.target))) {
				focusChangeCount++;
				lastActivityAt = performance.now();
			}
		};
		element.ownerDocument.addEventListener('focusin', onFocusIn, true);

		let animationFrame: number | undefined;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			return await new Promise<IUISettleResult>((resolve, reject) => {
				const finish = (): void => {
					resolve({
						durationMs: Math.round(performance.now() - startedAt),
						animationFrames,
						mutationCount,
						focusChangeCount
					});
				};

				const check = (): void => {
					animationFrames++;
					activeAnimationCount = settleOptions.waitForAnimations
						? element.getAnimations({ subtree: true }).filter(animation => {
							const iterations = animation.effect?.getTiming().iterations;
							return (animation.playState === 'running' || animation.pending) && iterations !== Infinity;
						}).length
						: 0;

					if (animationFrames >= 2 &&
						activeAnimationCount === 0 &&
						performance.now() - lastActivityAt >= settleOptions.quietPeriodMs) {
						finish();
						return;
					}
					animationFrame = requestAnimationFrame(check);
				};

				timeout = setTimeout(() => {
					reject(new Error(
						`UI did not settle within ${settleOptions.timeoutMs}ms ` +
						`(${mutationCount} mutations, ${focusChangeCount} focus changes, ${activeAnimationCount} active finite animations).`
					));
				}, settleOptions.timeoutMs);
				animationFrame = requestAnimationFrame(check);
			});
		} finally {
			observer.disconnect();
			element.ownerDocument.removeEventListener('focusin', onFocusIn, true);
			if (animationFrame !== undefined) {
				cancelAnimationFrame(animationFrame);
			}
			if (timeout !== undefined) {
				clearTimeout(timeout);
			}
		}
	}, { quietPeriodMs, timeoutMs, waitForAnimations });
}

/**
 * Clicks only when the locator's intended control is also the control under its
 * center point. This prevents broad container locators from activating nested
 * actions—for example, clicking the center of an SCM Graph pane header can hit
 * its repository picker instead of toggling the pane. Targeting the header's
 * twisty passes because both the twisty and its hit-tested point belong to the
 * same pane-header control.
 */
export async function safeClick(target: Locator): Promise<void> {
	const count = await target.count();
	if (count !== 1) {
		throw new Error(`safeClick(): expected exactly one target, found ${count}.`);
	}

	await target.scrollIntoViewIfNeeded();
	const initialBounds = await target.boundingBox();
	if (!initialBounds || initialBounds.width === 0 || initialBounds.height === 0) {
		throw new Error('safeClick(): target has no visible bounds.');
	}
	const initialPosition = { x: initialBounds.width / 2, y: initialBounds.height / 2 };
	await target.click({ position: initialPosition, trial: true });

	const bounds = await target.boundingBox();
	if (!bounds || bounds.width === 0 || bounds.height === 0) {
		throw new Error('safeClick(): target lost its visible bounds during actionability checks.');
	}
	const position = { x: bounds.width / 2, y: bounds.height / 2 };
	const hitTest = await target.evaluate((element, options) => {
		const interactiveSelector = [
			'button',
			'a[href]',
			'input:not([type="hidden"])',
			'select',
			'textarea',
			'summary',
			'[role="button"]',
			'[role="checkbox"]',
			'[role="link"]',
			'[role="menuitem"]',
			'[role="option"]',
			'[role="radio"]',
			'[role="switch"]',
			'[role="tab"]',
			'[role="treeitem"]'
		].join(',');
		const describe = (candidate: Element): string => {
			const label = candidate.getAttribute('aria-label') ??
				candidate.getAttribute('title') ??
				candidate.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80);
			const role = candidate.getAttribute('role');
			return `<${candidate.tagName.toLowerCase()}${role ? ` role="${role}"` : ''}${label ? ` "${label}"` : ''}>`;
		};
		const intendedControl = element.matches(interactiveSelector)
			? element
			: element.closest(interactiveSelector) ?? element;
		const rect = element.getBoundingClientRect();
		const hitElement = element.ownerDocument.elementFromPoint(
			rect.left + options.x,
			rect.top + options.y
		);
		if (!hitElement) {
			return { safe: false, intended: describe(intendedControl), actual: 'nothing' };
		}
		const hitControl = hitElement.closest(interactiveSelector);
		const actualControl = hitControl ?? (element.contains(hitElement) ? intendedControl : hitElement);
		return {
			safe: actualControl === intendedControl,
			intended: describe(intendedControl),
			actual: describe(actualControl)
		};
	}, position);
	if (!hitTest.safe) {
		throw new Error(`safeClick(): intended ${hitTest.intended}, but ${hitTest.actual} would receive the click. Use a more precise locator.`);
	}

	await target.click({ position });
}

async function readScrollMetrics(scrollContainer: Locator): Promise<IScrollMetrics> {
	return scrollContainer.evaluate(element => {
		const scrollbar = element.querySelector('.scrollbar.vertical');
		const slider = scrollbar?.querySelector('.slider');
		const scrollbarBounds = scrollbar?.getBoundingClientRect();
		const sliderBounds = slider?.getBoundingClientRect();
		const customScrollRange = scrollbarBounds && sliderBounds ? scrollbarBounds.height - sliderBounds.height : 0;
		return {
			scrollTop: element.scrollTop,
			scrollHeight: element.scrollHeight,
			clientHeight: element.clientHeight,
			customScrollRatio: scrollbarBounds && sliderBounds && customScrollRange > 0 ?
				(sliderBounds.top - scrollbarBounds.top) / customScrollRange : undefined
		};
	});
}

async function settleScroll(scrollContainer: Locator, settleMs: number): Promise<void> {
	await scrollContainer.evaluate(async (element, delay) => {
		const sample = () => {
			const slider = element.querySelector('.scrollbar.vertical .slider')?.getBoundingClientRect();
			return `${element.scrollTop}:${slider?.top ?? ''}:${slider?.height ?? ''}`;
		};
		let previous = sample();
		let stableSamples = 0;
		for (let attempt = 0; attempt < 40; attempt++) {
			await new Promise<void>(resolve => setTimeout(resolve, Math.max(16, delay)));
			const current = sample();
			if (current === previous) {
				if (++stableSamples >= 3) {
					return;
				}
			} else {
				previous = current;
				stableSamples = 0;
			}
		}
	}, settleMs);
}

async function defaultItemKey<T>(item: Locator, value: T): Promise<string> {
	const attributes = await item.evaluate(element => ({
		id: element.id,
		dataKey: element.getAttribute('data-key'),
		dataId: element.getAttribute('data-id'),
		ariaLabel: element.getAttribute('aria-label'),
		text: element.textContent?.replace(/\s+/g, ' ').trim()
	}));
	return attributes.dataKey ?? attributes.dataId ?? attributes.id ?? attributes.ariaLabel ??
		attributes.text ?? JSON.stringify(value);
}

/**
 * Collects a virtualized or scrollable surface without assuming what its items
 * represent. The caller retains full control over item extraction and identity.
 */
export async function collectVirtualized<T>(options: IVirtualizedCollectionOptions<T>): Promise<IVirtualizedCollectionResult<T>> {
	const {
		scrollContainer,
		page,
		interactionTarget = scrollContainer,
		items,
		readItem,
		key = defaultItemKey,
		maxItems = 1_000,
		maxPasses = 200,
		settleMs = 25,
		restoreScrollPosition = true
	} = options;

	if (!Number.isInteger(maxItems) || maxItems <= 0) {
		throw new Error(`collectVirtualized(): maxItems must be a positive integer, got ${maxItems}.`);
	}
	if (!Number.isInteger(maxPasses) || maxPasses <= 0) {
		throw new Error(`collectVirtualized(): maxPasses must be a positive integer, got ${maxPasses}.`);
	}
	if (!Number.isFinite(settleMs) || settleMs < 0) {
		throw new Error(`collectVirtualized(): settleMs must be a non-negative finite number, got ${settleMs}.`);
	}

	const initial = await readScrollMetrics(scrollContainer);
	const values = new Map<string, T>();
	let passes = 0;
	let truncated = false;
	let finalMetrics = initial;
	let reachedStart = false;
	let reachedEnd = false;
	let restored = false;

	const readVisibleItems = async (collect: boolean): Promise<string> => {
		const visibleKeys: string[] = [];
		const viewport = await interactionTarget.boundingBox();
		const count = await items.count();
		for (let index = 0; index < count; index++) {
			const item = items.nth(index);
			const itemBounds = await item.boundingBox();
			if (!viewport || !itemBounds ||
				itemBounds.x + itemBounds.width <= viewport.x ||
				itemBounds.y + itemBounds.height <= viewport.y ||
				itemBounds.x >= viewport.x + viewport.width ||
				itemBounds.y >= viewport.y + viewport.height) {
				continue;
			}

			const value = await readItem(item);
			const itemKey = await key(item, value);
			visibleKeys.push(itemKey);
			if (collect && !values.has(itemKey)) {
				values.set(itemKey, value);
				if (values.size >= maxItems) {
					truncated = true;
					break;
				}
			}
		}
		return visibleKeys.join('\u0000');
	};

	const positionKey = (metrics: IScrollMetrics): string =>
		`${Math.round(metrics.scrollTop)}:${metrics.customScrollRatio === undefined ? '' : metrics.customScrollRatio.toFixed(4)}`;

	const wheel = async (deltaY: number): Promise<void> => {
		await interactionTarget.hover();
		await page.mouse.wheel(0, deltaY);
		await settleScroll(scrollContainer, settleMs);
	};

	const scrollUntilStable = async (direction: -1 | 1, maximumPasses: number): Promise<boolean> => {
		let previous = await readVisibleItems(false);
		let previousPosition = positionKey(await readScrollMetrics(scrollContainer));
		let stablePasses = 0;
		for (let pass = 0; pass < maximumPasses; pass++) {
			const metrics = await readScrollMetrics(scrollContainer);
			await wheel(direction * Math.max(100, Math.floor(metrics.clientHeight * 0.8)));
			const current = await readVisibleItems(false);
			const currentPosition = positionKey(await readScrollMetrics(scrollContainer));
			if (current === previous && currentPosition === previousPosition) {
				if (++stablePasses >= 2) {
					return true;
				}
			} else {
				stablePasses = 0;
				previous = current;
				previousPosition = currentPosition;
			}
		}
		return false;
	};

	const initialFingerprint = await readVisibleItems(false);

	try {
		reachedStart = await scrollUntilStable(-1, Math.min(maxPasses, 50));

		while (passes < maxPasses) {
			passes++;
			const before = await readVisibleItems(true);
			finalMetrics = await readScrollMetrics(scrollContainer);
			if (truncated) {
				break;
			}

			await wheel(Math.max(100, Math.floor(finalMetrics.clientHeight * 0.8)));
			const after = await readVisibleItems(false);
			const afterMetrics = await readScrollMetrics(scrollContainer);
			if (after === before && positionKey(afterMetrics) === positionKey(finalMetrics)) {
				reachedEnd = true;
				break;
			}
			finalMetrics = afterMetrics;
		}

		if (passes >= maxPasses && !reachedEnd) {
			truncated = true;
		}
	} finally {
		if (restoreScrollPosition) {
			if (initial.customScrollRatio === undefined) {
				await scrollContainer.evaluate((element, scrollTop) => {
					element.scrollTop = scrollTop;
					element.dispatchEvent(new Event('scroll', { bubbles: true }));
				}, initial.scrollTop);
				await settleScroll(scrollContainer, settleMs);
				const restoredMetrics = await readScrollMetrics(scrollContainer);
				restored = Math.abs(restoredMetrics.scrollTop - initial.scrollTop) <= 1;
			} else {
				for (let pass = 0; pass < Math.min(maxPasses, 50); pass++) {
					const currentMetrics = await readScrollMetrics(scrollContainer);
					const currentRatio = currentMetrics.customScrollRatio ?? 0;
					const ratioDelta = initial.customScrollRatio - currentRatio;
					if (Math.abs(ratioDelta) <= 0.01) {
						restored = true;
						break;
					}
					const scrollRange = Math.max(100, currentMetrics.scrollHeight - currentMetrics.clientHeight);
					await wheel(Math.sign(ratioDelta) * Math.max(20, Math.abs(ratioDelta) * scrollRange));
				}
				if (!restored) {
					restored = await readVisibleItems(false) === initialFingerprint;
				}
			}
		}
	}

	return {
		items: [...values.values()],
		keys: [...values.keys()],
		passes,
		truncated,
		startScrollTop: initial.scrollTop,
		endScrollTop: finalMetrics.scrollTop,
		scrollHeight: finalMetrics.scrollHeight,
		clientHeight: finalMetrics.clientHeight,
		reachedStart,
		reachedEnd,
		restored
	};
}

/**
 * Returns a bounded, hierarchical description of the workbench state. Only
 * controls intersecting the viewport are enumerated; scroll containers describe
 * whether more content is reachable before or after the visible slice.
 */
export async function snapshotApplication(page: Page, options: IApplicationSnapshotOptions = {}): Promise<unknown> {
	const maxControlsPerSection = options.maxControlsPerSection ?? 100;
	const maxTextLength = options.maxTextLength ?? 200;
	if (!Number.isInteger(maxControlsPerSection) || maxControlsPerSection <= 0) {
		throw new Error(`snapshotApplication(): maxControlsPerSection must be a positive integer, got ${maxControlsPerSection}.`);
	}
	if (!Number.isInteger(maxTextLength) || maxTextLength <= 0) {
		throw new Error(`snapshotApplication(): maxTextLength must be a positive integer, got ${maxTextLength}.`);
	}

	return page.evaluate(({ maxControls, maxText }) => {
		const regionDefinitions = [
			{ id: 'titlebar', selector: '.part.titlebar' },
			{ id: 'banner', selector: '.part.banner' },
			{ id: 'activitybar', selector: '.part.activitybar' },
			{ id: 'sidebar', selector: '.part.sidebar' },
			{ id: 'editor', selector: '.part.editor' },
			{ id: 'panel', selector: '.part.panel' },
			{ id: 'auxiliarybar', selector: '.part.auxiliarybar' },
			{ id: 'statusbar', selector: '.part.statusbar' }
		] as const;
		const interactiveSelector = [
			'button',
			'a[href]',
			'input',
			'textarea',
			'select',
			'[contenteditable="true"]',
			'[tabindex]:not([tabindex="-1"])',
			'[role="button"]',
			'[role="checkbox"]',
			'[role="combobox"]',
			'[role="link"]',
			'[role="menuitem"]',
			'[role="option"]',
			'[role="radio"]',
			'[role="slider"]',
			'[role="switch"]',
			'[role="tab"]',
			'[role="textbox"]',
			'[role="treeitem"]'
		].join(',');

		const normalizeText = (value: string | null | undefined): string | undefined => {
			const normalized = value?.replace(/\s+/g, ' ').trim();
			if (!normalized) {
				return undefined;
			}
			return normalized.length > maxText ? `${normalized.slice(0, maxText - 1)}…` : normalized;
		};

		const bounds = (element: Element) => {
			const rect = element.getBoundingClientRect();
			return {
				x: Math.round(rect.x),
				y: Math.round(rect.y),
				width: Math.round(rect.width),
				height: Math.round(rect.height)
			};
		};

		const isRendered = (element: Element): boolean => {
			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			return style.display !== 'none' && style.visibility !== 'hidden' &&
				Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
		};

		const intersectsViewport = (element: Element): boolean => {
			if (!isRendered(element)) {
				return false;
			}
			const rect = element.getBoundingClientRect();
			return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
		};

		const implicitRole = (element: Element): string | undefined => {
			const explicitRole = element.getAttribute('role');
			if (explicitRole) {
				return explicitRole;
			}
			switch (element.tagName) {
				case 'BUTTON': return 'button';
				case 'A': return 'link';
				case 'INPUT':
					switch ((element as HTMLInputElement).type) {
						case 'checkbox': return 'checkbox';
						case 'radio': return 'radio';
						case 'range': return 'slider';
						default: return 'textbox';
					}
				case 'TEXTAREA': return 'textbox';
				case 'SELECT': return 'combobox';
				default: return undefined;
			}
		};

		const explicitLabelFor = (element: Element): string | undefined =>
				normalizeText(element.getAttribute('aria-label')) ??
				normalizeText(element.getAttribute('title')) ??
				normalizeText(element.getAttribute('placeholder')) ??
				normalizeText(element.getAttribute('alt'));

		const labelFor = (element: Element): string | undefined => {
			const explicitLabel = explicitLabelFor(element);
			if (explicitLabel || element === document.body || element.classList.contains('monaco-workbench')) {
				return explicitLabel;
			}
			return normalizeText(element.textContent);
		};

		const selectorHint = (element: Element): string | undefined => {
			if (element.id) {
				return `#${CSS.escape(element.id)}`;
			}
			for (const attribute of ['data-key', 'data-id']) {
				const value = element.getAttribute(attribute);
				if (value) {
					return `[${attribute}=${JSON.stringify(value)}]`;
				}
			}
			return undefined;
		};

		const describeControl = (element: Element) => {
			const classNames = [...element.classList];
			const icon = classNames.find(className => className.startsWith('codicon-') && className !== 'codicon-modifier-spin');
			const role = implicitRole(element);
			const label = labelFor(element);
			const input = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
			const inputValue = element instanceof HTMLInputElement && element.type === 'password' ?
				'[redacted]' :
				input ? normalizeText((element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value) : undefined;
			return {
				tag: element.tagName.toLowerCase(),
				role,
				label,
				icon,
				selector: selectorHint(element),
				bounds: bounds(element),
				focused: element === document.activeElement || undefined,
				disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true' || undefined,
				selected: element.getAttribute('aria-selected') === 'true' || element.classList.contains('selected') || undefined,
				expanded: element.hasAttribute('aria-expanded') ? element.getAttribute('aria-expanded') === 'true' : undefined,
				checked: element.hasAttribute('aria-checked') ? element.getAttribute('aria-checked') === 'true' :
					element.hasAttribute('aria-pressed') ? element.getAttribute('aria-pressed') === 'true' :
						element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type) ? element.checked : undefined,
				value: inputValue
			};
		};

		const visibleControls = (root: Element, excludedRoots: Element[] = []) => {
			const candidates = [...root.querySelectorAll(interactiveSelector)]
				.filter(element => !excludedRoots.some(excluded => excluded.contains(element)))
				.filter(intersectsViewport);
			const controls = candidates.filter(element => {
				const ancestor = element.parentElement?.closest(interactiveSelector);
				if (!ancestor || !root.contains(ancestor)) {
					return true;
				}
				const sameLabel = labelFor(ancestor) === labelFor(element);
				const ancestorBounds = ancestor.getBoundingClientRect();
				const elementBounds = element.getBoundingClientRect();
				return !(sameLabel && ancestorBounds.x === elementBounds.x && ancestorBounds.y === elementBounds.y &&
					ancestorBounds.width === elementBounds.width && ancestorBounds.height === elementBounds.height);
			});
			const described = controls.map(describeControl);
			return {
				items: described.slice(0, maxControls),
				visibleCount: described.length,
				truncated: described.length > maxControls
			};
		};

		const describeScrollContainers = (root: Element, excludedRoots: Element[] = []) => {
			const candidates = [root, ...root.querySelectorAll('*')]
				.filter(element => !excludedRoots.some(excluded => excluded.contains(element)))
				.filter(element => {
				if (!isRendered(element)) {
					return false;
				}
				const style = getComputedStyle(element);
				const customScrollbar = element.classList.contains('monaco-scrollable-element') &&
					element.querySelector('.scrollbar.vertical .slider');
				return !!customScrollbar || (element.scrollHeight > element.clientHeight + 1 &&
					['auto', 'scroll'].includes(style.overflowY));
				});
			return candidates.slice(0, 25).map(element => {
				const setSizes = [...element.querySelectorAll('[aria-setsize]')]
					.map(item => Number(item.getAttribute('aria-setsize')))
					.filter(Number.isFinite);
				const scrollbar = element.querySelector('.scrollbar.vertical');
				const slider = scrollbar?.querySelector('.slider');
				const scrollbarBounds = scrollbar?.getBoundingClientRect();
				const sliderBounds = slider?.getBoundingClientRect();
				const customHasMoreBefore = scrollbarBounds && sliderBounds ?
					sliderBounds.top > scrollbarBounds.top + 1 : undefined;
				const customHasMoreAfter = scrollbarBounds && sliderBounds ?
					sliderBounds.bottom < scrollbarBounds.bottom - 1 : undefined;
				return {
					role: implicitRole(element),
					label: labelFor(element),
					selector: selectorHint(element),
					bounds: bounds(element),
					kind: slider ? 'monaco' : 'native',
					scrollTop: Math.round(element.scrollTop),
					clientHeight: Math.round(element.clientHeight),
					scrollHeight: Math.round(element.scrollHeight),
					hasMoreBefore: customHasMoreBefore ?? element.scrollTop > 1,
					hasMoreAfter: customHasMoreAfter ?? element.scrollTop + element.clientHeight < element.scrollHeight - 1,
					renderedItemCount: element.querySelectorAll('[role="treeitem"], [role="listitem"], [role="option"], .monaco-list-row').length,
					estimatedItemCount: setSizes.length ? Math.max(...setSizes) : undefined
				};
			});
		};

		const sectionElements = (regionId: string, root: Element): Element[] => {
			let selector: string | undefined;
			switch (regionId) {
				case 'editor': selector = '.editor-group-container'; break;
				case 'sidebar':
				case 'panel':
				case 'auxiliarybar': selector = '.pane'; break;
			}
			if (!selector) {
				return [];
			}
			return [...root.querySelectorAll(selector)].filter(isRendered);
		};

		const describeSections = (elements: Element[]) =>
			elements.map((element, index) => ({
				index,
				label: labelFor(element.querySelector('[role="heading"], .title, .pane-header') ?? element),
				bounds: bounds(element),
				controls: visibleControls(element),
				scrollContainers: describeScrollContainers(element)
			}));

		const regions = regionDefinitions.map(definition => {
			const element = document.querySelector(definition.selector);
			if (!element) {
				return { id: definition.id, present: false, visible: false };
			}
			const visible = intersectsViewport(element);
			const sections = visible ? sectionElements(definition.id, element) : [];
			return {
				id: definition.id,
				present: true,
				visible,
				bounds: bounds(element),
				controls: visible ? visibleControls(element, sections) : { items: [], visibleCount: 0, truncated: false },
				sections: visible ? describeSections(sections) : [],
				scrollContainers: visible ? describeScrollContainers(element, sections) : []
			};
		});

		const overlaySelectors = [
			'[role="dialog"]',
			'.quick-input-widget',
			'.context-view',
			'.notifications-toasts',
			'.monaco-dialog-box'
		];
		const seenOverlays = new Set<Element>();
		const overlays = overlaySelectors.flatMap(selector => [...document.querySelectorAll(selector)])
			.filter(element => {
				if (!intersectsViewport(element) || seenOverlays.has(element)) {
					return false;
				}
				seenOverlays.add(element);
				return true;
			})
			.map(element => ({
				role: implicitRole(element),
				label: explicitLabelFor(element) ??
					labelFor(element.querySelector('[role="heading"], input, textarea, [role="textbox"], [role="menu"]') ?? element),
				className: element.className,
				bounds: bounds(element),
				controls: visibleControls(element),
				scrollContainers: describeScrollContainers(element)
			}));

		const activeElement = document.activeElement;
		const focusedRegion = activeElement ? regionDefinitions.find(definition =>
			document.querySelector(definition.selector)?.contains(activeElement))?.id : undefined;

		return {
			url: location.href,
			title: document.title,
			viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
			focus: activeElement ? {
				region: focusedRegion,
				control: describeControl(activeElement)
			} : undefined,
			overlays,
			regions
		};
	}, { maxControls: maxControlsPerSection, maxText: maxTextLength });
}
