# $caption = "Confirm"
# $message = "Proceed?"
# $choices = @(
#     [System.Management.Automation.Host.ChoiceDescription]::new("&Y", "Y"),
#     [System.Management.Automation.Host.ChoiceDescription]::new("&N", "N")
# )
# $result = $host.UI.PromptForChoice($caption, $message, $choices, 0)
# if ($result -eq 0) {
#     Write-Host "You chose Yes"
# } else {
#     Write-Host "You chose No"
# }

Write-Host "Type 'yes' to proceed:"
$userInput = Read-Host
if ($userInput -eq 'yes') {
    Write-Host "You chose Yes"
} else {
    Write-Host "You chose No"
}
