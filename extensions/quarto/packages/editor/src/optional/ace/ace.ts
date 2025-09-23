/*
 * ace.ts
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

import {
  Plugin,
  PluginKey,
  TextSelection,
  EditorState,
  Transaction,
  Selection,
} from 'prosemirror-state';

import { Node as ProsemirrorNode } from 'prosemirror-model';
import { EditorView, NodeView } from 'prosemirror-view';
import { undo, redo } from 'prosemirror-history';
import { exitCode } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { undoInputRule } from 'prosemirror-inputrules';

import { editingRootNode } from '../../api/node';
import { insertParagraph } from '../../api/paragraph';
import { ChunkEditor, EditorUIChunks } from '../../api/ui-types';
import { EditorEvents } from '../../api/event-types';
import { ExtensionContext, ExtensionFn } from '../../api/extension';
import { DispatchEvent, ResizeEvent, ScrollEvent } from '../../api/event-types';
import { codeViewArrowHandler, handleArrowToAdjacentNode } from '../../api/cursor';

import { selectAll } from '../../behaviors/select_all';

import { AceRenderQueue } from './ace-render-queue';
import { AcePlaceholder } from './ace-placeholder';

import { ProsemirrorCommand, EditorCommandId } from '../../api/command';
import { CodeEditorNodeViews, CodeViewOptions, scrollCodeViewElementIntoView } from '../../api/codeview';
import { EditorFind } from '../../api/find-types';

import './ace.css';

const plugin = new PluginKey('ace');

export function aceExtension(codeViews: { [key: string]: CodeViewOptions }): ExtensionFn {

  return (context: ExtensionContext) => {

    // we don't create the ace extension unless we have a chunks implemenentation
    if (!context.ui.chunks) {
      return null;
    }
   
    // shared services
    const aceRenderQueue = new AceRenderQueue(context.events);
    const aceNodeViews = new CodeEditorNodeViews();

    // build nodeViews
    const nodeTypes = Object.keys(codeViews);
    const nodeViews: {
      [name: string]: (node: ProsemirrorNode, view: EditorView, getPos: boolean | (() => number)) => NodeView;
    } = {};
    nodeTypes.forEach(name => {
      nodeViews[name] = (node: ProsemirrorNode, view: EditorView, getPos: boolean | (() => number)) => {
        return new AceNodeView(
          node,
          view,
          getPos as () => number,
          context,
          context.ui.chunks!,
          codeViews[name],
          aceRenderQueue,
          aceNodeViews,
        );
      };
    });

    const activeAceNodeViewCommand = (fn: (view: AceNodeView) => void) => {
      return (_state: EditorState, dispatch?: (tr: Transaction) => void) => {
        const activeView = aceNodeViews.activeNodeView();
        if (!activeView) {
          return false;
        }
        if (dispatch) {
          fn(activeView as AceNodeView);
        }
        return true;
      };
    };

    return {
      plugins: () => [
        new Plugin({
          key: plugin,
          props: {
            nodeViews,
            handleDOMEvents: {
              click: aceNodeViews.handleClick.bind(aceNodeViews),
            },
          },
        }),
        // arrow in and out of editor
        keymap({
          ArrowLeft: codeViewArrowHandler('left', nodeTypes),
          ArrowRight: codeViewArrowHandler('right', nodeTypes),
          ArrowUp: codeViewArrowHandler('up', nodeTypes),
          ArrowDown: codeViewArrowHandler('down', nodeTypes),
        }),
      ],
      commands: () => [
        new ProsemirrorCommand(EditorCommandId.ExpandChunk, [], activeAceNodeViewCommand(nodeView => {
          nodeView.setExpanded(true); 
        })),
        new ProsemirrorCommand(EditorCommandId.CollapseChunk, [], activeAceNodeViewCommand(nodeView => {
          nodeView.setExpanded(false);
        })),
      ]
    };
  };
}

/**
 * Represents a selection that was applied prior to the editor rendering (needs
 * to be applied when the editor rendering completes)
 */
