"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-check
const path = require("path");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const yarn = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
const rootDir = path.resolve(__dirname, '..', '..');
function runProcess(command, args = []) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, { cwd: rootDir, stdio: 'inherit', env: process.env });
        child.on('exit', err => !err ? resolve() : process.exit(err ?? 1));
        child.on('error', reject);
    });
}
async function exists(subdir) {
    try {
        await fs_1.promises.stat(path.join(rootDir, subdir));
        return true;
    }
    catch {
        return false;
    }
}
async function ensureNodeModules() {
    if (!(await exists('node_modules'))) {
        await runProcess(yarn);
    }
}
async function getElectron() {
    await runProcess(yarn, ['electron']);
}
async function ensureCompiled() {
    if (!(await exists('out'))) {
        await runProcess(yarn, ['compile']);
    }
}
async function main() {
    await ensureNodeModules();
    await getElectron();
    await ensureCompiled();
    // Can't require this until after dependencies are installed
    const { getBuiltInExtensions } = require('./builtInExtensions');
    await getBuiltInExtensions();
}
if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlTGF1bmNoLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicHJlTGF1bmNoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O2dHQUdnRzs7QUFFaEcsWUFBWTtBQUVaLDZCQUE2QjtBQUM3QixpREFBc0M7QUFDdEMsMkJBQW9DO0FBRXBDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxRQUFRLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztBQUNoRSxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFFcEQsU0FBUyxVQUFVLENBQUMsT0FBZSxFQUFFLE9BQThCLEVBQUU7SUFDcEUsT0FBTyxJQUFJLE9BQU8sQ0FBTyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUM1QyxNQUFNLEtBQUssR0FBRyxJQUFBLHFCQUFLLEVBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDekYsS0FBSyxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbkUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDM0IsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsS0FBSyxVQUFVLE1BQU0sQ0FBQyxNQUFjO0lBQ25DLElBQUk7UUFDSCxNQUFNLGFBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUMxQyxPQUFPLElBQUksQ0FBQztLQUNaO0lBQUMsTUFBTTtRQUNQLE9BQU8sS0FBSyxDQUFDO0tBQ2I7QUFDRixDQUFDO0FBRUQsS0FBSyxVQUFVLGlCQUFpQjtJQUMvQixJQUFJLENBQUMsQ0FBQyxNQUFNLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQyxFQUFFO1FBQ3BDLE1BQU0sVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ3ZCO0FBQ0YsQ0FBQztBQUVELEtBQUssVUFBVSxXQUFXO0lBQ3pCLE1BQU0sVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFDdEMsQ0FBQztBQUVELEtBQUssVUFBVSxjQUFjO0lBQzVCLElBQUksQ0FBQyxDQUFDLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUU7UUFDM0IsTUFBTSxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztLQUNwQztBQUNGLENBQUM7QUFFRCxLQUFLLFVBQVUsSUFBSTtJQUNsQixNQUFNLGlCQUFpQixFQUFFLENBQUM7SUFDMUIsTUFBTSxXQUFXLEVBQUUsQ0FBQztJQUNwQixNQUFNLGNBQWMsRUFBRSxDQUFDO0lBRXZCLDREQUE0RDtJQUM1RCxNQUFNLEVBQUUsb0JBQW9CLEVBQUUsR0FBRyxPQUFPLENBQUMscUJBQXFCLENBQUMsQ0FBQztJQUNoRSxNQUFNLG9CQUFvQixFQUFFLENBQUM7QUFDOUIsQ0FBQztBQUVELElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUU7SUFDNUIsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1FBQ2xCLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNqQixDQUFDLENBQUMsQ0FBQztDQUNIIn0=