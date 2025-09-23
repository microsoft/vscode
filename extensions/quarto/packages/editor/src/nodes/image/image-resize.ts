/*
 * image-resize.ts
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

import { EditorView } from 'prosemirror-view';
import { NodeWithPos } from 'prosemirror-utils';
import { NodeSelection } from 'prosemirror-state';
import { Node as ProsemirrorNode } from 'prosemirror-model';

import {
  createPopup,
  createHorizontalPanel,
  addHorizontalPanelCell,
  createInputLabel,
  createImageButton,
  createCheckboxInput,
  createSelectInput,
  createTextInput,
} from '../../api/widgets/widgets';
import { EditorUI } from '../../api/ui-types';
import { editingRootScrollContainerElement } from '../../api/node';
import { extractSizeStyles, kPercentUnit, kPixelUnit, removeStyleAttrib } from '../../api/css';
import {
  imageSizePropWithUnit,
  isNaturalAspectRatio,
  unitToPixels,
  pixelsToUnit,
  roundUnit,
  kValidUnits,
  isValidImageSizeUnit,
} from '../../api/image';
import { kWidthAttrib, kHeightAttrib, kStyleAttrib, kAlignAttrib, kFigAlignAttrib, pandocAttrGetKeyvalue } from '../../api/pandoc_attr';
import { EditorUIImages } from '../../api/ui-images';
import { EditorFormat } from '../../api/format';

import { imageDialog } from './image-dialog';
import { hasPercentWidth, imageDimensionsFromImg } from './image-util';

const kDataWidth = 'data-width';
const kDataHeight = 'data-height';

const kDefaultContainerDisplay = 'inline-block';

export function initResizeContainer(container: HTMLElement) {
  // add standard parent class
  container.classList.add('pm-image-resize-container', 'pm-selected-node-outline-color');

  // so that we are the offsetParent for the resize handles and shelf
  container.style.position = 'relative';

  // so that the container matches the size of the contained image
  container.style.display = kDefaultContainerDisplay;

  // so that the handles and shelf can be visible outside the boundaries of the image
  container.style.overflow = 'visible';

  // return for convenience
  return container;
}

export function isResizeUICompatible(img: HTMLImageElement) {
  // incompatible if it has a width, but not a data-width
  const incompatibleWidth = img.style.width && !img.hasAttribute(kDataWidth);

  // incompatible if it has a height, but not a data-height
  const incompatibleHeight = img.style.height && img.style.height !== 'auto' && !img.hasAttribute(kDataHeight);

  return !incompatibleWidth && !incompatibleHeight;
}

export interface ResizeUI {
  update: () => void;
  detach: () => void;
}

export function attachResizeUI(
  imageNode: () => NodeWithPos,
  container: HTMLElement,
  img: HTMLImageElement,
  imgContainerWidth: () => number,
  view: EditorView,
  ui: EditorUI,
  format: EditorFormat
): ResizeUI {
  // indicate that resize ui is active
  container.classList.add('pm-image-resize-active');

  // sync current state of shelf to node
  const updateImageNodeFromShelf = () => {
    updateImageNodeSize(
      view,
      imageNode(),
      img,
      imgContainerWidth,
      shelf.props.width(),
      shelf.props.height(),
      shelf.props.units(),
    );
  };

  // shelf init
  const onInitShelf = () => {
    // sync props
    shelf.sync();

    // default for lockRatio based on naturalWidth/naturalHeight
    const dims = imageDimensionsFromImg(img, imgContainerWidth());
    shelf.props.setLockRatio(isNaturalAspectRatio(shelf.props.width(), shelf.props.height(), dims, true));
  };

  // handle width changed from shelf
  const onWidthChanged = () => {
    const width = shelf.props.width();
    const height = shelf.props.lockRatio() ? (img.offsetHeight / img.offsetWidth) * width : shelf.props.height();
    shelf.props.setHeight(height);
    updateImageNodeFromShelf();
  };

  // handle height changed from shelf
  const onHeightChanged = () => {
    const height = shelf.props.height();
    const width = shelf.props.lockRatio() ? (img.offsetWidth / img.offsetHeight) * height : shelf.props.width();
    shelf.props.setWidth(width);
    updateImageNodeFromShelf();
  };

  // do necessary unit conversion when the units change
  const onUnitsChanged = () => {
    const prevUnits = shelfSizeFromImage(img).unit;
    const containerWidth = imgContainerWidth();

    const width = shelf.props.width();
    const widthPixels = unitToPixels(width, prevUnits, containerWidth);
    let widthInUnits = pixelsToUnit(widthPixels, shelf.props.units(), containerWidth);
    if (hasPercentWidth(shelf.props.units()) && widthInUnits > 100) {
      widthInUnits = 100;
    }
    shelf.props.setWidth(widthInUnits);

    const height = shelf.props.height();
    const heightPixels = unitToPixels(height, prevUnits, containerWidth);
    shelf.props.setHeight(pixelsToUnit(heightPixels, shelf.props.units(), containerWidth));

    updateImageNodeFromShelf();
  };

  // handle editImage request from shelf
  const onEditImage = () => {
    const nodeWithPos = imageNode();
    imageDialog(
      nodeWithPos.node,
      imageDimensionsFromImg(img, imgContainerWidth()),
      nodeWithPos.node.type,
      view,
      ui,
      format,
      true,
    );
  };

  // create resize shelf
  const shelf = resizeShelf(
    view,
    container,
    img,
    onInitShelf,
    onWidthChanged,
    onHeightChanged,
    onUnitsChanged,
    onEditImage,
    ui.images,
    ui.context.translateText,
  );

  // create resize handle and add it to the container
  const handle = resizeHandle(
    img,
    imageNode,
    container,
    imgContainerWidth,
    shelf.props.lockRatio,
    shelf.props.units,
    shelf.sync,
    updateImageNodeFromShelf,
  );
  container.append(handle);

  // return functions that can be used to update and detach the ui
  return {
    update: () => {
      shelf.sync();
    },
    detach: () => {
      container.classList.remove('pm-image-resize-active');
      handle.remove();
      shelf.remove();
    },
  };
}

function resizeShelf(
  view: EditorView,
  container: HTMLElement,
  img: HTMLImageElement,
  onInit: () => void,
  onWidthChanged: () => void,
  onHeightChanged: () => void,
  onUnitsChanged: () => void,
  onEditImage: () => void,
  uiImages: EditorUIImages,
  translateText: (text: string) => string,
) {
  // create resize shelf
  const shelf = createPopup(view, []);

  // add the shelf to the editor container (so we don't mutate the editor dom)
  const editorContainer = view.dom.parentNode as HTMLElement;
  editorContainer.appendChild(shelf);

  // update shelf absolute position to make sure it's visible
  const updatePosition = () => {
    const kShelfRequiredSize = 333;
    const editorBox = editorContainer.getBoundingClientRect();
    const imageBox = container.getBoundingClientRect();
    shelf.style.top = imageBox.top - editorBox.top + imageBox.height + 6 + 'px';
    const positionLeft = imageBox.left + kShelfRequiredSize < editorBox.right;
    if (positionLeft) {
      shelf.style.right = '';
      shelf.style.left = imageBox.left - editorBox.left + 'px';
    } else {
      shelf.style.left = '';
      shelf.style.right = editorBox.right - imageBox.right + 'px';
    }
  };

  // detect when the editing root note scrolls and update the position
  const editingScrollContainerEl = editingRootScrollContainerElement(view);
  if (editingScrollContainerEl) {
    editingScrollContainerEl.addEventListener('scroll', updatePosition);
  }

  // update position every 50ms (cleanup drag/drop copy/paste mispositioning)
  const positionTimer = window.setInterval(updatePosition, 50);

  // main panel that holds the controls
  const panel = createHorizontalPanel();
  shelf.append(panel);
  const addToPanel = (widget: HTMLElement, paddingRight: number) => {
    addHorizontalPanelCell(panel, widget);
    if (paddingRight) {
      const paddingSpan = window.document.createElement('span');
      paddingSpan.style.width = paddingRight + kPixelUnit;
      addHorizontalPanelCell(panel, paddingSpan);
    }
  };

  // width
  const inputClasses = ['pm-text-color', 'pm-background-color'];
  const wLabel = createInputLabel('w:');
  addToPanel(wLabel, 4);
  const wInput = createTextInput(5, inputClasses);
  wInput.onchange = onWidthChanged;
  addToPanel(wInput, 8);

  // height
  const kHeightWidth = '38px';
  const hLabel = createInputLabel('h:');
  addToPanel(hLabel, 4);
  const hInput = createTextInput(5, inputClasses, { width: kHeightWidth });
  hInput.onchange = onHeightChanged;
  addToPanel(hInput, 0);
  const hAutoLabel = createInputLabel('(auto)', ['pm-light-text-color'], { width: kHeightWidth });
  addToPanel(hAutoLabel, 10);

  // units
  const unitsSelect = createSelectInput(kValidUnits, inputClasses);
  unitsSelect.onchange = () => {
    // drive focus to width and back to prevent wierd selection change
    // detection condition that causes PM to re-render the node the
    // next time we resize it
    wInput.focus();
    unitsSelect.focus();

    // manage UI
    manageUnitsUI();

    // notify client
    onUnitsChanged();
  };
  addToPanel(unitsSelect, 12);

  // lock ratio
  const checkboxWrapper = window.document.createElement('div');
  const lockCheckbox = createCheckboxInput();
  lockCheckbox.checked = true;
  checkboxWrapper.append(lockCheckbox);
  addToPanel(checkboxWrapper, 4);
  const lockLabel = createInputLabel(translateText('Lock ratio'));
  addToPanel(lockLabel, 20);

  // edit button
  const editImage = createImageButton(
    uiImages.properties!,
    ['pm-image-button-edit-properties'],
    translateText('Edit Attributes'),
  );
  editImage.onclick = onEditImage;
  addHorizontalPanelCell(panel, editImage);

  // run onInit (wait for image to load if necessary)
  if (img.complete) {
    window.setTimeout(onInit, 0);
  } else {
    img.onload = onInit;
  }

  // function used to manage units ui (percent vs. non-percent)
  const manageUnitsUI = () => {
    const percentSizing = unitsSelect.value === kPercentUnit;

    if (percentSizing) {
      lockCheckbox.checked = true;
      lockCheckbox.disabled = true;
    } else {
      lockCheckbox.disabled = false;
    }

    hInput.style.display = percentSizing ? 'none' : '';
    hAutoLabel.style.display = percentSizing ? '' : 'none';
  };
  manageUnitsUI();

  // helper function to get a dimension (returns null if input not currently valid)
  const getDim = (input: HTMLInputElement) => {
    const value = parseFloat(input.value);
    if (isNaN(value)) {
      return null;
    }
    if (value > 0) {
      return value;
    } else {
      return null;
    }
  };

  const setWidth = (width: number) => {
    wInput.value = roundUnit(width, unitsSelect.value);
  };
  const setHeight = (height: number) => {
    hInput.value = roundUnit(height, unitsSelect.value);
  };

  return {
    // shelf element
    el: shelf,

    // sync the shelf props to the current size/units of the image
    // we don't sync to the node b/c we want to benefit from automatic
    // unit handling in the conversion to the DOM
    sync: () => {
      const size = shelfSizeFromImage(img);
      unitsSelect.value = size.unit;
      setWidth(size.width);
      setHeight(size.height);

      // manage units ui
      manageUnitsUI();

      // ensure we are positioned correctly (not offscreen, wide enough, etc.)
      updatePosition();
    },

    position: () => {
      updatePosition();
    },

    remove: () => {
      if (editingScrollContainerEl) {
        editingScrollContainerEl.removeEventListener('scroll', updatePosition);
      }
      clearInterval(positionTimer);
      shelf.remove();
    },

    props: {
      width: () => getDim(wInput) || shelfSizeFromImage(img).width,
      setWidth,
      height: () => getDim(hInput) || shelfSizeFromImage(img).height,
      setHeight,
      units: () => unitsSelect.value,
      setUnits: (units: string) => (unitsSelect.value = units),
      lockRatio: () => lockCheckbox.checked,
      setLockRatio: (lock: boolean) => {
        if (!lockCheckbox.disabled) {
          lockCheckbox.checked = lock;
        }
      },
    },
  };
}

function resizeHandle(
  img: HTMLImageElement,
  imageNode: () => NodeWithPos,
  container: HTMLElement,
  imgContainerWidth: () => number,
  lockRatio: () => boolean,
  units: () => string,
  onSizing: () => void,
  onSizingComplete: () => void,
) {
  const handle = document.createElement('span');
  handle.contentEditable = 'false';
  handle.classList.add('pm-image-resize-handle', 'pm-background-color', 'pm-selected-node-border-color');
  handle.style.position = 'absolute';
  handle.style.bottom = '-6px';
  handle.style.right = '-6px';
  handle.style.cursor = 'nwse-resize';

  const havePointerEvents = !!document.body.setPointerCapture;

  const onPointerDown = (ev: MouseEvent) => {
    ev.preventDefault();

    const startWidth = img.offsetWidth;
    const startHeight = img.offsetHeight;

    const startX = ev.pageX;
    const startY = ev.pageY;

    const containerWidth = imgContainerWidth();

    const onPointerMove = (e: MouseEvent) => {
      // detect pointer movement
      const movedX = e.pageX - startX;
      const movedY = e.pageY - startY;

      let width;
      let height;
      if (lockRatio()) {
        if (movedX >= movedY) {
          width = startWidth + movedX;
          height = startHeight + movedX * (startHeight / startWidth);
        } else {
          height = startHeight + movedY;
          width = startWidth + movedY * (startWidth / startHeight);
        }
      } else {
        width = startWidth + movedX;
        height = startHeight + movedY;
      }

      // determine the new width in units. If it's percent and > 100 then clip
      const widthInUnits = pixelsToUnit(width, units(), containerWidth);
      if (hasPercentWidth(units()) && widthInUnits > 100) {
        width = containerWidth;
        height = width * (startHeight / startWidth);
      }

      // set margins for any alignment we have
      const align = pandocAttrGetKeyvalue(imageNode().node.attrs, kFigAlignAttrib);
      if (align) {
        setMarginsForAlignment(container, align, width, containerWidth);
      }

      img.style.width = width + kPixelUnit;
      img.setAttribute(kDataWidth, pixelsToUnit(width, units(), containerWidth) + units());
      img.style.height = height + kPixelUnit;
      img.setAttribute(kDataHeight, pixelsToUnit(height, units(), containerWidth) + units());

      onSizing();
    };

    const onPointerUp = (e: MouseEvent) => {
      e.preventDefault();

      // stop listening to events
      if (havePointerEvents) {
        handle.releasePointerCapture((e as PointerEvent).pointerId);
        handle.removeEventListener('pointermove', onPointerMove);
        handle.removeEventListener('pointerup', onPointerUp);
      } else {
        document.removeEventListener('mousemove', onPointerMove);
        document.removeEventListener('mouseup', onPointerUp);
      }

      // update image size
      onSizingComplete();
    };

    if (havePointerEvents) {
      handle.setPointerCapture((ev as PointerEvent).pointerId);
      handle.addEventListener('pointermove', onPointerMove);
      handle.addEventListener('pointerup', onPointerUp);
    } else {
      document.addEventListener('mousemove', onPointerMove);
      document.addEventListener('mouseup', onPointerUp);
    }
  };

  if (havePointerEvents) {
    handle.addEventListener('pointerdown', onPointerDown);
  } else {
    handle.addEventListener('mousedown', onPointerDown);
  }

  return handle;
}

// derive the shelf size attributes from the image. takes advantage of any data-width
// or data-height attributes, then falls back to actual offsetWidth/offsetHeight
// as necessary
function shelfSizeFromImage(img: HTMLImageElement) {
  // get attributes
  const width = img.getAttribute(kDataWidth);
  const height = img.getAttribute(kDataHeight);

  // if there is no width and no height, then use naturalWidth/naturalHeight
  if (!width && !height) {
    return {
      width: img.naturalWidth || img.offsetWidth,
      height: img.naturalHeight || img.offsetHeight,
      unit: kPixelUnit,
    };

    // read units
  } else {
    let widthWithUnit = imageSizePropWithUnit(width);
    let heightWithUnit = imageSizePropWithUnit(height);

    if (!widthWithUnit) {
      widthWithUnit = {
        size: heightWithUnit!.size * (img.offsetWidth / img.offsetHeight),
        unit: heightWithUnit!.unit,
      };
    }

    if (!heightWithUnit) {
      heightWithUnit = {
        size: widthWithUnit.size * (img.offsetHeight / img.offsetWidth),
        unit: widthWithUnit.unit,
      };
    }

    return {
      width: widthWithUnit.size,
      height: heightWithUnit.size,
      unit: widthWithUnit.unit,
    };
  }
}

function updateImageNodeSize(
  view: EditorView,
  image: NodeWithPos,
  img: HTMLImageElement,
  imgContainerWidth: () => number,
  width: number,
  height: number,
  unit: string,
) {
  // don't write pixels explicitly
  unit = unit === kPixelUnit ? '' : unit;

  // edit width & height in keyvalue
  let keyvalue = extractSizeStyles(image.node.attrs.keyvalue as Array<[string, string]>)!;
  keyvalue = keyvalue.filter(value => ![kWidthAttrib, kHeightAttrib].includes(value[0]));
  keyvalue.push([kWidthAttrib, width + unit]);
  const dims = imageDimensionsFromImg(img, imgContainerWidth());
  if (!hasPercentWidth(width + unit) && !isNaturalAspectRatio(width, height, dims, false)) {
    keyvalue.push([kHeightAttrib, height + unit]);
  }

  // create transaction
  const tr = view.state.tr;

  // set new attributes
  tr.setNodeMarkup(image.pos, image.node.type, { ...image.node.attrs, keyvalue });

  // restore node selection if our tr.setNodeMarkup blew away the selection
  const prevState = view.state;
  if (prevState.selection instanceof NodeSelection && prevState.selection.from === image.pos) {
    tr.setSelection(NodeSelection.create(tr.doc, image.pos));
  }

  // dispatch transaction
  view.dispatch(tr);
}

// update the DOM representation of the image. extracts size-oriented attributes from the node and
// applies them to the img element (alignment oriented attributes are applied to the figure elmenet)
export function updateImageViewSize(
  node: ProsemirrorNode,
  img: HTMLImageElement,
  figure: HTMLElement | null,
  containerWidth: number,
) {
  // reset attributes (they'll be set to new values below)
  img.removeAttribute(kStyleAttrib);
  img.removeAttribute(kDataWidth);
  img.removeAttribute(kDataHeight);

  // reset figure styles (only reset styles that we explicitly set below, b/c some
  // styles may have been set by e.g. the attachResizeUI function)
  if (figure) {
    figure.style.cssFloat = '';
    figure.style.verticalAlign = '';
    figure.style.margin = '';
    figure.style.marginTop = '';
    figure.style.marginBottom = '';
    figure.style.marginRight = '';
    figure.style.marginLeft = '';
    figure.style.padding = '';
    figure.style.paddingTop = '';
    figure.style.paddingBottom = '';
    figure.style.paddingRight = '';
    figure.style.paddingLeft = '';
    figure.style.display = kDefaultContainerDisplay;
  }

  // apply keyvalue attribute to image
  if (node.attrs.keyvalue) {
    // factor width & height out of style
    const keyvalue = extractSizeStyles(node.attrs.keyvalue);

    // inspect all keys and process width, height, and style
    (keyvalue as Array<[string, string]>).forEach(attr => {
      // alias key and value
      const key = attr[0];
      let value = attr[1];

      // set align oriented styles on figure parent
      if (key === kStyleAttrib) {
        if (figure) {
          const liftStyle = (attrib: string, val: string) => figure.style.setProperty(attrib, val);
          value = removeStyleAttrib(value, 'float', liftStyle);
          value = removeStyleAttrib(value, 'vertical-align', liftStyle);
          value = removeStyleAttrib(value, 'padding(?:[\\w\\-])*', liftStyle);
          removeStyleAttrib(value, 'display', liftStyle); // leave display for lifting by image
        }

        // apply selected other styles to the image view (we don't just forward the entire
        // style attribute b/c that would interfere with setting of style props in the
        // width and height cases below). here we should enumerate all styles we think
        // users might want to see in the editor
        const liftImgStyle = (attrib: string, val: string) => img.style.setProperty(attrib, val);
        value = removeStyleAttrib(value, 'border(?:[\\w\\-])*', liftImgStyle);
        value = removeStyleAttrib(value, 'margin(?:[\\w\\-])*', liftImgStyle);
        value = removeStyleAttrib(value, 'display', liftImgStyle);
      } else if (key === kWidthAttrib) {
        // see if this is a unit we can edit
        const widthProp = imageSizePropWithUnit(value);
        if (widthProp) {
          widthProp.unit = widthProp.unit || kPixelUnit;
          if (isValidImageSizeUnit(widthProp.unit)) {
            img.setAttribute(kDataWidth, widthProp.size + widthProp.unit);
            img.style.width = unitToPixels(widthProp.size, widthProp.unit, containerWidth) + kPixelUnit;
          }
        }

        // if not, just pass it straight through (editing UI will be disabled)
        if (!img.hasAttribute(kDataWidth)) {
          img.style.width = value;
        }
      } else if (key === kHeightAttrib) {
        // see if this is a unit we can edit
        const heightProp = imageSizePropWithUnit(value);
        if (heightProp) {
          heightProp.unit = heightProp.unit || kPixelUnit;
          if (isValidImageSizeUnit(heightProp.unit)) {
            img.setAttribute(kDataHeight, heightProp.size + heightProp.unit);
            img.style.height = unitToPixels(heightProp.size, heightProp.unit, containerWidth) + kPixelUnit;
          }
        }

        // if not, just pass it straight through (editing UI will be disabled)
        if (!img.hasAttribute(kDataHeight)) {
          img.style.height = value;
        }

        // use of legacy 'align' attribute is common for some pandoc users
        // so we convert it to the requisite CSS and apply it to the figure container
      } else if (figure && key === kAlignAttrib) {
        switch (value) {
          case 'left':
          case 'right':
            figure.style.cssFloat = value;
            break;
          case 'top':
          case 'bottom':
          case 'middle':
            figure.style.verticalAlign = value;
            break;
        }
      }
    });

    // if we have a fig-align value then determine the displayed width and
    // apply margins as required to the figure
    if (figure) {
      const align = pandocAttrGetKeyvalue(node.attrs, kFigAlignAttrib);
      if (align && (align !== "default")) {
        let width: number | null = null;
        const widthProp = imageSizePropWithUnit(img.style.width);
        if (widthProp) {
          width = widthProp.size;
        } else {
          const dims = imageDimensionsFromImg(img, containerWidth);
          width = dims.naturalWidth;
        }
        if (width !== null) {
          setMarginsForAlignment(figure, align, width, containerWidth);
        }
      }
    }
    
    // if width is a percentage, then displayed height needs to be 'auto'
    if (hasPercentWidth(img.getAttribute(kDataWidth))) {
      img.style.height = 'auto';
    }
  }
}


function setMarginsForAlignment(el: HTMLElement, align: string, width: number, containerWidth: number) {
  const marginWidth = containerWidth - width;
  if (marginWidth > 0) {
    if (align === "left") {
      el.style.marginRight = marginWidth + kPixelUnit;
    } else if (align === "right") {
      el.style.marginLeft = marginWidth + kPixelUnit;
    } else if (align === "center") {
      el.style.marginLeft = (marginWidth/2) + kPixelUnit;
      el.style.marginRight = el.style.marginLeft ;
    }
  } else {
    el.style.marginLeft = "";
    el.style.marginRight = "" ;
  }
}