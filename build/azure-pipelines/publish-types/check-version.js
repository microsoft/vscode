"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const cp = require("child_process");
let tag = '';
try {
    tag = cp
        .execSync('git describe --tags `git rev-list --tags --max-count=1`')
        .toString()
        .trim();
    if (!isValidTag(tag)) {
        throw Error(`Invalid tag ${tag}`);
    }
}
catch (err) {
    console.error(err);
    console.error('Failed to update types');
    process.exit(1);
}
function isValidTag(t) {
    if (t.split('.').length !== 3) {
        return false;
    }
    const [major, minor, bug] = t.split('.');
    // Only release for tags like 1.34.0
    if (bug !== '0') {
        return false;
    }
    if (isNaN(parseInt(major, 10)) || isNaN(parseInt(minor, 10))) {
        return false;
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hlY2stdmVyc2lvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNoZWNrLXZlcnNpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyxvQ0FBb0M7QUFFcEMsSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQ2IsSUFBSSxDQUFDO0lBQ0osR0FBRyxHQUFHLEVBQUU7U0FDTixRQUFRLENBQUMseURBQXlELENBQUM7U0FDbkUsUUFBUSxFQUFFO1NBQ1YsSUFBSSxFQUFFLENBQUM7SUFFVCxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDdEIsTUFBTSxLQUFLLENBQUMsZUFBZSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQ25DLENBQUM7QUFDRixDQUFDO0FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztJQUNkLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDbkIsT0FBTyxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0lBQ3hDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDakIsQ0FBQztBQUVELFNBQVMsVUFBVSxDQUFDLENBQVM7SUFDNUIsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUMvQixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRCxNQUFNLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBRXpDLG9DQUFvQztJQUNwQyxJQUFJLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQztRQUNqQixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRCxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQzlELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVELE9BQU8sSUFBSSxDQUFDO0FBQ2IsQ0FBQyJ9