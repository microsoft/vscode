#define LocalizedLanguageFile(Language = "") \
    DirExists(RepoDir + "\licenses") && Language != "" \
      ? ('; LicenseFile: "' + RepoDir + '\licenses\LICENSE-' + Language + '.txt"') \
      : '; LicenseFile: "' + RepoDir + '\LICENSE.txt"'

[Setup]
AppId={#AppId}
AppName={#NameLong}
AppVerName={#NameVersion}
AppPublisher=Microsoft Corporation
AppPublisherURL=https://code.visualstudio.com/
AppSupportURL=https://code.visualstudio.com/
AppUpdatesURL=https://code.visualstudio.com/
DefaultDirName={pf}\{#DirName}
DefaultGroupName={#NameLong}
AllowNoIcons=yes
OutputDir={#OutputDir}
OutputBaseFilename=VSCodeSetup
Compression=lzma
SolidCompression=yes
AppMutex={#AppMutex}
WizardImageFile={#RepoDir}\resources\win32\inno-big.bmp
WizardSmallImageFile={#RepoDir}\resources\win32\inno-small.bmp
SetupIconFile={#RepoDir}\resources\win32\code.ico
UninstallDisplayIcon={app}\{#ExeBasename}.exe
ChangesEnvironment=true
ChangesAssociations=true
MinVersion=6.1.7600
SourceDir={#SourceDir}
AppVersion={#Version}
VersionInfoVersion={#RawVersion}
ShowLanguageDialog=auto
ArchitecturesAllowed={#ArchitecturesAllowed}
ArchitecturesInstallIn64BitMode={#ArchitecturesInstallIn64BitMode}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl,{#RepoDir}\build\win32\i18n\messages.en.isl" {#LocalizedLanguageFile}
Name: "german"; MessagesFile: "compiler:Languages\German.isl,{#RepoDir}\build\win32\i18n\messages.de.isl" {#LocalizedLanguageFile("deu")}
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl,{#RepoDir}\build\win32\i18n\messages.es.isl" {#LocalizedLanguageFile("esp")}
Name: "french"; MessagesFile: "compiler:Languages\French.isl,{#RepoDir}\build\win32\i18n\messages.fr.isl" {#LocalizedLanguageFile("fra")}
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl,{#RepoDir}\build\win32\i18n\messages.it.isl" {#LocalizedLanguageFile("ita")}
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl,{#RepoDir}\build\win32\i18n\messages.ja.isl" {#LocalizedLanguageFile("jpn")}
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl,{#RepoDir}\build\win32\i18n\messages.ru.isl" {#LocalizedLanguageFile("rus")}
Name: "korean"; MessagesFile: "{#RepoDir}\build\win32\i18n\Default.ko.isl,{#RepoDir}\build\win32\i18n\messages.ko.isl" {#LocalizedLanguageFile("kor")}
Name: "simplifiedChinese"; MessagesFile: "{#RepoDir}\build\win32\i18n\Default.zh-cn.isl,{#RepoDir}\build\win32\i18n\messages.zh-cn.isl" {#LocalizedLanguageFile("chs")}
Name: "traditionalChinese"; MessagesFile: "{#RepoDir}\build\win32\i18n\Default.zh-tw.isl,{#RepoDir}\build\win32\i18n\messages.zh-tw.isl" {#LocalizedLanguageFile("cht")}

[InstallDelete]
Type: filesandordirs; Name: {app}\resources\app\out
Type: filesandordirs; Name: {app}\resources\app\plugins
Type: filesandordirs; Name: {app}\resources\app\extensions
Type: filesandordirs; Name: {app}\resources\app\node_modules
Type: files; Name: {app}\resources\app\Credits_45.0.2454.85.html

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 0,6.1
Name: "addcontextmenufiles"; Description: "{cm:AddContextMenuFiles,{#NameShort}}"; GroupDescription: "{cm:Other}"; Flags: unchecked
Name: "addcontextmenufolders"; Description: "{cm:AddContextMenuFolders,{#NameShort}}"; GroupDescription: "{cm:Other}"; Flags: unchecked
Name: "associatewithfiles"; Description: "{cm:AssociateWithFiles,{#NameShort}}"; GroupDescription: "{cm:Other}"; Flags: unchecked
Name: "addtopath"; Description: "{cm:AddToPath}"; GroupDescription: "{cm:Other}"
Name: "runcode"; Description: "{cm:RunAfter,{#NameShort}}"; GroupDescription: "{cm:Other}"; Check: WizardSilent

[Files]
Source: "*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#NameLong}"; Filename: "{app}\{#ExeBasename}.exe"; AppUserModelID: "{#AppUserId}"
Name: "{commondesktop}\{#NameLong}"; Filename: "{app}\{#ExeBasename}.exe"; Tasks: desktopicon; AppUserModelID: "{#AppUserId}"
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#NameLong}"; Filename: "{app}\{#ExeBasename}.exe"; Tasks: quicklaunchicon; AppUserModelID: "{#AppUserId}"

[Run]
Filename: "{app}\{#ExeBasename}.exe"; Description: "{cm:LaunchProgram,{#NameLong}}"; Tasks: runcode; Flags: nowait postinstall; Check: WizardSilent
Filename: "{app}\{#ExeBasename}.exe"; Description: "{cm:LaunchProgram,{#NameLong}}"; Flags: nowait postinstall; Check: WizardNotSilent

[Registry]
Root: HKCR; Subkey: ".ascx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".ascx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.ascx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ascx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,ASCX}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ascx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ascx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".asp\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".asp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.asp"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.asp"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,ASP}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.asp\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.asp\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".aspx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".aspx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.aspx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.aspx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,ASPX}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.aspx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.aspx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".bash\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".bash\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.bash"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bash"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Bash}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bash\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bash\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".bash_login\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".bash_login\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.bash_login"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bash_login"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Bash Login}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bash_login\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bash_login\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".bash_logout\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".bash_logout\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.bash_logout"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bash_logout"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Bash Logout}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bash_logout\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bash_logout\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".bash_profile\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".bash_profile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.bash_profile"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bash_profile"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Bash Profile}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bash_profile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bash_profile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".bashrc\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".bashrc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.bashrc"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bashrc"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Bash RC}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bashrc\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bashrc\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".bowerrc\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".bowerrc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.bowerrc"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bowerrc"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Bower RC}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bowerrc\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.bowerrc\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".c\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".c\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.c"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.c"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.c\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.c\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".cc\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".cc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cc"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cc"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C++}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cc\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cc\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".clj\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".clj\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.clj"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.clj"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Clojure}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.clj\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.clj\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".cljs\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".cljs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cljs"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cljs"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,ClojureScript}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cljs\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cljs\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".cljx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".cljx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cljx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cljx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,CLJX}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cljx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cljx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".clojure\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".clojure\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.clojure"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.clojure"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Clojure}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.clojure\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.clojure\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".code-workspace\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".code-workspace\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.code-workspace"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.code-workspace"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Code Workspace}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.code-workspace\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.code-workspace\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".coffee\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".coffee\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.coffee"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.coffee"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,CoffeeScript}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.coffee\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.coffee\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".config\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".config\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.config"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.config"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Configuration}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.config\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.config\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".cpp\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".cpp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cpp"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cpp"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C++}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cpp\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cpp\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".cs\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".cs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cs"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cs"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C#}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cs\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cs\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".cshtml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".cshtml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cshtml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cshtml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,CSHTML}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cshtml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cshtml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".csproj\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".csproj\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.csproj"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.csproj"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C# Project}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.csproj\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.csproj\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".css\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".css\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.css"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.css"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,CSS}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.css\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.css\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".csx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".csx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.csx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.csx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C# Script}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.csx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.csx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".ctp\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".ctp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.ctp"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ctp"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,CakePHP Template}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ctp\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ctp\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".cxx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".cxx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.cxx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cxx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C++}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cxx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.cxx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".dockerfile\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".dockerfile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.dockerfile"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.dockerfile"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Dockerfile}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.dockerfile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.dockerfile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".dot\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".dot\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.dot"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.dot"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Dot}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.dot\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.dot\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".dtd\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".dtd\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.dtd"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.dtd"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Document Type Definition}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.dtd\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.dtd\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".editorconfig\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".editorconfig\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.editorconfig"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.editorconfig"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Editor Config}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.editorconfig\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.editorconfig\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".edn\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".edn\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.edn"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.edn"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Extensible Data Notation}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.edn\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.edn\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".eyaml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".eyaml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.eyaml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.eyaml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Hiera Eyaml}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.eyaml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.eyaml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".eyml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".eyml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.eyml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.eyml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Hiera Eyaml}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.eyml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.eyml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".fs\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".fs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.fs"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.fs"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,F#}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.fs\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.fs\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".fsi\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".fsi\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.fsi"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.fsi"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,F# Signature}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.fsi\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.fsi\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".fsscript\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".fsscript\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.fsscript"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.fsscript"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,F# Script}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.fsscript\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.fsscript\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".fsx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".fsx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.fsx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.fsx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,F# Script}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.fsx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.fsx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".gemspec\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".gemspec\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.gemspec"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.gemspec"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Gemspec}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.gemspec\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.gemspec\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".gitattributes\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".gitattributes\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.gitattributes"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.gitattributes"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Git Attributes}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.gitattributes"; ValueType: string; ValueName: "AlwaysShowExt"; ValueData: ""; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.gitattributes\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.gitattributes\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".gitconfig\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".gitconfig\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.gitconfig"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.gitconfig"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Git Config}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.gitconfig"; ValueType: string; ValueName: "AlwaysShowExt"; ValueData: ""; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.gitconfig\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.gitconfig\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".gitignore\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".gitignore\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.gitignore"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.gitignore"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Git Ignore}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.gitignore"; ValueType: string; ValueName: "AlwaysShowExt"; ValueData: ""; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.gitignore\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.gitignore\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".go\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".go\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.go"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.go"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Go}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.go\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.go\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".h\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".h\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.h"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.h"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C Header}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.h\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.h\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".handlebars\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".handlebars\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.handlebars"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.handlebars"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Handlebars}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.handlebars\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.handlebars\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".hbs\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".hbs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.hbs"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.hbs"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Handlebars}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.hbs\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.hbs\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".hh\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".hh\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.hh"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.hh"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C++ Header}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.hh\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.hh\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".hpp\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".hpp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.hpp"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.hpp"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C++ Header}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.hpp\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.hpp\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".htm\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".htm\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.htm"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.htm"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,HTML}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.htm\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.htm\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".html\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".html\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.html"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.html"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,HTML}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.html\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.html\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".hxx\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".hxx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.hxx"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.hxx"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,C++ Header}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.hxx\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.hxx\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".ini\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".ini\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.ini"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ini"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,INI}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ini\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ini\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".jade\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".jade\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.jade"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jade"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Jade}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jade\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jade\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".jav\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".jav\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.jav"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jav"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Java}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jav\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jav\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".java\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".java\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.java"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.java"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Java}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.java\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.java\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".js\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".js\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.js"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.js"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,JavaScript}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.js\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.js\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".jscsrc\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".jscsrc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.jscsrc"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jscsrc"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,JSCS RC}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jscsrc\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jscsrc\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".jshintrc\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".jshintrc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.jshintrc"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jshintrc"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,JSHint RC}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jshintrc\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jshintrc\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".jshtm\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".jshtm\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.jshtm"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jshtm"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,JavaScript HTML Template}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jshtm\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jshtm\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".json\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".json\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.json"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.json"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,JSON}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.json\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.json\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".jsp\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".jsp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.jsp"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jsp"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Java Server Pages}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jsp\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.jsp\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".less\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".less\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.less"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.less"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,LESS}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.less\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.less\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".lua\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".lua\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.lua"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.lua"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Lua}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.lua\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.lua\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".m\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".m\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.m"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.m"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Objective C}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.m\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.m\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".makefile\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".makefile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.makefile"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.makefile"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Makefile}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.makefile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.makefile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".markdown\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".markdown\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.markdown"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.markdown"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.markdown\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.markdown\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".md\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".md\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.md"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.md"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.md\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.md\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".mdoc\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".mdoc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mdoc"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mdoc"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,MDoc}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mdoc\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mdoc\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".mdown\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".mdown\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mdown"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mdown"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mdown\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mdown\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".mdtext\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".mdtext\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mdtext"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mdtext"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mdtext\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mdtext\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".mdtxt\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".mdtxt\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mdtxt"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mdtxt"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mdtxt\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mdtxt\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".mdwn\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".mdwn\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mdwn"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mdwn"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mdwn\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mdwn\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".mkd\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".mkd\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mkd"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mkd"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mkd\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mkd\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".mkdn\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".mkdn\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mkdn"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mkdn"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Markdown}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mkdn\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mkdn\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".ml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".ml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.ml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,OCaml}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".mli\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".mli\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.mli"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mli"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,OCaml}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mli\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.mli\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".npmignore\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".npmignore\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.npmignore"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.npmignore"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,NPM Ignore}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.npmignore"; ValueType: string; ValueName: "AlwaysShowExt"; ValueData: ""; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.npmignore\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.npmignore\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".php\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".php\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.php"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.php"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,PHP}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.php\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.php\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".phtml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".phtml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.phtml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.phtml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,PHP HTML}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.phtml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.phtml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".pl\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".pl\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.pl"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pl"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pl\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pl\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".pl6\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".pl6\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.pl6"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pl6"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl 6}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pl6\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pl6\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".pm\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".pm\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.pm"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pm"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl Module}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pm\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pm\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".pm6\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".pm6\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.pm6"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pm6"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl 6 Module}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pm6\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pm6\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".pod\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".pod\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.pod"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pod"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl POD}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pod\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pod\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".pp\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".pp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.pp"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pp"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pp\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.pp\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".profile\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".profile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.profile"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.profile"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Profile}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.profile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.profile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".properties\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".properties\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.properties"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.properties"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Properties}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.properties\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.properties\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".ps1\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".ps1\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.ps1"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ps1"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,PowerShell}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ps1\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ps1\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".psd1\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".psd1\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.psd1"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.psd1"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,PowerShell Module Manifest}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.psd1\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.psd1\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".psgi\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".psgi\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.psgi"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.psgi"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl CGI}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.psgi\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.psgi\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".psm1\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".psm1\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.psm1"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.psm1"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,PowerShell Module}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.psm1\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.psm1\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".py\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".py\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.py"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.py"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Python}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.py\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.py\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".r\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".r\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.r"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.r"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,R}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.r\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.r\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".rb\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".rb\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.rb"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.rb"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Ruby}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.rb\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.rb\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".rhistory\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".rhistory\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.rhistory"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.rhistory"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,R History}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.rhistory\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.rhistory\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".rprofile\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".rprofile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.rprofile"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.rprofile"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,R Profile}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.rprofile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.rprofile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".rs\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".rs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.rs"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.rs"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Rust}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.rs\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.rs\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".rt\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".rt\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.rt"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.rt"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Rich Text}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.rt\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.rt\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".scss\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".scss\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.scss"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.scss"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Sass}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.scss\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.scss\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".sh\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".sh\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.sh"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.sh"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,SH}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.sh\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.sh\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".shtml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".shtml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.shtml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.shtml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,SHTML}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.shtml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.shtml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".sql\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".sql\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.sql"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.sql"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,SQL}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.sql\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.sql\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".svg\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".svg\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.svg"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.svg"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,SVG}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.svg\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.svg\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".svgz\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".svgz\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.svgz"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.svgz"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,SVGZ}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.svgz\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.svgz\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".t\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".t\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.t"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.t"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Perl}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.t\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.t\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".tex\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".tex\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.tex"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.tex"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,LaTeX}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.tex\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.tex\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".ts\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".ts\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.ts"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ts"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,TypeScript}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ts\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.ts\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".txt\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".txt\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.txt"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.txt"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Text}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.txt\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.txt\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".vb\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".vb\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.vb"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.vb"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Visual Basic}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.vb\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.vb\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".wxi\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".wxi\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.wxi"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.wxi"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,WiX Include}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.wxi\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.wxi\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".wxl\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".wxl\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.wxl"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.wxl"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,WiX Localization}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.wxl\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.wxl\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".wxs\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".wxs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.wxs"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.wxs"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,WiX}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.wxs\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.wxs\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".xaml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".xaml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.xaml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.xaml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,XAML}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.xaml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.xaml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".xml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".xml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.xml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.xml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,XML}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.xml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.xml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".yaml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".yaml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.yaml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.yaml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Yaml}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.yaml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.yaml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".yml\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".yml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.yml"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.yml"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,Yaml}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.yml\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.yml\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: ".zsh\OpenWithProgids"; ValueType: none; ValueName: "{#RegValueName}"; Flags: deletevalue uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: ".zsh\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}.zsh"; ValueData: ""; Flags: uninsdeletevalue; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.zsh"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,ZSH}"; Flags: uninsdeletekey; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.zsh\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"; Tasks: associatewithfiles
Root: HKCR; Subkey: "{#RegValueName}.zsh\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: associatewithfiles

Root: HKCR; Subkey: "{#RegValueName}SourceFile"; ValueType: string; ValueName: ""; ValueData: "{cm:SourceFile,{#NameLong}}"; Flags: uninsdeletekey
Root: HKCR; Subkey: "{#RegValueName}SourceFile\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"
Root: HKCR; Subkey: "{#RegValueName}SourceFile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""

Root: HKCR; Subkey: "Applications\{#ExeBasename}.exe"; ValueType: none; ValueName: ""; Flags: uninsdeletekey
Root: HKCR; Subkey: "Applications\{#ExeBasename}.exe\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"
Root: HKCR; Subkey: "Applications\{#ExeBasename}.exe\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""

Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}\bin"; Tasks: addtopath; Check: NeedsAddPath(ExpandConstant('{app}\bin'))

Root: HKCU; Subkey: "SOFTWARE\Classes\*\shell\{#RegValueName}"; ValueType: expandsz; ValueName: ""; ValueData: "Open with {#ShellNameShort}"; Tasks: addcontextmenufiles; Flags: uninsdeletekey
Root: HKCU; Subkey: "SOFTWARE\Classes\*\shell\{#RegValueName}"; ValueType: expandsz; ValueName: "Icon"; ValueData: "{app}\{#ExeBasename}.exe"; Tasks: addcontextmenufiles
Root: HKCU; Subkey: "SOFTWARE\Classes\*\shell\{#RegValueName}\command"; ValueType: expandsz; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: addcontextmenufiles
Root: HKCU; Subkey: "SOFTWARE\Classes\directory\shell\{#RegValueName}"; ValueType: expandsz; ValueName: ""; ValueData: "Open with {#ShellNameShort}"; Tasks: addcontextmenufolders; Flags: uninsdeletekey
Root: HKCU; Subkey: "SOFTWARE\Classes\directory\shell\{#RegValueName}"; ValueType: expandsz; ValueName: "Icon"; ValueData: "{app}\{#ExeBasename}.exe"; Tasks: addcontextmenufolders
Root: HKCU; Subkey: "SOFTWARE\Classes\directory\shell\{#RegValueName}\command"; ValueType: expandsz; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%V"""; Tasks: addcontextmenufolders
Root: HKCU; Subkey: "SOFTWARE\Classes\directory\background\shell\{#RegValueName}"; ValueType: expandsz; ValueName: ""; ValueData: "Open with {#ShellNameShort}"; Tasks: addcontextmenufolders; Flags: uninsdeletekey
Root: HKCU; Subkey: "SOFTWARE\Classes\directory\background\shell\{#RegValueName}"; ValueType: expandsz; ValueName: "Icon"; ValueData: "{app}\{#ExeBasename}.exe"; Tasks: addcontextmenufolders
Root: HKCU; Subkey: "SOFTWARE\Classes\directory\background\shell\{#RegValueName}\command"; ValueType: expandsz; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%V"""; Tasks: addcontextmenufolders
Root: HKCU; Subkey: "SOFTWARE\Classes\Drive\shell\{#RegValueName}"; ValueType: expandsz; ValueName: ""; ValueData: "Open with {#ShellNameShort}"; Tasks: addcontextmenufolders; Flags: uninsdeletekey
Root: HKCU; Subkey: "SOFTWARE\Classes\Drive\shell\{#RegValueName}"; ValueType: expandsz; ValueName: "Icon"; ValueData: "{app}\{#ExeBasename}.exe"; Tasks: addcontextmenufolders
Root: HKCU; Subkey: "SOFTWARE\Classes\Drive\shell\{#RegValueName}\command"; ValueType: expandsz; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%V"""; Tasks: addcontextmenufolders

[Code]
// Don't allow installing conflicting architectures
function InitializeSetup(): Boolean;
var
  RegKey: String;
  ThisArch: String;
  AltArch: String;
begin
  Result := True;

  if IsWin64 then begin
    RegKey := 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\' + copy('{#IncompatibleAppId}', 2, 38) + '_is1';

    if '{#Arch}' = 'ia32' then begin
      Result := not RegKeyExists(HKLM64, RegKey);
      ThisArch := '32';
      AltArch := '64';
    end else begin
      Result := not RegKeyExists(HKLM32, RegKey);
      ThisArch := '64';
      AltArch := '32';
    end;

    if not Result then begin
      MsgBox('Please uninstall the ' + AltArch + '-bit version of {#NameShort} before installing this ' + ThisArch + '-bit version.', mbInformation, MB_OK);
    end;
  end;
end;

function WizardNotSilent(): Boolean;
begin
  Result := not WizardSilent();
end;

// http://stackoverflow.com/a/23838239/261019
procedure Explode(var Dest: TArrayOfString; Text: String; Separator: String);
var
  i, p: Integer;
begin
  i := 0;
  repeat
    SetArrayLength(Dest, i+1);
    p := Pos(Separator,Text);
    if p > 0 then begin
      Dest[i] := Copy(Text, 1, p-1);
      Text := Copy(Text, p + Length(Separator), Length(Text));
      i := i + 1;
    end else begin
      Dest[i] := Text;
      Text := '';
    end;
  until Length(Text)=0;
end;

function NeedsAddPath(Param: string): boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath)
  then begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + Param + ';', ';' + OrigPath + ';') = 0;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Path: string;
  VSCodePath: string;
  Parts: TArrayOfString;
  NewPath: string;
  i: Integer;
begin
  if not CurUninstallStep = usUninstall then begin
    exit;
  end;
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', Path)
  then begin
    exit;
  end;
  NewPath := '';
  VSCodePath := ExpandConstant('{app}\bin')
  Explode(Parts, Path, ';');
  for i:=0 to GetArrayLength(Parts)-1 do begin
    if CompareText(Parts[i], VSCodePath) <> 0 then begin
      NewPath := NewPath + Parts[i];

      if i < GetArrayLength(Parts) - 1 then begin
        NewPath := NewPath + ';';
      end;
    end;
  end;
  RegWriteExpandStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', NewPath);
end;