class QueuedSelection {
  constructor(public readonly anchor: number, public readonly head: number) {}
}

export class AceNodeView implements NodeView {
  public readonly getPos: () => number;
  public node: ProsemirrorNode;
  public readonly dom: HTMLElement;

  private readonly view: EditorView;
  private readonly chunks: EditorUIChunks;
  private readonly nodeViews: CodeEditorNodeViews;
  private readonly renderQueue: AceRenderQueue;
  private chunk?: ChunkEditor;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private aceEditor?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private editSession?: any;
  private readonly options: CodeViewOptions;
  private readonly find: EditorFind;
  private readonly events: EditorEvents;

  private updating: boolean;
  private escaping: boolean;
  private gapCursorPending: boolean;
  private mouseDown: boolean;
  private mode: string;
  private findMarkers: number[];
  private selectionMarker: number | null;
  private queuedSelection: QueuedSelection | null;
  private resizeTimer: number;
  private renderedWidth: number;
  private scrollRow: number;
  private cursorDirty: boolean;

  private readonly subscriptions: VoidFunction[];

  constructor(
    node: ProsemirrorNode,
    view: EditorView,
    getPos: () => number,
    context: ExtensionContext,
    chunks: EditorUIChunks,
    options: CodeViewOptions,
    renderQueue: AceRenderQueue,
    nodeViews: CodeEditorNodeViews,
  ) {
    // Store for later
    this.node = node;
    this.view = view;
    this.chunks = chunks;
    this.find = context.find;
    this.events = context.events;
    this.getPos = getPos;

    // Initialize values
    this.mode = '';
    this.escaping = false;
    this.gapCursorPending = false;
    this.findMarkers = [];
    this.selectionMarker = null;
    this.renderQueue = renderQueue;
    this.nodeViews = nodeViews;
    this.queuedSelection = null;
    this.subscriptions = [];
    this.resizeTimer = 0;
    this.renderedWidth = 0;
    this.scrollRow = -1;
    this.cursorDirty = false;
    this.mouseDown = false;

    // options
    this.options = options;

    // The editor's outer node is our DOM representation
    this.dom = document.createElement('div');
    this.dom.classList.add('pm-code-editor');
    this.dom.classList.add('pm-ace-editor');
    this.dom.classList.add('pm-ace-editor-inactive');
    this.dom.classList.add(options.borderColorClass || 'pm-block-border-color');
    if (this.options.classes) {
      this.options.classes.forEach(className => this.dom.classList.add(className));
    }

    // Create a preview of the text (will be shown until editor is fully initialized)
    const preview = new AcePlaceholder(node.textContent);
    this.dom.appendChild(preview.getElement());

    // Style the first line differently if requested
    if (options.firstLineMeta) {
      this.dom.classList.add('pm-ace-first-line-meta');
    }

    // update mode
    this.updateMode();

    // observe all editor dispatches
    this.subscriptions.push(
      this.events.subscribe(DispatchEvent, (tr: Transaction | undefined) => {
        if (tr) {
          this.onEditorDispatch(tr);
        }
      }),
    );

    // This flag is used to avoid an update loop between the outer and
    // inner editor
    this.updating = false;

    if (renderQueue.isRenderCompleted()) {
      // All editors have been rendered and the queue is empty; initialize
      // directly (this happens when e.g., inserting code chunks interactively
      // after the document is fully rendered)
      this.initEditor();
    } else {
      // Rendering is not complete; add to the queue
      renderQueue.add(this);
    }

    // add ourselves to the list of all ace node views
    this.nodeViews.add(this);
  }

  public destroy() {
    // Unsubscribe from events
    this.subscriptions.forEach(unsub => unsub());

    // Clean up attached editor instance when it's removed from the DOM
    if (this.chunk) {
      this.chunk.destroy();
    }

    // remove ourselves from the list of all ace node views
    this.nodeViews.remove(this);
  }

