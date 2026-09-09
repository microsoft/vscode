/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatBackground.css';
import { clearNode, DisposableResizeObserver, getWindow } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ISessionsChatBackground } from './chatBackgroundService.js';

const codiconCellSize = 80;
const codiconDefaults = { width: 960, height: 800 };
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
];

function hashCodiconCell(row: number, column: number, salt: number): number {
	let value = Math.imul(row + 1, 73856093) ^ Math.imul(column + 1, 19349663) ^ Math.imul(salt + 1, 83492791);
	value = Math.imul(value ^ (value >>> 13), 1540483477);
	return (value ^ (value >>> 15)) >>> 0;
}

export class SessionsChatBackgroundRenderer extends Disposable {

	private readonly backgroundLayer: HTMLElement;
	private readonly codiconLayer: HTMLElement;
	private readonly codiconCells = new Map<string, HTMLElement>();
	private background: ISessionsChatBackground | undefined;
	private codiconGridSize: string | undefined;

	constructor(private readonly element: HTMLElement) {
		super();

		this.backgroundLayer = element.ownerDocument.createElement('div');
		this.backgroundLayer.className = 'sessions-chat-background';
		this.backgroundLayer.ariaHidden = 'true';
		this.backgroundLayer.hidden = true;

		this.codiconLayer = element.ownerDocument.createElement('div');
		this.codiconLayer.className = 'sessions-chat-codicon-background';
		this.codiconLayer.ariaHidden = 'true';
		this.codiconLayer.hidden = true;
		this.backgroundLayer.appendChild(this.codiconLayer);
		this.element.prepend(this.backgroundLayer);
		this._register(toDisposable(() => {
			this.element.classList.remove('has-chat-background', 'has-chat-background-image');
			this.backgroundLayer.remove();
		}));

		const resizeObserver = this._register(new DisposableResizeObserver(
			'SessionsChatBackgroundRenderer',
			entries => {
				const entry = entries[0];
				if (entry) {
					this.renderCodicons(entry.contentRect.width, entry.contentRect.height);
				}
			},
			getWindow(element)
		));
		this._register(resizeObserver.observe(element));
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
			this.codiconCells.clear();
			clearNode(this.codiconLayer);
		}
	}

	private renderCodicons(width: number, height: number): void {
		if (this.background?.kind !== 'codicons') {
			return;
		}

		const columns = Math.max(1, Math.ceil((width || codiconDefaults.width) / codiconCellSize));
		const rows = Math.max(1, Math.ceil((height || codiconDefaults.height) / codiconCellSize));
		const gridSize = `${columns}x${rows}`;
		if (gridSize === this.codiconGridSize) {
			return;
		}
		this.codiconGridSize = gridSize;

		const fragment = this.element.ownerDocument.createDocumentFragment();
		const visibleCells = new Set<string>();
		for (let row = 0; row < rows; row++) {
			for (let column = 0; column < columns; column++) {
				if (hashCodiconCell(row, column, 0) % 9 === 0) {
					continue;
				}

				const cell = `${row}:${column}`;
				visibleCells.add(cell);
				if (this.codiconCells.has(cell)) {
					continue;
				}

				const icon = renderIcon(codiconChoices[hashCodiconCell(row, column, 1) % codiconChoices.length]);
				icon.ariaHidden = 'true';
				const horizontalOffset = ((hashCodiconCell(row, column, 2) % 71) - 35) / 100;
				const verticalOffset = ((hashCodiconCell(row, column, 3) % 65) - 32) / 100;
				const rotation = (hashCodiconCell(row, column, 4) % 71) - 35;
				icon.style.left = `${(column + 0.5 + horizontalOffset) * codiconCellSize}px`;
				icon.style.top = `${(row + 0.5 + verticalOffset) * codiconCellSize}px`;
				icon.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
				icon.style.opacity = `${0.65 + (hashCodiconCell(row, column, 5) % 36) / 100}`;
				this.codiconCells.set(cell, icon);
				fragment.append(icon);
			}
		}

		for (const [cell, icon] of this.codiconCells) {
			if (!visibleCells.has(cell)) {
				icon.remove();
				this.codiconCells.delete(cell);
			}
		}
		this.codiconLayer.append(fragment);
	}
}
