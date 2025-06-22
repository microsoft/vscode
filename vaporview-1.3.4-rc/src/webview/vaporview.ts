import { error } from 'console';
import { Viewport } from './viewport';
import { LabelsPanels } from './labels';
import { ControlBar } from './control_bar';
import { formatBinary, formatHex, ValueFormat, valueFormatList } from './value_format';
import { WaveformDataManager } from './data_manager';
import { WaveformRenderer, multiBitWaveformRenderer, binaryWaveformRenderer } from './renderer';

declare function acquireVsCodeApi(): VsCodeApi;
export const vscode = acquireVsCodeApi();
interface VsCodeApi {
  postMessage(message: any): void;
  setState(newState: any): void;
  getState(): any;
}

export type NetlistId = number;
export type SignalId  = number;
export type ValueChange = [number, string];
export type NetlistData = {
  signalId: number;
  signalName: string;
  modulePath: string;
  signalWidth: number;
  valueFormat: ValueFormat;
  vscodeContext: string;
  valueLinkCommand: string;
  valueLinkBounds: [number, number][];
  valueLinkIndex: number;
  variableType: string;
  encoding: string;
  renderType: WaveformRenderer;
  colorIndex: number;
  color: string;
  formattedValues: string[];
  formatValid: boolean;
  wasRendered: boolean;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
};

export type WaveformData = {
  transitionData: any[];
  signalWidth: number;
  min: number;
  max: number;
};

export enum ActionType {
  MarkerSet,
  SignalSelect,
  Zoom,
  ReorderSignals,
  AddVariable,
  RemoveVariable,
  RedrawVariable,
  Resize,
  updateColorTheme,
}

let resizeDebounce: any = 0;

export interface ViewerState {
  uri: any;
  markerTime: number | null;
  altMarkerTime: number | null;
  selectedSignal: number | null;
  selectedSignalIndex: number | null;
  displayedSignals: number[];
  zoomRatio: number;
  scrollLeft: number;
  touchpadScrolling: boolean;
  autoTouchpadScrolling: boolean;
  mouseupEventType: string | null;
}

export const viewerState: ViewerState = {
  uri: null,
  markerTime: null,
  altMarkerTime: null,
  selectedSignal: null,
  selectedSignalIndex: -1,
  displayedSignals: [],
  zoomRatio: 1,
  scrollLeft: 0,
  touchpadScrolling: false,
  autoTouchpadScrolling: false,
  mouseupEventType: null
};

export class EventHandler {
  private subscribers: Map<ActionType, ((...args: any[]) => void)[]> = new Map();

  subscribe(action: ActionType, callback: (...args: any[]) => void) {
    if (!this.subscribers.has(action)) {
      this.subscribers.set(action, []);
    }
    this.subscribers.get(action)?.push(callback);
  }

  dispatch(action: ActionType, ...args: any[]) {
    this.subscribers.get(action)?.forEach((callback) => callback(...args));
  }
}

export function restoreState() {
  const state = vscode.getState();
  if (!state) {return;}
  console.log('Restoring state: ');
  console.log(state);
  vscode.postMessage({
    command: 'restoreState',
    state: state,
    uri: viewerState.uri,
  });
}

// Event handler helper functions
export function arrayMove(array: any[], fromIndex: number, toIndex: number) {
  const element = array[fromIndex];
  array.splice(fromIndex, 1);
  array.splice(toIndex, 0, element);
}

// ----------------------------------------------------------------------------
// Event handler helper functions
// ----------------------------------------------------------------------------

export function setSeletedSignalOnStatusBar(netlistId: NetlistId) {
  vscode.postMessage({
    command: 'setSelectedSignal',
    netlistId: netlistId
  });
}

export function setTimeOnStatusBar() {
  // .toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  vscode.postMessage({
    command: 'setTime',
    markerTime:    viewerState.markerTime,
    altMarkerTime: viewerState.altMarkerTime
  });
}

export function sendDisplayedSignals() {
  vscode.postMessage({
    command: 'setDisplayedSignals',
    signals: viewerState.displayedSignals
  });
}

function createWebviewContext() {
  return  {
    markerTime: viewerState.markerTime,
    altMarkerTime: viewerState.altMarkerTime,
    displayTimeUnit: viewport.displayTimeUnit,
    selectedSignal: viewerState.selectedSignal,
    zoomRatio: vaporview.viewport.zoomRatio,
    scrollLeft: vaporview.viewport.pseudoScrollLeft,
    displayedSignals: viewerState.displayedSignals.map((id: NetlistId) => {
      const data = dataManager.netlistData[id];
      return {
        netlistId:        id,
        name:             data.modulePath + "." + data.signalName,
        numberFormat:     data.valueFormat.id,
        colorIndex:       data.colorIndex,
        renderType:       data.renderType.id,
        valueLinkCommand: data.valueLinkCommand,
      };
    }),
  }
}