  public update(node: ProsemirrorNode) {
    if (node.type !== this.node.type) {
      return false;
    }
    if (!this.editSession) {
      return false;
    }
    this.node = node;
    this.updateMode();

    // assumes that ace is available via global require (true in rstudio
    // which is where ace is utilized)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AceRange = (window as any).require('ace/range').Range;
    const doc = this.editSession.getDocument();

    const change = computeChange(this.editSession.getValue(), node.textContent);
    if (change) {
      this.updating = true;
      const range = AceRange.fromPoints(doc.indexToPosition(change.from, 0), doc.indexToPosition(change.to, 0));
      this.editSession.replace(range, change.text);
      this.updating = false;
    }

    // Clear any previously rendered find markers
    this.findMarkers.forEach(id => {
      if (this.editSession) {
        this.editSession.removeMarker(id);
      }
    });
    this.findMarkers = [];

    // Get all of the find results inside this node
    const decorations = this.find.decorations();
    if (decorations) {
      const decos = decorations?.find(this.getPos(), this.getPos() + node.nodeSize - 1);

      // If we got results, render them
      if (decos) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        decos.forEach((deco: any) => {
          if (!this.editSession) {
            return;
          }

          // Calculate from/to position for result marker (adjust for zero based column)
          const markerFrom = doc.indexToPosition(deco.from - this.getPos(), 0);
          markerFrom.column--;
          const markerTo = doc.indexToPosition(deco.to - this.getPos(), 0);
          markerTo.column--;
          const range = AceRange.fromPoints(markerFrom, markerTo);

          // Create the search result marker and add it to the rendered set
          const markerId = this.editSession.addMarker(range, deco.type.attrs.class, 'result', true);
          this.findMarkers.push(markerId);
        });
      }
    }

    // Ensure that the chunk is expanded if it contains find markers (so user can see search results)
    if (this.chunk && this.findMarkers.length > 0) {
      this.chunk.setExpanded(true);
    }

