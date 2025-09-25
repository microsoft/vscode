/*
 * postmessage.ts
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

import { JsonRpcPostMessageTarget } from "../../../core/src/jsonrpc.js";

export function windowJsonRpcPostMessageTarget(
  receiver: { postMessage: (data: unknown) => void | boolean } | Window, 
  source: Window
) : JsonRpcPostMessageTarget {
  if (receiver instanceof Window) {
    const windowReceiver = receiver;
    receiver = {
      postMessage: (data: unknown) => {
        windowReceiver.postMessage(data, { targetOrigin: "*" });
      }
    }
  }
  return {
    postMessage: (data: unknown) => {
      receiver.postMessage(data);
    },
    onMessage: (handler: (ev: MessageEvent) => void) => {
      const onMessage = (ev: MessageEvent) => {
        handler(ev.data);
      };
      source.addEventListener('message', onMessage);
      return () => {
        source.removeEventListener('message', onMessage);
      }
    }
  }
}
