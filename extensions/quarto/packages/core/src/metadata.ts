/*
 * metadata.ts
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


export type Metadata = {
  [key: string]: unknown;
};


export function metadataFromKeyvalueText(
  text: string,
  separator: " " | "\n",
): Metadata {
  // if the separator is a space then convert unquoted spaces to newline
  if (separator === " ") {
    let convertedText = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      let ch = text.charAt(i);
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === " " && !inQuotes) {
        ch = "\n";
      }
      convertedText += ch;
    }
    text = convertedText;
  }

  const lines = text.trim().split("\n");
  const metadata: Metadata = {};
  lines.forEach((line) => {
    const parts = line.trim().split("=");
    metadata[parts[0]] = (parts[1] || "").replace(/^"/, "").replace(/"$/, "");
  });
  return metadata;
}

