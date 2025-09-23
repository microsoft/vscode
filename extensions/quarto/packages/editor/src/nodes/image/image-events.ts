/*
 * image-events.ts
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

import { Plugin, PluginKey } from 'prosemirror-state';

import { kImageExtensions } from 'core';

import { EditorUI } from '../../api/ui-types';

const kTextUriList = 'text/uri-list';
const kApplicationQtImage = 'application/x-qt-image';

const pluginKey = new PluginKey('image-events');

export function imageEventsPlugin(ui: EditorUI) {
  return new Plugin({
    key: pluginKey,
    props: {
      handleDOMEvents: {
        drop: imageDrop(ui),
      },
      handlePaste: imagePaste(ui),
    },
  });
}

function imagePaste(ui: EditorUI) {
  return (view: EditorView, event: Event) => {
    const clipboardEvent = event as ClipboardEvent;

    if (clipboardEvent.clipboardData) {

      // don't handle office images (we want to use their html representation)
      const kTextHtml = "text/html";
      const kOfficeSchema = "urn:schemas-microsoft-com:office:office";
      if (clipboardEvent.clipboardData.types.includes(kTextHtml)) {
        const html = clipboardEvent.clipboardData.getData(kTextHtml);
        if (html.includes(kOfficeSchema)) {
          return false;
        }
      }
      
      // see if our stock image handling can take care of it
      if (handleImageDataTransfer(
        event, 
        clipboardEvent.clipboardData, 
        view,
        view.state.selection.from,
        ui)
      ) {
        return true;
      }

      // detect file pastes where there is no payload, in that case check to see
      // if there is clipboard data we can get from our context (e.g. from Qt)
      else if (clipboardEvent.clipboardData.types.includes(kTextUriList)) {
        const uriList = clipboardEvent.clipboardData.getData(kTextUriList);
        if (uriList.length === 0) {
          ui.context.clipboardUris().then(uris => {
            if (uris) {
              handleImageUris(view, view.state.selection.from, uris, ui);
            }
          });
          event.preventDefault();
          return true;
        }
        // raw image paste from qt
      } else if (clipboardEvent.clipboardData.types.includes(kApplicationQtImage)) {
        ui.context.clipboardImage().then(image => {
          if (image) {
            handleImageUris(view, view.state.selection.from, [image], ui);
          }
        });
        event.preventDefault();
        return true;
      }
    }

    return false;
  };
}

function imageDrop(ui: EditorUI) {
  return (view: EditorView, event: Event) => {
    // alias to drag event so typescript knows about event.dataTransfer
    const dragEvent = event as DragEvent;

    // ensure we have data transfer
    if (!dragEvent.dataTransfer) {
      return false;
    }

    // ensure the drop coordinates map to an editor position
    const coordinates = view.posAtCoords({
      left: dragEvent.clientX,
      top: dragEvent.clientY,
    });
    if (!coordinates) {
      return false;
    }

    return handleImageDataTransfer(dragEvent, dragEvent.dataTransfer, view, coordinates.pos, ui);
  }
}


function handleImageDataTransfer(event: Event, dataTransfer: DataTransfer, view: EditorView, pos: number, ui: EditorUI) {
  // array of uris
  let uris: string[] | null = null;

  // check for files w/ path (vscode provides full path in undocumented 'path' property)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (dataTransfer.files?.length && (dataTransfer.files[0] as any).path) {
    uris = [];
    for (let i=0; i<dataTransfer.files.length; i++) {
      const file = dataTransfer.files.item(i) as (File & { path: string } | null);
      if (file && file.path) {
        uris.push(file.path);
      } 
    }
  } else  {
    // see if this is a drag of uris
    const uriList = dataTransfer.getData(kTextUriList);
    if (uriList) {
      uris = uriList.split('\r?\n');
    } else {
      // see if the ui context has some dropped uris
      uris = ui.context.droppedUris();
    }
  }
 
  // process uris if we have them
  if (uris && handleImageUris(view, pos, uris, ui)) {
    event.preventDefault();
    return true;
  }
  
  // now look for png file blobs
  const files: File[] = [];
  if (dataTransfer.files.length) {
    for (let i=0; i<dataTransfer.files.length; i++) {
      const file = dataTransfer.files.item(i);
      if (file && kImageExtensions.some(ext => file.type === `image/${ext}`)) {
        files.push(file);
      }
    }
  }

  // if we have at least one then handle
  if (files.length) {
    if (ui.context.resolveBase64Images) {
      Promise.all(files.map(blobToBase64)).then(async (base64Files) => {
        const images = await ui.context.resolveBase64Images!(base64Files);
        insertImageFiles(view, pos, images);
      });
    }
    event.preventDefault();
    return true;
  } else {
    return false
  }
}

function handleImageUris(view: EditorView, pos: number, uris: string[], ui: EditorUI): boolean {
  // filter out images
  const imageUris = uris.filter(uri => {
    // get extension and check it it's an image
    // https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Image_types#Common_image_file_types
    const extension = uri
      .split(/\./)
      .pop()!
      .toLowerCase();
    return kImageExtensions.includes(extension);
  });

  // exit if we have no image uris
  if (imageUris.length === 0) {
    return false;
  }

  // resolve image uris then insert them. note that this is done
  // async so we return true indicating we've handled the drop and
  // then we actually do the insertion once it returns
  ui.context.resolveImageUris(imageUris).then(images => {
    insertImageFiles(view, pos, images);
  });

  // indicate that we will handle the event
  return true;
}

function insertImageFiles(view: EditorView, pos: number, images: string[]) {
  const tr = view.state.tr;
  images.forEach(image => {
    const node = view.state.schema.nodes.image.create({ src: image });
    tr.insert(pos, node);
  });
  view.dispatch(tr);
}

const blobToBase64 = (blob: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(blob);
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = error => reject(error);
});
