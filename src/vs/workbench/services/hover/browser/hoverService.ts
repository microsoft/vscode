/*----------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

 'vs/css!./media/hover';
 { registerSingleton } 'vs/platform/instantiation/common/extensions';
 { registerThemingParticipant } 'vs/platform/theme/common/themeService';
 { editorHoverBackground, editorHoverBorder, textLinkForeground, editorHoverForeground, editorHoverStatusBarBackground, textCodeBlockBackground, widgetShadow } 'vs/platform/theme/common/colorRegistry';
 { IHoverService, IHoverOptions } 'vs/workbench/services/hover/browser/hover';
 { IContextMenuService, IContextViewService } 'vs/platform/contextview/browser/contextView';
 { IInstantiationService } 'vs/platform/instantiation/common/instantiation';
 { HoverWidget } 'vs/workbench/services/hover/browser/hoverWidget';
 { IContextViewProvider, IDelegate } 'vs/base/browser/ui/contextview/contextview';
 { DisposableStore, IDisposable, toDisposable } 'vs/base/common/lifecycle';
 { addDisposableListener, EventType } 'vs/base/browser/dom';

  HoverService  IHoverService {
	  _serviceBrand: undefined;

	 _currentHoverOptions: IHoverOptions | undefined;

	constructor(
		@IInstantiationService _instantiationService: IInstantiationService,
		@IContextViewService _contextViewService: IContextViewService,
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		contextMenuService.onDidShowContextMenu(() => this.hideHover());
	}

	showHover(options: IHoverOptions, focus?: boolean): IDisposable | undefined {
		 (this._currentHoverOptions === options) {
			 undefined;
		}
		this._currentHoverOptions = options;

		hoverDisposables = DisposableStore();
		hover = this._instantiationService.createInstance(HoverWidget, options);
		hover.onDispose(() => {
			this._currentHoverOptions = undefined;
			hoverDisposables.dispose();
		});
	        provider = this._contextViewService as IContextViewProvider;
		provider.showContextView( HoverContextViewDelegate(hover, focus));
		hover.onRequestLayout(() => provider.layout());
		('targetElements' options.target) {
			 ( element options.target.targetElements) {
				hoverDisposables.add(addDisposableListener(element, EventType.CLICK, () => this.hideHover()));
			}
		} {
			hoverDisposables.add(addDisposableListener(options.target, EventType.CLICK, () => this.hideHover()));
		}

		('IntersectionObserver' in window) {
			 observer = IntersectionObserver(e => this._intersectionChange(e, hover), { threshold: 0 });
			 firstTargetElement = 'targetElements' options.target ? options.target.targetElements[0] : options.target;
			observer.observe(firstTargetElement);
			hoverDisposables.add(toDisposable(() => observer.disconnect()));
		}

		 hover;
	}

	hideHover(): {
		(!this._currentHoverOptions) {
			;
		}
		this._currentHoverOptions = undefined;
		this._contextViewService.hideContextView();
	}

	 _intersectionChange(entries: IntersectionObserverEntry[], hover: IDisposable): {
		entry = entries[entries.length - 1];
		(!entry.isIntersecting) {
			hover.dispose();
		}
	}
}

 HoverContextViewDelegate IDelegate {

	 anchorPosition() {
	       this._hover.anchor;
	}

	constructor(
		 _hover: HoverWidget,
		 _focus: boolean = false
	) {
	}

	render(container: HTMLElement) {
		this._hover.render(container);
		(this._focus) {
			this._hover.focus();
		}
		 this._hover;
	}

	getAnchor() {
		 {
			x: this._hover.x,
			y: this._hover.y
		};
	}

	layout() {
		this._hover.layout();
	}
}

registerSingleton(IHoverService, HoverService, true);

registerThemingParticipant((theme, collector) => {
	hoverBackground = theme.getColor(editorHoverBackground);
	(hoverBackground) {
		collector.addRule(`.monaco-workbench .workbench-hover { background-color: ${hoverBackground}; }`);
		collector.addRule(`.monaco-workbench .workbench-hover-pointer:after { background-color: ${hoverBackground}; }`);
	}
	hoverBorder = theme.getColor(editorHoverBorder);
	(hoverBorder) {
		collector.addRule(`.monaco-workbench .workbench-hover { border: 1px solid ${hoverBorder}; }`);
		collector.addRule(`.monaco-workbench .workbench-hover .hover-row:not(:first-child):not(:empty) { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
		collector.addRule(`.monaco-workbench .workbench-hover hr { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
		collector.addRule(`.monaco-workbench .workbench-hover hr { border-bottom: 0px solid ${hoverBorder.transparent(0.5)}; }`);

		collector.addRule(`.monaco-workbench .workbench-hover-pointer:after { border-right: 1px solid ${hoverBorder}; }`);
		collector.addRule(`.monaco-workbench .workbench-hover-pointer:after { border-bottom: 1px solid ${hoverBorder}; }`);
	}
	link = theme.getColor(textLinkForeground);
	(link) {
		collector.addRule(`.monaco-workbench .workbench-hover a { color: ${link}; }`);
	}
	hoverForeground = theme.getColor(editorHoverForeground);
	(hoverForeground) {
		collector.addRule(`.monaco-workbench .workbench-hover { color: ${hoverForeground}; }`);
	}
	actionsBackground = theme.getColor(editorHoverStatusBarBackground);
	(actionsBackground) {
		collector.addRule(`.monaco-workbench .workbench-hover .hover-row .actions { background-color: ${actionsBackground}; }`);
	}
	codeBackground = theme.getColor(textCodeBlockBackground);
	(codeBackground) {
		collector.addRule(`.monaco-workbench .workbench-hover code { background-color: ${codeBackground}; }`);
	}
});

registerThemingParticipant((theme, collector) => {
	widgetShadowColor = theme.getColor(widgetShadow);
	(widgetShadowColor) {
		collector.addRule(`.monaco-workbench .workbench-hover { box-shadow: 0 2px 8px ${widgetShadowColor}; }`);
	}
});
