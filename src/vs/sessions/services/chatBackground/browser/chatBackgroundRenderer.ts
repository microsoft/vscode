/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatBackground.css';
import { $, addDisposableListener, clearNode, DisposableResizeObserver, EventType, getWindow, isHTMLElement, sharedMutationObserver } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { getCompactCodicon } from '../../../../workbench/contrib/chat/browser/chatIcons.js';
import { ISessionsChatBackground } from './chatBackgroundService.js';

const codiconCellSize = 80;
const codiconButtonSize = 24;
const codiconDefaults = { width: 960, height: 800 };
const codiconButtonOccluderClasses = [
	'interactive-item-container',
	'monaco-sash',
	'new-chat-input-container',
	'new-chat-bottom-container',
	'interactive-input-part',
	'scrollbar',
];
const codiconButtonOccluderTags = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'SUMMARY', 'TEXTAREA']);
const codiconButtonOccluderRoles = new Set(['button', 'checkbox', 'combobox', 'link', 'menuitem', 'option', 'radio', 'slider', 'spinbutton', 'switch', 'tab', 'textbox', 'treeitem']);
const codiconChoices = [
	Codicon.sparkle,
	Codicon.heart,
	Codicon.gear,
	Codicon.rocket,
	Codicon.terminal,
	Codicon.code,
	Codicon.extensions,
	Codicon.lightbulb,
	Codicon.beaker,
	Codicon.coffee,
	Codicon.symbolMethod,
	Codicon.symbolClass,
	Codicon.debugAlt,
	Codicon.gitBranch,
	Codicon.book,
	Codicon.bell,
	Codicon.comment,
	Codicon.cloud,
	Codicon.database,
	Codicon.search,
	Codicon.globe,
	Codicon.flame,
	Codicon.gift,
	Codicon.key,
	Codicon.paintcan,
	Codicon.pin,
	Codicon.plug,
	Codicon.pulse,
	Codicon.radioTower,
	Codicon.remote,
	Codicon.repo,
	Codicon.shield,
	Codicon.starFull,
	Codicon.tools,
	Codicon.wand,
	Codicon.zap,
	Codicon.agent,
	Codicon.robot,
	Codicon.bug,
	Codicon.circuitBoard,
	Codicon.telescope,
	Codicon.compass,
	Codicon.layers,
	Codicon.package,
	Codicon.server,
	Codicon.graphLine,
	Codicon.searchFuzzy,
	Codicon.squirrel,
];

function hashCodiconCell(row: number, column: number, salt: number): number {
	let value = Math.imul(row + 1, 73856093) ^ Math.imul(column + 1, 19349663) ^ Math.imul(salt + 1, 83492791);
	value = Math.imul(value ^ (value >>> 13), 1540483477);
	return (value ^ (value >>> 15)) >>> 0;
}

function getCodiconCellLayout(row: number, column: number) {
	const horizontalOffset = ((hashCodiconCell(row, column, 2) % 71) - 35) / 100;
	const verticalOffset = ((hashCodiconCell(row, column, 3) % 65) - 32) / 100;
	const depth = hashCodiconCell(row, column, 6) % 10;
	return {
		left: (column + 0.5 + horizontalOffset) * codiconCellSize,
		top: (row + 0.5 + verticalOffset) * codiconCellSize,
		rotation: (hashCodiconCell(row, column, 4) % 71) - 35,
		opacity: 0.65 + (hashCodiconCell(row, column, 5) % 36) / 100,
		depth: depth < 5 ? 0 : depth < 9 ? 1 : 2,
	};
}

function isCodiconButtonFullyVisible(left: number, top: number, width: number, height: number): boolean {
	const buttonRadius = codiconButtonSize / 2;
	return left >= buttonRadius && left <= width - buttonRadius && top >= buttonRadius && top <= height - buttonRadius;
}

