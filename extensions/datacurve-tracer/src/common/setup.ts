// modified from pylint extension

import * as path from 'path';
import * as fs from 'fs-extra';

export interface IExtensionInfo {
  name: string;
  version: string;
}

export function loadServerDefaults(): IExtensionInfo {
  const packageJson = path.join(
    path.dirname(path.dirname(__dirname)),
    'package.json',
  );
  const content = fs.readFileSync(packageJson).toString();
  const config = JSON.parse(content);
  return config as IExtensionInfo;
}
