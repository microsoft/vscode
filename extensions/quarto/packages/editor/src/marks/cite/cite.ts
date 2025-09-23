/*
 * cite.ts
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

import { Mark, Schema, Fragment, Node as ProsemirrorNode, Slice } from 'prosemirror-model';
import { InputRule } from 'prosemirror-inputrules';
import { EditorState, Transaction, Plugin, PluginKey } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import uniqby from 'lodash.uniqby';

import { FocusEvent } from '../../api/event-types';
import { PandocTokenType, PandocToken, PandocOutput, ProsemirrorWriter, PandocServer, kPreventBracketEscape } from '../../api/pandoc';
import { fragmentText } from '../../api/fragment';
import { markIsActive, splitInvalidatedMarks, getMarkRange, detectAndApplyMarks, domAttrNoSpelling } from '../../api/mark';
import { MarkTransaction } from '../../api/transaction';
import { BibliographyManager, BibliographyFile, BibliographySource } from '../../api/bibliography/bibliography';
import { EditorUI } from '../../api/ui-types';
import { joinPaths, getExtension } from '../../api/path';
import { Extension, ExtensionContext } from '../../api/extension';
import { InsertCiteProps, kAlertTypeError, kAlertTypeWarning } from 'editor-types';
import { CSL, sanitizeForCiteproc } from '../../api/csl';
import { suggestCiteId, formatForPreview } from '../../api/cite';
import { performCompletionReplacement } from '../../api/completion';
import { FixupContext } from '../../api/fixup';
import { pasteTransaction } from '../../api/clipboard';
import { ensureBibliographyFileForDoc } from '../../api/bibliography/bibliography-provider_local';

import { citationCompletionHandler } from './cite-completion';
import { citeHighlightPlugin } from './cite-highlight';
import { citationDoiCompletionHandler } from './cite-completion_doi';
import { doiFromSlice } from './cite-doi';
import { citePopupPlugin } from './cite-popup';
import { InsertCitationCommand } from './cite-commands';
import { setTextSelection, findChildren } from 'prosemirror-utils';
import { AddMarkStep } from 'prosemirror-transform';
import { citeXrefPopupPlugin } from './cite-popup-xref';

const kCiteCitationsIndex = 0;


// Follow the pandoc rules for citations
// Each citation must have a key, composed of ‘@’ + the citation identifier from the database, 
// and may optionally have a prefix, a locator, and a suffix. The citation key must begin with a letter, 
// digit, or _, and may contain alphanumerics (UNICODE), _, and internal punctuation characters (:.#$%&-+?<>~/).
// In addition, we don't permit the citation to include a . or ? character (which are allowed in the cite identifier)
// This is only because when writing in text citations, it will be common to follow a citation with 
// punctuation, and we should be smart enough to filter that punctuation out of the citation itself.
const kCiteIdPrefixPattern = '-?@';
const kCiteIdCharsPattern = '[^@;\\(\\)\\[\\]\\s\\!\\,]*';
const kCiteIdBasePattern = `${kCiteIdPrefixPattern}${kCiteIdCharsPattern}`;

// Completions examine all the text inside the citation mark, so they need to only be interested
// in a citeId that terminates at the cursor (at the end of the text)
const kCompletionCiteIdRegEx = new RegExp(`(${kCiteIdPrefixPattern})(${kCiteIdCharsPattern})$`);

// Note that since Cite Ids can appear inline as in-text representations or can appear inside of brackets 
// in a Note style. Consequently, this is used in various places to identify them interchangeably (e.g. we use)
// this to identify a citeId inline in text, but also to identify a citedId in a bracketed citation.
const kCiteId = new RegExp(`^${kCiteIdBasePattern}`);

// Plain In Text: @foo2019 (this is intentionally a duplicate of the above)
// just to make the meaning more clear (this is used to detect an in text citation)
const kInTextCiteRegex = new RegExp(`${kCiteIdBasePattern}$`);

// Note Style: [@foo2019]
const kBeginCitePattern = `([^-]+ -@|[^@]+ @|-?@)`;
const kNoteCiteRegex = new RegExp(`\\[${kBeginCitePattern}${kCiteIdCharsPattern}.*?\\]`);

// In Text with Suffix: @foo2019 [p 35]
const kInTextCiteWithSuffixPattern = `${kCiteIdPrefixPattern}${kCiteIdCharsPattern}\\s+\\[.*?\\]`;
const kInTextCiteWithSuffixRegEx = new RegExp(`^${kInTextCiteWithSuffixPattern}$`);

enum CitationMode {
  NormalCitation = 'NormalCitation',
  AuthorInText = 'AuthorInText',
  SuppressAuthor = 'SuppressAuthor',
}

interface Citation {
  citationHash: number;
  citationId: string;
  citationMode: {
    t: CitationMode;
  };
  citationNoteNum: number;
  citationPrefix: PandocToken[];
  citationSuffix: PandocToken[];
}

const extension = (context: ExtensionContext): Extension | null => {
  const { pandocExtensions, ui } = context;

  // prime bibliography on initial focus
  const bibliographyManager = new BibliographyManager(context.server.pandoc, context.server.zotero);
  const focusUnsubscribe = context.events.subscribe(FocusEvent, doc => {
    bibliographyManager.prime(ui, doc!);
    focusUnsubscribe();
  });

  if (!pandocExtensions.citations) {
    return null;
  }

  return {
    marks: [
      {
        name: 'cite',
        spec: {
          attrs: {},
          inclusive: false,
          parseDOM: [
            {
              tag: "span[class*='cite']",
              // use priority to ensure that cite_id is parsed before cite
              // when reading the DOM for the clipboard. we need this because
              // 'cite' is first in the mark order (so that @ witin a cite
              // properly triggers the input rule)
              priority: 5
            },
          ],
          toDOM() {
            return ['span', { class: 'cite' } ]
         
          },
        },
        pandoc: {
          readers: [
            {
              token: PandocTokenType.Cite,
              handler: readPandocCite,
            },
          ],

          writer: {
            priority: 14,
            write: (output: PandocOutput, _mark: Mark, parent: Fragment) => {

              // extract parentText for inspection
              const parentText = fragmentText(parent);

              // if it's just a cite id then write it straight up
              if (fragmentText(parent).match(kInTextCiteRegex)) {

                output.writeInlines(parent);

              } else {

                // divide out delimiters from body
                const openCite = parent.cut(0, 1);
                const cite = parent.cut(1, parent.size - 1);
                const closeCite = parent.cut(parent.size - 1, parent.size);

                // check for fully enclosed in brackets
                if (
                  fragmentText(openCite) === '[' &&
                  fragmentText(closeCite) === ']'
                ) {
                  output.writeRawMarkdown('[');
                  output.withOption(kPreventBracketEscape, true, () => {
                    output.writeInlines(cite);
                  });
                  output.writeRawMarkdown(']');


                  // if it starts with a valid cite id prefix and ends with a close
                  // bracket then it might be an in-text citation with a suffix
                } else if (parentText.match(kInTextCiteWithSuffixRegEx)) {

                  // find the position of the begin bracket that matches the end bracket
                  let beginBracketPos = -1;
                  let bracketLevel = 0;
                  for (let i = parentText.length - 2; i >= 0; i--) {
                    const char = parentText.charAt(i);
                    if (char === ']') {
                      bracketLevel++;
                    } else if (char === '[') {
                      if (bracketLevel > 0) {
                        bracketLevel--;
                      } else {
                        beginBracketPos = i;
                        break;
                      }
                    }
                  }

                  // if we found one then cut as approrpriate
                  if (beginBracketPos) {
                    output.writeInlines(parent.cut(0, beginBracketPos));
                    output.writeRawMarkdown('[');
                    output.writeInlines(parent.cut(beginBracketPos + 1, parentText.length - 1));
                    output.writeRawMarkdown(']');

                  } else {
                    output.writeInlines(parent);
                  }
                } else {
                  output.writeInlines(parent);
                }
              }
            },
          },
        },
      },
      {
        name: 'cite_id',
        noSpelling: true,
        spec: {
          attrs: {},
          inclusive: true,
          parseDOM: [
            {
              tag: "span[class*='cite-id']",
              // use priority to ensure that cite_id is parsed before cite
              // when reading the DOM for the clipboard. we need this because
              // 'cite' is first in the mark order (so that @ witin a cite
              // properly triggers the input rule)
              priority: 10
            },
          ],
          toDOM() {
            return ['span', domAttrNoSpelling({ class: 'cite-id pm-link-text-color pm-fixedwidth-font' })];
          },
        },
        pandoc: {
          readers: [],
          writer: {
            priority: 13,
            write: (output: PandocOutput, _mark: Mark, parent: Fragment) => {
              const idText = fragmentText(parent);
              // only write as a citation id (i.e. don't escape @) if it is still
              // a valid citation id. note that this in principle is also taken care
              // of by the application of splitInvalidatedMarks below (as the
              // mark would have been broken by this if it wasn't valid). this
              // code predates that, and we leave it in for good measure in case that
              // code is removed or changes in another unexpected way.
              if (idText.match(kInTextCiteRegex)) {
                const prefixMatch = idText.match(/^-?@/);
                if (prefixMatch) {
                  output.writeRawMarkdown(prefixMatch.input!);
                  output.writeInlines(parent.cut(prefixMatch.input!.length));
                } else {
                  output.writeInlines(parent);
                }
              } else {
                output.writeInlines(parent);
              }
            },
          },
        },
      },
    ],

    commands: () => {
      return [new InsertCitationCommand(ui, context.events, bibliographyManager, context.server)];
    },

    appendTransaction: (schema: Schema) => {
      return [{
        name: 'cite-id-join',
        append: (tr: Transaction) => {
          const range = getMarkRange(tr.doc.resolve(tr.selection.head - 1), schema.marks.cite_id);
          if (range) {
            const text = tr.doc.textBetween(range.from, tr.selection.$head.after());
            const citeIdLen = citeIdLength(text);
            const markLength = range.to - range.from;
            if (citeIdLen > markLength) {
              tr.addMark(range.from, range.from + citeIdLen, schema.marks.cite_id.create());
            }
          }
          return tr;
        },
      }];
    },

    fixups: (schema: Schema) => {
      return [
        (tr: Transaction, fixupContext: FixupContext) => {
          if (fixupContext === FixupContext.Load) {
            // apply marks
            const markType = schema.marks.cite;
            const predicate = (node: ProsemirrorNode) => {
              return node.isTextblock && 
                     node.type.allowsMarkType(markType)  &&
                     node.textContent.indexOf('@') !== -1;
            };
            const markTr = new MarkTransaction(tr);
            findChildren(tr.doc, predicate).forEach(nodeWithPos => {
              const { pos } = nodeWithPos;
              applyCiteMarks(markTr, nodeWithPos.node, pos);
            });
          }
          return tr;
        },
      ];
    },

    appendMarkTransaction: (schema: Schema) => {

      return [
        {
          // 'break' cite marks if they are no longer valid. note that this will still preserve
          // the mark up to the length that it is valid. 
          name: 'cite-marks',
          filter: (node: ProsemirrorNode, transactions: readonly Transaction[]) => {

            // if the transaction added any cite id marks then we need to lay off
            // (mostly so that input rules can be reversed)
            if (transactions.some(trans => trans.steps.some(step => {
              if (step instanceof AddMarkStep) {
                return step.mark.type === schema.marks.cite_id;
              } else {
                return false;
              }
            }))) {
              return false;

              /// otherwise proceed if this node is a textblock that allows cites
            } else {

              return node.isTextblock && node.type.allowsMarkType(schema.marks.cite);
            }
          },
          append: (tr: MarkTransaction, node: ProsemirrorNode, pos: number) => {
            splitInvalidatedMarks(tr, node, pos, citeLength, schema.marks.cite, (from: number, to: number) => {
              tr.removeMark(from, to, schema.marks.cite);
            });
            // match all valid forms of mark
            if (node.textContent.indexOf('@') !== -1) {
              applyCiteMarks(tr, node, pos);
            }
          },
        },
        {
          // 'break' cite_id marks if they are no longer valid. note that this will still preserve
          // the mark up to the length that it is valid (so e.g. if a space is inserted within a
          // cite_id this will keep the mark on the part before the space and remove it from the
          // part after the space)
          name: 'remove-cite-id-marks',
          filter: (node: ProsemirrorNode) => node.isTextblock && node.type.allowsMarkType(schema.marks.cite_id),
          append: (tr: MarkTransaction, node: ProsemirrorNode, pos: number) => {
            splitInvalidatedMarks(tr, node, pos, citeIdLength, schema.marks.cite_id);
          },
        },
      ];
    },

    inputRules: (schema: Schema) => {
      return [
        citeIdInputRule(schema),
        citeIdDashInputRule(schema),
      ];
    },

    completionHandlers: () => [
      citationDoiCompletionHandler(context.ui, bibliographyManager, context.server),
      citationCompletionHandler(context.ui, context.events, bibliographyManager, context.server, context.format),
    ],

    plugins: (schema: Schema) => {
      return [
        new Plugin({
          key: new PluginKey('paste_cite_doi'),
          props: {
            handlePaste: handlePaste(ui, bibliographyManager, context.server.pandoc),
          },
        }),
        citeHighlightPlugin(schema),
        citeXrefPopupPlugin(schema, ui, context.server),
        citePopupPlugin(schema, ui, bibliographyManager, context.server),

      ];
    },
  };
};

function handlePaste(ui: EditorUI, bibManager: BibliographyManager, server: PandocServer) {
  return (view: EditorView, _event: Event, slice: Slice) => {
    const schema = view.state.schema;
    if (markIsActive(view.state, schema.marks.cite_id)) {
      // This is a DOI
      const parsedDOI = doiFromSlice(view.state, slice);
      if (parsedDOI) {
        // Insert the DOI text as a placeholder
        const tr = pasteTransaction(view.state);
        const doiText = schema.text(parsedDOI.token);
        tr.replaceSelectionWith(doiText, true);
        view.dispatch(tr);

        // First check the local bibliography- if we already have this DOI
        // we can just paste the DOI
        const source = bibManager.findDoiInLocalBibliography(parsedDOI.token);
        if (!source && bibManager.allowsWrites()) {
          insertCitation(view, parsedDOI.token, bibManager, parsedDOI.pos, ui, server);
        }
        return true;
      } else {
        // This is just content, accept any text and try pasting that
        let text = '';
        slice.content.forEach((node: ProsemirrorNode) => (text = text + node.textContent));
        if (text.length > 0) {
          const tr = pasteTransaction(view.state);
          tr.replaceSelectionWith(schema.text(text));
          view.dispatch(tr);
          return true;
        } else {
          // There wasn't any text, just allow the paste to be handled by anyone else
          return false;
        }
      }
    } else {
      // We aren't in a citation so let someone else handle the paste
      return false;
    }
  };
}


// create a cite_id within a citation when the @ sign is typed
function citeIdInputRule(schema: Schema) {
  return new InputRule(/@$/, (state: EditorState, match: string[], start: number) => {
    if (!markIsActive(state, schema.marks.cite_id)) {
      const { parent, parentOffset } = state.selection.$head;
      const text = match[0] + parent.textContent.slice(parentOffset);
      const textBefore = parent.textContent.slice(0, parentOffset);

      // reject unless the right prefix is there
      if (textBefore.length && !textBefore.match(/[\xA0 \t\-[]$/)) {
        return null;
      }

      // get cite id length
      const citeIdLen = citeIdLength(text);

      // insert the @
      const tr = state.tr;
      tr.insertText(match[0]);

      // insert a pairing end bracket if we started with [
      if (citeIdLen === 1 && textBefore.match(/\[-?$/) && text[1] !== ']') {
        tr.insertText(']');
        setTextSelection(tr.selection.head - 1)(tr);
      }

      if (citeIdLen) {
        // offset mark for incidence of '-' prefix
        const offset = textBefore.endsWith('-') ? 1 : 0;
        const citeStart = start - offset;
        const citeEnd = citeStart + citeIdLen + offset;
        tr.addMark(citeStart, citeEnd, schema.marks.cite_id.create());
      }

      return tr;
    }
    return null;
  });
}


function citeIdDashInputRule(schema: Schema) {
  return new InputRule(new RegExp(`-$`), (state: EditorState, match: string[], start: number, end: number) => {
    if (state.doc.rangeHasMark(start + 1, end + 2, schema.marks.cite_id)) {
      const tr = state.tr;
      tr.insertText(match[0]);
      tr.addMark(start, start + 1, schema.marks.cite_id.create());
      return tr;
    }
    return null;
  });
}


// read pandoc citation, creating requisite cite and cite_id marks as we go
function readPandocCite(schema: Schema) {
  return (writer: ProsemirrorWriter, tok: PandocToken) => {

    // create and open the mark
    const citeMark = schema.marks.cite.create();
    writer.openMark(citeMark);

    // helper to write a citation
    const writeCitation = (citation: Citation) => {
      // prefix
      writer.writeTokens(citation.citationPrefix);
      if (citation.citationPrefix.length) {
        writer.writeText(' ');
      }

      // id
      const suppress = citation.citationMode.t === CitationMode.SuppressAuthor ? '-' : '';
      const citeIdMark = schema.marks.cite_id.create();
      writer.openMark(citeIdMark);
      writer.writeText(suppress + '@' + citation.citationId);
      writer.closeMark(citeIdMark);

      // suffix
      const inTextSuffix = citation.citationMode.t === CitationMode.AuthorInText && citation.citationSuffix.length;
      if (inTextSuffix) {
        writer.writeText(' [');
      }
      writer.writeTokens(citation.citationSuffix);
      if (inTextSuffix) {
        writer.writeText(']');
      }
    };

    // get all of the citations
    const citations: Citation[] = tok.c[kCiteCitationsIndex];

    // look for a single in-text citation
    if (citations.length === 1 && citations[0].citationMode.t === CitationMode.AuthorInText) {
      writeCitation(citations[0]);
      // non-in text and/or multiple citations
    } else {
      writer.writeText('[');
      citations.forEach((citation: Citation, index: number) => {
        // add delimiter
        if (index !== 0) {
          writer.writeText('; ');
        }
        writeCitation(citation);
      });
      writer.writeText(']');
    }

    writer.closeMark(citeMark);
  };
}

const kCitationIdRegex = new RegExp(`(^\\[| )(${kCiteIdBasePattern})`, 'g');

function encloseInCiteMark(tr: Transaction, start: number, end: number) {
  const schema = tr.doc.type.schema;
  const mark = schema.marks.cite.create();

  tr.addMark(start, end, mark);

  // look for valid citation ids inside and mark them
  const citeText = tr.doc.textBetween(start, end);

  kCitationIdRegex.lastIndex = 0;
  let match = kCitationIdRegex.exec(citeText);
  while (match !== null) {
    const pos = start + match.index + match[1].length;
    const idMark = schema.marks.cite_id.create();

    tr.addMark(pos, pos + match[2].length, idMark);
    match = kCitationIdRegex.exec(citeText);
  }
  kCitationIdRegex.lastIndex = 0;
  return tr;
}

function citeLength(text: string) {
  if (text.match(kNoteCiteRegex) ||
    text.match(kInTextCiteRegex) ||
    text.match(kInTextCiteWithSuffixRegEx)) {
    return text.length;
  } else {
    return 0;
  }
}

// up to how many characters of the passed text constitute a valid cite_id in the editor
// (note that the editor tolerates citations ids with just an '@')
function citeIdLength(text: string) {
  const match = text.match(kCiteId);
  if (match) {
    return match[0].length;
  } else {
    return 0;
  }
}


const kFindInTextCiteRegex = new RegExp(kCiteIdBasePattern, 'g');
const kFindInTextCiteWithSuffixRegex = new RegExp(kInTextCiteWithSuffixPattern, 'g');
const kFindFullCiteRegex = new RegExp(kNoteCiteRegex.source, 'g');

function applyCiteMarks(tr: MarkTransaction, node: ProsemirrorNode, pos: number) {
  const schema = node.type.schema;
  [kFindInTextCiteRegex, kFindFullCiteRegex, kFindInTextCiteWithSuffixRegex].forEach(re => {
    detectAndApplyMarks(
      tr,
      tr.doc.nodeAt(pos)!,
      pos,
      re,
      schema.marks.cite,
      () => ({}),
      (from: number, to: number) => {
        return tr.doc.rangeHasMark(from, to, schema.marks.cite_id);
      }
    );
  });
}


export interface ParsedCitation {
  token: string;
  pos: number;
  offset: number;
}

export function parseCitation(context: EditorState | Transaction): ParsedCitation | null {
  // return completions only if we are inside a cite_id . This way
  // if the user dismisses the cite_id (e.g. decides to type @ as literal string)
  // we won't offer completions
  const markType = context.doc.type.schema.marks.cite_id;
  const range = getMarkRange(context.doc.resolve(context.selection.head - 1), markType);
  if (range) {
    // examine text up to the cursor
    const citeText = context.doc.textBetween(range.from, context.selection.head);

    // make sure there is no text directly ahead (except bracket, space, semicolon)
    const nextChar = context.doc.textBetween(context.selection.head, context.selection.head + 1);
    if (!nextChar || [';', ' ', ']'].includes(nextChar)) {
      // look for a cite id that terminates at the cursor (including spaces/text after the id,
      // but before any semicolon delimiter)
      const match = citeText.match(kCompletionCiteIdRegEx);
      if (match) {
        const token = match[2];
        const pos = range.from + match.index! + match[1].length;
        return { token, pos, offset: -match[1].length };
      }
    }
  }
  return null;
}

// Replaces the current selection with a resolved citation id
export async function insertCitation(
  view: EditorView,
  doi: string,
  bibManager: BibliographyManager,
  pos: number,
  ui: EditorUI,
  server: PandocServer,
  csl?: CSL,
  provider?: string,
) {
  // ensure the bib manager is loaded before proceeding
  await bibManager.loadLocal(ui, view.state.doc);

  // We try not call this function if the entry for this DOI is already in the bibliography,
  // but it can happen. So we need to check here if it is already in the bibliography and
  // if it is, deal with it appropriately.
  const existingEntry = bibManager.findDoiInLocalBibliography(doi);
  if (existingEntry) {
    // Now that we have loaded the bibliography, there is an entry
    // Just write it. Not an ideal experience, but something that
    // should happen only in unusual experiences
    const tr = view.state.tr;

    // This could be called by paste handler, so stop completions
    performCiteCompletionReplacement(tr, tr.mapping.map(pos), existingEntry.id);
    view.dispatch(tr);
  } else {
    // There isn't an entry in the existing bibliography
    // Show the user UI to and ultimately create an entry in the biblography
    // (even creating a bibliography if necessary)

    // Read bibliographies out of the document and pass those alone
    const existingIds = bibManager.localSources().map(source => source.id);

    const citeProps: InsertCiteProps = {
      doi,
      existingIds,
      bibliographyFiles: bibManager
        .writableBibliographyFiles(view.state.doc, ui)
        .map(writableFile => writableFile.displayPath),
      provider,
      csl,
      citeUI: csl
        ? {
          suggestedId: csl.id || suggestCiteId(existingIds, csl),
          previewFields: formatForPreview(csl),
        }
        : undefined,
    };

    const result = await ui.dialogs.insertCite(citeProps);
    if (result && result.id.length) {
      if (!result?.csl.title) {
        await ui.dialogs.alert(
          ui.context.translateText('Invalid Citation'),
          ui.context.translateText(
            "This citation can't be added to the bibliography because it is missing required fields.",
          ),
          kAlertTypeError,
        );
      } else {
        // Figure out whether this is a project or document level bibliography
        const writableBiblios = bibManager.writableBibliographyFiles(view.state.doc, ui);

        // Sort out the bibliography file into which we should write the entry
        const thisWritableBiblio = writableBiblios.find(writable => writable.displayPath === result.bibliographyFile);
        const project = thisWritableBiblio?.isProject || false;
        const writableBiblioPath = thisWritableBiblio
          ? thisWritableBiblio.fullPath
          : joinPaths(ui.context.getDefaultResourceDir(), result.bibliographyFile);
        const bibliographyFile: BibliographyFile = {
          displayPath: result.bibliographyFile,
          fullPath: writableBiblioPath,
          isProject: project,
          writable: true,
        };

        // Create the source that holds the id, provider, etc...
        const source: BibliographySource = {
          ...result.csl,
          id: result.id,
          providerKey: provider || '',
        };

        // Start the transaction
        const tr = view.state.tr;

        // Write the source to the bibliography if needed
        const writeCiteId = await ensureSourcesInBibliography(
          tr,
          [source],
          bibliographyFile,
          bibManager,
          view,
          ui,
          server,
        );

        if (writeCiteId) {
          // Write the citeId
          const schema = view.state.schema;
          const idText = schema.text(source.id, [schema.marks.cite_id.create()]);
          performCiteCompletionReplacement(tr, tr.mapping.map(pos), idText);
        }

        // Dispath the transaction
        view.dispatch(tr);
      }
    }
    view.focus();
  }
}

// Ensures that the sources are in the specified bibliography file
// and ensures that the bibliography file is properly referenced (either)
// as a project bibliography or inline in the document YAML
export async function ensureSourcesInBibliography(
  tr: Transaction,
  sources: BibliographySource[],
  bibliographyFile: BibliographyFile,
  bibManager: BibliographyManager,
  view: EditorView,
  ui: EditorUI,
  server: PandocServer,
): Promise<boolean> {
  // Write entry to a bibliography file if it isn't already present
  await bibManager.loadLocal(ui, view.state.doc);

  // See if there is a warning for the selected provider. If there is, we may need to surface
  // that to the user. If there is no provider specified, no need to care about warnings.
  const providers = uniqby(sources, (source: BibliographySource) => source.providerKey).map(
    source => source.providerKey,
  );

  // Find any providers that have warnings
  const providersWithWarnings = providers.filter(prov => bibManager.warningForProvider(prov));

  // Is this a bibtex bibliography?
  const bibliographyFileExtension = getExtension(bibliographyFile.fullPath);
  const isBibTexBibliography = !['yaml', 'yml', 'json'].includes(bibliographyFileExtension);

  // If there is a warning message and we're exporting to BibTeX, show the warning
  // message to the user and confirm that they'd like to proceed. This would ideally
  // know more about the warning type and not have this filter here (e.g. it would just
  // always show the warning)
  let proceedWithInsert = true;
  if (providersWithWarnings.length > 0 && ui.prefs.zoteroUseBetterBibtex() && isBibTexBibliography) {
    const results = await Promise.all<boolean>(
      providersWithWarnings.map(async withWarning => {
        const warning = bibManager.warningForProvider(withWarning);
        if (warning) {
          return await ui.dialogs.yesNoMessage(
            ui.context.translateText('Warning'),
            warning,
            kAlertTypeWarning,
            ui.context.translateText('Insert Citation Anyway'),
            ui.context.translateText('Cancel'),
          );
        } else {
          return true;
        }
      }),
    );
    proceedWithInsert = results.every(result => result);
  }

  if (proceedWithInsert) {
    await Promise.all(
      sources.map(async (source) => {
        if (source.id) {
          // Crossref sometimes provides invalid json for some entries. Sanitize it for citeproc
          const cslToWrite = sanitizeForCiteproc(source);

          if (!bibManager.findIdInLocalBibliography(source.id)) {
            const sourceAsBibTex = isBibTexBibliography
              ? await bibManager.generateBibTeX(ui, source.id, cslToWrite, source.providerKey)
              : undefined;
            await server.addToBibliography(
              bibliographyFile.fullPath,
              bibliographyFile.isProject,
              source.id,
              JSON.stringify([cslToWrite]),
              sourceAsBibTex || '',
              ui.context.getDocumentPath()
            );
          }

          if (!bibliographyFile.isProject) {
            ensureBibliographyFileForDoc(tr, bibliographyFile.displayPath);
          }
        }
      }),
    );
  }
  return proceedWithInsert;
}
export function performCiteCompletionReplacement(tr: Transaction, pos: number, replacement: ProsemirrorNode | string) {
  // perform replacement
  performCompletionReplacement(tr, pos, replacement);

  // find the range of the cite and fixup marks
  const range = getMarkRange(tr.selection.$head, tr.doc.type.schema.marks.cite);
  if (range) {
    encloseInCiteMark(tr, range.from, range.to);
  }
}

export default extension;
