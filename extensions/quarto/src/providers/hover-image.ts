/*
 * hover-image.ts
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

import * as path from "path";
import * as fs from "fs";
import {
  Hover,
  Position,
  TextDocument,
  Range,
  MarkdownString,
  workspace,
  Uri,
} from "vscode";
import { PngImage } from "core";

const kImagePattern =
  /(!\[((!\[[^\]]*?\]\(\s*)([^\s\(\)]+?)\s*\)\]|(?:\\\]|[^\]])*\])\(\s*)(([^\s\(\)]|\([^\s\(\)]*?\))+)\s*(".*?")?\)/g;

export async function imageHover(
  doc: TextDocument,
  pos: Position
): Promise<Hover | null> {
  const lineRange = new Range(pos.line, 0, pos.line + 1, 0);
  const line = doc.getText(lineRange).trimEnd();
  for (const match of line.matchAll(kImagePattern)) {
    if (
      match.index !== undefined &&
      pos.character >= match.index &&
      pos.character < match.index + match[0].length
    ) {
      // path can be either document relative or workspace rooted w/ "/"
      let imagePath = match[5];
      if (imagePath.startsWith("/") && workspace.workspaceFolders) {
        for (const wsFolder of workspace.workspaceFolders) {
          const wsRoot = wsFolder.uri.fsPath;
          imagePath = path.join(wsRoot, imagePath.slice(1));
          break;
        }
      } else {
        imagePath = path.join(path.dirname(doc.uri.fsPath), imagePath);
      }
      imagePath = path.normalize(imagePath);
      if (fs.existsSync(imagePath)) {
        const width = await imageWidth(imagePath);
        const widthAttrib = width ? `width="${width}"` : "";
        const content = new MarkdownString(
          `<img src="${imagePath}" ${widthAttrib}/>`
        );
        content.supportHtml = true;
        content.isTrusted = true;
        return {
          contents: [content],
          range: lineRange,
        };
      }
    }
  }

  return null;
}

interface ImageWidthInfo {
  file: string;
  mtime: number;
  width: number;
}

const kMaxImageWidth = 750;

const imageWidthCache = new Map<string, ImageWidthInfo>();

async function imageWidth(file: string) {
  if (file.toLowerCase().endsWith(".png")) {
    try {
      // file uri and modification time
      const fileUri = Uri.file(file);
      const mtime = await (await workspace.fs.stat(fileUri)).mtime;

      // can we serve the width from the cache?
      const cachedWidth = imageWidthCache.get(file);
      if (cachedWidth && cachedWidth.mtime === mtime) {
        return cachedWidth.width;
      }

      // crack the image header and see if we need to adjust the width
      const imageData = await workspace.fs.readFile(Uri.file(file));
      const pngImage = new PngImage(imageData);
      let width = pngImage.width;
      if (pngImage.isHighDpi) {
        width = Math.round(width / 2);
      }
      width = Math.min(width, kMaxImageWidth);
      imageWidthCache.set(file, { file, mtime, width });
      return width;
    } catch (error) {
      console.log(error);
      return null;
    }
  } else {
    return null;
  }
}
