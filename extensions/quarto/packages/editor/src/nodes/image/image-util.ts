/*
 * image-util.ts
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
import { findParentNodeClosestToPos } from 'prosemirror-utils';

import { ImageProps } from 'editor-types';
import {
  imageSizePropWithUnit,
  isValidImageSizeUnit,
  ensureContainerWidth,
  isNaturalAspectRatio,
  ImageDimensions,
} from '../../api/image';
import { kWidthAttrib, kHeightAttrib, attrPartitionKeyvalue } from '../../api/pandoc_attr';
import { kPercentUnit, kPixelUnit } from '../../api/css';
import { elementInnerDimensions } from '../../api/dom';

export function imagePropsWithSizes(image: ImageProps, dims: ImageDimensions) {
  // pull width, height, and units out of keyvalue if necessary
  // (enables front-ends to provide dedicated UI for width/height)
  // note that if the value doesn't use a unit supported by the
  // UI it's kept within the original keyvalue prop
  if (image.keyvalue) {
    let width: number | undefined;
    let height: number | undefined;
    let units: string | undefined;
    let lockRatio = true;
    const partitionedKeyvalue = attrPartitionKeyvalue([kWidthAttrib, kHeightAttrib], image.keyvalue);
    for (const kv of partitionedKeyvalue.partitioned) {
      const [key, value] = kv;
      let partitioned = false;
      const sizeWithUnit = imageSizePropWithUnit(value);
      if (sizeWithUnit) {
        sizeWithUnit.unit = sizeWithUnit.unit || kPixelUnit;
        if (isValidImageSizeUnit(sizeWithUnit.unit)) {
          if (key === kWidthAttrib) {
            width = sizeWithUnit.size;
            units = sizeWithUnit.unit;
          } else if (key === kHeightAttrib) {
            height = sizeWithUnit.size;
            units = units || sizeWithUnit.unit;
          }
          partitioned = true;
        }
      }
      if (!partitioned) {
        partitionedKeyvalue.base.push(kv);
      }
    }
    if (width && height) {
      lockRatio = isNaturalAspectRatio(width, height, dims, lockRatio);
    }
    return {
      ...image,
      width,
      height,
      units,
      lockRatio,
      keyvalue: partitionedKeyvalue.base,
    };
  } else {
    return image;
  }
}

export function imageDimensionsFromImg(img: HTMLImageElement, containerWidth: number) {
  return {
    naturalWidth: img.naturalWidth || null,
    naturalHeight: img.naturalHeight || null,
    containerWidth: ensureContainerWidth(containerWidth),
  };
}

export function hasPercentWidth(size: string | null) {
  return !!size && size.endsWith(kPercentUnit);
}

export function imageContainerWidth(pos: number, view: EditorView) {
  let containerWidth = (view.dom as HTMLElement).offsetWidth;
  if (containerWidth > 0) {
    if (pos) {
      const imagePos = view.state.doc.resolve(pos);
      const resizeContainer = findParentNodeClosestToPos(imagePos, nd => nd.isBlock);
      if (resizeContainer) {
        const resizeEl = view.domAtPos(resizeContainer.pos + 1);
        containerWidth = elementInnerDimensions(resizeEl.node as HTMLElement).width;
      }
    }
  }

  return containerWidth;
}

export function inlineHTMLIsImage(html: string) {
  return html
    .trimLeft()
    .toLowerCase()
    .startsWith('<img');
}
