; *** Inno Setup version 5.5.3+ Simplified Chinese messages ***
;
; To download user-contributed translations of this file, go to:
;   http://www.jrsoftware.org/files/istrans/
;
; Note: When translating this text, do not add periods (.) to the end of
; messages that didn't have them already, because on those messages Inno
; Setup adds the periods automatically (appending a period would result in
; two periods being displayed).
[LangOptions]
; The following three entries are very important. Be sure to read and 
; understand the '[LangOptions] section' topic in the help file.
LanguageName=Simplified Chinese
LanguageID=$0804
LanguageCodePage=936
; If the language you are translating to requires special font faces or
; sizes, uncomment any of the following entries and change them accordingly.
;DialogFontName=
;DialogFontSize=8
;WelcomeFontName=Verdana
;WelcomeFontSize=12
;TitleFontName=Arial
;TitleFontSize=29
;CopyrightFontName=Arial
;CopyrightFontSize=8
[Messages]
; *** Application titles
SetupAppTitle=安装程序
SetupWindowTitle=安装程序 - %1
UninstallAppTitle=卸载
UninstallAppFullTitle=%1 卸载
; *** Misc. common
InformationTitle=信息
ConfirmTitle=确认
ErrorTitle=错误
; *** SetupLdr messages
SetupLdrStartupMessage=这将安装 %1。是否要继续?
LdrCannotCreateTemp=无法创建临时文件。安装程序已中止
LdrCannotExecTemp=无法在临时目录中执行文件。安装程序已中止
; *** Startup error messages
LastErrorMessage=%1。%n%n错误 %2: %3
SetupFileMissing=安装目录缺失文件 %1。请更正该问题或获取该问题的新副本。
SetupFileCorrupt=安装程序文件夹已损坏。请获取该程序的新副本。
SetupFileCorruptOrWrongVer=安装程序文件夹已损坏或与此安装程序版本不兼容。请更正该问题或获取该程序的新副本。
InvalidParameter=命令行 %n%n%1 上传递了一个无效参数
SetupAlreadyRunning=安装程序已在运行。
WindowsVersionNotSupported=此程序不支持你计算机正运行的 Windows 版本。
WindowsServicePackRequired=此程序需要 %1 服务包 %2 或更高版本。
NotOnThisPlatform=此程序将不在 %1 上运行。
OnlyOnThisPlatform=此程序必须在 %1 上运行。
OnlyOnTheseArchitectures=此程序仅可安装在为以下处理器体系结构设计的 Windows 版本上:%n%n%1
MissingWOW64APIs=你正运行的 Windows 版本不包含安装程序执行 64 位安装所需的功能。要更正此问题，请安装服务包 %1。
WinVersionTooLowError=此程序需要 %1 版本 %2 或更高版本。
WinVersionTooHighError=此程序不能安装在 %1 版本 %2 或更高的版本上。
AdminPrivilegesRequired=在安装此程序时必须作为管理员登录。
PowerUserPrivilegesRequired=安装此程序时必须以管理员或 Power User 组成员身份登录。
SetupAppRunningError=安装程序检测到 %1 当前正在运行。%n%n请立即关闭它的所有实例，然后单击“确定”以继续，或单击“取消”以退出。
UninstallAppRunningError=卸载检测到 %1 当前正在运行。%n%n请立即关闭它的所有实例，然后单击“确定”以继续或单击“取消”以退出。
; *** Misc. errors
ErrorCreatingDir=安装程序无法创建目录“%1”
ErrorTooManyFilesInDir=无法在目录“%1”中创建文件，因为它包含太多文件
; *** Setup common messages
ExitSetupTitle=退出安装程序
ExitSetupMessage=安装程序未完成。如果立即退出，将不会安装该程序。%n%n可在其他时间再次运行安装程序以完成安装。%n%n是否退出安装程序?
AboutSetupMenuItem=关于安装程序(&A)...
AboutSetupTitle=关于安装程序
AboutSetupMessage=%1 版本 %2%n%3%n%n%1 主页:%n%4
AboutSetupNote=
TranslatorNote=
; *** Buttons
ButtonBack=< 上一步(&B)
ButtonNext=下一步(&N) >
ButtonInstall=安装(&I)
ButtonOK=确定
ButtonCancel=取消
ButtonYes=是(&Y)
ButtonYesToAll=接受全部(&A)
ButtonNo=否(&N)
ButtonNoToAll=否定全部(&O)
ButtonFinish=完成(&F)
ButtonBrowse=浏览(&B)...
ButtonWizardBrowse=浏览(&R)...
ButtonNewFolder=新建文件夹(&M)
; *** "Select Language" dialog messages
SelectLanguageTitle=选择安装程序语言
SelectLanguageLabel=选择安装时要使用的语言:
; *** Common wizard text
ClickNext=单击“下一步”以继续，或单击“取消”以退出安装程序。
BeveledLabel=
BrowseDialogTitle=浏览查找文件夹
BrowseDialogLabel=在以下列表中选择一个文件夹，然后单击“确定”。
NewFolderName=新建文件夹
; *** "Welcome" wizard page
WelcomeLabel1=欢迎使用 [name] 安装向导
WelcomeLabel2=这将在计算机上安装 [name/ver]。%n%n建议关闭所有其他应用程序再继续。
; *** "Password" wizard page
WizardPassword=密码
PasswordLabel1=此安装受密码保护。
PasswordLabel3=请提供密码，然后单击“下一步”以继续。密码区分大小写。
PasswordEditLabel=密码(&P):
IncorrectPassword=输入的密码不正确。请重试。
; *** "License Agreement" wizard page
WizardLicense=许可协议
LicenseLabel=请在继续操作前阅读以下重要信息。
LicenseLabel3=请阅读以下许可协议。必须接受此协议条款才可继续安装。
LicenseAccepted=我接受协议(&A)
LicenseNotAccepted=我不接受协议(&D)
; *** "Information" wizard pages
WizardInfoBefore=信息
InfoBeforeLabel=请在继续操作前阅读以下重要信息。
InfoBeforeClickLabel=准备好继续安装后，单击“下一步”。
WizardInfoAfter=信息
InfoAfterLabel=请在继续操作前阅读以下重要信息。
InfoAfterClickLabel=准备好继续安装后，单击“下一步”。
; *** "User Information" wizard page
WizardUserInfo=用户信息
UserInfoDesc=请输入你的信息。
UserInfoName=用户名(&U):
UserInfoOrg=组织(&O):
UserInfoSerial=序列号(&S):
UserInfoNameRequired=必须输入名称。
; *** "Select Destination Location" wizard page
WizardSelectDir=选择目标位置
SelectDirDesc=应将 [name] 安装到哪里?
SelectDirLabel3=安装程序会将 [name] 安装到以下文件夹。
SelectDirBrowseLabel=若要继续，单击“下一步”。如果想选择其他文件夹，单击“浏览”。
DiskSpaceMBLabel=需要至少 [mb] MB 可用磁盘空间。
CannotInstallToNetworkDrive=安装程序无法安装到网络驱动器。
CannotInstallToUNCPath=安装程序无法安装到 UNC 路径。
InvalidPath=必须输入带驱动器号的完整路径(例如:%n%nC:\APP%n%n)或以下格式的 UNC 路径:%n%n\\server\share
InvalidDrive=所选驱动器或 UNC 共享不存在或不可访问。请另外选择。
DiskSpaceWarningTitle=磁盘空间不足
DiskSpaceWarning=安装程序需要至少 %1 KB 可用空间来安装，但所选驱动器仅有 %2 KB 可用空间。%n%n是否仍要继续?
DirNameTooLong=文件夹名称或路径太长。
InvalidDirName=文件夹名称无效。
BadDirName32=文件夹名不能包含以下任一字符:%n%n%1
DirExistsTitle=文件夹存在
DirExists=文件夹:%n%n%1%n%n已存在。是否仍要安装到该文件夹?
DirDoesntExistTitle=文件夹不存在
DirDoesntExist=文件夹:%n%n%1%n%n不存在。是否要创建该文件夹?
; *** "Select Components" wizard page
WizardSelectComponents=选择组件
SelectComponentsDesc=应安装哪些组件?
SelectComponentsLabel2=选择希望安装的组件；清除不希望安装的组件。准备就绪后单击“下一步”以继续。
FullInstallation=完全安装
; if possible don't translate 'Compact' as 'Minimal' (I mean 'Minimal' in your language)
CompactInstallation=简洁安装
CustomInstallation=自定义安装
NoUninstallWarningTitle=组件存在
NoUninstallWarning=安装程序检测到计算机上已安装以下组件:%n%n%1%n%n取消选择这些组件将不会卸载它们。%n%n是否仍要继续?
ComponentSize1=%1 KB
ComponentSize2=%1 MB
ComponentsDiskSpaceMBLabel=当前选择需要至少 [mb] MB 磁盘空间。
; *** "Select Additional Tasks" wizard page
WizardSelectTasks=选择其他任务
SelectTasksDesc=应执行哪些其他任务?
SelectTasksLabel2=选择安装 [name] 时希望安装程序来执行的其他任务，然后单击“下一步”。
; *** "Select Start Menu Folder" wizard page
WizardSelectProgramGroup=选择开始菜单文件夹
SelectStartMenuFolderDesc=安装程序应将程序的快捷方式放置到哪里?
SelectStartMenuFolderLabel3=安装程序将在以下开始菜单文件夹中创建该程序的快捷方式。
SelectStartMenuFolderBrowseLabel=若要继续，单击“下一步”。如果想选择其他文件夹，单击“浏览”。
MustEnterGroupName=必须输入文件夹名。
GroupNameTooLong=文件夹名称或路径太长。
InvalidGroupName=文件夹名称无效。
BadGroupName=文件夹名不能保护以下任一字符:%n%n%1
NoProgramGroupCheck2=不创建开始菜单文件夹(&D)
; *** "Ready to Install" wizard page
WizardReady=安装准备就绪
ReadyLabel1=安装程序现已准备好在计算机上安装 [name]。
ReadyLabel2a=单击“安装”以继续安装，如想查看或更改任何设置则单击"返回"。
ReadyLabel2b=单击“安装”以继续安装。
ReadyMemoUserInfo=用户信息:
ReadyMemoDir=目标位置:
ReadyMemoType=安装程序类型:
ReadyMemoComponents=所选组件:
ReadyMemoGroup=开始菜单文件夹:
ReadyMemoTasks=其他任务:
; *** "Preparing to Install" wizard page
WizardPreparing=正在准备安装
PreparingDesc=安装程序正准备在计算机上安装 [name]。
PreviousInstallNotCompleted=上一个程序的安装/删除未完成。需重启计算机以完成该安装。%n%n重启计算机后，重新运行安装程序以完成 [name] 的安装。
CannotContinue=安装程序无法继续。请单击"取消"以退出。
ApplicationsFound=以下应用程序正在使用需要通过安装程序进行更新的文件。建议允许安装程序自动关闭这些应用程序。
ApplicationsFound2=以下应用程序正在使用需要通过安装程序进行更新的文件。建议允许安装程序自动关闭这些应用程序。完成安装后，安装程序将尝试重启应用程序。
CloseApplications=自动关闭应用程序(&A)
DontCloseApplications=不关闭应用程序(&D)
ErrorCloseApplications=安装程序无法自动关闭所有应用程序。建议在继续操作之前先关闭所有使用需通过安装程序进行更新的文件的应用程序。
; *** "Installing" wizard page
WizardInstalling=正在安装
InstallingLabel=安装程序正在计算机上安装 [name]，请稍等。
; *** "Setup Completed" wizard page
FinishedHeadingLabel=完成 [name] 安装向导
FinishedLabelNoIcons=安装程序已在计算机上完成安装 [name]。
FinishedLabel=安装程序已在计算机上完成安装 [name]。通过选择安装的快捷方式可以启动该应用程序。
ClickFinish=单击“完成”以退出安装程序。
FinishedRestartLabel=要完成 [name] 的安装，安装程序必须重启计算机。是否要立即重启?
FinishedRestartMessage=要完成 [name] 的安装，安装程序必须重启计算机。%n%n是否要立即重启?
ShowReadmeCheck=是，我希望查看 README 文件
YesRadio=是，立即重启计算机(&Y)
NoRadio=否，我将稍后重启计算机(&N)
; used for example as 'Run MyProg.exe'
RunEntryExec=运行 %1
; used for example as 'View Readme.txt'
RunEntryShellExec=查看 %1
; *** "Setup Needs the Next Disk" stuff
ChangeDiskTitle=安装程序需要下一个磁盘
SelectDiskLabel2=请插入磁盘 %1 并点击“确定”。%n%n如果此磁盘上的文件可在以下文件夹外的其他文件夹中找到，请输入正确路径或单击“浏览”。
PathLabel=路径(&P):
FileNotInDir2=在“%2”中无法定位文件“%1”。请插入正确的磁盘或选择其他文件夹。
SelectDirectoryLabel=请指定下一个磁盘的位置。
; *** Installation phase messages
SetupAborted=安装程序未完成。%n%n请更正问题并重新运行安装程序。
EntryAbortRetryIgnore=单击“重试”以再次尝试，单击“忽略”以继续，或单击“中止”以取消安装。
; *** Installation status messages
StatusClosingApplications=正在关闭应用程序...
StatusCreateDirs=正在创建目录...
StatusExtractFiles=正在解压缩文件...
StatusCreateIcons=正在创建快捷方式...
StatusCreateIniEntries=正在创建 INI 项...
StatusCreateRegistryEntries=正在创建注册表项...
StatusRegisterFiles=正在注册文件...
StatusSavingUninstall=正在保存卸载信息...
StatusRunProgram=正在完成安装...
StatusRestartingApplications=正在重启应用程序...
StatusRollback=正在回退更改...
; *** Misc. errors
ErrorInternal2=内部错误: %1
ErrorFunctionFailedNoCode=%1 失败
ErrorFunctionFailed=%1 失败；代码 %2
ErrorFunctionFailedWithMessage=%1 失败；代码 %2。%n%3
ErrorExecutingProgram=无法执行文件:%n%1
; *** Registry errors
ErrorRegOpenKey=打开注册表项时出错:%n%1\%2
ErrorRegCreateKey=创建注册表项时出错:%n%1\%2
ErrorRegWriteKey=写入注册表项时出错:%n%1\%2
; *** INI errors
ErrorIniEntry=在文件“%1”中创建 INI 项时出错。
; *** File copying errors
FileAbortRetryIgnore=单击“重试”以再次操作，单击“忽略”以跳过此文件(不建议此操作)，或单击“中止”以取消安装。
FileAbortRetryIgnore2=单击“重试”以再次操作，单击“忽略”以继续(不建议此操作)，或单击“中止”以取消安装。
SourceIsCorrupted=源文件已损坏
SourceDoesntExist=源文件“%1”不存在
ExistingFileReadOnly=现有文件被标记为只读状态。%n%n单击“重试”以删除只读特性并重试，单击“忽略”以跳过此文件，或单击“中止”以取消安装。
ErrorReadingExistingDest=尝试读取现有文件时出错:
FileExists=该文件已存在。%n%n是否要安装程序覆盖它?
ExistingFileNewer=现有文件比安装程序正尝试安装的文件更新。建议保留现有文件。%n%n是否要保留现有文件?
ErrorChangingAttr=尝试更改现有文件特性出错:
ErrorCreatingTemp=尝试在目标目录创建文件时出错:
ErrorReadingSource=尝试读取源文件时出错:
ErrorCopying=尝试复制文件时出错:
ErrorReplacingExistingFile=尝试替换现有文件时出错:
ErrorRestartReplace=RestartReplace 失败:
ErrorRenamingTemp=尝试在目标目录重命名文件时出错:
ErrorRegisterServer=无法注册 DLL/OCX: %1
ErrorRegSvr32Failed=RegSvr32 失败，退出代码为 %1
ErrorRegisterTypeLib=无法注册类型库: %1
; *** Post-installation errors
ErrorOpeningReadme=尝试打开 README 文件时出错。
ErrorRestartingComputer=安装程序无法重启计算机。请手动执行此操作。
; *** Uninstaller messages
UninstallNotFound=文件“%1”不存在。无法安装。
UninstallOpenError=无法打开文件“%1”。无法卸载
UninstallUnsupportedVer=卸载日志“%1”的格式无法被此版本的卸载程序识别。无法卸载
UninstallUnknownEntry=卸载日志中发现未知条目(%1)
ConfirmUninstall=确定要彻底删除 %1 和及其全部组件?
UninstallOnlyOnWin64=仅可在 64 位 Windows 上卸载此安装。
OnlyAdminCanUninstall=仅具有管理权限的用户才可卸载此安装。
UninstallStatusLabel=正从计算机删除 %1，请稍等。
UninstalledAll=已成功从计算机上删除 %1。
UninstalledMost=%1 卸载完成。%n%n无法删除一些元素。可将其手动删除。
UninstalledAndNeedsRestart=要完成 %1 的卸载，必须重启计算机。%n%n是否要立即重启?
UninstallDataCorrupted=“%1”文件已损坏。无法卸载
; *** Uninstallation phase messages
ConfirmDeleteSharedFileTitle=删除共享文件?
ConfirmDeleteSharedFile2=系统表示以下共享文件不再被任何程序使用。是否要卸载删除此共享文件?%n%n如果在有程序仍在使用此文件而它被删除，则程序可能不会正常运行。如果不确定，请选择“否”。将文件留住系统上不会造成任何问题。
SharedFileNameLabel=文件名:
SharedFileLocationLabel=位置:
WizardUninstalling=卸载状态
StatusUninstalling=正在卸载 %1...
; *** Shutdown block reasons
ShutdownBlockReasonInstallingApp=正在安装 %1。
ShutdownBlockReasonUninstallingApp=正在卸载 %1。
; The custom messages below aren't used by Setup itself, but if you make
; use of them in your scripts, you'll want to translate them.
[CustomMessages]
NameAndVersion=%1 版本 %2
AdditionalIcons=其他快捷方式:
CreateDesktopIcon=创建桌面快捷方式(&D)
CreateQuickLaunchIcon=创建快速启动快捷方式(&Q)
ProgramOnTheWeb=Web 上的 %1
UninstallProgram=卸载 %1
LaunchProgram=启动 %1
AssocFileExtension=将 %1 与 %2 文件扩展名关联(&A)
AssocingFileExtension=正将 %1 与 %2 文件扩展名关联...
AutoStartProgramGroupDescription=启动:
AutoStartProgram=自动启动 %1
AddonHostProgramNotFound=无法在所选文件夹中定位 %1。%n%n是否仍要继续?