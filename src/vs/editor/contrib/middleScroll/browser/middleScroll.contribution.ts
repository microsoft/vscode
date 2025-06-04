/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, getActiveWindow, addDisposableListener } from '../../../../base/browser/dom.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, IEditorMouseEvent } from '../../../browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { EditorOption } from '../../../common/config/editorOptions.js';

import './middleScroll.css';

export class MiddleScrollController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.middleScroll';

	private readonly _editor: ICodeEditor;
	private moving: boolean = false;
	private scrolling: boolean = false;
	private currentX: number | null = null;
	private currentY: number | null = null;
	private x: number | null = null;
	private y: number | null = null;
	private threshold: number = 5;
	private speed: number = 2;
	private animationFrameId: number | null = null;
	private dot: HTMLDivElement | null = null;
	private mouseMoveListener: IDisposable | null = null;

	static get(editor: ICodeEditor): MiddleScrollController | null {
		return editor.getContribution<MiddleScrollController>(MiddleScrollController.ID);
	}

	get editor(): ICodeEditor {
		return this._editor;
	}

	private get scrollOnMiddleClick() {
		return this._editor.getOptions().get(EditorOption.scrollOnMiddleClick);
	}

	constructor(editor: ICodeEditor) {
		super();
		this._editor = editor;

		this.windowMouseMove = this.windowMouseMove.bind(this);

		this._register(this._editor.onMouseDown(this.editorMouseDown.bind(this)));
		this._register(this._editor.onMouseUp(this.editorMouseUp.bind(this)));

		this._register(toDisposable(() => this.stopScroll()));
	}

	getWindow() {
		return this._editor.getDomNode() ? getWindow(this._editor.getDomNode()) : getActiveWindow();
	}

	getTarget() {
		return this._editor.getDomNode();
	}

	scrollPane() {
		if (this.currentX === null || this.currentY === null || this.x === null || this.y === null) {
			return;
		}

		const top = this._editor.getScrollTop();
		const left = this._editor.getScrollLeft();

		const diffTop = (this.currentY - this.y);
		let moveTop = 0;
		if (diffTop > this.threshold) {
			moveTop = (diffTop - this.threshold) / this.speed;
		} else if (diffTop < -this.threshold) {
			moveTop = (diffTop + this.threshold) / this.speed;
		}
		const diffLeft = (this.currentX - this.x);
		let moveLeft = 0;
		if (diffLeft > this.threshold) {
			moveLeft = (diffLeft - this.threshold) / this.speed;
		} else if (diffLeft < -this.threshold) {
			moveLeft = (diffLeft + this.threshold) / this.speed;
		}

		let direction = '';
		direction += (moveTop < 0 ? 'n' : (moveTop > 0 ? 's' : ''));
		direction += (moveLeft < 0 ? 'w' : (moveLeft > 0 ? 'e' : ''));
		if (direction !== '') {
			this.moving = true;
		}
		this.getTarget()?.setAttribute('data-scroll-direction', direction);

		const targetTop = top + moveTop;
		this._editor.setScrollTop(targetTop);

		const targetLeft = left + moveLeft;
		this._editor.setScrollLeft(targetLeft);

		this.animationFrameId = this.getWindow().requestAnimationFrame(() => this.scrollPane());
	}

	startScroll(x: number, y: number) {
		if (this.scrolling) {
			this.stopScroll();
		}

		if (!this.dot) {
			this.createDot();
		}

		this.scrolling = true;
		this.moving = false;
		this.getTarget()?.classList.add('scroll-editor-on-middle-click-editor');
		const offset = this.getTarget()?.getBoundingClientRect() ?? { left: 0, top: 0 };
		if (this.dot) {
			this.dot.style.left = (x - offset.left) + 'px';
			this.dot.style.top = (y - offset.top) + 'px';
			this.dot.classList.remove('hidden');
		}
		this.x = x;
		this.y = y;
		this.currentX = x;
		this.currentY = y;
		this.mouseMoveListener = addDisposableListener(this.getWindow(), 'mousemove', this.windowMouseMove, { passive: true });
		this._register(this.mouseMoveListener);
		this.scrollPane();
	}

	stopScroll() {
		this.scrolling = false;
		this.moving = false;
		if (this.animationFrameId !== null) {
			this.getWindow().cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
		if (this.dot) {
			this.dot.classList.add('hidden');
		}
		const workbench = this.getTarget();
		workbench?.removeAttribute('data-scroll-direction');
		workbench?.classList.remove('scroll-editor-on-middle-click-editor');
		this.mouseMoveListener?.dispose();
		this.mouseMoveListener = null;
	}

	setCurrent(x: number, y: number) {
		this.currentX = x;
		this.currentY = y;
	}

	editorMouseDown(e: IEditorMouseEvent) {
		if (!this.scrolling && this.scrollOnMiddleClick && e.event.middleButton) {
			e.event.stopPropagation();
			e.event.preventDefault();
			this.startScroll(e.event.posx, e.event.posy);
		} else if (this.scrolling) {
			this.stopScroll();
		}
	}

	editorMouseUp() {
		if (this.moving) {
			this.stopScroll();
		}
	}

	windowMouseMove(e: MouseEvent) {
		if (!this.scrolling) {
			return;
		}

		if (!this.scrollOnMiddleClick) {
			this.stopScroll();
		} else {
			this.setCurrent(e.pageX, e.pageY);
		}
	}

	createDot() {
		this.dot = document.createElement('div');
		this.dot.classList.add('scroll-editor-on-middle-click-dot', 'hidden');
		const workbench = this.getTarget();
		if (workbench) {
			workbench.append(this.dot);
			this._register(toDisposable(() => {
				if (this.dot) {
					this.dot.remove();
					this.dot = null;
				}
			}));
		}
	}
}

registerEditorContribution(MiddleScrollController.ID, MiddleScrollController, EditorContributionInstantiation.BeforeFirstInteraction);
