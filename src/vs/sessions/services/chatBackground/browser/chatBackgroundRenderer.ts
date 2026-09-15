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
import { ISessionsChatBackground } from './chatBackgroundService.js';

const codiconCellSize = 80;
const codiconButtonSize = 24;
const codiconDefaults = { width: 960, height: 800 };
const codiconButtonOccluderClasses = ['new-chat-input-container', 'new-chat-bottom-container', 'interactive-input-part'];
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
	return {
		left: (column + 0.5 + horizontalOffset) * codiconCellSize,
		top: (row + 0.5 + verticalOffset) * codiconCellSize,
		rotation: (hashCodiconCell(row, column, 4) % 71) - 35,
		opacity: `${0.65 + (hashCodiconCell(row, column, 5) % 36) / 100}`,
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
		if (!isHTMLElement(child) || child.classList.contains('sessions-chat-background')) {
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
	readonly disposable?: IDisposable;
}

export class SessionsChatBackgroundRenderer extends Disposable {

	private readonly backgroundLayer: HTMLElement;
	private readonly codiconLayer: HTMLElement;
	private readonly codiconCells = new Map<string, ICodiconCell>();
	private readonly confettiCandidates = new Set<string>();
	private readonly foregroundResizeObservations = new Map<HTMLElement, IDisposable>();
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
		if (!this.interactive) {
			this.backgroundLayer.ariaHidden = 'true';
		} else {
			this.backgroundLayer.classList.add('sessions-chat-background-interactive');
		}
		this.backgroundLayer.hidden = true;

		this.codiconLayer = $('.sessions-chat-codicon-background');
		if (!this.interactive) {
			this.codiconLayer.ariaHidden = 'true';
		}
		this.codiconLayer.hidden = true;
		this.backgroundLayer.appendChild(this.codiconLayer);
		this.element.prepend(this.backgroundLayer);
		this._register(toDisposable(() => {
			this.element.classList.remove('has-chat-background', 'has-chat-background-image');
			this.clearCodicons();
			this.backgroundLayer.remove();
		}));

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
				if (mutations.some(mutation => !this.backgroundLayer.contains(mutation.target))) {
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
				visibleCells.set(cell, layout);
				if (candidateGeometry && this.isConfettiCandidate(layout.left, layout.top, viewportWidth, viewportHeight, candidateGeometry)) {
					this.confettiCandidates.add(cell);
				}
			}
		}

		const preserveFocus = !!this.confettiCell
			&& this.codiconCells.get(this.confettiCell)?.element === getWindow(this.element).document.activeElement;
		if (this.interactive && (!this.confettiCell || !this.confettiCandidates.has(this.confettiCell))) {
			const candidates = [...this.confettiCandidates];
			this.confettiCell = candidates.length ? candidates[Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))] : undefined;
		}

		if (gridSize === this.codiconGridSize) {
			this.updateConfettiButtons(preserveFocus);
			return;
		}
		this.codiconGridSize = gridSize;

		for (const [cell, codiconCell] of this.codiconCells) {
			if (!visibleCells.has(cell)) {
				codiconCell.disposable?.dispose();
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
			const codiconCell = this.interactive ? this.createCodiconButton(cell, icon) : this.createDecorativeCodicon(icon);
			if (this.interactive) {
				codiconCell.element.style.left = `${layout.left}px`;
				codiconCell.element.style.top = `${layout.top}px`;
				codiconCell.icon.style.transform = `rotate(${layout.rotation}deg)`;
				codiconCell.icon.style.opacity = layout.opacity;
			} else {
				codiconCell.element.style.left = `${layout.left}px`;
				codiconCell.element.style.top = `${layout.top}px`;
				codiconCell.element.style.transform = `translate(-50%, -50%) rotate(${layout.rotation}deg)`;
				codiconCell.element.style.opacity = layout.opacity;
			}
			this.codiconCells.set(cell, codiconCell);
			this.codiconLayer.appendChild(codiconCell.element);
		}

		this.updateConfettiButtons(preserveFocus);
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

	private createDecorativeCodicon(icon: ThemeIcon): ICodiconCell {
		const element = renderIcon(icon);
		element.ariaHidden = 'true';
		return { element, icon: element };
	}

	private createCodiconButton(cell: string, icon: ThemeIcon): ICodiconCell {
		const disposables = new DisposableStore();
		const button = disposables.add(new Button(this.codiconLayer, {}));
		button.element.classList.add('sessions-chat-codicon-cell');
		button.element.style.width = `${codiconButtonSize}px`;
		button.element.style.height = `${codiconButtonSize}px`;
		const animationElement = $('.sessions-chat-codicon-button-animation');
		const buttonIcon = renderIcon(icon);
		buttonIcon.ariaHidden = 'true';
		animationElement.appendChild(buttonIcon);
		button.element.appendChild(animationElement);
		disposables.add(button.onDidClick(event => {
			if (this.confettiCell !== cell) {
				return;
			}

			this._onDidActivateCodicon.fire(animationElement);
			this.selectNextConfettiCell(cell, event.type === EventType.KEY_DOWN);
		}));
		return { element: button.element, icon: buttonIcon, animationElement, disposable: disposables };
	}

	private selectNextConfettiCell(currentCell: string, preserveFocus: boolean): void {
		const candidates = [...this.confettiCandidates].filter(cell => cell !== currentCell);
		if (!candidates.length) {
			return;
		}

		const candidateIndex = Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length));
		this.confettiCell = candidates[candidateIndex];
		this.updateConfettiButtons(preserveFocus);
	}

	private updateConfettiButtons(preserveFocus = false): void {
		const label = localize('sessionsChatBackground.confettiButton', "Celebrate");
		for (const [cell, codiconCell] of this.codiconCells) {
			if (!codiconCell.animationElement) {
				continue;
			}

			const active = cell === this.confettiCell;
			codiconCell.element.classList.toggle('sessions-chat-codicon-button', active);
			codiconCell.element.tabIndex = active ? 0 : -1;
			if (active) {
				codiconCell.element.removeAttribute('aria-hidden');
				codiconCell.element.setAttribute('role', 'button');
				codiconCell.element.setAttribute('aria-label', label);
				codiconCell.element.title = label;
			} else {
				codiconCell.element.blur();
				codiconCell.element.ariaHidden = 'true';
				codiconCell.element.removeAttribute('role');
				codiconCell.element.removeAttribute('aria-label');
				codiconCell.element.removeAttribute('title');
			}
		}
		if (preserveFocus && this.confettiCell) {
			this.codiconCells.get(this.confettiCell)?.element.focus();
		}
	}

	private clearCodicons(): void {
		for (const observation of this.foregroundResizeObservations.values()) {
			observation.dispose();
		}
		this.foregroundResizeObservations.clear();
		for (const cell of this.codiconCells.values()) {
			cell.disposable?.dispose();
		}
		this.codiconCells.clear();
		this.confettiCandidates.clear();
		this.confettiCell = undefined;
		clearNode(this.codiconLayer);
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
		this.layout();

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
		this.renderer.setBackground(background);
	}

	layout(): void {
		const sourceBounds = this.source.getBoundingClientRect();
		const containerBounds = this.container.getBoundingClientRect();
		this.element.style.left = `${sourceBounds.left - containerBounds.left}px`;
		this.element.style.top = `${sourceBounds.top - containerBounds.top}px`;
		this.element.style.width = `${sourceBounds.width}px`;
		this.element.style.height = `${sourceBounds.height}px`;
	}
}
