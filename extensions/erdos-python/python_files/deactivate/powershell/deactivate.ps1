# Load dotenv-style file and restore environment variables
Get-Content -Path "$PSScriptRoot\envVars.txt" | ForEach-Object {
    # Split each line into key and value at the first '='
    $parts = $_ -split '=', 2
    if ($parts.Count -eq 2) {
        $key = $parts[0].Trim()
        $value = $parts[1].Trim()
        # Set the environment variable
        Set-Item -Path "env:$key" -Value $value
    }
}
