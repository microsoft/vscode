/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './consoleInstance.css';

import React, { KeyboardEvent, MouseEvent, UIEvent, useCallback, useEffect, useLayoutEffect, useRef, useState, WheelEvent } from 'react';

import * as nls from '../../../../../nls.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { ConsoleInstanceItems } from './consoleInstanceItems.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { useErdosConsoleContext } from '../erdosConsoleContext.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IAction, Separator } from '../../../../../base/common/actions.js';
import { isMacintosh, isWeb } from '../../../../../base/common/platform.js';
import { useStateRef } from '../../../../../base/browser/ui/react/useStateRef.js';
import { FontConfigurationManager } from '../../../../browser/fontConfigurationManager.js';
import { IReactComponentContainer } from '../../../../../base/browser/erdosReactRenderer.js';
import { ERDOS_PLOTS_VIEW_ID } from '../../../../services/erdosPlots/common/erdosPlots.js';
import { AnchorAlignment, AnchorAxisAlignment } from '../../../../../base/browser/ui/contextview/contextview.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ERDOS_CONSOLE_COPY, ERDOS_CONSOLE_PASTE, ERDOS_CONSOLE_SELECT_ALL } from '../erdosConsoleIdentifiers.js';
import { IErdosConsoleInstance, ErdosConsoleState } from '../../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';

interface ConsoleInstanceProps {
	readonly active: boolean;
	readonly width: number;
	readonly height: number;
	readonly erdosConsoleInstance: IErdosConsoleInstance;
	readonly reactComponentContainer: IReactComponentContainer;
}