export function sendWebviewContext() {
  let context: any = createWebviewContext();
  vscode.setState(context);
  context.command = 'contextUpdate';
  vscode.postMessage(context);
}

export function outputLog(message: string) {
  vscode.postMessage({ command: 'logOutput', message: message });
}

class VaporviewWebview {

  // HTML Elements
  webview: HTMLElement;
  labelsScroll: HTMLElement;
  transitionScroll: HTMLElement;
  scrollArea: HTMLElement;
  contentArea: HTMLElement;
  scrollbar: HTMLElement;

  // Components
  viewport: Viewport;
  controlBar: ControlBar;

  // event handler variables
  events: EventHandler;

  lastIsTouchpad: boolean = false;
  touchpadCheckTimer: any = 0;

  constructor(
    events: EventHandler, 
    viewport: Viewport, 
    controlBar: ControlBar
  ) {

    this.events     = events;
    this.viewport   = viewport;
    this.controlBar = controlBar;
    // Assuming you have a reference to the webview element
    const webview           = document.getElementById('vaporview-top');
    const labelsScroll      = document.getElementById('waveform-labels-container');
    const transitionScroll  = document.getElementById('transition-display-container');
    const scrollArea        = document.getElementById('scrollArea');
    const contentArea       = document.getElementById('contentArea');
    const scrollbar         = document.getElementById('scrollbar');

    if (webview === null || labelsScroll === null || transitionScroll === null ||
      scrollArea === null || contentArea === null || scrollbar === null) {
      throw new Error("Could not find all required elements");
    }

    this.webview          = webview;
    this.labelsScroll     = labelsScroll;
    this.transitionScroll = transitionScroll;
    this.scrollArea       = scrollArea;
    this.contentArea      = contentArea;
    this.scrollbar        = scrollbar;

    webview.style.gridTemplateColumns = `150px 50px auto`;
 
    // #region Primitive Handlers
    window.addEventListener('message', (e) => {this.handleMessage(e);});
    window.addEventListener('keydown', (e) => {this.keyDownHandler(e);});
    window.addEventListener('keyup',   (e) => {this.keyUpHandler(e);});
    window.addEventListener('mouseup', (e) => {this.handleMouseUp(e);});
    window.addEventListener('resize',  ()  => {this.handleResizeViewer();}, false);
    this.scrollArea.addEventListener(      'wheel', (e) => {this.scrollHandler(e);});
    this.scrollArea.addEventListener(      'scroll', () => {this.handleViewportScroll();});
    this.labelsScroll.addEventListener(    'wheel', (e) => {this.syncVerticalScroll(e, labelsScroll.scrollTop);});
    this.transitionScroll.addEventListener('wheel', (e) => {this.syncVerticalScroll(e, transitionScroll.scrollTop);});

    this.handleMarkerSet          = this.handleMarkerSet.bind(this);
    this.handleSignalSelect       = this.handleSignalSelect.bind(this);
    this.reorderSignals           = this.reorderSignals.bind(this);

    this.events.subscribe(ActionType.MarkerSet, this.handleMarkerSet);
    this.events.subscribe(ActionType.SignalSelect, this.handleSignalSelect);
    this.events.subscribe(ActionType.ReorderSignals, this.reorderSignals);
  }

  // Function to test whether or not the user is using a touchpad
  // Sometimes it returns false negatives when flicking the touchpad,
  // hence the timer to prevent multiple checks in a short period of time
  isTouchpad(e) {

    if (performance.now() < this.touchpadCheckTimer) {
      return this.lastIsTouchpad;
    }

    if (e.wheelDeltaY) {
      if (e.wheelDeltaY === (e.deltaY * -3)) {
        this.lastIsTouchpad = true;
        return true;
      }
    //} else if (e.wheelDeltaX && !e.shiftKey) {
    //  if (e.wheelDeltaX === (e.deltaX * -3)) {
    //    this.lastIsTouchpad = true;
    //    return true;
    //  }
    } else if (e.deltaMode === 0) {
      this.lastIsTouchpad = true;
      return true;
    }
    this.lastIsTouchpad = false;
    return false;
  }

