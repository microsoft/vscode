// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as crypto from "crypto";

export class Hash {
    /**
     * Creates a hash code from a string.
     */
    public static hashCode(s: string): string {
        return crypto
            .createHash("md5")
            .update(s)
            .digest("hex");
    }
}