function isCodiconButtonOccluder(element: HTMLElement): boolean {
	return codiconButtonOccluderClasses.some(className => element.classList.contains(className))
		|| codiconButtonOccluderTags.has(element.tagName)
		|| codiconButtonOccluderRoles.has(element.getAttribute('role') ?? '')
		|| element.isContentEditable;
}

function* getCodiconButtonOccluders(element: HTMLElement): Iterable<HTMLElement> {
	for (const child of element.children) {
		if (!isHTMLElement(child)
			|| child.classList.contains('sessions-chat-background')
			|| child.classList.contains('sessions-chat-codicon-hit-target')) {
			continue;
		}
		if (isCodiconButtonOccluder(child)) {
			yield child;
		} else {
			yield* getCodiconButtonOccluders(child);
		}
	}
}

interface IConfettiCandidateGeometry {
	readonly backgroundBounds: DOMRect;
	readonly occluderBounds: readonly DOMRect[];
}

interface ICodiconCell {
	readonly element: HTMLElement;
	readonly icon: HTMLElement;
	readonly animationElement?: HTMLElement;
	opacity: number;
}

export class SessionsChatBackgroundRenderer extends Disposable {

	private readonly backgroundLayer: HTMLElement;
	private readonly codiconLayer: HTMLElement;
	private readonly codiconDepthLayers: readonly HTMLElement[];
	private readonly codiconCells = new Map<string, ICodiconCell>();
	private readonly confettiCandidates = new Set<string>();
	private readonly foregroundResizeObservations = new Map<HTMLElement, IDisposable>();
	private readonly confettiButton: Button | undefined;
	private readonly _onDidActivateCodicon = this._register(new Emitter<HTMLElement>());
	readonly onDidActivateCodicon: Event<HTMLElement> = this._onDidActivateCodicon.event;
	private readonly refreshScheduler: RunOnceScheduler;
	private readonly resizeObserver: DisposableResizeObserver;
	private background: ISessionsChatBackground | undefined;
	private codiconGridSize: string | undefined;
	private confettiCell: string | undefined;

	constructor(
		private readonly element: HTMLElement,
		private readonly interactive = false,
		private readonly random: () => number = Math.random,
	) {
		super();
		this.refreshScheduler = this._register(new RunOnceScheduler(
			() => this.renderCodicons(this.element.clientWidth, this.element.clientHeight),
			0
		));

		this.backgroundLayer = $('.sessions-chat-background');
		this.backgroundLayer.ariaHidden = 'true';
		this.backgroundLayer.hidden = true;

		this.codiconLayer = $('.sessions-chat-codicon-background');
		this.codiconLayer.ariaHidden = 'true';
		this.codiconLayer.hidden = true;
		this.codiconDepthLayers = ['far', 'middle', 'near'].map(depth => {
			const layer = $(`.sessions-chat-codicon-depth.${depth}`);
			this.codiconLayer.appendChild(layer);
			return layer;
		});
		this.backgroundLayer.appendChild(this.codiconLayer);
		this.element.prepend(this.backgroundLayer);
		this._register(toDisposable(() => {
			this.element.classList.remove('has-chat-background', 'has-chat-background-image');
			this.clearCodicons();
			this.backgroundLayer.remove();
		}));

		if (this.interactive) {
			const label = localize('sessionsChatBackground.confettiButton', "Celebrate");
			this.confettiButton = this._register(new Button(this.element, { ariaLabel: label, title: label }));
			this.confettiButton.element.classList.add('sessions-chat-codicon-hit-target');
			this.element.insertBefore(this.confettiButton.element, this.backgroundLayer);
			this.confettiButton.element.hidden = true;
			this._register(this.confettiButton.onDidClick(() => this.activateConfettiCell()));
		} else {
			this.confettiButton = undefined;
		}

		this.resizeObserver = this._register(new DisposableResizeObserver(
			'SessionsChatBackgroundRenderer',
			() => this.refreshScheduler.schedule(),
			getWindow(element)
		));
		this._register(this.resizeObserver.observe(element));

		if (this.interactive) {
			const mutationObserverDisposables = this._register(new DisposableStore());
			this._register(sharedMutationObserver.observe(element, mutationObserverDisposables, {
				attributes: true,
				attributeFilter: ['class', 'contenteditable', 'hidden', 'href', 'role', 'style', 'tabindex'],
				childList: true,
				subtree: true,
			})(mutations => {
				if (mutations.some(mutation => !this.backgroundLayer.contains(mutation.target) && !this.confettiButton?.element.contains(mutation.target))) {
					this.refreshScheduler.schedule();
				}
			}));
			this._register(addDisposableListener(element, EventType.SCROLL, () => this.refreshScheduler.schedule(), true));
		}
	}

