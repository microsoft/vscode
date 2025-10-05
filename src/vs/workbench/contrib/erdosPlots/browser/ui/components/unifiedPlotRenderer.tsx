/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as DOM from '../../../../../../base/browser/dom.js';
import { ProgressBar } from '../../../../../../base/browser/ui/progressbar/progressbar.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { VSBuffer, encodeBase64 } from '../../../../../../base/common/buffer.js';
import { IOverlayWebview } from '../../../../webview/browser/webview.js';
import { localize } from '../../../../../../nls.js';
import { PlotClientInstance, PlotClientState, IErdosPlotMetadata } from '../../../../../services/languageRuntime/common/languageRuntimePlotClient.js';
import { IErdosPlotClient, StaticPlotInstance } from '../../../common/erdosPlotsService.js';
import { services } from '../../../../../../base/browser/erdosReactServices.js';
import { DataTransfers } from '../../../../../../base/browser/dnd.js';
import { IAction } from '../../../../../../base/common/actions.js';

enum RenderMode {
	Static = 'static',
	Dynamic = 'dynamic', 
	Interactive = 'interactive'
}

interface VisualizationConfig {
	dimensions: { w: number; h: number };
	displayMode: RenderMode;
	isVisible: boolean;
	renderer: IErdosPlotClient;
}

interface LoadingState {
	active: boolean;
	message?: string;
}

abstract class InteractivePlotEngine extends Disposable implements IErdosPlotClient {
	protected readonly _viewContainer = this._register(new MutableDisposable<IOverlayWebview>());
	private _cachedSnapshot: VSBuffer | undefined;
	private _activationEmitter: Emitter<void>;
	protected _snapshotEmitter: Emitter<string>;
	private _isClaimed: boolean = false;
	private _snapshotTimer: Timeout | undefined;
	private _targetElement: HTMLElement | undefined;
	private _activationPromise?: Promise<void>;

	constructor(public readonly metadata: IErdosPlotMetadata) {
		super();
		this._activationEmitter = this._register(new Emitter<void>());
		this.onDidActivate = this._activationEmitter.event;
		this._snapshotEmitter = this._register(new Emitter<string>());
		this.onDidRenderThumbnail = this._snapshotEmitter.event;
	}

	get id(): string {
		return this.metadata.id;
	}

	get snapshotDataUrl(): string | undefined {
		if (this._cachedSnapshot) {
			return this._buildDataUrl(this._cachedSnapshot);
		}
		return undefined;
	}

	isRunning(): boolean {
		return Boolean(this._viewContainer.value);
	}

	protected abstract initializeView(): Promise<IOverlayWebview>;
	protected abstract teardownView(): void;

	public injectHtmlContent(markup: string): void {
		if (this._viewContainer.value) {
			this._viewContainer.value.setHtml(markup);
			this._scheduleSnapshotCapture();
		}
	}

	public get htmlMarkup(): string | undefined {
		return undefined;
	}

	public startEngine() {
		if (this._viewContainer.value) {
			return Promise.resolve();
		}

		if (this._activationPromise) {
			return this._activationPromise;
		}

		this._activationPromise = this.initializeView().then((view) => {
			this._viewContainer.value = view;
			this._activationEmitter.fire();
		}).finally(() => {
			this._activationPromise = undefined;
		});
		return this._activationPromise;
	}

	public stopEngine() {
		if (!this._viewContainer.value) {
			return;
		}
		this.teardownView();
		this._viewContainer.clear();
	}

	public assignOwner(owner: any) {
		if (!this._viewContainer.value) {
			throw new Error('View not initialized for ownership assignment');
		}
		this._viewContainer.value.claim(owner, DOM.getWindow(this._targetElement), undefined);
		this._isClaimed = true;
		this._scheduleSnapshotCapture();
	}

	public positionViewOverTarget(target: HTMLElement) {
		if (!this._viewContainer.value) {
			throw new Error('View not initialized for positioning');
		}
		this._targetElement = target;
		this._viewContainer.value.layoutWebviewOverElement(target);
	}

	public releaseOwner(owner: any) {
		if (!this._viewContainer.value) {
			return;
		}
		this._viewContainer.value.release(owner);
		this._isClaimed = false;
		this._cancelScheduledSnapshot();
	}

	private _captureSnapshot() {
		if (!this._viewContainer.value) {
			throw new Error('View not initialized for snapshot');
		}
		this._viewContainer.value.captureContentsAsPng().then(buffer => {
			if (buffer) {
				this._cachedSnapshot = buffer;
				const dataUrl = this._buildDataUrl(buffer);
				this._snapshotEmitter.fire(dataUrl);
			}
		}).catch(err => {
			console.error('[InteractivePlotEngine] captureContentsAsPng error:', err);
		});
	}