    return true;
  }

  public setSelection(anchor: number, head: number) {
    // We haven't drawn the editor yet, so queue the selection until we can
    // apply it.
    if (!this.aceEditor || !this.editSession) {
      this.queuedSelection = new QueuedSelection(anchor, head);
      return;
    }
    if (!this.escaping && !this.gapCursorPending) {
      this.aceEditor.focus();
    }
    this.updating = true;
    const doc = this.editSession.getDocument();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AceRange = (window as any).require('ace/range').Range;
    const range = AceRange.fromPoints(doc.indexToPosition(anchor, 0), doc.indexToPosition(head, 0));
    this.editSession.getSelection().setSelectionRange(range);
    this.updating = false;
  }

  public setGapCursorPending(pending: boolean) {
    this.gapCursorPending = pending;
  }

  public isFocused() {
    return this.aceEditor && this.aceEditor.isFocused();
  }

  public setExpanded(expanded: boolean) {
    if (this.chunk) {
      this.chunk.setExpanded(expanded);
    }
  }

  public getExpanded() {
    if (this.chunk) {
      return this.chunk.getExpanded();
    } else {
      return false;
    }
  }

  public selectNode() {
    if (this.aceEditor) {
      this.aceEditor.focus();
    }
  }

  public stopEvent() {
    return true;
  }

  public ignoreMutation() {
    return true;
  }

  private onEditorDispatch(tr: Transaction) {
    if (!tr.docChanged && tr.selectionSet) {
      this.highlightSelectionAcross(tr.selection);      
    }
  }

  private forwardSelection() {
    // ignore if we don't have focus
    if (!this.chunk || !this.chunk.element.contains(window.document.activeElement)) {
      return;
    }

    const state = this.view.state;
    const selection = this.asProseMirrorSelection(state.doc);
    if (selection && !selection.eq(state.selection)) {
      this.view.dispatch(state.tr.setSelection(selection));
    }
  }

  private asProseMirrorSelection(doc: ProsemirrorNode) {
    if (!this.editSession) {
      return null;
    }
    const offset = this.getPos() + 1;
    const session = this.editSession;
    const range = session.getSelection().getRange();
    const anchor = session.getDocument().positionToIndex(range.start, 0) + offset;
    const head = session.getDocument().positionToIndex(range.end, 0) + offset;
    return TextSelection.create(doc, anchor, head);
  }

  // detect the entire editor being selected across, in which case we add an ace marker
  // visually indicating that the text is selected
  private highlightSelectionAcross(selection: Selection) {
    if (!this.aceEditor || !this.editSession) {
      return;
    }

    // clear any existing selection marker
    if (this.selectionMarker !== null) {
      this.editSession.removeMarker(this.selectionMarker);
      this.selectionMarker = null;
    }

    // check for selection spanning us
    const pos = this.getPos();
    if (selection.from < pos && selection.to > pos + this.node.nodeSize) {
      const doc = this.editSession.getDocument();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AceRange = (window as any).require('ace/range').Range;
      const range = AceRange.fromPoints(doc.indexToPosition(0, 0), doc.indexToPosition(this.node.nodeSize - 1, 0));
      this.selectionMarker = this.editSession.addMarker(range, 'pm-selected-text', 'selection', true);
    }
  }

  private valueChanged() {
    const change = computeChange(this.node.textContent, this.getContents());
    if (change) {
      // update content
      const start = this.getPos() + 1;
      if (!isNaN(start)) {
        const tr = this.view.state.tr.replaceWith(
          start + change.from,
          start + change.to,
          change.text ? this.node.type.schema.text(change.text) : [],
        );
        this.view.dispatch(tr);
      }
    }
    this.updateMode();
  }

  /**
   * Scrolls a child of the editor chunk into view.
   *
   * @param ele The child to scroll.
   */
  private scrollIntoView(ele: HTMLElement) {
    scrollCodeViewElementIntoView(ele, this.dom, this.view);
  }

  /**
   * Initializes the editing surface by creating and injecting an Ace editor
   * instance from the host.
   */
  public initEditor() {
    // skip if we're already initialized
    if (this.aceEditor) {
      return;
    }

    // call host factory to instantiate editor
    this.chunk = this.chunks.createChunkEditor('ace', this.dom, this.node.attrs.md_index, this.node.attrs.classes, {
      getPos: () => this.getPos(),
      scrollIntoView: ele => this.scrollIntoView(ele),
      scrollCursorIntoView: () => this.scrollCursorIntoView(),
      getTextContent: () => this.node.textContent
    });

    // populate initial contents
    this.aceEditor = this.chunk.editor;
    this.updating = true;
    this.aceEditor.setValue(this.node.textContent);
    this.updating = false;

    this.aceEditor.clearSelection();

    // cache edit session for convenience; most operations happen on the session
    this.editSession = this.aceEditor.getSession();

    // remove the preview and recreate chunk toolbar
    this.dom.innerHTML = '';
    this.dom.appendChild(this.chunk.element);

    // Propagate updates from the code editor to ProseMirror
    this.aceEditor.on('changeSelection', () => {
      if (!this.updating) {
        this.forwardSelection();
      }
    });
    this.aceEditor.on('change', () => {
      if (!this.updating) {
        this.valueChanged();
      }
    });

    // Forward selection we we receive it
    this.aceEditor.on('focus', () => {
      this.dom.classList.remove('pm-ace-editor-inactive');
      this.forwardSelection();
    });

    this.aceEditor.on('blur', () => {
      // Add a class to editor; this class contains CSS rules that hide editor
      // components that Ace cannot hide natively (such as the cursor,
      // matching bracket indicator, and active selection)
      this.dom.classList.add('pm-ace-editor-inactive');
    });

    // If the cursor moves and we're in focus, ensure that the cursor is
    // visible. Ace's own cursor visiblity mechanisms don't work in embedded
    // editors.
    this.aceEditor.getSelection().on('changeCursor', () => {
      if (this.dom.contains(document.activeElement) && !this.mouseDown) {
        this.cursorDirty = true;
      }
    });

    this.aceEditor.renderer.on('afterRender', () => {
      // If the cursor position is dirty and the mouse is not down, scroll the
      // cursor into view. Don't scroll while the mouse is down, as it will be
      // treated as a click-and-drag by Ace.
      if (this.cursorDirty && !this.mouseDown) {
        this.scrollCursorIntoView();
        this.cursorDirty = false;
      }
    });

    // Add custom escape commands for movement keys (left/right/up/down); these
    // will check to see whether the movement should leave the editor, and if
    // so will do so instead of moving the cursor.
    this.aceEditor.commands.addCommand({
      name: 'leftEscape',
      bindKey: 'Left',
      exec: () => {
        this.arrowMaybeEscape('char', -1, 'gotoleft');
      },
      readOnly: true
    });
    this.aceEditor.commands.addCommand({
      name: 'rightEscape',
      bindKey: 'Right',
      exec: () => {
        // if the chunk is currently collapsed, the right arrow should open it up
        if (this.chunk && !this.chunk.getExpanded()) {
          this.chunk.setExpanded(true);
          return;
        }
        this.arrowMaybeEscape('char', 1, 'gotoright');
      },
      readOnly: true
    });
    this.aceEditor.commands.addCommand({
      name: 'upEscape',
      bindKey: 'Up',
      exec: () => {
        this.arrowMaybeEscape('line', -1, 'golineup');
      },
      readOnly: true
    });
    this.aceEditor.commands.addCommand({
      name: 'downEscape',
      bindKey: 'Down',
      exec: () => {
        this.arrowMaybeEscape('line', 1, 'golinedown');
      },
      readOnly: true
    });

    // Pressing Backspace in the editor when it's empty should delete it.
    this.aceEditor.commands.addCommand({
      name: 'backspaceDeleteNode',
      bindKey: 'Backspace',
      exec: () => {
        this.backspaceMaybeDeleteNode();
      },
    });

    // Handle undo/redo in ProseMirror
    this.aceEditor.commands.addCommand({
      name: 'undoProsemirror',
      bindKey: {
        win: 'Ctrl-Z',
        mac: 'Command-Z',
      },
      exec: () => {
        if (undo(this.view.state, this.view.dispatch)) {
          this.view.focus();
        }
      },
    });
    this.aceEditor.commands.addCommand({
      name: 'redoProsemirror',
      bindKey: {
        win: 'Ctrl-Shift-Z|Ctrl-Y',
        mac: 'Command-Shift-Z|Command-Y',
      },
      exec: () => {
        if (redo(this.view.state, this.view.dispatch)) {
          this.view.focus();
        }
      },
    });

    // Handle Select All in ProseMirror
    this.aceEditor.commands.addCommand({
      name: 'selectAllProsemirror',
      bindKey: {
        win: 'Ctrl-A',
        mac: 'Command-A',
      },
      exec: () => {
        if (selectAll(this.view.state, this.view.dispatch, this.view)) {
          this.view.focus();
        }
      },
    });

    // Handle shortcuts for moving focus out of the code editor and into
    // ProseMirror
    this.aceEditor.commands.addCommand({
      name: 'exitCodeBlock',
      bindKey: 'Shift-Enter',
      exec: () => {
        if (exitCode(this.view.state, this.view.dispatch)) {
          this.view.focus();
        }
      },
    });

    // Create a command for inserting paragraphs from the code editor
    this.aceEditor.commands.addCommand({
      name: 'insertParagraph',
      bindKey: {
        win: 'Ctrl-\\',
        mac: 'Command-\\',
      },
      exec: () => {
        if (insertParagraph(this.view.state, this.view.dispatch)) {
          this.view.focus();
        }
      },
    });

    // Line-by-line execution
    this.aceEditor.commands.addCommand({
      name: 'executeSelection',
      bindKey: {
        win: 'Ctrl-Enter',
        mac: 'Ctrl-Enter|Command-Enter',
      },
      exec: () => {
        if (this.chunk && this.aceEditor) {
          // Record the position prior to execution
          const pos = this.aceEditor.getCursorPosition();

          // Execute the selection
          this.chunk.executeSelection();

          // If the cursor stayed on the last line, step out of the code block
          // if we're not at the end of the doc (this is a no-op when not on the
          // last line, and mirrors the behavior when stepping past the end of
          // chunks in the code editor)
          if (pos.row === this.aceEditor.getCursorPosition().row) {
            this.arrowMaybeEscape('line', 1);
          }
        }
      },
    });

    // If an attribute editor function was supplied, bind it to F4
    if (this.options.attrEditFn) {
      this.aceEditor.commands.addCommand({
        name: 'editAttributes',
        bindKey: 'F4',
        exec: () => {
          this.options.attrEditFn!(this.view.state, this.view.dispatch, this.view);
        },
      });
    }

    // Apply editor mode
    if (this.mode) {
      this.chunk.setMode(this.mode);
    }

    // Disconnect font metrics system after render loop
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.aceEditor.renderer as any).on('afterRender', () => {
      // Update known rendered width
      if (this.chunk) {
        this.renderedWidth = this.chunk.element.offsetWidth;
      }

      window.setTimeout(() => {
        if (this.aceEditor) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const metrics = (this.aceEditor.renderer as any).$fontMetrics;
          if (metrics && metrics.$observer) {
            metrics.$observer.disconnect();
          }
        }
      }, 0);
    });

    // Hook up the container to the render queue
    const editingRoot = editingRootNode(this.view.state.selection)!;
    const container = this.view.nodeDOM(editingRoot.pos) as HTMLElement;
    if (container.parentElement) {
      this.renderQueue.setContainer(container);
    }

    // Forward selection, if we have one (this can be set while the editor is
    // waiting to render)
    if (this.queuedSelection) {
      this.setSelection(this.queuedSelection.anchor, this.queuedSelection.head);
      this.queuedSelection = null;
    }

    // Subscribe to resize event; will reflow the editor to wrap properly at the
    // new width
    this.subscriptions.push(
      this.events.subscribe(ResizeEvent, () => {
        this.debounceResize();
      }),
    );

    // Subscribe to scroll event; invalidates the row we're scrolled to so
    // scrollback will be triggered if necessary (after e.g., typing after
    // scrolling offscreen)
    this.subscriptions.push(
      this.events.subscribe(ScrollEvent, () => {
        this.scrollRow = -1;
      }),
    );

    // Keep track of mouse state so we can avoid e.g., autoscrolling while the
    // mouse is down
    this.dom.addEventListener("mousedown", () => {
      this.mouseDown = true;
    });
    this.dom.addEventListener("mouseup", () => {
      this.mouseDown = false;
    });
    this.dom.addEventListener("mouseleave", () => {
      // Treat mouse exit as an up since it will cause us to miss the up event
      this.mouseDown = false;
    });
  }

  /**
   * Debounced version of editor resize; ensures we don't aggressively resize
   * while size is still changing.
   */
  private debounceResize() {
    // Clear any previously running resize timer
    if (this.resizeTimer !== 0) {
      window.clearTimeout(this.resizeTimer);
    }

    // Create a new resize timer
    this.resizeTimer = window.setTimeout(() => {
      if (this.chunk && this.aceEditor) {
        // If the width we last rendered is different than our current width,
        // trigger an Ace resize event (causes editor to reflow wrapped text)
        if (this.renderedWidth !== this.chunk.element.offsetWidth) {
          this.aceEditor.resize();
        }
      }
      this.resizeTimer = 0;
    }, 500);
  }

  private updateMode() {
    // get lang
    const lang = this.options.lang(this.node, this.getContents());

    if (lang !== null && this.mode !== lang) {
      if (this.chunk) {
        this.chunk.setMode(lang);
      }
      this.mode = lang;
    }
  }

  private backspaceMaybeDeleteNode() {
    // if the node is empty and we execute a backspace then delete the node
    if (this.node.childCount === 0) {
      // if there is an input rule we just executed then use this to undo it
      if (undoInputRule(this.view.state)) {
        undoInputRule(this.view.state, this.view.dispatch);
        this.view.focus();
      } else {
        const tr = this.view.state.tr;
        tr.delete(this.getPos(), this.getPos() + this.node.nodeSize);
        tr.setSelection(TextSelection.near(tr.doc.resolve(this.getPos()), -1));
        this.view.dispatch(tr);
        this.view.focus();
      }
    } else if (this.aceEditor) {
      this.aceEditor.execCommand('backspace');
    }
  }

  // Checks to see whether an arrow key should escape the editor or not. If so,
  // sends the focus to the right node; if not, executes the given Ace command
  // (to perform the arrow key's usual action)
  private arrowMaybeEscape(unit: string, dir: number, command?: string) {
    if (!this.aceEditor || !this.editSession) {
      return;
    }

    const pos = this.aceEditor.getCursorPosition();
    const lastrow = this.editSession.getLength() - 1;
    if (this.getExpanded() && // special handing of keys for collapsed
      (!this.aceEditor.getSelection().isEmpty() ||
      pos.row !== (dir < 0 ? 0 : lastrow) ||
      (unit === 'char' && pos.column !== (dir < 0 ? 0 : this.editSession.getDocument().getLine(pos.row).length)))
    ) {
      // this movement is happening inside the editor itself. don't escape
      // the editor; just execute the underlying command
      if (command) {
        this.aceEditor.execCommand(command);
      }
      return;
    }

    // the cursor is about to leave the editor region; flag this to avoid side
    // effects
    this.escaping = true;

    // ensure we are focused
    this.view.focus();

    // handle arrow key
    handleArrowToAdjacentNode(this.getPos(), dir, this.view.state, this.view.dispatch);

    // set focus
    this.view.focus();
    this.escaping = false;
  }

  private getContents(): string {
    if (this.editSession) {
      return this.editSession.getValue();
    } else {
      return this.dom.innerText;
    }
  }

  /**
   * Ensures that the Ace cursor is visible in the scrollable region of the document.
   */
  private scrollCursorIntoView(): void {
    // No need to try to enforce cursor position if we're already scrolled to
    // this row
    if (this.editSession && this.editSession.getSelection().getCursor().row === this.scrollRow) {
      return;
    }

    // Ensure we still have focus before proceeding
    if (this.dom.contains(document.activeElement)) {

      // Find the element containing the rendered virtual cursor 
      const cursor = this.dom.querySelector(".ace_cursor");
      if (cursor === null) {
        return;
      }

      // Ace doesn't actually move the cursor but uses CSS translations to
      // make it appear in the right place, so we need to use the somewhat
      // expensive getBoundingClientRect call to get a resolved position.
      // (The alternative would be parse the translate: transform(10px 20px))
      // call from the style property.)
      const editingRoot = editingRootNode(this.view.state.selection)!;
      const container = this.view.nodeDOM(editingRoot.pos) as HTMLElement;
      const containerRect = container.getBoundingClientRect();
      const cursorRect = cursor.getBoundingClientRect();

      // Scrolling down?
      const down = cursorRect.bottom + 10 - containerRect.bottom;
      if (down > 0) {
        container.scrollTop += down;
      } else {
        // Scrolling up?
        const up = containerRect.top + 10 - cursorRect.top;
        if (up > 0) {
          container.scrollTop -= up;
        }
      }

      // Update cached scroll row so we don't unnecessarily redo these
      // computations
      if (this.editSession) {
        this.scrollRow = this.editSession.getSelection().getCursor().row;
      }
    }
  }
}

function computeChange(oldVal: string, newVal: string) {
  if (oldVal === newVal) {
    return null;
  }
  let start = 0;
  let oldEnd = oldVal.length;
  let newEnd = newVal.length;
  while (start < oldEnd && oldVal.charCodeAt(start) === newVal.charCodeAt(start)) {
    ++start;
  }
  while (oldEnd > start && newEnd > start && oldVal.charCodeAt(oldEnd - 1) === newVal.charCodeAt(newEnd - 1)) {
    oldEnd--;
    newEnd--;
  }
  return {
    from: start,
    to: oldEnd,
    text: newVal.slice(start, newEnd),
  };
}

