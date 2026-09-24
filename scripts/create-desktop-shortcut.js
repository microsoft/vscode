const { execSync } = require('child_process');
const fs = require('fs');

const vbsContent = [
  'Set oWS = WScript.CreateObject("WScript.Shell")',
  'sLinkFile = "C:\\Users\\sn1090634\\Desktop\\JS Studio.lnk"',
  'Set oLink = oWS.CreateShortcut(sLinkFile)',
  'oLink.TargetPath = "C:\\Users\\sn1090634\\Desktop\\projetos\\vscode\\launch-scratchpad.bat"',
  'oLink.WorkingDirectory = "C:\\Users\\sn1090634\\Desktop\\projetos\\vscode"',
  'oLink.IconLocation = "C:\\Users\\sn1090634\\Desktop\\projetos\\vscode\\resources\\logo.ico"',
  'oLink.Description = "JS Studio (RunJS OSS) Playground"',
  'oLink.WindowStyle = 7',
  'oLink.Save'
].join('\r\n');

fs.writeFileSync('create_shortcut.vbs', vbsContent);
execSync('cscript //nologo create_shortcut.vbs');
fs.unlinkSync('create_shortcut.vbs');
console.log('Shortcut created successfully on Desktop: C:\\Users\\sn1090634\\Desktop\\JS Studio.lnk');
