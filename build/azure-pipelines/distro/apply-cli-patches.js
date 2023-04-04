"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const cp = require("child_process");
function log(...args) {
    console.log(`[${new Date().toLocaleTimeString('en', { hour12: false })}]`, '[distro]', ...args);
}
log(`Applying CLI patches...`);
const basePath = `.build/distro/cli-patches`;
for (const patch of fs.readdirSync(basePath)) {
    cp.execSync(`git apply --ignore-whitespace --ignore-space-change ${basePath}/${patch}`, { stdio: 'inherit' });
    log('Applied CLI patch:', patch, '✔︎');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwbHktY2xpLXBhdGNoZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhcHBseS1jbGktcGF0Y2hlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7O0FBRWhHLHlCQUF5QjtBQUN6QixvQ0FBb0M7QUFFcEMsU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFXO0lBQzFCLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLElBQUksRUFBRSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQyxHQUFHLEVBQUUsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7QUFDakcsQ0FBQztBQUVELEdBQUcsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO0FBRS9CLE1BQU0sUUFBUSxHQUFHLDJCQUEyQixDQUFDO0FBRTdDLEtBQUssTUFBTSxLQUFLLElBQUksRUFBRSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsRUFBRTtJQUM3QyxFQUFFLENBQUMsUUFBUSxDQUFDLHVEQUF1RCxRQUFRLElBQUksS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztJQUM5RyxHQUFHLENBQUMsb0JBQW9CLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0NBQ3ZDIn0=