  scrollHandler(e: any) {
    e.preventDefault();
    //console.log(event);


    //if (!isTouchpad) {e.preventDefault();}

    const deltaY = e.deltaY;
    const deltaX = e.deltaX;
    const touchpadScrollDivisor = 18;
    const mouseMode = !viewerState.autoTouchpadScrolling && !viewerState.touchpadScrolling;

    if (e.shiftKey) {
      e.stopPropagation();
      this.scrollArea.scrollTop      += deltaY || deltaX;
      this.labelsScroll.scrollTop     = this.scrollArea.scrollTop;
      this.transitionScroll.scrollTop = this.scrollArea.scrollTop;
    } else if (e.ctrlKey) {
      if      (this.viewport.updatePending) {return;}
      // Touchpad mode detection returns false positives with pinches, so we
      // just clamp the deltaY value to prevent zooming in/out too fast
      const bounds      = this.scrollArea.getBoundingClientRect();
      const pixelLeft   = Math.round(e.pageX - bounds.left);
      const time        = Math.round((pixelLeft + this.viewport.pseudoScrollLeft) * this.viewport.pixelTime);
      const zoomOffset  = Math.min(touchpadScrollDivisor, Math.max(-touchpadScrollDivisor, deltaY));

      //if (deltaY !== zoomOffset) {console.log('deltaY: ' + deltaY + '; zoomOffset: ' + zoomOffset);}
      // scroll up zooms in (- deltaY), scroll down zooms out (+ deltaY)
      if      (mouseMode && (deltaY > 0)) {this.events.dispatch(ActionType.Zoom, 1, time, pixelLeft);}
      else if (mouseMode && (deltaY < 0)) {this.events.dispatch(ActionType.Zoom,-1, time, pixelLeft);}

      // Handle zooming with touchpad since we apply scroll attenuation
      else {
        this.events.dispatch(ActionType.Zoom, zoomOffset / touchpadScrollDivisor, time, pixelLeft);
      }

    } else {
      //if (isTouchpad) {
      //  this.viewport.handleScrollEvent(this.viewport.pseudoScrollLeft + e.deltaX);
      //  this.scrollArea.scrollTop       += e.deltaY;
      //  this.labelsScroll.scrollTop      = this.scrollArea.scrollTop;
      //  this.transitionScroll.scrollTop  = this.scrollArea.scrollTop;
      //} else {
      //  this.viewport.handleScrollEvent(this.viewport.pseudoScrollLeft + deltaY);
      //}

      const isTouchpad = viewerState.autoTouchpadScrolling ? this.isTouchpad(e) : viewerState.touchpadScrolling;
      this.touchpadCheckTimer = performance.now() + 100;

      if (e.deltaX !== 0 || isTouchpad) {
        this.viewport.handleScrollEvent(this.viewport.pseudoScrollLeft + deltaX);
        this.scrollArea.scrollTop       += e.deltaY;
        this.labelsScroll.scrollTop      = this.scrollArea.scrollTop;
        this.transitionScroll.scrollTop  = this.scrollArea.scrollTop;
      } else {
        this.viewport.handleScrollEvent(this.viewport.pseudoScrollLeft + deltaY);
      }
    }
  }

  keyDownHandler(e: any) {

    if (controlBar.searchInFocus) {return;} 
    else {e.preventDefault();}

    // debug handler to print the data cache
    if (e.key === 'd' && e.ctrlKey) {
      console.log(this.viewport.updatePending);
      console.log(viewerState);
      console.log(dataManager.netlistData);
    }

    // left and right arrow keys move the marker
    // ctrl + left and right arrow keys move the marker to the next transition

    if ((e.key === 'ArrowRight') && (viewerState.markerTime !== null)) {
      if (e.ctrlKey || e.altKey) {controlBar.goToNextTransition(1);}
      else if (e.metaKey) {this.events.dispatch(ActionType.MarkerSet, this.viewport.timeStop, 0);}
      else                {this.events.dispatch(ActionType.MarkerSet, viewerState.markerTime + 1, 0);}
    } else if ((e.key === 'ArrowLeft') && (viewerState.markerTime !== null)) {
      if (e.ctrlKey || e.altKey) {controlBar.goToNextTransition(-1);}
      else if (e.metaKey) {this.events.dispatch(ActionType.MarkerSet, 0, 0);}
      else                {this.events.dispatch(ActionType.MarkerSet, viewerState.markerTime - 1, 0);}

    // up and down arrow keys move the selected signal
    // alt + up and down arrow keys reorder the selected signal up and down
    } else if ((e.key === 'ArrowUp') && (viewerState.selectedSignalIndex !== null)) {
      const newIndex = Math.max(viewerState.selectedSignalIndex - 1, 0);
      if (e.altKey) {this.events.dispatch(ActionType.ReorderSignals, viewerState.selectedSignalIndex, newIndex);}
      else          {this.events.dispatch(ActionType.SignalSelect, viewerState.displayedSignals[newIndex]);}
    } else if ((e.key === 'ArrowDown') && (viewerState.selectedSignalIndex !== null)) {
      const newIndex = Math.min(viewerState.selectedSignalIndex + 1, viewerState.displayedSignals.length - 1);
      if (e.altKey) {this.events.dispatch(ActionType.ReorderSignals, viewerState.selectedSignalIndex, newIndex);}
      else          {this.events.dispatch(ActionType.SignalSelect, viewerState.displayedSignals[newIndex]);}
    }

    // handle Home and End keys to move to the start and end of the waveform
    else if (e.key === 'Home') {this.events.dispatch(ActionType.MarkerSet, 0, 0);}
    else if (e.key === 'End')  {this.events.dispatch(ActionType.MarkerSet, this.viewport.timeStop, 0);}

    // "N" and Shoft + "N" go to the next transition
    else if (e.key === 'n') {controlBar.goToNextTransition(1);}
    else if (e.key === 'N') {controlBar.goToNextTransition(-1);}

    else if (e.key === 'Escape') {this.events.dispatch(ActionType.SignalSelect, null);}
    else if (e.key === 'Delete' || e.key === 'Backspace') {this.removeVariableInternal(viewerState.selectedSignal);}

    else if (e.key === 'Control' || e.key === 'Meta') {viewport.setValueLinkCursor(true);}
  }

