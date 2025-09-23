/*
 * insert_symbol-plugin.tsx
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

import { EditorState, Transaction, Plugin, PluginKey } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import React from 'react';

import { applyStyles } from '../../api/css';
import { EditorEvents } from '../../api/event-types';
import { canInsertNode } from '../../api/node';
import { EditorUI } from '../../api/ui-types';

import { InsertSymbolPopup } from './insert_symbol-popup';
import { SymbolDataProvider, SymbolCharacter } from './insert_symbol-dataprovider';

import { ScrollEvent } from '../../api/event-types';
import { createRoot, Root } from 'react-dom/client';

const kMinimumPanelPaddingToEdgeOfView = 5;

export const performInsertSymbol = (pluginKey: PluginKey<boolean>) => {
  return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
    if (!isEnabled(state)) {
      return false;
    }

    if (dispatch && view) {
      const plugin = pluginKey.get(state) as InsertSymbolPlugin;
      plugin.showPopup(view);
    }
    return true;
  };
};

function isEnabled(state: EditorState) {
  return canInsertNode(state, state.schema.nodes.text);
}

export class InsertSymbolPlugin extends Plugin<boolean> {
  private readonly scrollUnsubscribe: VoidFunction;
  private readonly ui: EditorUI;
  private popup: { popup: HTMLElement, root: Root } | null = null;
  private dataProvider: SymbolDataProvider;

  constructor(pluginKey: PluginKey<boolean>, dataProvider: SymbolDataProvider, ui: EditorUI, events: EditorEvents) {
    super({
      key: pluginKey,
      view: () => ({
        update: () => {
          this.closePopup();
        },
        destroy: () => {
          this.closePopup();
          this.scrollUnsubscribe();
          window.document.removeEventListener('onfocus', this.focusChanged);
        },
      }),
    });

    this.dataProvider = dataProvider;
    this.ui = ui;
    this.closePopup = this.closePopup.bind(this);
    this.scrollUnsubscribe = events.subscribe(ScrollEvent, this.closePopup);

    this.focusChanged = this.focusChanged.bind(this);
    window.document.addEventListener('onfocus', this.focusChanged);
  }

  public showPopup(view: EditorView) {
    if (!this.popup) {
      const kHeight = 336;
      const kWidth = 450;
      const popup = window.document.createElement('div');
      popup.tabIndex = 0;
      popup.style.position = 'absolute';
      popup.style.zIndex = '900';
      applyStyles(popup, [], this.panelPositionStylesForCurrentSelection(view, kHeight, kWidth));
      const root = createRoot(popup);
      root.render(this.insertSymbolPopup(view, [kHeight, kWidth]));
      window.document.body.appendChild(popup);
      this.popup = { popup, root };
    }
  }

  private panelPositionStylesForCurrentSelection(view: EditorView, height: number, width: number) {
    const selection = view.state.selection;
    const editorRect = view.dom.getBoundingClientRect();

    const selectionCoords = view.coordsAtPos(selection.from);

    const maximumTopPosition = Math.min(
      selectionCoords.bottom,
      window.innerHeight - height - kMinimumPanelPaddingToEdgeOfView,
    );
    const minimumTopPosition = editorRect.y;
    const popupTopPosition = Math.max(minimumTopPosition, maximumTopPosition);

    const maximumLeftPosition = Math.min(
      selectionCoords.right,
      window.innerWidth - width - kMinimumPanelPaddingToEdgeOfView,
    );
    const minimumLeftPosition = editorRect.x;
    const popupLeftPosition = Math.max(minimumLeftPosition, maximumLeftPosition);

    // styles we'll return
    const styles = {
      top: popupTopPosition + 'px',
      left: popupLeftPosition + 'px',
    };

    return styles;
  }

  private focusChanged() {
    if (window.document.activeElement !== this.popup?.popup && !this.popup?.popup.contains(window.document.activeElement)) {
      this.closePopup();
    }
  }

  private closePopup() {
    if (this.popup) {
      this.popup.root.unmount();
      this.popup.popup.remove();
      this.popup = null;
    }
  }

  private insertSymbolPopup(view: EditorView, size: [number, number]) {
    const insertSymbol = (symbolCharacter: SymbolCharacter, searchTerm: string) => {
      const tr = this.dataProvider.insertSymbolTransaction(symbolCharacter, searchTerm, view.state);
      view.dispatch(tr);
      view.focus();
    };

    const closePopup = () => {
      this.closePopup();
      view.focus();
    };

    return (
      <InsertSymbolPopup
        symbolDataProvider={this.dataProvider}
        onClose={closePopup}
        onInsertSymbol={insertSymbol}
        enabled={isEnabled(view.state)}
        size={size}
        searchImage={this.ui.images.search}
        searchPlaceholder={this.ui.context.translateText(this.dataProvider.filterPlaceholderHint)}
        ui={this.ui}
      />
    );
  }
}
