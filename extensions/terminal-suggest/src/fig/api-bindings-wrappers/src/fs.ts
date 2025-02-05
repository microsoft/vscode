import { fs as FileSystem } from "@aws/amazon-q-developer-cli-api-bindings";

export const fread = (path: string): Promise<string> =>
  FileSystem.read(path).then((out) => out ?? "");
