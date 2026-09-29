// GitHub Copilot CLI: publishes the native `copilot` shim to {app}\bin\copilot-shim, manages its PATH entry, and optionally
// installs Copilot CLI through the shim. Design: https://github.com/microsoft/vscode-internalbacklog/issues/9765
//
// Included from the [Code] section of code.iss when the build contains bin\copilot-shim\copilot.exe (CopilotShim).
//
// Shim contract used by setup (all files are INI files written atomically by the shim):
//   copilot.exe --vscode-shim probe --scope user|machine [--no-network] --timeout-ms N --result-file <ini>
//     [probe] protocol=1, policy=allowed|disabled, aiDisabled=0|1, cliFound=0|1, downloadAvailable=0|1,
//             downloadSize=<bytes>, pwshFound=0|1, reason=<text>
//   copilot.exe --vscode-shim install --non-interactive --consent=installer --progress-file <ini>
//               --result-file <ini> --cancel-file <path> --running-mutex <name>
//     [progress] phase=downloading|verifying|installing, current=<bytes>, total=<bytes>, heartbeat=<n>
//     [result] status=installed|alreadyInstalled|policy|network|verification|msiexec|cancelled|timeout|error,
//              exitCode=<n>, cliPath=<path>, cliVersion=<version>, log=<path>
//   The install command holds the named mutex while it runs and rewrites the progress file at least every 5 seconds.

#ifndef CopilotCliPolicyName
#define CopilotCliPolicyName "CopilotCliCommand"
#endif
#ifndef CopilotCliLearnMoreUrl
#define CopilotCliLearnMoreUrl "https://docs.github.com/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli"
#endif

const
  CopilotChoiceInstall = 'install';
  CopilotChoiceOnFirstUse = 'onfirstuse';
  CopilotChoiceNone = 'none';
  CopilotChoiceExisting = 'existing';
  CopilotChoicePolicy = 'policy';

  CopilotActionKeep = 0;
  CopilotActionInstall = 1;
  CopilotActionAdd = 2;
  CopilotActionRemove = 3;
  CopilotActionPolicy = 4;

  CopilotPageNone = 0;
  CopilotPageFull = 1;
  CopilotPageBasic = 2;

  CopilotProbeTimeoutMs = 5000;
  CopilotProbeWaitMs = 6000;
  CopilotInstallStartTimeoutMs = 15000;
  CopilotInstallStallTimeoutMs = 60000;
  CopilotInstallTotalTimeoutMs = 900000;
  CopilotInstallCancelGraceMs = 10000;
  CopilotPathLengthLimit = 32767;
  CopilotPathLengthMargin = 512;

  CopilotMachineEnvironmentKey = 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment';
  CopilotUserEnvironmentKey = 'Environment';

var
  CopilotInitialized: Boolean;
  CopilotIsExistingInstall: Boolean;
  CopilotPreviousChoice: String;
  CopilotPreviousSource: String;
  CopilotSwitchValue: String;
  CopilotShimExtracted: Boolean;

  CopilotProbeStarted: Boolean;
  CopilotProbeLaunched: Boolean;
  CopilotProbeRead: Boolean;
  CopilotProbeCompleted: Boolean;
  CopilotProbeStartTick: Cardinal;
  CopilotProbePolicyDisabled: Boolean;
  CopilotProbeAIDisabled: Boolean;
  CopilotProbeCliFound: Boolean;
  CopilotProbeDownloadAvailable: Boolean;
  CopilotProbeDownloadSizeMB: Int64;
  CopilotProbePwshFound: Boolean;

  CopilotPageKind: Integer;
  CopilotDefaultsApplied: Boolean;
  CopilotBasicPage: TWizardPage;
  CopilotBasicPageBuilt: Boolean;
  CopilotAddRadio: TNewRadioButton;
  CopilotBasicDontAddRadio: TNewRadioButton;
#if "user" == InstallTarget
  CopilotFullPage: TWizardPage;
  CopilotFullPageBuilt: Boolean;
  CopilotInstallNowRadio: TNewRadioButton;
  CopilotFirstUseRadio: TNewRadioButton;
  CopilotFullDontAddRadio: TNewRadioButton;
  CopilotInstallPage: TDownloadWizardPage;
#endif

  CopilotDecided: Boolean;
  CopilotAction: Integer;
  CopilotChoice: String;
  CopilotSource: String;
  CopilotInstallCancelled: Boolean;
  CopilotCommandReady: Boolean;

function CopilotGetTickCount(): Cardinal;
  external 'GetTickCount@kernel32.dll stdcall';

function CopilotExpandEnvironmentStrings(lpSrc: String; lpDst: String; nSize: Cardinal): Cardinal;
  external 'ExpandEnvironmentStringsW@kernel32.dll stdcall';

function CopilotElapsedMs(const StartTick: Cardinal): Integer;
begin
  Result := Integer(CopilotGetTickCount() - StartTick);
end;

function CopilotIsUserInstaller(): Boolean;
begin
#if "user" == InstallTarget
  Result := True;
#else
  Result := False;
#endif
end;

function CopilotShimDir(): String;
begin
  // Under bin so that inno_updater's cleanup (--gc), which only removes top-level folders, keeps it.
  Result := ExpandConstant('{app}\bin\copilot-shim');
end;

function CopilotTempShimPath(): String;
begin
  Result := ExpandConstant('{tmp}\copilot.exe');
end;

// PATH helpers. Entries are compared after trimming, unquoting, expanding environment variables, normalizing
// separators, dropping trailing backslashes, and lowercasing. Other entries are always written back unchanged.

