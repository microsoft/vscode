/*
 * widgets.ts
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

import { applyStyles } from '../css';

import './widgets.css';

export function createHorizontalPanel() {
  const div = window.document.createElement('div');
  div.classList.add('pm-horizontal-panel');
  return div;
}

export function addHorizontalPanelCell(panel: HTMLDivElement, el: HTMLElement) {
  el.classList.add('pm-horizontal-panel-cell');
  panel.append(el);
}

export function createPopup(
  view: EditorView,
  classes: string[],
  onDestroyed?: () => void,
  style?: { [key: string]: string },
) {
  // create popup
  const popup = window.document.createElement('span');
  popup.contentEditable = 'false';
  popup.classList.add(
    'pm-popup',
    'pm-text-color',
    'pm-proportional-font',
    'pm-pane-border-color',
    'pm-background-color',
  );
  popup.style.position = 'absolute';
  popup.style.zIndex = '10';
  applyStyles(popup, classes, style);

  // create mutation observer that watches for destruction
  if (onDestroyed) {
    const observer = new MutationObserver(mutationsList => {
      mutationsList.forEach(mutation => {
        mutation.removedNodes.forEach(node => {
          if (node === popup) {
            observer.disconnect();
            onDestroyed();
          }
        });
      });
    });
    observer.observe(view.dom, { attributes: false, childList: true, subtree: true });
  }

  return popup;
}

export function createImageButton(image: string, classes: string[], title: string, style?: { [key: string]: string }) {
  const button = window.document.createElement('button');
  button.classList.add('pm-image-button');
  button.title = title;
  applyStyles(button, classes, style);
  const imageEl = window.document.createElement('img') as HTMLImageElement;
  imageEl.src = image;
  imageEl.setAttribute('draggable', 'false');
  button.append(imageEl);
  return button;
}

export function createInputLabel(text: string, classes?: string[], style?: { [key: string]: string }) {
  const label = window.document.createElement('label');
  label.innerText = text;
  label.classList.add('pm-input-label');
  applyStyles(label, classes, style);
  return label;
}

export function createSelectInput(options: string[], classes?: string[], style?: { [key: string]: string }) {
  const select = window.document.createElement('select');
  appendOptions(select, options);
  select.classList.add('pm-input-select');
  select.classList.add('pm-pane-border-color');
  applyStyles(select, classes, style);
  return select;
}

function appendOptions(container: HTMLElement, options: string[]) {
  options.forEach(option => {
    const optionEl = window.document.createElement('option');
    optionEl.value = option;
    optionEl.textContent = option;
    container.append(optionEl);
  });
}

export function createCheckboxInput(classes?: string[], style?: { [key: string]: string }) {
  const input = window.document.createElement('input');
  input.classList.add('pm-input-checkbox');
  input.type = 'checkbox';
  applyStyles(input, classes, style);
  return input;
}

export function createTextInput(widthChars: number, classes?: string[], style?: { [key: string]: string }) {
  const input = document.createElement('input');
  input.type = 'text';
  input.classList.add('pm-input-text');
  input.classList.add('pm-pane-border-color');
  applyStyles(input, classes, style);
  input.style.width = widthChars + 'ch';
  return input;
}
