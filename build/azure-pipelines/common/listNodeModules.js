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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlzdE5vZGVNb2R1bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGlzdE5vZGVNb2R1bGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7QUFFaEcseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUU3QixJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtJQUM5QixPQUFPLENBQUMsS0FBSyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7SUFDNUQsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0NBQ2pCO0FBRUQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLENBQUM7QUFFL0MsU0FBUyxvQkFBb0IsQ0FBQyxRQUFnQixFQUFFLGFBQXNCLEVBQUUsTUFBZ0I7SUFDdkYsTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQzFELEtBQUssTUFBTSxLQUFLLElBQUksT0FBTyxFQUFFO1FBQzVCLE1BQU0sU0FBUyxHQUFHLEdBQUcsUUFBUSxJQUFJLEtBQUssRUFBRSxDQUFDO1FBRXpDLElBQUksNENBQTRDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFO1lBQ2pFLFNBQVM7U0FDVDtRQUVELElBQUksSUFBYyxDQUFDO1FBQ25CLElBQUk7WUFDSCxJQUFJLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1NBQy9DO1FBQUMsT0FBTyxHQUFHLEVBQUU7WUFDYixTQUFTO1NBQ1Q7UUFFRCxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRTtZQUN2QixvQkFBb0IsQ0FBQyxTQUFTLEVBQUUsYUFBYSxJQUFJLENBQUMsS0FBSyxLQUFLLGNBQWMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1NBQ3JGO2FBQU07WUFDTixJQUFJLGFBQWEsRUFBRTtnQkFDbEIsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDakM7U0FDRDtLQUNEO0FBQ0YsQ0FBQztBQUVELE1BQU0sTUFBTSxHQUFhLEVBQUUsQ0FBQztBQUM1QixvQkFBb0IsQ0FBQyxFQUFFLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQ3hDLEVBQUUsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDIn0=