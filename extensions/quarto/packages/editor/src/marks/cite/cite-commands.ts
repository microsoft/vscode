/*
 * cite-commands.ts
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

import { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { setTextSelection } from 'prosemirror-utils';

import { ProsemirrorCommand, EditorCommandId, toggleMarkType } from '../../api/command';
import { canInsertNode } from '../../api/node';
import { EditorUI } from '../../api/ui-types';
import { OmniInsertGroup } from '../../api/omni_insert';
import { EditorEvents } from '../../api/event-types';
import { BibliographyManager } from '../../api/bibliography/bibliography';

import { ensureSourcesInBibliography } from './cite';
import { showInsertCitationDialog, InsertCitationDialogResult } from '../../behaviors/insert_citation/insert_citation';
import { markIsActive, getMarkRange } from '../../api/mark';
import { EditorServer } from 'editor-types';

export class InsertCitationCommand extends ProsemirrorCommand {
  private initialSelectionKey: string | undefined;

  constructor(ui: EditorUI, _events: EditorEvents, bibliographyManager: BibliographyManager, server: EditorServer) {
    super(
      EditorCommandId.Citation,
      ['Shift-Mod-F8'],
      (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
        // enable/disable command
        const schema = state.schema;
        if (!canInsertNode(state, schema.nodes.text) || !toggleMarkType(schema.marks.cite)(state)) {
          return false;
        }

        if (dispatch && view) {
          showInsertCitationDialog(
            ui,
            state.doc,
            bibliographyManager,
            server,
            async (result: InsertCitationDialogResult) => {
              if (result) {
                // Remember the last tree node that was selected
                this.initialSelectionKey = result.selectionKey;

                // Remember whether the citation is intext for the future
                ui.prefs.setCitationDefaultInText(result.intextCitationStyle);

                // The citations that we should insert
                const bibliographySources = result.bibliographySources;

                // The bibliography that we should insert sources into (if needed)
                const bibliography = result.bibliography;

                // The transaction that will hold all the changes we'll make
                const tr = state.tr;

                // First, be sure that we add any sources to the bibliography
                // and that the bibliography is properly configured
                const writeCiteId = await ensureSourcesInBibliography(
                  tr,
                  bibliographySources,
                  bibliography,
                  bibliographyManager,
                  view,
                  ui,
                  server.pandoc,
                );

                if (writeCiteId) {
                  // The starting location of this transaction
                  const start = tr.selection.from;

                  // See if we are already inside an active cite mark
                  const alreadyInCite = markIsActive(tr, schema.marks.cite);
                  const includeWrapper = !result.intextCitationStyle || result.bibliographySources.length > 1;

                  // Insert the wrapping [] if the user wants that style citation
                  // Note that if the use is inserting more than one citation, we ignore this and just
                  // always perform a 'note' style citation insert
                  // If we're already inside a cite including [], don't bother inserting wrapper
                  if (!alreadyInCite && includeWrapper) {
                    const wrapperText = schema.text('[]');
                    tr.insert(tr.selection.from, wrapperText);

                    // move the selection into the wrapper
                    setTextSelection(tr.selection.from - 1)(tr);
                  }

                  // If the previous character is a part of a cite_id, advance to the end of the mark,
                  // insert a separator, and then proceed
                  const preCiteIdRange = getMarkRange(tr.doc.resolve(start - 1), schema.marks.cite_id);
                  if (preCiteIdRange) {
                    setTextSelection(preCiteIdRange.to)(tr);
                    const separator = schema.text('; ');
                    tr.insert(tr.selection.from, separator);
                  }

                  // insert the CiteId marks and text
                  bibliographySources.forEach((citation, i) => {
                    const citeIdMark = schema.marks.cite_id.create();
                    const citeIdText = schema.text(`@${citation.id}`, [citeIdMark]);
                    tr.insert(tr.selection.from, citeIdText);
                    if (bibliographySources.length > 1 && i !== bibliographySources.length - 1) {
                      tr.insert(tr.selection.from, schema.text('; ', []));
                    }
                  });

                  // If the next character is a part of a cite_id, insert a separator (that will appear after the current citeId)
                  const postCiteIdRange = getMarkRange(tr.doc.resolve(tr.selection.from + 1), schema.marks.cite_id);
                  if (postCiteIdRange) {
                    const separator = schema.text('; ');
                    tr.insert(tr.selection.from, separator);
                  }

                  // Enclose wrapper in the cite mark (if not already in a cite)
                  if (!alreadyInCite) {
                    const endOfWrapper = includeWrapper ? tr.selection.from + 1 : tr.selection.from;
                    const citeMark = schema.marks.cite.create();
                    tr.addMark(start, endOfWrapper, citeMark);
                    setTextSelection(endOfWrapper)(tr);
                  }
                }

                // commit the transaction
                dispatch(tr);

                return Promise.resolve();
              } 
            },
            this.initialSelectionKey,
          ).then(() => {
            view.focus();
          });
        }
        return true;
      },
      {
        name: ui.context.translateText('Citation...'),
        description: ui.context.translateText('Reference to a source'),
        group: OmniInsertGroup.References,
        priority: 1,
        noFocus: true,
        image: () => (ui.prefs.darkMode() ? ui.images.omni_insert.citation_dark : ui.images.omni_insert.citation),
      },
      // false
    );
  }
}
