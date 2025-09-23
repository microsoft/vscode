/*
 * image-view.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import { Node as ProsemirrorNode } from 'prosemirror-model';
import { NodeView, EditorView } from 'prosemirror-view';
import { NodeSelection, PluginKey, Plugin } from 'prosemirror-state';

import { EditorUI } from '../../api/ui-types';
import { ImageType } from '../../api/image';
import { PandocExtensions, imageAttributesAvailable } from '../../api/pandoc';
import { isElementVisible } from '../../api/dom';
import { EditorEvents } from '../../api/event-types';
import { ResizeEvent } from '../../api/event-types';
import { EditorFormat } from '../../api/format';
import { mapResourceToURL } from '../../api/resource';

import { imageDialog } from './image-dialog';
import {
  attachResizeUI,
  initResizeContainer,
  ResizeUI,
  isResizeUICompatible,
  updateImageViewSize,
} from './image-resize';
import { imageDimensionsFromImg, imageContainerWidth } from './image-util';

import './image-styles.css';

export function imageNodeViewPlugins(
  type: string,
  ui: EditorUI,
  format: EditorFormat,
  events: EditorEvents,
  pandocExtensions: PandocExtensions,
): Plugin[] {
  return [
    new Plugin({
      key: new PluginKey(`${type}-node-view`),
      props: {
        nodeViews: {
          [type]: (node: ProsemirrorNode, view: EditorView, getPos: boolean | (() => number)) => {
            return new ImageNodeView(node, view, getPos as () => number, ui, format, events, pandocExtensions);
          },
        },
      },
    }),
  ];
}

class ImageNodeView implements NodeView {
  // ProseMirror context
  private readonly type: ImageType;
  private node: ProsemirrorNode;
  private readonly view: EditorView;
  private readonly getPos: () => number;
  private readonly editorUI: EditorUI;
  private readonly editorFormat: EditorFormat;
  private readonly imageAttributes: boolean;
  private readonly implicitFigures: boolean;

  // DOM elements
  public readonly dom: HTMLElement;
  private readonly img: HTMLImageElement;
  public readonly contentDOM: HTMLElement | null;
  private readonly figcaption: HTMLElement | null;

  // transient state
  private imgBroken: boolean;

  // things to clean up
  private resizeUI: ResizeUI | null;
  private sizeOnVisibleTimer?: number;
  private unregisterOnResize: VoidFunction;
  private unregisterWatchImg: VoidFunction | null = null;

  constructor(
    node: ProsemirrorNode,
    view: EditorView,
    getPos: () => number,
    editorUI: EditorUI,
    editorFormat: EditorFormat,
    editorEvents: EditorEvents,
    pandocExtensions: PandocExtensions,
  ) {
    // determine type
    const schema = node.type.schema;
    this.type = node.type === schema.nodes.image ? ImageType.Image : ImageType.Figure;

    // save references
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.imageAttributes = imageAttributesAvailable(pandocExtensions);
    this.implicitFigures = pandocExtensions.implicit_figures;
    this.editorUI = editorUI;
    this.editorFormat = editorFormat;
    this.resizeUI = null;
    this.imgBroken = false;

    // set node selection on click
    const selectOnClick = () => {
      const tr = view.state.tr;
      tr.setSelection(NodeSelection.create(tr.doc, getPos()));
      view.dispatch(tr);
    };

    // show image dialog on double-click
    const editOnDblClick = () => {
      selectOnClick();
      imageDialog(
        this.node,
        imageDimensionsFromImg(this.img, this.containerWidth()),
        this.node.type,
        this.view,
        editorUI,
        editorFormat,
        this.imageAttributes,
      );
    };

    // stop propagation from child elmeents that need to handle click
    // (e.g. figcaption element)
    const noPropagateClick = (ev: MouseEvent) => {
      ev.stopPropagation();
    };

    // create the image (used by both image and figure node types)
    this.img = document.createElement('img');
    this.img.classList.add('pm-img');
    this.img.onload = () => {
      this.imgBroken = false;
    };
    this.img.onerror = () => {
      this.imgBroken = true;
    };
    this.img.onclick = selectOnClick;
    this.img.ondblclick = editOnDblClick;

    // wrap in figure if appropriate
    if (this.type === ImageType.Figure) {
      // create figure wrapper
      this.dom = document.createElement('figure');
      this.dom.classList.add('pm-figure');

      // create container
      const container = document.createElement('div');
      container.contentEditable = 'false';
      this.dom.append(container);

      // initialize the image
      container.append(this.img);
      this.updateImg();

      // create the caption and make it our contentDOM
      this.figcaption = document.createElement('figcaption');
      this.figcaption.classList.add('pm-figcaption');
      this.figcaption.classList.add('pm-node-caption');
      this.figcaption.onclick = noPropagateClick;
      this.figcaption.ondblclick = noPropagateClick;
      this.contentDOM = this.figcaption;
      this.dom.append(this.figcaption);

      // manage visibility
      this.manageFigcaption();

      // standard inline image
    } else {
      this.dom = document.createElement('span');

      this.dom.append(this.img);
      this.updateImg();

      this.contentDOM = null;
      this.figcaption = null;
    }

    // prevent drag/drop if the event doesn't target the image
    this.dom.ondragstart = (event: DragEvent) => {
      if (event.target !== this.img) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    // init resize if we support imageAttributes
    if (this.imageAttributes) {
      initResizeContainer(this.dom);
    }

    // update image size when the image first becomes visible
    this.updateSizeOnVisible();

    // update image size whenever the container is resized
    this.unregisterOnResize = editorEvents.subscribe(ResizeEvent, () => {
      this.updateImageSize();
    });
  }

  public destroy() {
    if (this.unregisterWatchImg) {
      this.unregisterWatchImg();
    }
    this.unregisterOnResize();
    this.clearSizeOnVisibleTimer();
    this.detachResizeUI();
  }

  public selectNode() {
    // mirror default implementation
    this.dom.classList.add('ProseMirror-selectednode');
    if (this.contentDOM || !this.node.type.spec.draggable) {
      this.dom.draggable = true;
    }

    // manage figcaption
    this.manageFigcaption();

    // attach resize UI
    this.attachResizeUI();
  }

  public deselectNode() {
    // mirror default implementation
    this.dom.classList.remove('ProseMirror-selectednode');
    if (this.contentDOM || !this.node.type.spec.draggable) {
      this.dom.draggable = false;
    }

    // remove resize UI
    this.detachResizeUI();
  }

  // update image with latest node/attributes
  public update(node: ProsemirrorNode) {
    // boilerplate type check
    if (node.type !== this.node.type) {
      return false;
    }

    // set new node and update the image
    this.node = node;
    this.updateImg().then(() => {
      // if we already have resize UI then either update it
      // or detach it (if e.g. the units are no longer compatible)
      if (this.resizeUI) {
        if (isResizeUICompatible(this.img!)) {
          this.resizeUI.update();
        } else {
          this.resizeUI.detach();
          this.resizeUI = null;
        }
        // attach if the node is selected
      } else if (this.isNodeSelected()) {
        this.attachResizeUI();
      }
    });

   
    return true;
  }

  // ignore mutations outside of the content dom so sizing actions don't cause PM re-render
  public ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Element }) {
    return !this.contentDOM || !this.contentDOM.contains(mutation.target);
  }

  // map node to img tag
  private async updateImg() {

    // unsubscribe from any existing resource watcher
    if (this.unregisterWatchImg) {
      this.unregisterWatchImg();
    }

    // if the image has a protocol then just set it
    const src = this.node.attrs.src;
    if (src.match(/^\w+:\/\//)) {
      this.img.src = src;
    } else {
      // otherwise map to path reachable within current editing frame
      // (and watch for future changes)
      const decodedSrc = decodeURI(src);
      this.img.src = await mapResourceToURL(this.editorUI.context, decodedSrc);
      this.unregisterWatchImg = this.editorUI.context.watchResource(decodedSrc, async () => {
        this.img.src = await mapResourceToURL(this.editorUI.context, decodedSrc) + "?" + new Date().getTime();
      });
    }

    // title/tooltip
    this.img.title = '';
    if (this.node.attrs.title) {
      this.img.title = this.node.attrs.title;
    }

    // ensure alt attribute so that we get default browser broken image treatment
    this.img.alt = this.node.textContent || this.node.attrs.src;

    // manage caption visibility
    this.manageFigcaption();

    // update size
    this.updateImageSize();
  }

  private updateImageSize() {
    const containerWidth = this.img.isConnected ? this.containerWidth() : 0;
    updateImageViewSize(this.node, this.img, this.isFigure() ? this.dom : null, containerWidth);
  }

  private updateSizeOnVisible() {
    const updateSizeOnVisible = () => {
      if (isElementVisible(this.img)) {
        this.updateImageSize();
        this.clearSizeOnVisibleTimer();
      }
    };
    this.sizeOnVisibleTimer = window.setInterval(updateSizeOnVisible, 200);
  }

  private clearSizeOnVisibleTimer() {
    if (this.sizeOnVisibleTimer) {
      clearInterval(this.sizeOnVisibleTimer);
      this.sizeOnVisibleTimer = undefined;
    }
  }

  // attach resize UI if appropriate
  private attachResizeUI() {
    if (this.imageAttributes && !this.imgBroken && isResizeUICompatible(this.img!)) {
      const imageNode = () => ({ pos: this.getPos(), node: this.node });
      const imgContainerWidth = () => this.containerWidth();
      this.resizeUI = attachResizeUI(imageNode, this.dom, this.img!, imgContainerWidth, 
                                     this.view, this.editorUI, this.editorFormat);
    }
  }

  private detachResizeUI() {
    if (this.resizeUI) {
      this.resizeUI.detach();
      this.resizeUI = null;
    }
  }

  private isNodeSelected() {
    return this.dom.classList.contains('ProseMirror-selectednode');
  }

  private isFigure() {
    return this.type === ImageType.Figure;
  }

  private containerWidth() {
    return imageContainerWidth(this.getPos(), this.view);
  }

  private manageFigcaption() {
    // hide the figcaption if appropriate
    const noImplicitFigures = !this.implicitFigures;
    const emptyFigcaption = this.figcaption && this.node.textContent.length === 0;
    const selection = this.view.state.selection;
    const selectionInFigcaption = selection.empty && selection.$head.node() === this.node;
    const hide = noImplicitFigures || (emptyFigcaption && !selectionInFigcaption);

    // hide or show if we have a figcaption
    if (this.figcaption) {
      if (noImplicitFigures) {
        this.figcaption.style.display = 'none';
        this.figcaption.contentEditable = 'false';
      } else {
        this.figcaption.contentEditable = hide ? 'false' : 'true';
        this.figcaption.style.height = hide ? '0' : '';
        this.figcaption.style.minHeight = hide ? '0' : '';
        this.figcaption.style.margin = hide ? '0' : '';
      }
    }
  }
}
