/*
 * plain_text_paste.ts
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

import { isWindows } from 'core-browser';
import { ResolvedPos, Schema, Fragment, Slice, Node as ProsemirrorNode } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { ExtensionContext } from '../api/extension';
import { mapFragment } from '../api/fragment';
import { EditorMarkdown } from '../api/markdown-types';
import { clearFormatting } from '../api/formatting';
import { EditorCommandId, ProsemirrorCommand } from '../api/command';
import { pasteTransaction } from '../api/clipboard';
import { isLink, linkPasteHandler } from '../api/link';

const kTextPlain = "text/plain";
const kTextHtml = "text/html";

const extension = (context: ExtensionContext) => {

  let pasteRaw = false;
  const collectPasteRaw = () => {
    const raw = pasteRaw;
    pasteRaw = false;
    return raw;
  }

  return {

    plugins: (schema: Schema) => [
      pastePlugin(
        schema, 
        context.markdown, 
        collectPasteRaw,
        [pasteMarkdownHandler(schema), pasteHtmlHandler(schema)]
      )
    ],
    commands: () => {
      const havePaste = document.queryCommandSupported("paste");
      if (havePaste) {
        return [new ProsemirrorCommand(EditorCommandId.PasteRaw, ['Mod-Shift-v'], 
                  (_state: EditorState, dispatch?: (tr: Transaction) => void) => {
          if (!document.queryCommandEnabled("paste")) {
            return false;
          }
          if (dispatch) {
            pasteRaw = true;
            document.execCommand("paste");
          }
          return true;
        })];
      } else {
        return [];
      }

    }
  };
}

type PasteHandler = (
  editorMarkdown: EditorMarkdown,
  view: EditorView, 
  event: ClipboardEvent, 
  pasteRaw: boolean,
  slice: Slice) => boolean;

function pastePlugin(
  schema: Schema, 
  editorMarkdown: EditorMarkdown,
  pasteRaw: () => boolean,
  handlers: PasteHandler[]) {

  let shiftPaste = false;

  return new Plugin({
    key: new PluginKey('paste-handler'),

    props: {

      // detect shift paste (required for chrome which handles Cmd+Shift+v natively)
      handleKeyDown: (_, event) => {           
        shiftPaste = event.key === 'v' && (event.metaKey || event.ctrlKey) && event.shiftKey;          
      },

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clipboardTextParser: (text: string, $context: ResolvedPos) : any => {
        // if it's a single line then create a slice w/ marks from the active context
        if (text.indexOf('\n') === -1) {
          const marks = $context.marks();
          const textNode = schema.text(text, marks);
          return new Slice(Fragment.from(textNode), 0, 0);
        } else {
          return null;
        }
      },

      // NOTE: this issue is fixed in later versions of prosemirror so we can 
      // remove once we've upgraded. see https://github.com/ProseMirror/prosemirror-view/pull/144
      transformPastedHTML(html) {
        if (isWindows()) {
          const fragments = html.match(/<!--StartFragment-->(.*)<!--EndFragment-->/); 
          if (fragments) {
            return fragments[1];
          }
        }
        return html;
      },

      // call all of the paste handlers
      handlePaste(view, event, slice) {
        const raw = pasteRaw() || shiftPaste;
        for (const handler of handlers) {
          const handled = handler(editorMarkdown, view, event, raw, slice);
          if (handled) {
            return true;
          }
        }
        return false;
      }
    }
  });

}



function pasteMarkdownHandler(
  schema: Schema
) {

  const linkHandler = linkPasteHandler(schema);

  return (editorMarkdown: EditorMarkdown,
          view: EditorView, 
          event: ClipboardEvent, 
          pasteRaw: boolean,
          slice: Slice) => {
  
    // must be in a location valid for a markdown paste
    if (!editorMarkdown.allowMarkdownPaste(view.state)) {
      return false;
    }
  
    // inspect clipboard and selection state
    const { clipboardData } = event;
    const text = clipboardData?.getData(kTextPlain);
    const html = clipboardData?.getData(kTextHtml);
    const isVscode = isVscodePaste(clipboardData, html);
  
    // must have text/plain
    if (!text) {
      return false;
    }
  
    // text/html is a disqualifier, save for pastes from vscode
    // (where we need to steer around using the html version of the code)
    if (html && !isVscode) {
      return false;
    }
  
    editorMarkdown.markdownToSlice(text, slice.openStart, slice.openEnd).then(slice => {
  
      // convert bare links into markdown links
      slice = linkHandler(slice);

      // prepare paste transaction
      const tr = pasteTransaction(view.state);
      
      // if there is a selection and the slice is a single link then apply the mark
      const sliceText = slice.content.textBetween(0, slice.content.size);
      if (!tr.selection.empty && isLink(sliceText)) {
        tr.addMark(
          tr.selection.from, 
          tr.selection.to, 
          schema.marks.link.create({ href: sliceText })
        );
      } else {
        const prevSel = tr.selection;
        tr.replaceSelection(slice);
        if (pasteRaw) {
          clearFormatting(tr, prevSel.from, prevSel.from + slice.size);
        } 
      }
      view.dispatch(tr);
    });
  
    return true; 
  
  }

}
  



function pasteHtmlHandler(
  schema: Schema
) {
  return (_editorMarkdown: EditorMarkdown,
    view: EditorView, 
    event: ClipboardEvent, 
    pasteRaw: boolean,
    slice: Slice) => {
  
    if (!event.clipboardData) {
      return false;
    }
  
    // helper to paste slice
    const pasteSlice = (s: Slice) => {
      const tr = view.state.tr;
      const prevSel = tr.selection;
      tr.replaceSelection(s);
      if (pasteRaw) {;
        clearFormatting(tr, prevSel.from, prevSel.from + slice.size)
      } 
      view.dispatch(tr);
    }
  
    // if this contains office content or we are on windows then handle it
    // (office content has excessive internal vertical space, windows has
    // issues w/ prosemirror freezing in its paste implementation when handling
    // multiple paragraphs)
    const kTextHtml = "text/html";
    const kWordSchema = "urn:schemas-microsoft-com:office:word";
    if (event.clipboardData.types.includes(kTextHtml)) {
      const html = event.clipboardData.getData(kTextHtml);
      if (html.includes(kWordSchema) || isWindows()) {
        // filter out nodes with empty paragraphs
        const nodes: ProsemirrorNode[] = [];
        for (let i = 0; i < slice.content.childCount; i++) {
          const node = slice.content.child(i)
          if (node.textContent.trim() !== "") {
            const newNode = node.type.createAndFill(node.attrs, mapFragment(node.content, nd => {
              if (nd.isText) {
                return schema.text(nd.text!.replace(/\n/g, ' '), nd.marks);
              } else {
                return nd;
              }
            }), node.marks);
            nodes.push(newNode || node);
          }
        }
        const fragment = Fragment.fromArray(nodes);
        const newSlice = new Slice(fragment, slice.openStart, slice.openEnd);
        pasteSlice(newSlice); 
        return true;
      } else if (pasteRaw) {
        pasteSlice(slice);
        return true;
      }
    }
      
    return false;
  }
}
  

// detect vscode paste
const kVscodeEditorData = "vscode-editor-data";
const kVscodeRegex = /^<div.*?orphans: auto;.*?widows: auto.*?white-space: pre;/;
function isVscodePaste(clipboardData: DataTransfer | null, html: string | undefined) {
  if (clipboardData?.types.some((type) => type === kVscodeEditorData)) {
    return true;
  } else if (html && html.match(kVscodeRegex)) {
    return true;
  } else {
    return false;
  }
}

export default extension;
