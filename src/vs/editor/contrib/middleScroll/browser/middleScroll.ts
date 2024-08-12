/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./middleScroll';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';

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
	private readonly disposables: DisposableStore = new DisposableStore();

	static get(editor: ICodeEditor): MiddleScrollController | null {
		return editor.getContribution<MiddleScrollController>(MiddleScrollController.ID);
	}

	constructor(editor: ICodeEditor) {
		super();
		this._editor = editor;
		this.setCurrent = this.setCurrent.bind(this);
		this.windowMouseDown = this.windowMouseDown.bind(this);
		this.windowMouseUp = this.windowMouseUp.bind(this);
		this.scrollPane = this.scrollPane.bind(this);
		this.stopScroll = this.stopScroll.bind(this);

		this._register(this._editor.onMouseDown((e: IEditorMouseEvent) => this.windowMouseDown(e.event)));
		this._register(this._editor.onMouseUp((e: IEditorMouseEvent) => this.windowMouseUp()));

		this.disposables.add(toDisposable(() => {
			this.stopScroll();
		}));
	}

	getWindow() {
		return this._editor.getDomNode() ? dom.getWindow(this._editor.getDomNode()) : dom.getActiveWindow();
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
			moveTop = Math.round((diffTop - this.threshold) / this.speed);
		} else if (diffTop < -this.threshold) {
			moveTop = Math.round((diffTop + this.threshold) / this.speed);
		}
		const diffLeft = (this.currentX - this.x);
		let moveLeft = 0;
		if (diffLeft > this.threshold) {
			moveLeft = Math.round((diffLeft - this.threshold) / this.speed);
		} else if (diffLeft < -this.threshold) {
			moveLeft = Math.round((diffLeft + this.threshold) / this.speed);
		}

		let direction = '';
		direction += (moveTop < 0 ? 'n' : (moveTop > 0 ? 's' : ''));
		direction += (moveLeft < 0 ? 'w' : (moveLeft > 0 ? 'e' : ''));
		if (direction !== '') {
			this.moving = true;
		}
		this.getWindow().document.body.setAttribute('data-scroll-direction', direction);

		const targetTop = top + moveTop;
		this._editor.setScrollTop(targetTop);

		const targetLeft = left + moveLeft;
		this._editor.setScrollLeft(targetLeft);

		this.animationFrameId = this.getWindow().requestAnimationFrame(this.scrollPane);
	}

	startScroll(e: IMouseEvent) {
		if (this.scrolling) {
			this.stopScroll();
		}
		this.scrolling = true;
		this.moving = false;
		this.getWindow().document.body.classList.add('scroll-editor-on-middle-click-editor');
		if (this.dot) {
			this.dot.style.left = e.posx + 'px';
			this.dot.style.top = e.posy + 'px';
			this.dot.classList.remove('hidden');
		}
		this.x = e.posx;
		this.y = e.posy;
		this.currentX = e.posx;
		this.currentY = e.posy;
		this.getWindow().addEventListener('mousemove', this.setCurrent, { capture: true });
		this.scrollPane();
	}

	stopScroll() {
		this.scrolling = false;
		this.moving = false;
		this.getWindow().removeEventListener('mousemove', this.setCurrent, { capture: true });
		if (this.animationFrameId !== null) {
			this.getWindow().cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
		if (this.dot) {
			this.dot.classList.add('hidden');
		}
		this.getWindow().document.body.removeAttribute('data-scroll-direction');
		this.getWindow().document.body.classList.remove('scroll-editor-on-middle-click-editor');
	}

	setCurrent(e: MouseEvent) {
		this.currentX = e.pageX;
		this.currentY = e.pageY;
	}

	windowMouseDown(e: IMouseEvent) {
		if (this.scrolling) {
			if (e.middleButton) {
				e.stopPropagation();
			}
			this.stopScroll();
		} else {
			if (!this.dot) {
				this.createDot();
			}
			if (e.middleButton) {
				e.stopPropagation();
				this.startScroll(e);
			}
		}
	}

	windowMouseUp() {
		if (this.moving) {
			this.stopScroll();
		}
	}

	createDot() {
		this.dot = document.createElement('div');
		this.dot.classList.add('scroll-editor-on-middle-click-dot', 'hidden');
		this.getWindow().document.body.append(this.dot);
		this.disposables.add(toDisposable(() => {
			if (this.dot) {
				this.dot.remove();
				this.dot = null;
			}
		}));
		console.log(this.dot);

	}

	public override dispose() {
		this.disposables.dispose();
		super.dispose();
	}
}

registerEditorContribution(MiddleScrollController.ID, MiddleScrollController, EditorContributionInstantiation.BeforeFirstInteraction);
