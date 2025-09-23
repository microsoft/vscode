/*
 * formatting.ts
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

export interface FormattingTag {
  open: string;
  close: string;
  verbatim: boolean;
}

// Maps formatting tags/marks to the LaTeX replacements
// When marks are applied to text nodes, these will be emitted in place of those marks
export const FormattingTags: { [key: string]: FormattingTag } = {
  strong: { open: '\\textbf{', close: '}', verbatim: false },
  em: { open: '\\emph{', close: '}', verbatim: false },
  sub: { open: '\\textsubscript{', close: '}', verbatim: false },
  sup: { open: '\\textsuperscript{', close: '}', verbatim: false },
  nocase: { open: '{{', close: '}}', verbatim: false },
  smallcaps: { open: '\\textsc{', close: '}', verbatim: false },
  enquote: { open: '\\enquote{', close: '}', verbatim: false },
  math: { open: '$', close: '$', verbatim: false },
  url: { open: '\\url{', close: '}', verbatim: true },
};