	protected _scheduleSnapshotCapture(delayMs: number = 3000) {
		this._cancelScheduledSnapshot();
		this._snapshotTimer = setTimeout(() => {
			if (this._isClaimed) {
				this._captureSnapshot();
			}
		}, delayMs);
	}

	private _cancelScheduledSnapshot() {
		if (this._snapshotTimer) {
			clearTimeout(this._snapshotTimer);
			this._snapshotTimer = undefined;
		}
	}

	private _buildDataUrl(buffer: VSBuffer) {
		return `data:image/png;base64,${encodeBase64(buffer)}`;
	}

	public readonly onDidActivate: Event<void>;
	public readonly onDidRenderThumbnail: Event<string>;

	override dispose(): void {
		super.dispose();
		this._cancelScheduledSnapshot();
	}
}

const UnifiedPlotRenderer = (config: VisualizationConfig) => {
	const ctx = services;
	const frameElement = useRef<HTMLIFrameElement>(null);
	const wrapperElement = useRef<HTMLDivElement>(null);
	const ownerRef = useRef<object>({});
	const loadMonitor = useRef<HTMLDivElement>(null);
	const [loadState, setLoadState] = useState<LoadingState>({ active: true });
	const [resourcePath, setResourcePath] = useState<string>('');
	const [errorMsg, setErrorMsg] = useState<string | undefined>();


	useEffect(() => {
		if (config.displayMode === RenderMode.Static) {
			const performStaticLoad = async () => {
				setLoadState({ active: true });
				setErrorMsg(undefined);
				
			if (config.renderer instanceof StaticPlotInstance) {
				const dataSource = config.renderer.dataUri;
				if (dataSource) {
					setResourcePath(dataSource);
				} else {
					setErrorMsg('Resource unavailable');
				}
			} else {
				setErrorMsg('Invalid renderer type for static plot');
			}
				setLoadState({ active: false });
			};

			performStaticLoad();
		}
	}, [config.renderer, config.displayMode]);

	useEffect(() => {
		if (config.displayMode !== RenderMode.Dynamic) {
			return;
		}

		const pixelDensity = DOM.getActiveWindow().devicePixelRatio;
		const cleanupTasks = new DisposableStore();

		if (config.dimensions.h <= 0 || config.dimensions.w <= 0) {
			return;
		}

		const lastRenderResult = (config.renderer as PlotClientInstance).lastRender;
		if (lastRenderResult) {
			setResourcePath(lastRenderResult.uri);
		}

		setLoadState({ active: false });

		const executeRender = async () => {
			const policy = (config.renderer as PlotClientInstance).sizingPolicy;
			const computedSize = policy.calculateOptimalSize({
				height: config.dimensions.h,
				width: config.dimensions.w
			});

			if (computedSize) {
				const output = await (config.renderer as PlotClientInstance).renderWithSizingPolicy(
					computedSize,
					pixelDensity
				);
				setResourcePath(output.uri);
			}
		};

		executeRender().catch(e => {
			if (e.name === 'Canceled' || e.message === 'Canceled') {
				return;
			}
			const msg = localize('erdosPlots.policyRenderError', "Error rendering plot to '{0}' size: {1} ({2})", 'Auto', e.message, e.code);
			ctx.notificationService.warn(msg);
			setErrorMsg(msg);
		});

        cleanupTasks.add((config.renderer as PlotClientInstance).onDidCompleteRender((output) => {
            setResourcePath(output.uri);
        }));

        cleanupTasks.add((config.renderer as PlotClientInstance).onDidChangeSizingPolicy(() => {
            executeRender();
        }));

        let progressIndicator: ProgressBar | undefined;
        let progressInterval: number | undefined;

        cleanupTasks.add((config.renderer as PlotClientInstance).onDidChangeState((status) => {
            if (!loadMonitor.current) {
                return;
            }

            const activeWin = DOM.getActiveWindow();

            if (status === PlotClientState.Rendering) {
                loadMonitor.current.replaceChildren();
                progressIndicator = new ProgressBar(loadMonitor.current);

                if ((config.renderer as PlotClientInstance).renderEstimateMs > 0) {
                    const startTime = Date.now();
                    progressIndicator.total((config.renderer as PlotClientInstance).renderEstimateMs);
                    progressInterval = activeWin.setInterval(() => {
                        progressIndicator?.setWorked(Date.now() - startTime);
                    }, 100);
                } else {
                    progressIndicator.infinite();
                }
            } else if (status === PlotClientState.Rendered || status === PlotClientState.Closed) {
                if (progressInterval) {
                    activeWin.clearTimeout(progressInterval);
                    progressInterval = undefined;
                }
                if (progressIndicator) {
                    progressIndicator.done();
                    progressIndicator.dispose();
                    progressIndicator = undefined;
                }
            }
        }));

		return () => {
			cleanupTasks.dispose();
		};
	}, [config.renderer, config.dimensions.h, config.dimensions.w, config.displayMode, ctx.erdosPlotsService, ctx.notificationService]);

	useEffect(() => {
		if (config.displayMode !== RenderMode.Interactive) {
			return;
		}

		const performInteractiveSetup = async () => {
			setLoadState({ active: true, message: 'Initializing interactive view...' });
			setErrorMsg(undefined);

			const markup = (config.renderer as InteractivePlotEngine).htmlMarkup;
			if (markup && frameElement.current) {
				const frameDoc = frameElement.current.contentDocument;
				if (frameDoc) {
					frameDoc.open();
					frameDoc.write(markup);
					frameDoc.close();
					setLoadState({ active: false });
					return;
				}
			}

			const snapshot = (config.renderer as InteractivePlotEngine).snapshotDataUrl;
			if (snapshot) {
				setLoadState({ active: false });
				return;
			}

			if (config.isVisible && wrapperElement.current) {
				await (config.renderer as InteractivePlotEngine).startEngine();
				(config.renderer as InteractivePlotEngine).assignOwner(ownerRef.current);
				(config.renderer as InteractivePlotEngine).positionViewOverTarget(wrapperElement.current);
			}

			setLoadState({ active: false });
		};

		performInteractiveSetup().catch((err) => {
			console.error('[UnifiedPlotRenderer] Interactive setup ERROR:', err);
			setErrorMsg('Interactive view unavailable');
			setLoadState({ active: false });
		});

		return () => {
			if ((config.renderer as InteractivePlotEngine).isRunning()) {
				(config.renderer as InteractivePlotEngine).releaseOwner(ownerRef.current);
			}
		};
	}, [config.renderer, config.isVisible, config.displayMode]);

	useEffect(() => {
		if (config.displayMode === RenderMode.Interactive && !config.isVisible) {
			if ((config.renderer as InteractivePlotEngine).isRunning()) {
				(config.renderer as InteractivePlotEngine).releaseOwner(ownerRef.current);
			}
		}
	}, [config.isVisible, config.renderer, config.displayMode]);

	useEffect(() => {
		if (config.displayMode === RenderMode.Interactive && config.isVisible && wrapperElement.current) {
			if ((config.renderer as InteractivePlotEngine).isRunning()) {
				(config.renderer as InteractivePlotEngine).positionViewOverTarget(wrapperElement.current);
			}
		}
	}, [config.dimensions.w, config.dimensions.h, config.displayMode, config.isVisible, config.renderer]);

	const buildDragPayload = useCallback((e: React.DragEvent) => {
		if (e.dataTransfer) {
			const payload = {
				id: config.renderer.id,
				uri: resourcePath,
				type: config.displayMode,
				metadata: config.renderer.metadata
			};
			e.dataTransfer.setData(DataTransfers.PLOTS, JSON.stringify(payload));
			e.dataTransfer.setData(DataTransfers.TEXT, `Plot: ${config.renderer.id}`);
		}
	}, [config.renderer, resourcePath, config.displayMode]);

	const handleContextAction = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		
		if (!resourcePath) {
			return;
		}
		
		const copyAction: IAction = {
			id: 'erdos.plots.copyImage',
			label: 'Copy Image',
			tooltip: 'Copy plot image to clipboard',
			class: undefined,
			enabled: true,
			run: async () => {
				await ctx.clipboardService.writeImage(resourcePath);
				ctx.notificationService.info('Image copied to clipboard');
			}
		};
		
		const saveAction: IAction = {
			id: 'erdos.plots.saveImage',
			label: 'Save Image As...',
			tooltip: 'Save plot image to disk',
			class: undefined,
			enabled: true,
			run: async () => {
				const link = document.createElement('a');
				link.href = resourcePath;
				link.download = `plot-${config.renderer.id}.png`;
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
			}
		};
		
		ctx.contextMenuService.showContextMenu({
			getAnchor: () => ({ x: e.clientX, y: e.clientY }),
			getActions: () => [copyAction, saveAction]
		});
	}, [resourcePath, config.renderer, ctx]);

	if (loadState.active) {
		return (
			<div 
				ref={wrapperElement}
				className="ep-plot-instance" 
				style={{ width: config.dimensions.w, height: config.dimensions.h }}
			>
				<div className="ep-placeholder">
					<div className="ep-placeholder-text">
						{loadState.message || 'Loading plot...'}
					</div>
				</div>
			</div>
		);
	}

	if (errorMsg) {
		return (
			<div 
				ref={wrapperElement}
				className="ep-plot-instance" 
				style={{ width: config.dimensions.w, height: config.dimensions.h }}
			>
				<div className="ep-placeholder">
					<div className="ep-placeholder-text">{errorMsg}</div>
				</div>
			</div>
		);
	}

	if (config.displayMode === RenderMode.Interactive) {
		const fallbackSnapshot = (config.renderer as InteractivePlotEngine).snapshotDataUrl;
		const isEngineRunning = (config.renderer as InteractivePlotEngine).isRunning();
		
		if (fallbackSnapshot && !isEngineRunning) {
			return (
				<div 
					ref={wrapperElement}
					className="ep-plot-instance ep-webview-plot" 
					style={{ width: config.dimensions.w, height: config.dimensions.h }}
				>
					<img 
						src={fallbackSnapshot}
						alt={`Webview Plot ${config.renderer.id}`}
						style={{ 
							width: '100%', 
							height: '100%',
							objectFit: 'contain'
						}}
						onError={() => setErrorMsg('Failed to load thumbnail')}
					/>
				</div>
			);
		}

		return (
			<div 
				ref={wrapperElement}
				className="ep-plot-instance ep-webview-plot" 
				style={{ width: config.dimensions.w, height: config.dimensions.h }}
			>
				<iframe
					ref={frameElement}
					width="100%"
					height="100%"
					frameBorder="0"
					sandbox="allow-scripts allow-same-origin"
					style={{ 
						position: 'absolute',
						top: 0,
						left: 0,
						background: 'transparent'
					}}
				/>
			</div>
		);
	}

	if (config.displayMode === RenderMode.Static) {
		if (!resourcePath) {
			return (
				<div className="ep-plot-instance ep-static-plot">
					<div className="ep-placeholder">
						<div className="ep-placeholder-text">
							Static Plot (ID: {config.renderer.id})
						</div>
					</div>
				</div>
			);
		}

		return (
			<div className="ep-plot-instance ep-static-plot" style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: '100%',
				height: '100%'
			}}>
				<img 
					src={resourcePath} 
					alt={`Plot ${config.renderer.id}`}
					draggable={true}
					className='ep-plot-image'
					style={{ 
						maxWidth: '100%',
						maxHeight: '100%',
						objectFit: 'contain',
						pointerEvents: 'auto',
						userSelect: 'auto'
					}}
					onError={() => setErrorMsg('Failed to load image')}
					onDragStart={buildDragPayload}
				/>
			</div>
		);
	}

	if (config.displayMode === RenderMode.Dynamic) {
		if (!resourcePath) {
			return (
				<div className='ep-plot-instance ep-dynamic-plot'>
					<div ref={loadMonitor}></div>
					<div className='ep-placeholder' style={{
						width: config.dimensions.w + 'px',
						height: config.dimensions.h + 'px'
					}}>
						<div className='ep-placeholder-text'>
							{errorMsg || 'Rendering plot'}
						</div>
					</div>
				</div>
			);
		}

		return (
			<div className='ep-plot-instance ep-dynamic-plot'>
				<div ref={loadMonitor}></div>
				<div style={{ 
					width: `${config.dimensions.w}px`, 
					height: `${config.dimensions.h}px`, 
					overflow: 'auto',
					position: 'relative',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center'
				}}>
					<img 
						src={resourcePath}
						alt={(config.renderer as PlotClientInstance).metadata.code ?
							(config.renderer as PlotClientInstance).metadata.code :
							'Plot ' + config.renderer.id}
						className='ep-plot-image'
						draggable={true}
						style={{ 
							maxWidth: '100%',
							maxHeight: '100%',
							objectFit: 'contain',
							pointerEvents: 'auto',
							userSelect: 'auto'
						}}
						onDragStart={buildDragPayload}
						onContextMenu={handleContextAction}
					/>
				</div>
			</div>
		);
	}

	return null;
};

export { UnifiedPlotRenderer, RenderMode, InteractivePlotEngine };
export type { VisualizationConfig };

