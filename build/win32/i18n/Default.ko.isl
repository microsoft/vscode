; *** Inno Setup version 5.5.3+ Korean messages ***
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
LanguageName=Korean
LanguageID=$0412
LanguageCodePage=949
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
SetupAppTitle=설치
SetupWindowTitle=설치 - %1
UninstallAppTitle=제거
UninstallAppFullTitle=%1 제거
; *** Misc. common
InformationTitle=정보
ConfirmTitle=확인
ErrorTitle=오류
; *** SetupLdr messages
SetupLdrStartupMessage=그러면 %1이(가) 설치됩니다. 계속하시겠습니까?
LdrCannotCreateTemp=임시 파일을 만들 수 없습니다. 설치 프로그램이 중단되었습니다.
LdrCannotExecTemp=임시 디렉터리에서 파일을 실행할 수 없습니다. 설치 프로그램이 중단되었습니다.
; *** Startup error messages
LastErrorMessage=%1.%n%n오류 %2: %3
SetupFileMissing=파일 %1이(가) 설치 디렉터리에서 누락되었습니다. 문제를 해결하거나 프로그램을 새로 받으세요.
SetupFileCorrupt=설치 파일이 손상되었습니다. 프로그램을 새로 받으세요.
SetupFileCorruptOrWrongVer=설치 파일이 손상되었거나 이 버전의 설치 프로그램과 호환되지 않습니다. 문제를 해결하거나 프로그램을 새로 받으세요.
InvalidParameter=명령줄에 잘못된 매개 변수가 전달됨:%n%n%1
SetupAlreadyRunning=설치 프로그램이 이미 실행 중입니다.
WindowsVersionNotSupported=이 프로그램은 컴퓨터에서 실행 중인 버전의 Windows를 지원하지 않습니다.
WindowsServicePackRequired=이 프로그램을 설치하려면 %1 서비스 팩 %2 이상이 필요합니다.
NotOnThisPlatform=이 프로그램은 %1에서 실행되지 않습니다.
OnlyOnThisPlatform=이 프로그램은 %1에서 실행해야 합니다.
OnlyOnTheseArchitectures=이 프로그램은 프로세서 아키텍처 %n%n%1용으로 설계된 Windows 버전에서만 설치할 수 있습니다.
MissingWOW64APIs=실행 중인 Windows 버전에는 설치 프로그램에서 64비트를 설치하는 데 필요한 기능이 없습니다. 이 문제를 해결하려면 서비스 팩 %1을(를) 설치하세요.
WinVersionTooLowError=이 프로그램을 설치하려면 %1 버전 %2 이상이 필요합니다.
WinVersionTooHighError=이 프로그램은 %1 버전 %2 이상에서는 설치할 수 없습니다.
AdminPrivilegesRequired=이 프로그램을 설치할 때는 관리자로 로그인해야 합니다.
PowerUserPrivilegesRequired=이 프로그램을 설치할 때는 관리자나 고급 사용자 그룹의 구성원으로 로그인해야 합니다.
SetupAppRunningError=설치 프로그램에서 %1(이)가 현재 실행 중임을 감지했습니다.%n%n이 항목의 모든 인스턴스를 지금 닫고 계속하려면 [확인]을, 종료하려면 [취소]를 클릭하세요.
UninstallAppRunningError=제거 작업에서 %1(이)가 현재 실행 중임을 감지했습니다.%n%n이 항목의 모든 인스턴스를 지금 닫고 계속하려면 [확인]을, 종료하려면 [취소]를 클릭하세요.
; *** Misc. errors
ErrorCreatingDir=설치 프로그램에서 디렉터리 "%1"을(를) 만들 수 없습니다.
ErrorTooManyFilesInDir=디렉터리 "%1"에 파일이 너무 많으므로 이 디렉터리에 파일을 만들 수 없습니다.
; *** Setup common messages
ExitSetupTitle=설치 종료
ExitSetupMessage=설치가 완료되지 않았습니다. 지금 종료하면 프로그램이 설치되지 않습니다.%n%n나중에 설치 프로그램을 다시 실행하여 설치를 끝낼 수 있습니다.%n%n설치 프로그램을 종료하시겠습니까?
AboutSetupMenuItem=설치 프로그램 정보(&A)...
AboutSetupTitle=설치 프로그램 정보
AboutSetupMessage=%1 버전 %2%n%3%n%n%1 홈페이지:%n%4
AboutSetupNote=
TranslatorNote=
; *** Buttons
ButtonBack=< 뒤로(&B)
ButtonNext=다음(&N) >
ButtonInstall=설치(&I)
ButtonOK=확인
ButtonCancel=취소
ButtonYes=예(&Y)
ButtonYesToAll=모두 예(&A)
ButtonNo=아니요(&N)
ButtonNoToAll=모두 아니요(&O)
ButtonFinish=마침(&F)
ButtonBrowse=찾아보기(&B)...
ButtonWizardBrowse=찾아보기(&R)
ButtonNewFolder=새 폴더 만들기(&M)
; *** "Select Language" dialog messages
SelectLanguageTitle=설치 언어 선택
SelectLanguageLabel=설치 중에 사용할 언어를 선택하세요.
; *** Common wizard text
ClickNext=계속하려면 [다음]을 클릭하고 설치 프로그램을 종료하려면 [취소]를 클릭하세요.
BeveledLabel=
BrowseDialogTitle=폴더 찾아보기
BrowseDialogLabel=아래 목록에서 폴더를 선택한 다음 [확인]을 클릭하세요.
NewFolderName=새 폴더
; *** "Welcome" wizard page
WelcomeLabel1=[name] 설치 마법사 시작
WelcomeLabel2=이 마법사는 컴퓨터에 [name/ver]을(를) 설치합니다.%n%n계속하기 전에 다른 모든 응용 프로그램을 닫는 것이 좋습니다.
; *** "Password" wizard page
WizardPassword=암호
PasswordLabel1=이 설치는 암호로 보호되고 있습니다.
PasswordLabel3=계속하려면 암호를 입력한 다음 [다음]을 클릭하세요. 암호는 대소문자를 구분합니다.
PasswordEditLabel=암호(&P):
IncorrectPassword=입력한 암호가 잘못되었습니다. 다시 시도하세요.
; *** "License Agreement" wizard page
WizardLicense=사용권 계약
LicenseLabel=계속하기 전에 다음 중요한 정보를 읽어 보세요.
LicenseLabel3=다음 사용권 계약을 읽어 주세요. 설치를 계속하려면 먼저 이 계약 조건에 동의해야 합니다.
LicenseAccepted=계약에 동의함(&A)
LicenseNotAccepted=계약에 동의 안 함(&D)
; *** "Information" wizard pages
WizardInfoBefore=정보
InfoBeforeLabel=계속하기 전에 다음 중요한 정보를 읽어 보세요.
InfoBeforeClickLabel=설치를 계속 진행할 준비가 되면 [다음]을 클릭합니다.
WizardInfoAfter=정보
InfoAfterLabel=계속하기 전에 다음 중요한 정보를 읽어 보세요.
InfoAfterClickLabel=설치를 계속 진행할 준비가 되면 [다음]을 클릭합니다.
; *** "User Information" wizard page
WizardUserInfo=사용자 정보
UserInfoDesc=정보를 입력하세요.
UserInfoName=사용자 이름(&U):
UserInfoOrg=조직(&O):
UserInfoSerial=일련 번호(&S):
UserInfoNameRequired=이름을 입력해야 합니다.
; *** "Select Destination Location" wizard page
WizardSelectDir=대상 위치 선택
SelectDirDesc=[name]을(를) 어디에 설치하시겠습니까?
SelectDirLabel3=설치 프로그램에서 [name]을(를) 다음 폴더에 설치합니다.
SelectDirBrowseLabel=계속하려면 [다음]을 클릭하세요. 다른 폴더를 선택하려면 [찾아보기]를 클릭하세요.
DiskSpaceMBLabel=적어도 [mb]MB의 여유 디스크 공간이 필요합니다.
CannotInstallToNetworkDrive=설치 프로그램은 네트워크 드라이브에 설치할 수 없습니다.
CannotInstallToUNCPath=설치 프로그램은 UNC 경로에 설치할 수 없습니다.
InvalidPath=드라이브 문자와 함께 전체 경로를 입력해야 합니다. 예:%n%nC:\APP%n%n또는 다음 형태의 UNC 경로:%n%n\\server\share
InvalidDrive=선택한 드라이브나 UNC 공유가 없거나 이 두 항목에 액세스할 수 없습니다. 다른 드라이브나 UNC 공유를 선택하세요.
DiskSpaceWarningTitle=디스크 공간 부족
DiskSpaceWarning=설치 프로그램을 설치하려면 여유 설치 공간이 적어도 %1KB가 필요하지만 선택한 드라이브의 가용 공간은 %2KB밖에 없습니다.%n%n그래도 계속하시겠습니까?
DirNameTooLong=폴더 이름 또는 경로가 너무 깁니다.
InvalidDirName=폴더 이름이 잘못되었습니다.
BadDirName32=폴더 이름에는 %n%n%1 문자를 사용할 수 없습니다.
DirExistsTitle=폴더 있음
DirExists=폴더 %n%n%1%n%n이(가) 이미 있습니다. 그래도 해당 폴더에 설치하시겠습니까?
DirDoesntExistTitle=폴더 없음
DirDoesntExist=폴더 %n%n%1%n%n이(가) 없습니다. 폴더를 만드시겠습니까?
; *** "Select Components" wizard page
WizardSelectComponents=구성 요소 선택
SelectComponentsDesc=어떤 구성 요소를 설치하시겠습니까?
SelectComponentsLabel2=설치할 구성 요소는 선택하고 설치하지 않을 구성 요소는 지우세요. 계속 진행할 준비가 되면 [다음]을 클릭하세요.
FullInstallation=전체 설치
; if possible don't translate 'Compact' as 'Minimal' (I mean 'Minimal' in your language)
CompactInstallation=Compact 설치
CustomInstallation=사용자 지정 설치
NoUninstallWarningTitle=구성 요소가 있음
NoUninstallWarning=설치 프로그램에서 구성 요소 %n%n%1%n%n이(가) 컴퓨터에 이미 설치되어 있음을 감지했습니다. 이러한 구성 요소는 선택 취소해도 제거되지 않습니다.%n%n그래도 계속하시겠습니까?
ComponentSize1=%1KB
ComponentSize2=%1MB
ComponentsDiskSpaceMBLabel=현재 선택을 위해서는 적어도 [mb]MB의 디스크 공간이 필요합니다.
; *** "Select Additional Tasks" wizard page
WizardSelectTasks=추가 작업 선택
SelectTasksDesc=어떤 작업을 추가로 수행하시겠습니까?
SelectTasksLabel2=설치 프로그램에서 [name]을(를) 설치하는 동안 수행할 추가 작업을 선택한 후 [다음]을 클릭하세요.
; *** "Select Start Menu Folder" wizard page
WizardSelectProgramGroup=시작 메뉴 폴더 선택
SelectStartMenuFolderDesc=설치 프로그램에서 프로그램의 바로 가기를 어디에 만들도록 하시겠습니까?
SelectStartMenuFolderLabel3=설치 프로그램에서 프로그램의 바로 가기를 다음 시작 메뉴 폴더에 만듭니다.
SelectStartMenuFolderBrowseLabel=계속하려면 [다음]을 클릭하세요. 다른 폴더를 선택하려면 [찾아보기]를 클릭하세요.
MustEnterGroupName=폴더 이름을 입력해야 합니다.
GroupNameTooLong=폴더 이름 또는 경로가 너무 깁니다.
InvalidGroupName=폴더 이름이 잘못되었습니다.
BadGroupName=폴더 이름에는 %n%n%1 문자를 사용할 수 없습니다.
NoProgramGroupCheck2=시작 메뉴 폴더를 만들지 않음(&D)
; *** "Ready to Install" wizard page
WizardReady=설치 준비됨
ReadyLabel1=이제 설치 프로그램이 컴퓨터에 [name] 설치를 시작할 준비가 되었습니다.
ReadyLabel2a=설치를 계속하려면 [설치]를 클릭하고, 설정을 검토하거나 변경하려면 [뒤로]를 클릭하세요.
ReadyLabel2b=설치를 계속하려면 [설치]를 클릭하세요.
ReadyMemoUserInfo=사용자 정보:
ReadyMemoDir=대상 위치:
ReadyMemoType=설치 유형:
ReadyMemoComponents=선택한 구성 요소:
ReadyMemoGroup=시작 메뉴 폴더:
ReadyMemoTasks=추가 작업:
; *** "Preparing to Install" wizard page
WizardPreparing=설치 준비 중
PreparingDesc=설치 프로그램에서 컴퓨터에 [name] 설치를 준비하고 있습니다.
PreviousInstallNotCompleted=이전 프로그램의 설치/제거 작업이 완료되지 않았습니다. 해당 설치를 완료하려면 컴퓨터를 다시 시작해야 합니다.%n%n컴퓨터를 다시 시작한 후 [name] 설치를 완료하려면 설치 프로그램을 다시 실행하세요.
CannotContinue=설치 프로그램을 계속할 수 없습니다. 종료하려면 [취소]를 클릭하세요.
ApplicationsFound=설치 프로그램에서 업데이트해야 하는 파일이 다음 응용 프로그램에 사용되고 있습니다. 설치 프로그램에서 이러한 응용 프로그램을 자동으로 닫도록 허용하는 것이 좋습니다.
ApplicationsFound2=설치 프로그램에서 업데이트해야 하는 파일이 다음 응용 프로그램에 사용되고 있습니다. 설치 프로그램에서 이러한 응용 프로그램을 자동으로 닫도록 허용하는 것이 좋습니다. 설치가 완료되면 설치 프로그램에서 응용 프로그램을 다시 시작하려고 시도합니다.
CloseApplications=응용 프로그램 자동 닫기(&A)
DontCloseApplications=응용 프로그램을 닫지 않음(&D)
ErrorCloseApplications=설치 프로그램에서 일부 응용 프로그램을 자동으로 닫을 수 없습니다. 계속하기 전에 설치 프로그램에서 업데이트해야 하는 파일을 사용하는 응용 프로그램을 모두 닫는 것이 좋습니다.
; *** "Installing" wizard page
WizardInstalling=설치 중
InstallingLabel=설치 프로그램에서 컴퓨터에 [name]을(를) 설치하는 동안 기다려 주세요.
; *** "Setup Completed" wizard page
FinishedHeadingLabel=[name] 설정 마법사를 완료하는 중
FinishedLabelNoIcons=설치 프로그램에서 컴퓨터에 [name]을(를) 설치했습니다.
FinishedLabel=설치 프로그램에서 컴퓨터에 [name]을(를) 설치했습니다. 설치한 바로 가기를 선택하여 해당 응용 프로그램을 시작할 수 있습니다.
ClickFinish=설치 프로그램을 종료하려면 [마침]을 클릭하세요.
FinishedRestartLabel=[name] 설치를 완료하려면 설치 프로그램에서 컴퓨터를 다시 시작해야 합니다. 지금 다시 시작하시겠습니까?
FinishedRestartMessage=[name] 설치를 완료하려면 설치 프로그램에서 컴퓨터를 다시 시작해야 합니다.%n%n지금 다시 시작하시겠습니까?
ShowReadmeCheck=예, README 파일을 보겠습니다.
YesRadio=예, 컴퓨터를 지금 다시 시작하겠습니다(&Y).
NoRadio=아니요, 컴퓨터를 나중에 다시 시작하겠습니다(&N).
; used for example as 'Run MyProg.exe'
RunEntryExec=%1 실행
; used for example as 'View Readme.txt'
RunEntryShellExec=%1 보기
; *** "Setup Needs the Next Disk" stuff
ChangeDiskTitle=설치 프로그램에서 다음 디스크가 필요함
SelectDiskLabel2=디스크 %1을(를) 삽입한 다음 [확인]을 클릭하세요.%n%n이 디스크의 파일이 아래 표시된 폴더가 아닌 다른 폴더에 있으면 올바른 경로를 입력하거나 [찾아보기]를 클릭하세요.
PathLabel=경로(&P):
FileNotInDir2="%2"에서 파일 "%1"을(를) 찾을 수 없습니다. 올바른 디스크를 삽입하거나 다른 폴더를 선택하세요.
SelectDirectoryLabel=다음 디스크의 위치를 지정하세요.
; *** Installation phase messages
SetupAborted=설치를 완료하지 못했습니다.%n%n문제를 해결한 다음 설치 프로그램을 다시 실행하세요.
EntryAbortRetryIgnore=다시 시도하려면 [다시 시도]를, 그래도 계속하려면 [무시]를, 설치를 취소하려면 [중단]을 클릭하세요.
; *** Installation status messages
StatusClosingApplications=응용 프로그램을 닫는 중...
StatusCreateDirs=디렉터리를 만드는 중...
StatusExtractFiles=파일을 추출하는 중...
StatusCreateIcons=바로 가기를 만드는 중...
StatusCreateIniEntries=INI 항목을 만드는 중...
StatusCreateRegistryEntries=레지스트리 항목을 만드는 중...
StatusRegisterFiles=파일을 등록하는 중...
StatusSavingUninstall=제거 정보를 저장하는 중...
StatusRunProgram=설치를 완료하는 중...
StatusRestartingApplications=응용 프로그램을 다시 시작하는 중...
StatusRollback=변경 사항을 롤백하는 중...
; *** Misc. errors
ErrorInternal2=내부 오류: %1
ErrorFunctionFailedNoCode=%1 실패
ErrorFunctionFailed=%1 실패, 코드 %2
ErrorFunctionFailedWithMessage=%1 실패, 코드 %2.%n%3
ErrorExecutingProgram=파일을 실행할 수 없음:%n%1
; *** Registry errors
ErrorRegOpenKey=레지스트리 키를 여는 중 오류 발생:%n%1\%2
ErrorRegCreateKey=레지스트리 키를 만드는 중 오류 발생:%n%1\%2
ErrorRegWriteKey=레지스트리 키에 기록하는 중 오류 발생:%n%1\%2
; *** INI errors
ErrorIniEntry=파일 "%1"에 INI 항목을 만드는 중에 오류가 발생했습니다. 
; *** File copying errors
FileAbortRetryIgnore=다시 시도하려면 [다시 시도]를, 이 파일을 건너뛰려면 [무시](권장되지 않음)를, 설치를 취소하려면 [중단]을 클릭하세요.
FileAbortRetryIgnore2=다시 시도하려면 [다시 시도]를, 그래도 계속하려면 [무시](권장되지 않음)를, 설치를 취소하려면 [중단]을 클릭하세요.
SourceIsCorrupted=원본 파일이 손상되었습니다.
SourceDoesntExist=원본 파일 "%1"이(가) 없습니다.
ExistingFileReadOnly=기존 파일이 읽기 전용으로 표시되어 있습니다.%n%n읽기 전용 특성을 제거하고 다시 시도하려면 [다시 시도]를, 이 파일을 건너뛰려면 [무시]를, 설치를 취소하려면 [중단]을 클릭하세요.
ErrorReadingExistingDest=기존 파일을 읽는 중 오류 발생:
FileExists=해당 파일이 이미 있습니다.%n%n설치 프로그램에서 이 파일을 덮어쓰도록 하시겠습니까?
ExistingFileNewer=기존 파일이 설치 프로그램에서 설치하려는 파일보다 최신입니다. 기존 파일을 유지할 것을 권장합니다.%n%n기존 파일을 유지하시겠습니까?
ErrorChangingAttr=기존 파일의 특성을 변경하는 중 오류 발생:
ErrorCreatingTemp=대상 디렉터리에 파일을 만드는 중 오류 발생:
ErrorReadingSource=원본 파일을 읽는 중 오류 발생:
ErrorCopying=파일을 복사하는 중 오류 발생:
ErrorReplacingExistingFile=기존 파일을 바꾸는 중 오류 발생:
ErrorRestartReplace=RestartReplace 실패:
ErrorRenamingTemp=대상 디렉터리에 있는 파일 이름을 바꾸는 중 오류 발생:
ErrorRegisterServer=DLL/OCX를 등록할 수 없음: %1
ErrorRegSvr32Failed=종료 코드 %1과(와) 함께 RegSvr32 실패
ErrorRegisterTypeLib=형식 라이브러리를 등록할 수 없음: %1
; *** Post-installation errors
ErrorOpeningReadme=README 파일을 여는 중에 오류가 발생했습니다.
ErrorRestartingComputer=설치 프로그램에서 컴퓨터를 다시 시작할 수 없습니다. 수동으로 진행하세요.
; *** Uninstaller messages
UninstallNotFound=파일 "%1"이(가) 없습니다. 제거할 수 없습니다.
UninstallOpenError=파일 "%1"을(를) 열 수 없습니다. 제거할 수 없습니다.
UninstallUnsupportedVer=제거 로그 파일 "%1"이(가) 이 버전의 제거 프로그램에서 인식하지 못하는 형식입니다. 제거할 수 없습니다.
UninstallUnknownEntry=제거 로그에서 알 수 없는 항목(%1)이 발견되었습니다.
ConfirmUninstall=%1과(와) 해당 구성 요소를 모두 완전히 제거하시겠습니까?
UninstallOnlyOnWin64=이 설치는 64비트 Windows에서만 제거할 수 있습니다.
OnlyAdminCanUninstall=이 설치는 관리자 권한이 있는 사용자만 제거할 수 있습니다.
UninstallStatusLabel=컴퓨터에서 %1을(를) 제거하는 동안 기다려 주세요.
UninstalledAll=컴퓨터에서 %1을(를) 제거했습니다.
UninstalledMost=%1 제거가 완료되었습니다.%n%n일부 요소는 제거할 수 없습니다. 이러한 항목은 수동으로 제거할 수 있습니다.
UninstalledAndNeedsRestart=%1 제거를 완료하려면 컴퓨터를 다시 시작해야 합니다.%n%n지금 다시 시작하시겠습니까?
UninstallDataCorrupted="%1" 파일이 손상되었습니다. 제거할 수 없습니다.
; *** Uninstallation phase messages
ConfirmDeleteSharedFileTitle=공유 파일을 제거하시겠습니까?
ConfirmDeleteSharedFile2=시스템에서는 이제 다음 공유 파일을 사용하는 프로그램이 없는 것으로 표시됩니다. 제거 작업을 통해 이 공유 파일을 제거하시겠습니까?%n%n아직 이 파일을 사용하는 프로그램이 있는데 이 파일을 제거하면 해당 프로그램이 올바르게 작동하지 않을 수 있습니다. 잘 모르는 경우 [아니요]를 선택하세요. 시스템에 파일을 그대로 두어도 아무런 문제가 발생하지 않습니다.
SharedFileNameLabel=파일 이름:
SharedFileLocationLabel=위치:
WizardUninstalling=제거 상태
StatusUninstalling=%1을(를) 제거하는 중...
; *** Shutdown block reasons
ShutdownBlockReasonInstallingApp=%1을(를) 설치하는 중입니다.
ShutdownBlockReasonUninstallingApp=%1을(를) 제거하는 중입니다.
; The custom messages below aren't used by Setup itself, but if you make
; use of them in your scripts, you'll want to translate them.
[CustomMessages]
NameAndVersion=%1 버전 %2
AdditionalIcons=추가 바로 가기:
CreateDesktopIcon=바탕 화면 바로 가기 만들기(&D)
CreateQuickLaunchIcon=빠른 실행 바로 가기 만들기(&Q)
ProgramOnTheWeb=%1 웹 정보
UninstallProgram=%1 제거
LaunchProgram=%1 시작
AssocFileExtension=%1을(를) %2 파일 확장명과 연결(&A)
AssocingFileExtension=%1을(를) %2 파일 확장명과 연결 중...
AutoStartProgramGroupDescription=시작:
AutoStartProgram=%1 자동 시작
AddonHostProgramNotFound=선택한 폴더에서 %1을(를) 찾을 수 없습니다.%n%n그래도 계속하시겠습니까?