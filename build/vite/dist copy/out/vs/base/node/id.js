/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { networkInterfaces } from 'os';
import { TernarySearchTree } from '../common/ternarySearchTree.js';
import * as uuid from '../common/uuid.js';
import { getMac } from './macAddress.js';
import { isWindows } from '../common/platform.js';
// http://www.techrepublic.com/blog/data-center/mac-address-scorecard-for-common-virtual-machine-platforms/
// VMware ESX 3, Server, Workstation, Player	00-50-56, 00-0C-29, 00-05-69
// Microsoft Hyper-V, Virtual Server, Virtual PC	00-03-FF
// Parallels Desktop, Workstation, Server, Virtuozzo	00-1C-42
// Virtual Iron 4	00-0F-4B
// Red Hat Xen	00-16-3E
// Oracle VM	00-16-3E
// XenSource	00-16-3E
// Novell Xen	00-16-3E
// Sun xVM VirtualBox	08-00-27
export const virtualMachineHint = new class {
    _isVirtualMachineMacAddress(mac) {
        if (!this._virtualMachineOUIs) {
            this._virtualMachineOUIs = TernarySearchTree.forStrings();
            // dash-separated
            this._virtualMachineOUIs.set('00-50-56', true);
            this._virtualMachineOUIs.set('00-0C-29', true);
            this._virtualMachineOUIs.set('00-05-69', true);
            this._virtualMachineOUIs.set('00-03-FF', true);
            this._virtualMachineOUIs.set('00-1C-42', true);
            this._virtualMachineOUIs.set('00-16-3E', true);
            this._virtualMachineOUIs.set('08-00-27', true);
            // colon-separated
            this._virtualMachineOUIs.set('00:50:56', true);
            this._virtualMachineOUIs.set('00:0C:29', true);
            this._virtualMachineOUIs.set('00:05:69', true);
            this._virtualMachineOUIs.set('00:03:FF', true);
            this._virtualMachineOUIs.set('00:1C:42', true);
            this._virtualMachineOUIs.set('00:16:3E', true);
            this._virtualMachineOUIs.set('08:00:27', true);
        }
        return !!this._virtualMachineOUIs.findSubstr(mac);
    }
    value() {
        if (this._value === undefined) {
            let vmOui = 0;
            let interfaceCount = 0;
            const interfaces = networkInterfaces();
            for (const name in interfaces) {
                const networkInterface = interfaces[name];
                if (networkInterface) {
                    for (const { mac, internal } of networkInterface) {
                        if (!internal) {
                            interfaceCount += 1;
                            if (this._isVirtualMachineMacAddress(mac.toUpperCase())) {
                                vmOui += 1;
                            }
                        }
                    }
                }
            }
            this._value = interfaceCount > 0
                ? vmOui / interfaceCount
                : 0;
        }
        return this._value;
    }
};
let machineId;
export async function getMachineId(errorLogger) {
    if (!machineId) {
        machineId = (async () => {
            const id = await getMacMachineId(errorLogger);
            return id || uuid.generateUuid(); // fallback, generate a UUID
        })();
    }
    return machineId;
}
async function getMacMachineId(errorLogger) {
    try {
        const crypto = await import('crypto');
        const macAddress = getMac();
        return crypto.createHash('sha256').update(macAddress, 'utf8').digest('hex');
    }
    catch (err) {
        errorLogger(err);
        return undefined;
    }
}
const SQM_KEY = 'Software\\Microsoft\\SQMClient';
export async function getSqmMachineId(errorLogger) {
    if (isWindows) {
        const Registry = await import('@vscode/windows-registry');
        try {
            return Registry.GetStringRegKey('HKEY_LOCAL_MACHINE', SQM_KEY, 'MachineId') || '';
        }
        catch (err) {
            errorLogger(err);
            return '';
        }
    }
    return '';
}
export async function getDevDeviceId(errorLogger) {
    try {
        const deviceIdPackage = await import('@vscode/deviceid');
        const id = await deviceIdPackage.getDeviceId();
        return id;
    }
    catch (err) {
        errorLogger(err);
        return uuid.generateUuid();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL25vZGUvaWQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3ZDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ25FLE9BQU8sS0FBSyxJQUFJLE1BQU0sbUJBQW1CLENBQUM7QUFDMUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3pDLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUVsRCwyR0FBMkc7QUFDM0cseUVBQXlFO0FBQ3pFLHlEQUF5RDtBQUN6RCw2REFBNkQ7QUFDN0QsMEJBQTBCO0FBQzFCLHVCQUF1QjtBQUN2QixxQkFBcUI7QUFDckIscUJBQXFCO0FBQ3JCLHNCQUFzQjtBQUN0Qiw4QkFBOEI7QUFDOUIsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQXdCLElBQUk7SUFLbEQsMkJBQTJCLENBQUMsR0FBVztRQUM5QyxJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLG1CQUFtQixHQUFHLGlCQUFpQixDQUFDLFVBQVUsRUFBVyxDQUFDO1lBRW5FLGlCQUFpQjtZQUNqQixJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMvQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMvQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMvQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLFVBQVUs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