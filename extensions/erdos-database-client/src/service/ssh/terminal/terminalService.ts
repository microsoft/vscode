import { SSHConfig } from "../../../model/interface/sshConfig";

export interface TerminalService {
    openPath(sshConfig: SSHConfig, fullPath: string): void;
    openMethod(sshConfig: SSHConfig): void;
}