  keyUpHandler(e: any) {
    if (e.key === 'Control' || e.key === 'Meta') {viewport.setValueLinkCursor(false);}
  }

  handleMouseUp(event: MouseEvent) {
    //console.log('mouseup event type: ' + mouseupEventType);
    if (viewerState.mouseupEventType === 'rearrange') {
      labelsPanel.dragEnd(event);
    } else if (viewerState.mouseupEventType === 'resize') {
      labelsPanel.resizeElement.classList.remove('is-resizing');
      labelsPanel.resizeElement.classList.add('is-idle');
      document.removeEventListener("mousemove", labelsPanel.resize, false);
      this.handleResizeViewer();
    } else if (viewerState.mouseupEventType === 'scroll') {
      this.scrollbar.classList.remove('is-dragging');
      document.removeEventListener('mousemove', this.viewport.handleScrollbarMove, false);
      this.viewport.scrollbarMoved = false;
    } else if (viewerState.mouseupEventType === 'highlightZoom') {
      this.scrollArea.removeEventListener('mousemove', viewport.drawHighlightZoom, false);
      viewport.highlightListenerSet = false;
      viewport.highlightZoom();
    } else if (viewerState.mouseupEventType === 'markerSet') {
      this.scrollArea.removeEventListener('mousemove', viewport.drawHighlightZoom, false);
      clearTimeout(viewport.highlightDebounce);
      viewport.handleScrollAreaClick(viewport.highlightStartEvent, 0);
      viewport.highlightListenerSet = false;
      if (viewport.highlightElement) {
        viewport.highlightElement.remove();
        viewport.highlightElement = null;
      }
    }
    viewerState.mouseupEventType = null;
  }

  // #region Global Events
  reorderSignals(oldIndex: number, newIndex: number) {
    //arrayMove(viewerState.displayedSignals, oldIndex, newIndex);
    this.events.dispatch(ActionType.SignalSelect, viewerState.displayedSignals[newIndex]);
  }

  handleResizeViewer() {
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(this.events.dispatch.bind(this.events, ActionType.Resize), 100);
  }

  handleMarkerSet(time: number, markerType: number) {
    if (time > this.viewport.timeStop || time < 0) {return;}
    sendWebviewContext();
  }

  handleSignalSelect(netlistId: NetlistId | null) {
    if (netlistId === null) {return;}
    sendWebviewContext();
  }

// #region Helper Functions

  syncVerticalScroll(e: any, scrollLevel: number) {
    const deltaY = e.deltaY;
    if (this.viewport.updatePending) {return;}
    this.viewport.updatePending     = true;
    this.labelsScroll.scrollTop     = scrollLevel + deltaY;
    this.transitionScroll.scrollTop = scrollLevel + deltaY;
    this.scrollArea.scrollTop       = scrollLevel + deltaY;
    viewport.renderAllWaveforms(false);
    this.viewport.updatePending     = false;
  }

  handleViewportScroll() {
    if (this.viewport.updatePending) {return;}
    this.viewport.updatePending     = true;
    this.labelsScroll.scrollTop     = this.scrollArea.scrollTop;
    this.transitionScroll.scrollTop = this.scrollArea.scrollTop;
    viewport.renderAllWaveforms(false);
    this.viewport.updatePending     = false;
  }