export const ConsoleInstance = (props: ConsoleInstanceProps) => {
	const services = useErdosReactServicesContext();
	const erdosConsoleContext = useErdosConsoleContext();

	const consoleInstanceRef = useRef<HTMLDivElement>(undefined!);
	const consoleInstanceContainerRef = useRef<HTMLDivElement>(undefined!);

	const [fontInfo, setFontInfo] = useState(FontConfigurationManager.getFontInfo(services.configurationService, 'console'));
	const [trace, setTrace] = useState(props.erdosConsoleInstance.trace);
	const [wordWrap, setWordWrap] = useState(props.erdosConsoleInstance.wordWrap);
	const [marker, setMarker] = useState(generateUuid());
	const [runtimeAttached, setRuntimeAttached] = useState(props.erdosConsoleInstance.runtimeAttached);
	const [, setIgnoreNextScrollEvent, ignoreNextScrollEventRef] = useStateRef(false);
	const [disconnected, setDisconnected] = useState(false);

	const scrollable = () => consoleInstanceRef.current.scrollHeight > consoleInstanceRef.current.clientHeight;

	const scrollToBottom = useCallback(() => {
		props.erdosConsoleInstance.scrollLocked = false;
		setIgnoreNextScrollEvent(true);
		scrollVertically(consoleInstanceRef.current.scrollHeight);
	}, [props.erdosConsoleInstance, setIgnoreNextScrollEvent]);

	const scrollVertically = (y: number) => {
		consoleInstanceRef.current.scrollTo(consoleInstanceRef.current.scrollLeft, y);
	};

	const getSelection = () => {
		const selection = DOM.getActiveWindow().document.getSelection();
		if (selection) {
			for (let i = 0; i < selection.rangeCount; i++) {
				const range = selection.getRangeAt(i);
				if (!consoleInstanceRef.current.contains(range.commonAncestorContainer)) {
					return null;
				}
			}
		}

		return selection;
	};

	const pasteText = (text: string) => {
		scrollToBottom();
		props.erdosConsoleInstance.pasteText(text);
	};

	const showContextMenu = async (x: number, y: number): Promise<void> => {
		const selection = getSelection();
		const clipboardText = await services.clipboardService.readText();

		const actions: IAction[] = [];

		actions.push({
			id: ERDOS_CONSOLE_COPY,
			label: nls.localize('erdos.console.copy', "Copy"),
			tooltip: '',
			class: undefined,
			enabled: selection?.type === 'Range',
			run: () => {
				if (selection) {
					services.clipboardService.writeText(selection.toString());
				}
			}
		});

		actions.push({
			id: ERDOS_CONSOLE_PASTE,
			label: nls.localize('erdos.console.paste', "Paste"),
			tooltip: '',
			class: undefined,
			enabled: clipboardText !== '',
			run: () => pasteText(clipboardText)
		});

		actions.push(new Separator());

		actions.push({
			id: ERDOS_CONSOLE_SELECT_ALL,
			label: nls.localize('erdos.console.selectAll', "Select All"),
			tooltip: '',
			class: undefined,
			enabled: true,
			run: () => selectAllRuntimeItems()
		});

		services.contextMenuService.showContextMenu({
			getActions: () => actions,
			getAnchor: () => ({ x, y }),
			anchorAlignment: AnchorAlignment.LEFT,
			anchorAxisAlignment: AnchorAxisAlignment.VERTICAL
		});
	};

	const selectAllRuntimeItems = () => {
		const selection = DOM.getActiveWindow().document.getSelection();
		if (selection) {
			selection.selectAllChildren(consoleInstanceContainerRef.current);
		}
	};

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(services.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('console')) {
				setFontInfo(FontConfigurationManager.getFontInfo(services.configurationService, 'console'));
			}
		}));

		disposableStore.add(props.erdosConsoleInstance.onDidChangeState(state => {
			if (state === ErdosConsoleState.Starting) {
				scrollToBottom();
			}

			setDisconnected(state === ErdosConsoleState.Disconnected);
		}));

		disposableStore.add(props.erdosConsoleInstance.onDidChangeTrace(trace => {
			setTrace(trace);
		}));

		disposableStore.add(props.erdosConsoleInstance.onDidChangeWordWrap(wordWrap => {
			setWordWrap(wordWrap);
		}));

		disposableStore.add(props.erdosConsoleInstance.onDidChangeRuntimeItems(() => {
			setMarker(generateUuid());
		}));

		disposableStore.add(props.erdosConsoleInstance.onDidExecuteCode(() => {
			scrollToBottom();
		}));

		disposableStore.add(props.reactComponentContainer.onVisibilityChanged(visible => {
			if (visible) {
				const restoreScrollTop = () => {
					if (props.erdosConsoleInstance.scrollLocked) {
						scrollVertically(props.erdosConsoleInstance.lastScrollTop);
					} else {
						scrollToBottom();
					}
				};
				disposableTimeout(restoreScrollTop, 0, disposableStore);
			}
		}));

		disposableStore.add(props.reactComponentContainer.onSizeChanged(_ => {
			if (!props.erdosConsoleInstance.scrollLocked) {
				scrollToBottom();
			}
		}));

		disposableStore.add(props.erdosConsoleInstance.onDidSelectPlot(plotId => {
			services.viewsService.openView(ERDOS_PLOTS_VIEW_ID, false);
			services.erdosPlotsService.selectPlot(plotId);
		}));

		disposableStore.add(props.erdosConsoleInstance.onDidRequestRestart(() => {
			const sessionId =
				erdosConsoleContext.activeErdosConsoleInstance?.sessionId;
			if (sessionId) {
				services.runtimeSessionService.restartSession(
					sessionId,
					'Restart requested from activity in the Console tab');
			}
		}));

		disposableStore.add(props.erdosConsoleInstance.onDidSelectAll(text => {
			selectAllRuntimeItems();
		}));

		disposableStore.add(props.erdosConsoleInstance.onDidAttachSession((runtime) => {
			setRuntimeAttached(!!runtime);
		}));

		return () => disposableStore.dispose();
	}, [erdosConsoleContext.activeErdosConsoleInstance?.attachedRuntimeSession, erdosConsoleContext.activeErdosConsoleInstance, services.configurationService, services.erdosPlotsService, services.runtimeSessionService, services.viewsService, props.erdosConsoleInstance, props.reactComponentContainer, scrollToBottom]);

	useLayoutEffect(() => {
		if (!props.erdosConsoleInstance.scrollLocked) {
			scrollVertically(consoleInstanceRef.current.scrollHeight);
		}
	}, [marker, props.erdosConsoleInstance.scrollLocked]);

	const clickHandler = (e: MouseEvent<HTMLDivElement>) => {
		const selection = getSelection();
		if (!selection || selection.type !== 'Range') {
			props.erdosConsoleInstance.focusInput();
		}
	};

	const keyDownHandler = async (e: KeyboardEvent<HTMLDivElement>) => {
		const consumeEvent = () => {
			e.preventDefault();
			e.stopPropagation();
		};

		const noModifierKey = !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

		const onlyCmdOrCtrlKey = (isMacintosh ? e.metaKey : e.ctrlKey) &&
			(isMacintosh ? !e.ctrlKey : !e.metaKey) &&
			!e.shiftKey &&
			!e.altKey;

		const onlyShiftKey = e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;

		const pageHeight = () =>
			Math.max(
				Math.floor(consoleInstanceRef.current.clientHeight / fontInfo.lineHeight) - 1,
				1
			) * fontInfo.lineHeight;

		if (noModifierKey) {
			switch (e.key) {
				case 'PageUp':
					consumeEvent();
					props.erdosConsoleInstance.scrollLocked = scrollable();
					scrollVertically(consoleInstanceRef.current.scrollTop - pageHeight());
					return;

				case 'PageDown':
					consumeEvent();
					scrollVertically(consoleInstanceRef.current.scrollTop + pageHeight());
					return;

				case 'Home':
					consumeEvent();
					props.erdosConsoleInstance.scrollLocked = scrollable();
					scrollVertically(0);
					return;

				case 'End':
					consumeEvent();
					scrollToBottom();
					return;
			}
		}

		if (onlyCmdOrCtrlKey) {
			switch (e.key) {
				case 'a': {
					if (getSelection()) {
						consumeEvent();
						selectAllRuntimeItems();
					}
					return;
				}

				case 'c': {
					consumeEvent();

					const selection = getSelection();
					if (selection) {
						services.clipboardService.writeText(selection.toString());
					}
					return;
				}

				case 'v': {
					consumeEvent();
					pasteText(await services.clipboardService.readText());
					return;
				}
			}
		}

		if (noModifierKey || onlyShiftKey) {
			scrollToBottom();
			props.erdosConsoleInstance.focusInput();
			return;
		}
	};

	const mouseDownHandler = (e: MouseEvent<HTMLDivElement>) => {
		if ((e.button === 0 && isMacintosh && e.ctrlKey) || e.button === 2) {
			setTimeout(async () => await showContextMenu(e.clientX, e.clientY), 0);
			return;
		}

		const selection = getSelection();

		if (selection && selection.type === 'Range') {
			let insideSelection = false;
			for (let i = 0; i < selection.rangeCount && !insideSelection; i++) {
				const range = selection.getRangeAt(i);

				const rects = Array.from(range.getClientRects()).sort((a, b) => {
					if (a.top < b.top) {
						return -1;
					} else if (a.top > b.top) {
						return 1;
					} else {
						return 0;
					}
				});

				for (let j = 0; j < rects.length; j++) {
					const rect = rects[j];
					const bottom = j < rects.length - 1 ? rects[j + 1].top : rect.bottom;
					if (e.clientX >= rect.x && e.clientX <= rect.right &&
						e.clientY >= rect.y && e.clientY <= bottom) {
						insideSelection = true;
						break;
					}
				}
			}

			if (insideSelection) {
				services.clipboardService.writeText(selection.toString());
				props.erdosConsoleInstance.focusInput();
				return;
			}
		}
	};

	const scrollHandler = (e: UIEvent<HTMLDivElement>) => {
		if (ignoreNextScrollEventRef.current) {
			setIgnoreNextScrollEvent(false);
		} else {
			const scrollPosition = Math.abs(
				consoleInstanceRef.current.scrollHeight -
				consoleInstanceRef.current.clientHeight -
				consoleInstanceRef.current.scrollTop
			);

			props.erdosConsoleInstance.scrollLocked = scrollPosition >= 1;
			props.erdosConsoleInstance.lastScrollTop = consoleInstanceRef.current.scrollTop;
		}
	};

	const scrollOverrideHandler = (e: WheelEvent<HTMLDivElement>) => {
		if (isWeb) {
			consoleInstanceRef.current.scrollBy(e.deltaX, e.deltaY);
		}
	};

	const wheelHandler = (e: WheelEvent<HTMLDivElement>) => {
		if (e.deltaY < 0 && !props.erdosConsoleInstance.scrollLocked) {
			props.erdosConsoleInstance.scrollLocked = scrollable();
			return;
		}
	};

	const adjustedWidth = props.width - 10;

	let consoleInputWidth = adjustedWidth;
	if (consoleInstanceRef.current?.scrollHeight >= consoleInstanceRef.current?.clientHeight) {
		consoleInputWidth -= 14;
	}

	props.erdosConsoleInstance.setWidthInChars(Math.floor(consoleInputWidth / fontInfo.spaceWidth));

	return (
		<div
			ref={consoleInstanceRef}
			aria-labelledby={`console-panel-${props.erdosConsoleInstance.sessionMetadata.sessionId}`}
			className='console-instance'
			data-testid={`console-${props.erdosConsoleInstance.sessionMetadata.sessionId}`}
			role='tabpanel'
			style={{
				width: adjustedWidth,
				height: props.height,
				whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
				zIndex: props.active ? 'auto' : -1
			}}
			onClick={clickHandler}
			onKeyDown={keyDownHandler}
			onMouseDown={mouseDownHandler}
			onScroll={scrollHandler}
			onWheel={wheelHandler}
		>
			<div
				ref={consoleInstanceContainerRef}
				className='console-instance-container'
				onWheel={scrollOverrideHandler}
			>
				<ConsoleInstanceItems
					consoleInputWidth={consoleInputWidth}
					disconnected={disconnected}
					fontInfo={fontInfo}
					erdosConsoleInstance={props.erdosConsoleInstance}
					runtimeAttached={runtimeAttached}
					trace={trace}
					onSelectAll={() => selectAllRuntimeItems()}
				/>
			</div>
		</div>
	);
};
