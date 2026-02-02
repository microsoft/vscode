"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
if (process.argv.length !== 3) {
    console.error('Usage: node listNodeModules.js OUTPUT_FILE');
    process.exit(-1);
}
const ROOT = path.join(__dirname, '../../../');
function findNodeModulesFiles(location, inNodeModules, result) {
    const entries = fs.readdirSync(path.join(ROOT, location));
    for (const entry of entries) {
        const entryPath = `${location}/${entry}`;
        if (/(^\/out)|(^\/src$)|(^\/.git$)|(^\/.build$)/.test(entryPath)) {
            continue;
        }
        let stat;
        try {
            stat = fs.statSync(path.join(ROOT, entryPath));
        }
        catch (err) {
            continue;
        }
        if (stat.isDirectory()) {
            findNodeModulesFiles(entryPath, inNodeModules || (entry === 'node_modules'), result);
        }
        else {
            if (inNodeModules) {
                result.push(entryPath.substr(1));
            }
        }
    }
}
const result = [];
findNodeModulesFiles('', false, result);
fs.writeFileSync(process.argv[2], result.join('\n') + '\n');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlzdE5vZGVNb2R1bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGlzdE5vZGVNb2R1bGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7QUFFaEcseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUU3QixJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO0lBQy9CLE9BQU8sQ0FBQyxLQUFLLENBQUMsNENBQTRDLENBQUMsQ0FBQztJQUM1RCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDbEIsQ0FBQztBQUVELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0FBRS9DLFNBQVMsb0JBQW9CLENBQUMsUUFBZ0IsRUFBRSxhQUFzQixFQUFFLE1BQWdCO0lBQ3ZGLE1BQU0sT0FBTyxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUMxRCxLQUFLLE1BQU0sS0FBSyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzdCLE1BQU0sU0FBUyxHQUFHLEdBQUcsUUFBUSxJQUFJLEtBQUssRUFBRSxDQUFDO1FBRXpDLElBQUksNENBQTRDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDbEUsU0FBUztRQUNWLENBQUM7UUFFRCxJQUFJLElBQWMsQ0FBQztRQUNuQixJQUFJLENBQUM7WUFDSixJQUFJLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQ2hELENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2QsU0FBUztRQUNWLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDO1lBQ3hCLG9CQUFvQixDQUFDLFNBQVMsRUFBRSxhQUFhLElBQUksQ0FBQyxLQUFLLEtBQUssY0FBYyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDdEYsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLGFBQWEsRUFBRSxDQUFDO2dCQUNuQixNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQyxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO0FBQzVCLG9CQUFvQixDQUFDLEVBQUUsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDeEMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMifQ==