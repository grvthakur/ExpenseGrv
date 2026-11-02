param(
  [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) "deploy\apps-script-source")
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackendRoot = Join-Path $ProjectRoot "backend"
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)

$files = @(Get-ChildItem -Path $BackendRoot -Filter "*.gs" -File -Recurse)
$duplicates = @($files | Group-Object Name | Where-Object { $_.Count -gt 1 })
if ($duplicates.Count -gt 0) {
  $names = ($duplicates | ForEach-Object { $_.Name }) -join ", "
  throw "Apps Script flat namespace collision: duplicate .gs filenames: $names"
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
foreach ($file in $files) {
  $target = Join-Path $OutputDirectory $file.Name
  Copy-Item -LiteralPath $file.FullName -Destination $target -Force
  Write-Host ("Flattened {0} -> {1}" -f $file.FullName.Substring($ProjectRoot.Path.Length + 1), $target)
}

$manifest = Join-Path $BackendRoot "appsscript.json"
if (Test-Path $manifest) {
  Copy-Item -LiteralPath $manifest -Destination (Join-Path $OutputDirectory "appsscript.json") -Force
} else {
  Write-Warning "No appsscript.json was present in the uploaded source. Clone the existing bound Apps Script project and retain its existing manifest before clasp push."
}

Write-Host ("Completed: {0} .gs files copied flat." -f $files.Count)
Write-Host "Repository folders are not Apps Script folders; all .gs files must remain flat in the bound Apps Script project."