function CopilotExpandEnvironment(const Value: String): String;
var
  Size: Cardinal;
  Buffer: String;
  Terminator: Integer;
begin
  Result := Value;
  if Pos('%', Value) = 0 then
    exit;

  Size := CopilotExpandEnvironmentStrings(Value, '', 0);
  if Size = 0 then
    exit;

  SetLength(Buffer, Size);
  if CopilotExpandEnvironmentStrings(Value, Buffer, Size) = 0 then
    exit;

  Terminator := Pos(#0, Buffer);
  if Terminator > 0 then
    Result := Copy(Buffer, 1, Terminator - 1)
  else
    Result := Buffer;
end;

function CopilotNormalizePathEntry(const Entry: String): String;
begin
  Result := Trim(Entry);
  if (Length(Result) >= 2) and (Result[1] = '"') and (Result[Length(Result)] = '"') then
    Result := Trim(Copy(Result, 2, Length(Result) - 2));
  Result := CopilotExpandEnvironment(Result);
  StringChangeEx(Result, '/', '\', True);
  while (Length(Result) > 3) and (Result[Length(Result)] = '\') do
    SetLength(Result, Length(Result) - 1);
  Result := AnsiLowercase(Result);
end;

function CopilotPathEntryMatches(const Entry, NormalizedDir: String): Boolean;
begin
  Result := (Trim(Entry) <> '') and (CopilotNormalizePathEntry(Entry) = NormalizedDir);
end;

function CopilotPathContains(const PathValue, Dir: String): Boolean;
var
  Parts: TArrayOfString;
  Target: String;
  I: Integer;
begin
  Result := False;
  Target := CopilotNormalizePathEntry(Dir);
  Parts := StringSplit(PathValue, [';'], stAll);
  for I := 0 to GetArrayLength(Parts) - 1 do begin
    if CopilotPathEntryMatches(Parts[I], Target) then begin
      Result := True;
      exit;
    end;
  end;
end;

function CopilotAppendPathEntry(const PathValue, Dir: String): String;
begin
  if PathValue = '' then
    Result := Dir
  else if PathValue[Length(PathValue)] = ';' then
    Result := PathValue + Dir
  else
    Result := PathValue + ';' + Dir;
end;

function CopilotRemovePathEntry(const PathValue, Dir: String; var Removed: Boolean): String;
var
  Parts, Kept: TArrayOfString;
  Target: String;
  I, Count: Integer;
begin
  Removed := False;
  Target := CopilotNormalizePathEntry(Dir);
  Parts := StringSplit(PathValue, [';'], stAll);
  SetArrayLength(Kept, GetArrayLength(Parts));
  Count := 0;
  for I := 0 to GetArrayLength(Parts) - 1 do begin
    if CopilotPathEntryMatches(Parts[I], Target) then
      Removed := True
    else begin
      Kept[Count] := Parts[I];
      Count := Count + 1;
    end;
  end;
  SetArrayLength(Kept, Count);
  Result := StringJoin(';', Kept);
end;

function CopilotPathTooLong(const MachinePath, UserPath, Dir: String): Boolean;
var
  Combined: Integer;
begin
  Combined := Length(CopilotExpandEnvironment(MachinePath)) + 1 + Length(CopilotExpandEnvironment(UserPath)) + 1 + Length(Dir);
  Result := Combined > CopilotPathLengthLimit - CopilotPathLengthMargin;
end;

function CopilotReadPath(const RootKey: Integer; const SubKey: String): String;
begin
  if not RegQueryStringValue(RootKey, SubKey, 'Path', Result) then
    Result := '';
end;

function CopilotAddToPath(const RootKey: Integer; const SubKey, Dir: String): Boolean;
var
  Current: String;
begin
  Current := CopilotReadPath(RootKey, SubKey);
  if CopilotPathContains(Current, Dir) then begin
    Log('Copilot: PATH already contains ' + Dir);
    Result := True;
    exit;
  end;

  if CopilotPathTooLong(CopilotReadPath(HKLM, CopilotMachineEnvironmentKey), CopilotReadPath(HKCU, CopilotUserEnvironmentKey), Dir) then begin
    Log('Copilot: not adding ' + Dir + ' because PATH would become too long');
    Result := False;
    exit;
  end;

  Result := RegWriteExpandStringValue(RootKey, SubKey, 'Path', CopilotAppendPathEntry(Current, Dir));
  Log('Copilot: added ' + Dir + ' to PATH, success=' + BoolToStr(Result));
end;

function CopilotRemoveFromPath(const RootKey: Integer; const SubKey, Dir: String): Boolean;
var
  Current, Updated: String;
  Removed: Boolean;
begin
  Result := True;
  if not RegQueryStringValue(RootKey, SubKey, 'Path', Current) then
    exit;

  Updated := CopilotRemovePathEntry(Current, Dir, Removed);
  if not Removed then
    exit;

  Result := RegWriteExpandStringValue(RootKey, SubKey, 'Path', Updated);
  Log('Copilot: removed ' + Dir + ' from PATH, success=' + BoolToStr(Result));
end;

// Policy, switch, and previous state

function CopilotPolicyDisabled(): Boolean;
var
  Value: Cardinal;
begin
  // A machine policy takes precedence over a user policy, matching VS Code's policy service.
  if RegQueryDWordValue(HKLM, 'SOFTWARE\Policies\Microsoft\{#RegValueName}', '{#CopilotCliPolicyName}', Value) then
    Result := Value = 0
  else if RegQueryDWordValue(HKCU, 'SOFTWARE\Policies\Microsoft\{#RegValueName}', '{#CopilotCliPolicyName}', Value) then
    Result := Value = 0
  else
    Result := False;
end;

function CopilotParseSwitch(const Value: String): String;
begin
  Result := AnsiLowercase(Trim(Value));
  if (Result <> '') and (Result <> CopilotChoiceInstall) and (Result <> CopilotChoiceOnFirstUse) and (Result <> CopilotChoiceNone) then begin
    Log('Copilot: ignoring unsupported /copilotcli value: ' + Value);
    Result := '';
  end;
end;

procedure CopilotInitialize();
begin
  if CopilotInitialized then
    exit;
  CopilotInitialized := True;

  // Captured before setup rewrites the uninstall key, so these describe the previous installation.
  CopilotIsExistingInstall := RegKeyExists({#Uninstall64RootKey}, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\' + Copy('{#AppId}', 2, 38) + '_is1');
  CopilotPreviousChoice := GetPreviousData('CopilotCliChoice', '');
  CopilotPreviousSource := GetPreviousData('CopilotCliSource', '');
  CopilotSwitchValue := CopilotParseSwitch(ExpandConstant('{param:copilotcli|}'));
  Log('Copilot: existingInstall=' + BoolToStr(CopilotIsExistingInstall) + ', previousChoice=' + CopilotPreviousChoice + ', previousSource=' + CopilotPreviousSource + ', switch=' + CopilotSwitchValue);
end;

// Decisions

// Returns the preselected page option for a switch value, the previous choice, and whether the download is offered.
function CopilotSelectDefault(const Switch, PreviousChoice: String; const DownloadAvailable: Boolean): String;
begin
  if Switch <> '' then
    Result := Switch
  else if PreviousChoice = CopilotChoiceNone then
    Result := CopilotChoiceNone
  else if (PreviousChoice = CopilotChoiceOnFirstUse) or (PreviousChoice = CopilotChoiceInstall) or (PreviousChoice = CopilotChoiceExisting) then
    // Copilot CLI isn't installed now, so an earlier install was removed; don't download it again by default.
    Result := CopilotChoiceOnFirstUse
  else
    Result := CopilotChoiceInstall;

  if (Result = CopilotChoiceInstall) and not DownloadAvailable then
    Result := CopilotChoiceOnFirstUse;
end;

// Decides what a silent run (silent install, silent update, or background update) does.
function CopilotDecideSilent(const Switch: String; const IsExistingInstall: Boolean; const PreviousChoice, PreviousSource: String; const IsUserInstaller, IsElevated, AddToPathSelected: Boolean; var Choice, Source: String): Integer;
begin
  if Switch = CopilotChoiceInstall then begin
    Source := 'switch';
    if IsUserInstaller and not IsElevated then begin
      Result := CopilotActionInstall;
      Choice := CopilotChoiceInstall;
    end else begin
      Result := CopilotActionAdd;
      Choice := CopilotChoiceOnFirstUse;
    end;
  end else if Switch = CopilotChoiceOnFirstUse then begin
    Result := CopilotActionAdd;
    Choice := CopilotChoiceOnFirstUse;
    Source := 'switch';
  end else if Switch = CopilotChoiceNone then begin
    Result := CopilotActionRemove;
    Choice := CopilotChoiceNone;
    Source := 'switch';
  end else if not IsExistingInstall then begin
    Result := CopilotActionAdd;
    Choice := CopilotChoiceOnFirstUse;
    Source := 'default';
  end else if PreviousChoice <> '' then begin
    Result := CopilotActionKeep;
    Choice := PreviousChoice;
    Source := PreviousSource;
  end else if IsUserInstaller and AddToPathSelected then begin
    // One-time migration for user installs that predate the shim and already put `code` on PATH.
    Result := CopilotActionAdd;
    Choice := CopilotChoiceOnFirstUse;
    Source := 'migration';
  end else begin
    Result := CopilotActionKeep;
    Choice := '';
    Source := '';
  end;
end;

function CopilotChoiceFromPage(): String;
begin
  Result := '';
#if "user" == InstallTarget
  if CopilotPageKind = CopilotPageFull then begin
    if CopilotInstallNowRadio.Checked then
      Result := CopilotChoiceInstall
    else if CopilotFirstUseRadio.Checked then
      Result := CopilotChoiceOnFirstUse
    else
      Result := CopilotChoiceNone;
    exit;
  end;
#endif
  if CopilotPageKind = CopilotPageBasic then begin
    if CopilotAddRadio.Checked then
      Result := CopilotChoiceOnFirstUse
    else
      Result := CopilotChoiceNone;
  end;
end;

procedure CopilotEnsureDecision();
var
  PageChoice: String;
begin
  if CopilotDecided then
    exit;
  CopilotDecided := True;
  CopilotInitialize();

  if CopilotPolicyDisabled() or (CopilotProbeCompleted and CopilotProbePolicyDisabled) then begin
    CopilotAction := CopilotActionPolicy;
    CopilotChoice := CopilotChoicePolicy;
    CopilotSource := 'policy';
  end else if WizardSilent() then begin
    CopilotAction := CopilotDecideSilent(CopilotSwitchValue, CopilotIsExistingInstall, CopilotPreviousChoice, CopilotPreviousSource,
      CopilotIsUserInstaller(), IsAdmin(), WizardIsTaskSelected('addtopath'), CopilotChoice, CopilotSource);
  end else begin
    PageChoice := CopilotChoiceFromPage();
    if PageChoice = CopilotChoiceInstall then
      CopilotAction := CopilotActionInstall
    else if PageChoice = CopilotChoiceOnFirstUse then
      CopilotAction := CopilotActionAdd
    else if PageChoice = CopilotChoiceNone then
      CopilotAction := CopilotActionRemove
    else
      CopilotAction := CopilotActionKeep;

    if PageChoice <> '' then begin
      CopilotChoice := PageChoice;
      CopilotSource := 'page';
    end else if CopilotProbeCompleted and CopilotProbeCliFound then begin
      CopilotChoice := CopilotChoiceExisting;
      CopilotSource := 'detected';
    end else begin
      CopilotChoice := CopilotPreviousChoice;
      CopilotSource := CopilotPreviousSource;
    end;
  end;

  Log(Format('Copilot: action=%d, choice=%s, source=%s', [CopilotAction, CopilotChoice, CopilotSource]));
end;

// Shim extraction, probe, and publishing

function CopilotExtractShim(): Boolean;
begin
  if not CopilotShimExtracted then begin
    try
      ExtractTemporaryFile('copilot.exe');
      CopilotShimExtracted := True;
    except
      Log('Copilot: failed to extract the shim: ' + GetExceptionMessage);
    end;
  end;
  Result := CopilotShimExtracted;
end;

function CopilotProbeResultFile(): String;
begin
  Result := ExpandConstant('{tmp}\copilot-probe.ini');
end;

procedure CopilotStartProbe();
var
  Params: String;
  ResultCode: Integer;
begin
  if CopilotProbeStarted then
    exit;
  CopilotProbeStarted := True;
  CopilotProbeStartTick := CopilotGetTickCount();

  if CopilotPolicyDisabled() then begin
    Log('Copilot: not probing because Copilot CLI is disabled by policy');
    exit;
  end;
  if CopilotIsUserInstaller() and IsAdmin() then begin
    Log('Copilot: not probing because the user installer is running elevated');
    exit;
  end;
  if not CopilotExtractShim() then
    exit;

#if "user" == InstallTarget
  Params := '--vscode-shim probe --scope user';
#else
  // The system installer never offers the download, so it only needs local detection.
  Params := '--vscode-shim probe --scope machine --no-network';
#endif
  Params := Params + ' --timeout-ms ' + IntToStr(CopilotProbeTimeoutMs) + ' --result-file ' + AddQuotes(CopilotProbeResultFile());

  CopilotProbeLaunched := Exec(CopilotTempShimPath(), Params, '', SW_HIDE, ewNoWait, ResultCode);
  if CopilotProbeLaunched then
    Log('Copilot: probe started')
  else
    Log('Copilot: failed to start the probe: ' + SysErrorMessage(ResultCode));
end;

procedure CopilotReadProbeResult();
var
  ResultFile: String;
begin
  ResultFile := CopilotProbeResultFile();
  CopilotProbeCompleted := FileExists(ResultFile) and (GetIniInt('probe', 'protocol', 0, 0, 1000, ResultFile) = 1);
  if not CopilotProbeCompleted then begin
    Log('Copilot: the probe did not complete');
    exit;
  end;

  CopilotProbePolicyDisabled := CompareText(GetIniString('probe', 'policy', 'allowed', ResultFile), 'disabled') = 0;
  CopilotProbeAIDisabled := GetIniBool('probe', 'aiDisabled', False, ResultFile);
  CopilotProbeCliFound := GetIniBool('probe', 'cliFound', False, ResultFile);
  CopilotProbeDownloadAvailable := GetIniBool('probe', 'downloadAvailable', False, ResultFile);
  CopilotProbeDownloadSizeMB := (StrToInt64Def(GetIniString('probe', 'downloadSize', '0', ResultFile), 0) + 524288) div 1048576;
  CopilotProbePwshFound := GetIniBool('probe', 'pwshFound', True, ResultFile);
  Log('Copilot: probe policyDisabled=' + BoolToStr(CopilotProbePolicyDisabled) + ', aiDisabled=' + BoolToStr(CopilotProbeAIDisabled)
    + ', cliFound=' + BoolToStr(CopilotProbeCliFound) + ', downloadAvailable=' + BoolToStr(CopilotProbeDownloadAvailable)
    + ', downloadSizeMB=' + IntToStr(CopilotProbeDownloadSizeMB) + ', pwshFound=' + BoolToStr(CopilotProbePwshFound)
    + ', reason=' + GetIniString('probe', 'reason', '', ResultFile));
end;

procedure CopilotWaitForProbe();
var
  Page: TOutputMarqueeProgressWizardPage;
begin
  if CopilotProbeRead then
    exit;
  CopilotProbeRead := True;
  CopilotStartProbe();

  if CopilotProbeLaunched and not FileExists(CopilotProbeResultFile()) and (CopilotElapsedMs(CopilotProbeStartTick) < CopilotProbeWaitMs) then begin
    Page := CreateOutputMarqueeProgressPage(CustomMessage('CopilotCliPageCaption'), CustomMessage('CopilotCliChecking'));
    Page.Show;
    try
      while not FileExists(CopilotProbeResultFile()) and (CopilotElapsedMs(CopilotProbeStartTick) < CopilotProbeWaitMs) do begin
        Page.Animate;
        Sleep(50);
      end;
    finally
      Page.Hide;
    end;
  end;

  CopilotReadProbeResult();
end;

function CopilotNextAsideName(const Dir: String): String;
var
  I: Integer;
begin
  I := 1;
  repeat
    Result := Dir + '\copilot.exe.old-' + IntToStr(I);
    I := I + 1;
  until not FileExists(Result);
end;

procedure CopilotDeleteStaleShims(const Dir: String);
var
  FindRec: TFindRec;
begin
  // Copies renamed aside by earlier updates can be deleted once the Copilot sessions using them have ended.
  if FindFirst(Dir + '\copilot.exe.old-*', FindRec) then begin
    try
      repeat
        if DeleteFile(Dir + '\' + FindRec.Name) then
          Log('Copilot: deleted ' + FindRec.Name);
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;
  DeleteFile(Dir + '\copilot.exe.new');
end;

// Copies the shim into place without Restart Manager. A running shim (an open Copilot session) can't be overwritten
// but can be renamed, so it's moved aside and replaced; the session keeps running from the renamed file.
function CopilotPublishShimFile(const Source, Dir: String): Boolean;
var
  Target, Staging: String;
begin
  Result := False;
  Target := Dir + '\copilot.exe';
  Staging := Dir + '\copilot.exe.new';
  try
    if not ForceDirectories(Dir) then begin
      Log('Copilot: could not create ' + Dir);
      exit;
    end;
    CopilotDeleteStaleShims(Dir);

    if FileExists(Target) then begin
      if GetSHA256OfFile(Target) = GetSHA256OfFile(Source) then begin
        Log('Copilot: the published shim is up to date');
        Result := True;
        exit;
      end;
    end;

    if not CopyFile(Source, Staging, False) then begin
      Log('Copilot: could not copy the shim to ' + Staging);
      exit;
    end;

    if FileExists(Target) then begin
      if not DeleteFile(Target) then begin
        if not RenameFile(Target, CopilotNextAsideName(Dir)) then begin
          Log('Copilot: could not replace ' + Target + '; keeping the current shim');
          DeleteFile(Staging);
          exit;
        end;
      end;
    end;

    Result := RenameFile(Staging, Target);
    Log('Copilot: published the shim, success=' + BoolToStr(Result));
  except
    Log('Copilot: failed to publish the shim: ' + GetExceptionMessage);
  end;
end;

function CopilotPublishShim(): Boolean;
begin
  Result := CopilotExtractShim() and CopilotPublishShimFile(CopilotTempShimPath(), CopilotShimDir());
end;

procedure CopilotRemovePublishedShim();
var
  Dir, Target: String;
begin
  Dir := CopilotShimDir();
  Target := Dir + '\copilot.exe';
  if FileExists(Target) then begin
    if not DeleteFile(Target) then
      RenameFile(Target, CopilotNextAsideName(Dir));
  end;
  CopilotDeleteStaleShims(Dir);
end;

// Install now

function CopilotReadInstallProgress(const ProgressFile: String; var Phase: String; var Current, Total: Int64): String;
var
  Content: AnsiString;
begin
  Result := '';
  Phase := '';
  Current := 0;
  Total := 0;
  if not FileExists(ProgressFile) then
    exit;
  if LoadStringFromFile(ProgressFile, Content) then
    Result := String(Content);
  Phase := GetIniString('progress', 'phase', '', ProgressFile);
  Current := StrToInt64Def(GetIniString('progress', 'current', '0', ProgressFile), 0);
  Total := StrToInt64Def(GetIniString('progress', 'total', '0', ProgressFile), 0);
end;

#if "user" == InstallTarget
procedure CopilotShowInstallProgress(const Page: TDownloadWizardPage; const Phase: String; const Current, Total: Int64);
begin
  if Phase = 'installing' then begin
    // The MSI install can't be stopped safely once it has started.
    Page.AbortButton.Visible := False;
    Page.SetText(CustomMessage('CopilotCliInstallingPhase'), '');
    Page.SetProgress(0, 0);
  end else if Phase = 'verifying' then begin
    Page.SetText(CustomMessage('CopilotCliVerifyingPhase'), '');
    Page.SetProgress(0, 0);
  end else if Total > 0 then begin
    Page.SetText(FmtMessage(CustomMessage('CopilotCliDownloadingProgress'), [IntToStr(Current div 1048576), IntToStr(Total div 1048576)]), '');
    Page.SetProgress(Integer(Current div 1024), Integer(Total div 1024));
  end else begin
    Page.SetText(CustomMessage('CopilotCliDownloadingPhase'), '');
    Page.SetProgress(0, 0);
  end;
end;
#endif

// Runs the shim's install command as the installing user. Never raises; returns True when Copilot CLI is installed.
function CopilotRunInstall(const ShowProgress: Boolean): Boolean;
var
  ProgressFile, ResultFile, CancelFile, MutexName, Params, Status, Signature, LastSignature, Phase: String;
  StartTick, LastChangeTick, CancelTick: Cardinal;
  Current, Total: Int64;
  ResultCode: Integer;
  SeenRunning, CancelRequested, Visible: Boolean;
begin
  Result := False;
  CopilotInstallCancelled := False;
  if not CopilotExtractShim() then
    exit;

  ProgressFile := ExpandConstant('{tmp}\copilot-install-progress.ini');
  ResultFile := ExpandConstant('{tmp}\copilot-install-result.ini');
  CancelFile := ExpandConstant('{tmp}\copilot-install.cancel');
  MutexName := '{#AppMutex}-copilot-install';
  DeleteFile(ProgressFile);
  DeleteFile(ResultFile);
  DeleteFile(CancelFile);

  Params := '--vscode-shim install --non-interactive --consent=installer'
    + ' --progress-file ' + AddQuotes(ProgressFile)
    + ' --result-file ' + AddQuotes(ResultFile)
    + ' --cancel-file ' + AddQuotes(CancelFile)
    + ' --running-mutex ' + AddQuotes(MutexName);

  if not Exec(CopilotTempShimPath(), Params, '', SW_HIDE, ewNoWait, ResultCode) then begin
    Log('Copilot: failed to start the install: ' + SysErrorMessage(ResultCode));
    exit;
  end;
  Log('Copilot: install started');

  Visible := False;
#if "user" == InstallTarget
  Visible := ShowProgress;
  if Visible then begin
    CopilotInstallPage.Show;
    CopilotInstallPage.AbortButton.Visible := True;
    CopilotShowInstallProgress(CopilotInstallPage, '', 0, 0);
  end;
#endif

  StartTick := CopilotGetTickCount();
  LastChangeTick := StartTick;
  CancelTick := StartTick;
  LastSignature := '';
  SeenRunning := False;
  CancelRequested := False;
  try
    while not FileExists(ResultFile) do begin
      if CheckForMutexes(MutexName) then
        SeenRunning := True
      else if SeenRunning then begin
        // The process exited; give the result file a moment to appear.
        Sleep(250);
        break;
      end else if CopilotElapsedMs(StartTick) > CopilotInstallStartTimeoutMs then begin
        Log('Copilot: the install did not start');
        break;
      end;

      Signature := CopilotReadInstallProgress(ProgressFile, Phase, Current, Total);
      if Signature <> LastSignature then begin
        LastSignature := Signature;
        LastChangeTick := CopilotGetTickCount();
      end;

      if not CancelRequested then begin
#if "user" == InstallTarget
        if Visible and CopilotInstallPage.AbortedByUser then begin
          Log('Copilot: the user stopped the install');
          CopilotInstallCancelled := True;
          CancelRequested := True;
        end;
#endif
        if not CancelRequested and (CopilotElapsedMs(LastChangeTick) > CopilotInstallStallTimeoutMs) then begin
          Log('Copilot: the install stopped reporting progress');
          CancelRequested := True;
        end;
        if not CancelRequested and (CopilotElapsedMs(StartTick) > CopilotInstallTotalTimeoutMs) then begin
          Log('Copilot: the install timed out');
          CancelRequested := True;
        end;
        if CancelRequested then begin
          SaveStringToFile(CancelFile, 'cancel', False);
          CancelTick := CopilotGetTickCount();
        end;
      end else if CopilotElapsedMs(CancelTick) > CopilotInstallCancelGraceMs then begin
        Log('Copilot: the install did not stop after cancellation');
        break;
      end;

#if "user" == InstallTarget
      if Visible then
        CopilotShowInstallProgress(CopilotInstallPage, Phase, Current, Total);
#endif
      Sleep(100);
    end;
  finally
#if "user" == InstallTarget
    if Visible then
      CopilotInstallPage.Hide;
#endif
  end;

  if not FileExists(ResultFile) then begin
    Log('Copilot: the install did not report a result');
    exit;
  end;

  Status := GetIniString('result', 'status', '', ResultFile);
  Log('Copilot: install status=' + Status + ', exitCode=' + GetIniString('result', 'exitCode', '', ResultFile)
    + ', cliPath=' + GetIniString('result', 'cliPath', '', ResultFile) + ', cliVersion=' + GetIniString('result', 'cliVersion', '', ResultFile)
    + ', log=' + GetIniString('result', 'log', '', ResultFile));
  Result := (Status = 'installed') or (Status = 'alreadyInstalled');
end;

// Post-install and uninstall entry points, called from code.iss

procedure CopilotPostInstall();
var
  Installed: Boolean;
begin
  CopilotEnsureDecision();

  if CopilotAction = CopilotActionPolicy then begin
    Log('Copilot: Copilot CLI is disabled by policy; removing the copilot command');
    CopilotRemoveFromPath({#EnvironmentRootKey}, '{#EnvironmentKey}', CopilotShimDir());
    CopilotRemovePublishedShim();
    exit;
  end;

  // The shim is always published: VS Code terminals use it even when it isn't on PATH.
  if not CopilotPublishShim() then
    Log('Copilot: continuing without an updated shim');

  if CopilotAction = CopilotActionInstall then begin
    Installed := CopilotRunInstall(not WizardSilent());
    if Installed then
      CopilotCommandReady := True
    else begin
      if not WizardSilent() and not CopilotInstallCancelled then
        SuppressibleMsgBox(FmtMessage(CustomMessage('CopilotCliInstallFailed'), ['{#NameLong}']), mbInformation, MB_OK, IDOK);
      CopilotCommandReady := CopilotAddToPath({#EnvironmentRootKey}, '{#EnvironmentKey}', CopilotShimDir());
    end;
  end else if CopilotAction = CopilotActionAdd then
    CopilotCommandReady := CopilotAddToPath({#EnvironmentRootKey}, '{#EnvironmentKey}', CopilotShimDir())
  else if CopilotAction = CopilotActionRemove then
    CopilotRemoveFromPath({#EnvironmentRootKey}, '{#EnvironmentKey}', CopilotShimDir());
end;

procedure CopilotUninstall();
begin
  CopilotRemoveFromPath({#EnvironmentRootKey}, '{#EnvironmentKey}', CopilotShimDir());
#if "user" != InstallTarget
  // Best effort for an entry added from VS Code by the account that is uninstalling.
  CopilotRemoveFromPath(HKCU, CopilotUserEnvironmentKey, CopilotShimDir());
#endif
end;

// Wizard pages

function CopilotAddText(const Page: TWizardPage; var Top: Integer; const Left: Integer; const Caption: String; const SpaceAfter: Integer): TNewStaticText;
begin
  Result := TNewStaticText.Create(Page);
  Result.Parent := Page.Surface;
  Result.Left := Left;
  Result.Top := Top;
  Result.Width := Page.SurfaceWidth - Left;
  Result.WordWrap := True;
  Result.Caption := Caption;
  Result.AdjustHeight;
  Top := Result.Top + Result.Height + ScaleY(SpaceAfter);
end;

function CopilotAddOption(const Page: TWizardPage; var Top: Integer; const Caption, Description: String): TNewRadioButton;
begin
  Result := TNewRadioButton.Create(Page);
  Result.Parent := Page.Surface;
  Result.Left := 0;
  Result.Top := Top;
  Result.Width := Page.SurfaceWidth;
  Result.Height := ScaleY(17);
  Result.Caption := Caption;
  Top := Result.Top + Result.Height + ScaleY(1);
  CopilotAddText(Page, Top, ScaleX(18), Description, 8);
end;

procedure CopilotLinkClick(Sender: TObject; const Link: String; LinkType: TSysLinkType);
var
  ErrorCode: Integer;
begin
  ShellExecAsOriginalUser('open', Link, '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode);
end;

procedure CopilotAddFooter(const Page: TWizardPage; var Top: Integer);
var
  Note: String;
  Link: TNewLinkLabel;
begin
  Note := CustomMessage('CopilotCliLicenseNote');
  if CopilotProbeCompleted and not CopilotProbePwshFound then
    Note := Note + ' ' + CustomMessage('CopilotCliPwshMissing');

  Link := TNewLinkLabel.Create(Page);
  Link.Parent := Page.Surface;
  Link.AutoSize := False;
  Link.Left := 0;
  Link.Top := Top + ScaleY(4);
  Link.Width := Page.SurfaceWidth;
  Link.Caption := Note + ' <a href="{#CopilotCliLearnMoreUrl}">' + CustomMessage('CopilotCliLearnMore') + '</a>';
  Link.OnLinkClick := @CopilotLinkClick;
  Link.AdjustHeight;
  Top := Link.Top + Link.Height;
end;

procedure CopilotBuildBasicPage();
var
  Top: Integer;
begin
  if CopilotBasicPageBuilt then
    exit;
  CopilotBasicPageBuilt := True;

  Top := 0;
#if "user" == InstallTarget
  CopilotAddText(CopilotBasicPage, Top, 0, CustomMessage('CopilotCliPromptBasic'), 12);
  CopilotAddRadio := CopilotAddOption(CopilotBasicPage, Top, CustomMessage('CopilotCliAdd'), CustomMessage('CopilotCliAddDescription'));
  CopilotBasicDontAddRadio := CopilotAddOption(CopilotBasicPage, Top, CustomMessage('CopilotCliDontAdd'), FmtMessage(CustomMessage('CopilotCliDontAddDescription'), ['{#NameLong}']));
#else
  CopilotAddText(CopilotBasicPage, Top, 0, CustomMessage('CopilotCliPromptAllUsers'), 12);
  CopilotAddRadio := CopilotAddOption(CopilotBasicPage, Top, CustomMessage('CopilotCliAddAllUsers'), CustomMessage('CopilotCliAddAllUsersDescription'));
  CopilotBasicDontAddRadio := CopilotAddOption(CopilotBasicPage, Top, CustomMessage('CopilotCliDontAdd'), FmtMessage(CustomMessage('CopilotCliDontAddAllUsersDescription'), ['{#NameLong}']));
#endif
  CopilotAddFooter(CopilotBasicPage, Top);
end;

#if "user" == InstallTarget
procedure CopilotBuildFullPage();
var
  Top: Integer;
  Description: String;
begin
  if CopilotFullPageBuilt then
    exit;
  CopilotFullPageBuilt := True;

  if CopilotProbeDownloadSizeMB > 0 then
    Description := FmtMessage(CustomMessage('CopilotCliInstallNowDescription'), [IntToStr(CopilotProbeDownloadSizeMB), '{#NameLong}'])
  else
    Description := FmtMessage(CustomMessage('CopilotCliInstallNowDescriptionNoSize'), ['{#NameLong}']);

  Top := 0;
  CopilotAddText(CopilotFullPage, Top, 0, CustomMessage('CopilotCliPrompt'), 12);
  CopilotInstallNowRadio := CopilotAddOption(CopilotFullPage, Top, CustomMessage('CopilotCliInstallNow'), Description);
  CopilotFirstUseRadio := CopilotAddOption(CopilotFullPage, Top, CustomMessage('CopilotCliFirstUse'), CustomMessage('CopilotCliFirstUseDescription'));
  CopilotFullDontAddRadio := CopilotAddOption(CopilotFullPage, Top, CustomMessage('CopilotCliDontAdd'), FmtMessage(CustomMessage('CopilotCliDontAddDescription'), ['{#NameLong}']));
  CopilotAddFooter(CopilotFullPage, Top);
end;
#endif

function CopilotDecidePageKind(): Integer;
begin
  Result := CopilotPageNone;
  if WizardSilent() or CopilotPolicyDisabled() then
    exit;
  if CopilotIsUserInstaller() and IsAdmin() then
    exit;
  if CopilotProbeCompleted and (CopilotProbePolicyDisabled or CopilotProbeAIDisabled or CopilotProbeCliFound) then
    exit;

  if CopilotIsUserInstaller() and CopilotProbeCompleted and CopilotProbeDownloadAvailable then
    Result := CopilotPageFull
  else
    Result := CopilotPageBasic;
end;

procedure CopilotPreparePage();
var
  Choice: String;
begin
  CopilotPageKind := CopilotDecidePageKind();
  Log('Copilot: page kind=' + IntToStr(CopilotPageKind));
  if CopilotPageKind = CopilotPageNone then
    exit;

#if "user" == InstallTarget
  if CopilotPageKind = CopilotPageFull then
    CopilotBuildFullPage()
  else
#endif
    CopilotBuildBasicPage();

  if CopilotDefaultsApplied then
    exit;
  CopilotDefaultsApplied := True;

  Choice := CopilotSelectDefault(CopilotSwitchValue, CopilotPreviousChoice, CopilotPageKind = CopilotPageFull);
#if "user" == InstallTarget
  if CopilotPageKind = CopilotPageFull then begin
    CopilotInstallNowRadio.Checked := Choice = CopilotChoiceInstall;
    CopilotFirstUseRadio.Checked := Choice = CopilotChoiceOnFirstUse;
    CopilotFullDontAddRadio.Checked := Choice = CopilotChoiceNone;
    exit;
  end;
#endif
  CopilotAddRadio.Checked := Choice <> CopilotChoiceNone;
  CopilotBasicDontAddRadio.Checked := Choice = CopilotChoiceNone;
end;

function CopilotReadyMemoChoice(): String;
var
  Choice: String;
begin
  Choice := CopilotChoiceFromPage();
  if Choice = CopilotChoiceInstall then begin
    if CopilotProbeDownloadSizeMB > 0 then
      Result := FmtMessage(CustomMessage('CopilotCliMemoInstallNow'), [IntToStr(CopilotProbeDownloadSizeMB)])
    else
      Result := CustomMessage('CopilotCliMemoInstallNowNoSize');
  end else if Choice = CopilotChoiceOnFirstUse then
    Result := CustomMessage('CopilotCliMemoAdd')
  else
    Result := CustomMessage('CopilotCliMemoDontAdd');
end;

procedure CopilotAppendMemoSection(var Memo: String; const Section, NewLine: String);
begin
  if Section = '' then
    exit;
  if Memo <> '' then
    Memo := Memo + NewLine + NewLine;
  Memo := Memo + Section;
end;

// Event functions

<event('InitializeWizard')>
procedure CopilotInitializeWizard();
begin
  CopilotInitialize();
#if "user" == InstallTarget
  CopilotFullPage := CreateCustomPage(wpSelectTasks, CustomMessage('CopilotCliPageCaption'), CustomMessage('CopilotCliPageDescription'));
  CopilotBasicPage := CreateCustomPage(CopilotFullPage.ID, CustomMessage('CopilotCliPageCaption'), CustomMessage('CopilotCliPageDescription'));
  CopilotInstallPage := CreateDownloadPage(CustomMessage('CopilotCliInstallingCaption'), CustomMessage('CopilotCliInstallingDescription'), nil);
#else
  CopilotBasicPage := CreateCustomPage(wpSelectTasks, CustomMessage('CopilotCliPageCaption'), CustomMessage('CopilotCliPageDescription'));
#endif
end;

<event('NextButtonClick')>
function CopilotNextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if WizardSilent() then
    exit;

  if CurPageID = wpLicense then
    CopilotStartProbe()
  else if CurPageID = wpSelectTasks then begin
    CopilotWaitForProbe();
    CopilotPreparePage();
  end;
end;

<event('CurPageChanged')>
procedure CopilotCurPageChanged(CurPageID: Integer);
var
  Delta: Integer;
begin
  if WizardSilent() then
    exit;

  if CurPageID = wpSelectTasks then
    CopilotStartProbe()
  else if (CurPageID = wpFinished) and CopilotCommandReady then begin
    WizardForm.FinishedLabel.Caption := WizardForm.FinishedLabel.Caption + CustomMessage('CopilotCliFinishedHint') + #13#10;
    Delta := WizardForm.FinishedLabel.AdjustHeight;
    WizardForm.RunList.Top := WizardForm.RunList.Top + Delta;
    WizardForm.RunList.Height := WizardForm.RunList.Height - Delta;
  end;
end;

<event('ShouldSkipPage')>
function CopilotShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
#if "user" == InstallTarget
  if PageID = CopilotFullPage.ID then
    Result := CopilotPageKind <> CopilotPageFull;
#endif
  if PageID = CopilotBasicPage.ID then
    Result := CopilotPageKind <> CopilotPageBasic;
end;

<event('UpdateReadyMemo')>
function CopilotUpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := '';
  CopilotAppendMemoSection(Result, MemoUserInfoInfo, NewLine);
  CopilotAppendMemoSection(Result, MemoDirInfo, NewLine);
  CopilotAppendMemoSection(Result, MemoTypeInfo, NewLine);
  CopilotAppendMemoSection(Result, MemoComponentsInfo, NewLine);
  CopilotAppendMemoSection(Result, MemoGroupInfo, NewLine);
  CopilotAppendMemoSection(Result, MemoTasksInfo, NewLine);
  if CopilotPageKind <> CopilotPageNone then
    CopilotAppendMemoSection(Result, CustomMessage('CopilotCliMemoHeading') + NewLine + Space + CopilotReadyMemoChoice(), NewLine);
end;

<event('RegisterPreviousData')>
procedure CopilotRegisterPreviousData(PreviousDataKey: Integer);
begin
  CopilotEnsureDecision();
  if CopilotChoice <> '' then begin
    SetPreviousData(PreviousDataKey, 'CopilotCliChoice', CopilotChoice);
    SetPreviousData(PreviousDataKey, 'CopilotCliSource', CopilotSource);
  end;
end;
