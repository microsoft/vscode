/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { constants as FSConstants, promises as FSPromises } from 'fs';
import { createInterface as readLines } from 'readline';
import * as Platform from '../common/platform.js';
export async function getOSReleaseInfo(errorLogger) {
    if (Platform.isMacintosh || Platform.isWindows) {
        return;
    }
    // Extract release information on linux based systems
    // using the identifiers specified in
    // https://www.freedesktop.org/software/systemd/man/os-release.html
    let handle;
    for (const filePath of ['/etc/os-release', '/usr/lib/os-release', '/etc/lsb-release']) {
        try {
            handle = await FSPromises.open(filePath, FSConstants.R_OK);
            break;
        }
        catch (err) { }
    }
    if (!handle) {
        errorLogger('Unable to retrieve release information from known identifier paths.');
        return;
    }
    try {
        const osReleaseKeys = new Set([
            'ID',
            'DISTRIB_ID',
            'ID_LIKE',
            'VERSION_ID',
            'DISTRIB_RELEASE',
        ]);
        const releaseInfo = {
            id: 'unknown'
        };
        for await (const line of readLines({ input: handle.createReadStream(), crlfDelay: Infinity })) {
            if (!line.includes('=')) {
                continue;
            }
            const key = line.split('=')[0].toUpperCase().trim();
            if (osReleaseKeys.has(key)) {
                const value = line.split('=')[1].replace(/"/g, '').toLowerCase().trim();
                if (key === 'ID' || key === 'DISTRIB_ID') {
                    releaseInfo.id = value;
                }
                else if (key === 'ID_LIKE') {
                    releaseInfo.id_like = value;
                }
                else if (key === 'VERSION_ID' || key === 'DISTRIB_RELEASE') {
                    releaseInfo.version_id = value;
                }
            }
        }
        return releaseInfo;
    }
    catch (err) {
        errorLogger(err);
    }
    finally {
        await handle.close();
    }
    return;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3NSZWxlYXNlSW5mby5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2Uvbm9kZS9vc1JlbGVhc2VJbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxTQUFTLElBQUksV0FBVyxFQUFFLFFBQVEsSUFBSSxVQUFVLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDdEUsT0FBTyxFQUFFLGVBQWUsSUFBSSxTQUFTLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDeEQsT0FBTyxLQUFLLFFBQVEsTUFBTSx1QkFBdUIsQ0FBQztBQVFsRCxNQUFNLENBQUMsS0FBSyxVQUFVLGdCQUFnQixDQUFDLFdBQTRDO0lBQ2xGLElBQUksUUFBUSxDQUFDLFdBQVcsSUFBSSxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDaEQsT0FBTztJQUNSLENBQUM7SUFFRCxxREFBcUQ7SUFDckQscUNBQXFDO0lBQ3JDLG1FQUFtRTtJQUNuRSxJQUFJLE1BQXlDLENBQUM7SUFDOUMsS0FBSyxNQUFNLFFBQVEsSUFBSSxDQUFDLGlCQUFpQixFQUFFLHFCQUFxQixFQUFFLGtCQUFrQixDQUFDLEVBQUUsQ0FBQztRQUN2RixJQUFJLENBQUM7WUFDSixNQUFNLEdBQUcsTUFBTSxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0QsTUFBTTtRQUNQLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNsQixDQUFDO0lBRUQsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2IsV0FBVyxDQUFDLHFFQUFxRSxDQUFDLENBQUM7UUFDbkYsT0FBTztJQUNSLENBQUM7SUFFRCxJQUFJLENBQUM7UUFDSixNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsQ0FBQztZQUM3QixJQUFJO1lBQ0osWUFBWTtZQUNaLFNBQVM7WUFDVCxZQUFZO1lBQ1osaUJBQWlCO1NBQ2pCLENBQUMsQ0FBQztRQUNILE1BQU0sV0FBVyxHQUFnQjtZQUNoQyxFQUFFLEVBQUUsU0FBUztTQUNiLENBQUM7UUFFRixJQUFJLEtBQUssRUFBRSxNQUFNLElBQUksSUFBSSxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixFQUFFLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUMvRixJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN6QixTQUFTO1lBQ1YsQ0FBQztZQUNELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDcEQsSUFBSSxhQUFhLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzVCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDeEUsSUFBSSxHQUFHLEtBQUssSUFBSSxJQUFJLEdBQUcsS0FBSyxZQUFZLEVBQUUsQ0FBQztvQkFDMUMsV0FBVyxDQUFDLEVBQUUsR0FBRyxLQUFLLENBQUM7Z0JBQ3hCLENBQUM7cUJBQU0sSUFBSSxHQUFHLEtBQUssU0FBUyxFQUFFLENBQUM7b0JBQzlCLFdBQVcsQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO2dCQUM3QixDQUFDO3FCQUFNLElBQUksR0FBRyxLQUFLLFlBQVksSUFBSSxHQUFHLEtBQUssaUJBQWlCLEVBQUUsQ0FBQztvQkFDOUQsV0FBVyxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7Z0JBQ2hDLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sV0FBVyxDQUFDO0lBQ3BCLENBQUM7SUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBQ2QsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2xCLENBQUM7WUFBUyxDQUFDO1FBQ1YsTUFBTSxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDdEIsQ0FBQztJQUVELE9BQU87QUFDUixDQUFDIn0=