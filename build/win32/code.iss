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
OutputDir={#RepoDir}\.build\win32\setup
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
Type: filesandordirs; Name: {app}\resources\app\plugins
Type: filesandordirs; Name: {app}\resources\app\extensions
Type: filesandordirs; Name: {app}\resources\app\node_modules

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 0,6.1
Name: "addcontextmenufiles"; Description: "{cm:AddContextMenuFiles,{#NameShort}}"; GroupDescription: "{cm:Other}"; Flags: unchecked
Name: "addcontextmenufolders"; Description: "{cm:AddContextMenuFolders,{#NameShort}}"; GroupDescription: "{cm:Other}"; Flags: unchecked
Name: "addtopath"; Description: "{cm:AddToPath}"; GroupDescription: "{cm:Other}"
Name: "runcode"; Description: "{cm:RunAfter,{#NameShort}}"; GroupDescription: "{cm:Other}"

[Files]
Source: "*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#NameLong}"; Filename: "{app}\{#ExeBasename}.exe"; AppUserModelID: "{#AppUserId}"
Name: "{commondesktop}\{#NameLong}"; Filename: "{app}\{#ExeBasename}.exe"; Tasks: desktopicon; AppUserModelID: "{#AppUserId}"
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#NameLong}"; Filename: "{app}\{#ExeBasename}.exe"; Tasks: quicklaunchicon; AppUserModelID: "{#AppUserId}"

[Run]
Filename: "{app}\{#ExeBasename}.exe"; Description: "{cm:LaunchProgram,{#NameLong}}"; Tasks: runcode; Flags: nowait postinstall

[Registry]
Root: HKCR; Subkey: ".ascx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".asp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".aspx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".bash\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".bash_login\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".bash_logout\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".bash_profile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".bashrc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".bowerrc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".c\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".cc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".clj\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".cljs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".cljx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".clojure\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".coffee\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".config\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".cpp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".cs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".cshtml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".csproj\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".css\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".csx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".ctp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".cxx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".dockerfile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".dot\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".dtd\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".editorconfig\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".edn\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".eyaml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".eyml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".fs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".fsi\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".fsscript\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".fsx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".gemspec\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".gitattributes\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".gitconfig\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".gitignore\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".go\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".h\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".handlebars\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".hbs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".hh\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".hpp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".htm\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".html\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".hxx\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".ini\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".jade\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".jav\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".java\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".js\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".jscsrc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".jshintrc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".jshtm\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".json\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".jsp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".less\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".lua\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".m\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".makefile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".markdown\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".md\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".mdoc\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".mdown\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".mdtext\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".mdtxt\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".mdwn\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".mkd\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".mkdn\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".ml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".mli\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".nqp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".p6\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".php\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".phtml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".pl\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".pl6\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".pm\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".pm6\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".pod\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".pp\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".profile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".properties\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".ps1\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".psd1\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".psgi\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".psm1\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".py\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".r\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".rb\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".rhistory\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".rprofile\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".rs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".rt\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".scss\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".sh\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".shtml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".sql\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".svg\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".svgz\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".t\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".ts\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".txt\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".vb\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".wxi\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".wxl\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".wxs\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".xaml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".xml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".yaml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".yml\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: ".zsh\OpenWithProgids"; ValueType: string; ValueName: "{#RegValueName}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKCR; Subkey: "{#RegValueName}"; ValueType: string; ValueName: ""; ValueData: "{#NameLong}"; Flags: uninsdeletekey
Root: HKCR; Subkey: "{#RegValueName}\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\resources\app\resources\win32\code_file.ico"
Root: HKCR; Subkey: "{#RegValueName}\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""

Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}\bin"; Tasks: addtopath; Check: NeedsAddPath(ExpandConstant('{app}\bin'))

Root: HKCU; Subkey: "SOFTWARE\Classes\*\shell\{#RegValueName}"; ValueType: expandsz; ValueName: ""; ValueData: "Open with {#NameShort}"; Tasks: addcontextmenufiles; Flags: uninsdeletekey
Root: HKCU; Subkey: "SOFTWARE\Classes\*\shell\{#RegValueName}"; ValueType: expandsz; ValueName: "Icon"; ValueData: "{app}\{#ExeBasename}.exe"; Tasks: addcontextmenufiles
Root: HKCU; Subkey: "SOFTWARE\Classes\*\shell\{#RegValueName}\command"; ValueType: expandsz; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%1"""; Tasks: addcontextmenufiles
Root: HKCU; Subkey: "SOFTWARE\Classes\directory\shell\{#RegValueName}"; ValueType: expandsz; ValueName: ""; ValueData: "Open with {#NameShort}"; Tasks: addcontextmenufolders; Flags: uninsdeletekey
Root: HKCU; Subkey: "SOFTWARE\Classes\directory\shell\{#RegValueName}"; ValueType: expandsz; ValueName: "Icon"; ValueData: "{app}\{#ExeBasename}.exe"; Tasks: addcontextmenufolders
Root: HKCU; Subkey: "SOFTWARE\Classes\directory\shell\{#RegValueName}\command"; ValueType: expandsz; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%V"""; Tasks: addcontextmenufolders
Root: HKCU; Subkey: "SOFTWARE\Classes\directory\background\shell\{#RegValueName}"; ValueType: expandsz; ValueName: ""; ValueData: "Open with {#NameShort}"; Tasks: addcontextmenufolders; Flags: uninsdeletekey
Root: HKCU; Subkey: "SOFTWARE\Classes\directory\background\shell\{#RegValueName}"; ValueType: expandsz; ValueName: "Icon"; ValueData: "{app}\{#ExeBasename}.exe"; Tasks: addcontextmenufolders
Root: HKCU; Subkey: "SOFTWARE\Classes\directory\background\shell\{#RegValueName}\command"; ValueType: expandsz; ValueName: ""; ValueData: """{app}\{#ExeBasename}.exe"" ""%V"""; Tasks: addcontextmenufolders

[Code]
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