	setBackground(background: ISessionsChatBackground | undefined): void {
		this.background = background;
		this.element.classList.toggle('has-chat-background', !!background);
		this.element.classList.toggle('has-chat-background-image', background?.kind === 'image');
		this.backgroundLayer.hidden = !background;
		this.backgroundLayer.style.backgroundImage = background?.kind === 'image' ? background.backgroundImage : '';
		this.backgroundLayer.style.backgroundRepeat = background?.kind === 'image' ? background.backgroundRepeat : '';
		this.backgroundLayer.style.backgroundSize = background?.kind === 'image' ? background.backgroundSize : '';
		this.backgroundLayer.style.backgroundPosition = background?.kind === 'image' ? background.backgroundPosition : '';

		const showCodicons = background?.kind === 'codicons';
		this.codiconLayer.hidden = !showCodicons;
		if (showCodicons) {
			this.renderCodicons(this.element.clientWidth, this.element.clientHeight);
		} else {
			this.codiconGridSize = undefined;
			this.clearCodicons();
		}
	}

	private renderCodicons(width: number, height: number): void {
		if (this.background?.kind !== 'codicons') {
			return;
		}

		const viewportWidth = width || codiconDefaults.width;
		const viewportHeight = height || codiconDefaults.height;
		const columns = Math.max(1, Math.ceil(viewportWidth / codiconCellSize));
		const rows = Math.max(1, Math.ceil(viewportHeight / codiconCellSize));
		const gridSize = `${columns}x${rows}`;
		const visibleCells = new Map<string, ReturnType<typeof getCodiconCellLayout>>();
		const candidateGeometry = this.interactive ? this.getConfettiCandidateGeometry() : undefined;
		this.confettiCandidates.clear();
		for (let row = 0; row < rows; row++) {
			for (let column = 0; column < columns; column++) {
				if (hashCodiconCell(row, column, 0) % 9 === 0) {
					continue;
				}

				const cell = `${row}:${column}`;
				const layout = getCodiconCellLayout(row, column);
				const distanceFromContent = Math.min(1, Math.hypot(
					(layout.left / viewportWidth - 0.5) * 2,
					(layout.top / viewportHeight - 0.45) * 2,
				));
				layout.opacity *= 0.35 + 0.65 * distanceFromContent;
				visibleCells.set(cell, layout);
				const existingCell = this.codiconCells.get(cell);
				// Compare the cached number because CSSOM rounds the serialized opacity.
				if (existingCell && existingCell.opacity !== layout.opacity) {
					existingCell.icon.style.opacity = `${layout.opacity}`;
					existingCell.opacity = layout.opacity;
				}
				if (layout.depth === 1 && candidateGeometry && this.isConfettiCandidate(layout.left, layout.top, viewportWidth, viewportHeight, candidateGeometry)) {
					this.confettiCandidates.add(cell);
				}
			}
		}

		if (this.interactive && (!this.confettiCell || !this.confettiCandidates.has(this.confettiCell))) {
			const candidates = [...this.confettiCandidates];
			this.confettiCell = candidates.length ? candidates[Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))] : undefined;
		}

		if (gridSize === this.codiconGridSize) {
			this.updateConfettiButton();
			return;
		}
		this.codiconGridSize = gridSize;

		for (const [cell, codiconCell] of this.codiconCells) {
			if (!visibleCells.has(cell)) {
				codiconCell.element.remove();
				this.codiconCells.delete(cell);
			}
		}

		for (const [cell, layout] of visibleCells) {
			const [row, column] = cell.split(':').map(Number);
			const existingCell = this.codiconCells.get(cell);
			if (existingCell) {
				continue;
			}

			const icon = codiconChoices[hashCodiconCell(row, column, 1) % codiconChoices.length];
			const depthIcon = layout.depth === 0 ? getCompactCodicon(icon) : icon;
			const codiconCell = this.interactive ? this.createInteractiveCodicon(depthIcon, layout.opacity) : this.createDecorativeCodicon(depthIcon, layout.opacity);
			if (this.interactive) {
				codiconCell.element.style.left = `${layout.left}px`;
				codiconCell.element.style.top = `${layout.top}px`;
				codiconCell.icon.style.transform = `rotate(${layout.rotation}deg)`;
			} else {
				codiconCell.element.style.left = `${layout.left}px`;
				codiconCell.element.style.top = `${layout.top}px`;
				codiconCell.element.style.transform = `translate(-50%, -50%) rotate(${layout.rotation}deg)`;
			}
			codiconCell.icon.style.opacity = `${layout.opacity}`;
			this.codiconCells.set(cell, codiconCell);
			this.codiconDepthLayers[layout.depth].appendChild(codiconCell.element);
		}

		this.updateConfettiButton();
	}

	private getConfettiCandidateGeometry(): IConfettiCandidateGeometry {
		const occluders = new Set(getCodiconButtonOccluders(this.element));
		for (const [element, observation] of this.foregroundResizeObservations) {
			if (!occluders.has(element)) {
				observation.dispose();
				this.foregroundResizeObservations.delete(element);
			}
		}
		for (const occluder of occluders) {
			if (!this.foregroundResizeObservations.has(occluder)) {
				this.foregroundResizeObservations.set(occluder, this.resizeObserver.observe(occluder));
			}
		}
		return {
			backgroundBounds: this.backgroundLayer.getBoundingClientRect(),
			occluderBounds: [...occluders].map(occluder => occluder.getBoundingClientRect()).filter(bounds => bounds.width > 0 && bounds.height > 0),
		};
	}

	private isConfettiCandidate(left: number, top: number, viewportWidth: number, viewportHeight: number, geometry: IConfettiCandidateGeometry): boolean {
		if (!isCodiconButtonFullyVisible(left, top, viewportWidth, viewportHeight)) {
			return false;
		}

		const buttonRadius = codiconButtonSize / 2;
		const buttonBounds = {
			left: geometry.backgroundBounds.left + left - buttonRadius,
			right: geometry.backgroundBounds.left + left + buttonRadius,
			top: geometry.backgroundBounds.top + top - buttonRadius,
			bottom: geometry.backgroundBounds.top + top + buttonRadius,
		};
		for (const bounds of geometry.occluderBounds) {
			if (buttonBounds.left < bounds.right && buttonBounds.right > bounds.left
				&& buttonBounds.top < bounds.bottom && buttonBounds.bottom > bounds.top) {
				return false;
			}
		}
		return true;
	}

	private createDecorativeCodicon(icon: ThemeIcon, opacity: number): ICodiconCell {
		const element = renderIcon(icon);
		element.ariaHidden = 'true';
		return { element, icon: element, opacity };
	}

	private createInteractiveCodicon(icon: ThemeIcon, opacity: number): ICodiconCell {
		const element = $('.sessions-chat-codicon-cell');
		element.ariaHidden = 'true';
		const animationElement = $('.sessions-chat-codicon-button-animation');
		const iconElement = renderIcon(icon);
		iconElement.ariaHidden = 'true';
		animationElement.appendChild(iconElement);
		element.appendChild(animationElement);
		return { element, icon: iconElement, animationElement, opacity };
	}

	private activateConfettiCell(): void {
		if (!this.confettiCell) {
			return;
		}

		const cell = this.codiconCells.get(this.confettiCell);
		if (!cell?.animationElement) {
			return;
		}

		this._onDidActivateCodicon.fire(cell.animationElement);
		this.selectNextConfettiCell(this.confettiCell);
	}

	private selectNextConfettiCell(currentCell: string): void {
		const candidates = [...this.confettiCandidates].filter(cell => cell !== currentCell);
		if (!candidates.length) {
			return;
		}

		const candidateIndex = Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length));
		this.confettiCell = candidates[candidateIndex];
		this.updateConfettiButton();
	}

	private updateConfettiButton(): void {
		if (!this.confettiButton) {
			return;
		}

		const confettiCell = this.confettiCell;
		const cell = confettiCell ? this.codiconCells.get(confettiCell) : undefined;
		if (!confettiCell || !cell) {
			this.confettiButton.element.hidden = true;
			this.updateActiveConfettiCell();
			return;
		}

		this.confettiButton.element.style.left = cell.element.style.left;
		this.confettiButton.element.style.top = cell.element.style.top;
		this.confettiButton.element.hidden = false;
		this.updateActiveConfettiCell();
	}

	private updateActiveConfettiCell(): void {
		for (const [cellId, cell] of this.codiconCells) {
			cell.element.classList.toggle('sessions-chat-codicon-button-active', cellId === this.confettiCell);
		}
	}

	private clearCodicons(): void {
		for (const observation of this.foregroundResizeObservations.values()) {
			observation.dispose();
		}
		this.foregroundResizeObservations.clear();
		if (this.confettiButton) {
			this.confettiButton.element.blur();
			this.confettiButton.element.hidden = true;
		}
		this.codiconCells.clear();
		this.confettiCandidates.clear();
		this.confettiCell = undefined;
		for (const layer of this.codiconDepthLayers) {
			clearNode(layer);
		}
	}
}

