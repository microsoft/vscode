$title    = 'File Operation'
$question = 'Multiple files need to be processed. How would you like to proceed?'
$choices  = '&Yes', 'Yes to &All', '&No', 'No to A&ll', '&Cancel'

$decision = $Host.UI.PromptForChoice($title, $question, $choices, 0)
switch ($decision) {
    0 { Write-Host "Processing current file..." -ForegroundColor Green }
    1 { Write-Host "Processing all files..." -ForegroundColor Green }
    2 { Write-Host "Skipping current file..." -ForegroundColor Yellow }
    3 { Write-Host "Skipping all files..." -ForegroundColor Yellow }
    4 {
        Write-Host "Operation cancelled." -ForegroundColor Red
        exit
    }
}
$subTitle    = 'Confirmation'
$subQuestion = 'Now pick a color?'
$subChoices  = '&Blue', '&Red'

$subDecision = $Host.UI.PromptForChoice($subTitle, $subQuestion, $subChoices, 0)
if ($subDecision -eq 0) {
    Write-Host "Confirmed. Continuing..." -ForegroundColor Green
} else {
    Write-Host "Action aborted by user." -ForegroundColor Red
    exit
}