  unload() {
    viewerState.selectedSignal      = null;
    viewerState.selectedSignalIndex = null;
    viewerState.markerTime          = null;
    viewerState.altMarkerTime       = null;
    viewerState.displayedSignals    = [];
    dataManager.unload();

    //this.contentArea.style.height = '40px';
    //this.viewport.updateContentArea(0, [0, 0]);
    this.events.dispatch(ActionType.Zoom, 1, 0, 0);
    labelsPanel.renderLabelsPanels();
    this.viewport.init({defaultZoom: 1, timeScale: 1, timeEnd: 0}, viewerState.uri);
    vscode.postMessage({type: 'ready'});
  }

  // We need to let the extension know that we are removing a variable so that
  // it can update the views. Rather than handling it and telling the extension,
  // we just have the extension handle it as normal.
  removeVariableInternal(netlistId: NetlistId | null) {
    if (netlistId === null) {return;}
    vscode.postMessage({
      command: 'removeVariable',
      netlistId: netlistId
    });
  }

  removeVariable(netlistId: NetlistId | null) {
    if (netlistId === null) {return;}
    const index = viewerState.displayedSignals.findIndex((id: NetlistId) => id === netlistId);
    //console.log('deleting signal' + message.signalId + 'at index' + index);
    if (index === -1) {
      return;
    } else {
      const newindex = Math.min(viewerState.displayedSignals.length - 2, index);
      this.events.dispatch(ActionType.RemoveVariable, netlistId);
      if (viewerState.selectedSignal === netlistId) {
        const newNetlistId = viewerState.displayedSignals[newindex];
        this.events.dispatch(ActionType.SignalSelect, newNetlistId);
      }
    }
  }

  handleSetConfigSettings(settings: any) {
    if (settings.scrollingMode !== undefined) {
      controlBar.setScrollMode(settings.scrollingMode);
    }
    if (settings.rulerLines !== undefined) {
      this.viewport.setRulerLines(settings.rulerLines);
    }
  }

  handleSetSelectedSignal(netlistId: NetlistId) {
    if (netlistId === null) {return;}
    if (dataManager.netlistData[netlistId] === undefined) {return;}
    this.events.dispatch(ActionType.SignalSelect, netlistId);
  }

  handleMessage(e: any) {
    const message = e.data;

    switch (message.command) {
      case 'initViewport':          {this.viewport.init(message.metadata, message.uri); break;}
      case 'unload':                {this.unload(); break;}
      case 'setConfigSettings':     {this.handleSetConfigSettings(message); break;}
      case 'getContext':            {sendWebviewContext(); break;}
      case 'getSelectionContext':   {sendWebviewContext(); break;}
      case 'add-variable':          {dataManager.addVariable(message.signalList); break;}
      case 'remove-signal':         {this.removeVariable(message.netlistId); break;}
      case 'update-waveform-chunk': {dataManager.updateWaveformChunk(message); break;}
      //case 'update-waveform-full':  {dataManager.updateWaveformFull(message); break;}
      case 'setDisplayFormat':      {dataManager.setDisplayFormat(message); break;}
      case 'setWaveDromClock':      {dataManager.waveDromClock = {netlistId: message.netlistId, edge:  message.edge,}; break;}
      case 'setMarker':             {this.events.dispatch(ActionType.MarkerSet, message.time, message.markerType); break;}
      case 'setTimeUnits':          {this.viewport.updateUnits(message.units, true); break;}
      case 'setSelectedSignal':     {this.handleSetSelectedSignal(message.netlistId); break;}
      case 'copyWaveDrom':          {dataManager.copyWaveDrom(); break;}
      case 'copyValueAtMarker':     {labelsPanel.copyValueAtMarker(message.netlistId); break;}
      case 'updateColorTheme':      {this.events.dispatch(ActionType.updateColorTheme); break;}
      default:                      {outputLog('Unknown webview message type: ' + message.command); break;}
    }
  }
}

const events             = new EventHandler();
export const dataManager = new WaveformDataManager(events);
export const controlBar  = new ControlBar(events);
export const viewport    = new Viewport(events);
export const labelsPanel = new LabelsPanels(events);
const vaporview          = new VaporviewWebview(events, viewport, controlBar);

vscode.postMessage({ command: 'ready' });

//function getNonce(): string {
//  let text = '';
//  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
//  for (let i = 0; i < 32; i++) {
//    text += possible.charAt(Math.floor(Math.random() * possible.length));
//  }
//  return text;
//}