export class SessionsChatBackgroundReplica extends Disposable {

	private readonly viewport: HTMLElement;
	private readonly element: HTMLElement;
	private readonly renderer: SessionsChatBackgroundRenderer;

	constructor(
		private readonly source: HTMLElement,
		private readonly container: HTMLElement,
	) {
		super();

		this.viewport = $('.sessions-chat-background-replica-viewport');
		this.viewport.ariaHidden = 'true';
		this.viewport.hidden = true;
		this.element = $('.sessions-chat-background-replica');
		this.element.ariaHidden = 'true';
		this.viewport.appendChild(this.element);
		this.container.prepend(this.viewport);
		this._register(toDisposable(() => this.viewport.remove()));

		this.renderer = this._register(new SessionsChatBackgroundRenderer(this.element));

		const resizeObserver = this._register(new DisposableResizeObserver(
			'SessionsChatBackgroundReplica',
			() => this.layout(),
			getWindow(source)
		));
		this._register(resizeObserver.observe(source));
		this._register(resizeObserver.observe(container));
	}

	setBackground(background: ISessionsChatBackground | undefined): void {
		this.viewport.hidden = !background;
		this.layout();
		this.renderer.setBackground(background);
	}

	layout(): void {
		if (this.viewport.hidden) {
			return;
		}

		const sourceBounds = this.source.getBoundingClientRect();
		const containerBounds = this.container.getBoundingClientRect();
		this.element.style.left = `${sourceBounds.left - containerBounds.left}px`;
		this.element.style.top = `${sourceBounds.top - containerBounds.top}px`;
		this.element.style.width = `${sourceBounds.width}px`;
		this.element.style.height = `${sourceBounds.height}px`;
	}
}
