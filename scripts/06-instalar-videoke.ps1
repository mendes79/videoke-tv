# 06-instalar-videoke.ps1 - Monta, assina (perfil 'mendes'), instala e abre o Videoke na TV.
param([string]$TvIp = "192.168.18.77", [string]$Perfil = "mendes")
$ErrorActionPreference = 'Continue'
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$proj = Join-Path $root "videoke-app"
$out  = Join-Path $proj ".buildResult"
$sdb  = "C:\tizen-studio\tools\sdb.exe"
$tz   = "C:\tizen-studio\tools\ide\bin\tizen.bat"
$serial = "$TvIp`:26101"
$appId = "lilvideoke.Videoke"
$logDir = Join-Path $root "diagnostico"; New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("videoke_install_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".txt")
function Run($titulo, [scriptblock]$b) {
  $h = "`n==== $titulo ===="; Add-Content -Path $log -Value $h; Write-Host $h -ForegroundColor Cyan
  $r = & $b 2>&1 | Out-String; Add-Content -Path $log -Value $r; Write-Host $r
}
if (-not (Test-Path $tz)) { "tizen CLI nao encontrado em $tz" | Tee-Object -FilePath $log -Append; exit 1 }

Run "CONECTAR" { & $sdb connect $serial; & $sdb devices }
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
Run "BUILD" { & $tz build-web -- $proj }
Run "PACKAGE (perfil $Perfil)" { & $tz package -t wgt -s $Perfil -- $out }
$wgt = Get-ChildItem -Path $out -Filter *.wgt -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $wgt) { "FALHA: .wgt nao gerado. Veja o log: $log" | Tee-Object -FilePath $log -Append; exit 1 }
$final = Join-Path $out "Videoke.wgt"
if ($wgt.FullName -ne $final) { Move-Item -Force $wgt.FullName $final }
Run "INSTALL" { & $tz install -s $serial --name Videoke.wgt -- $out }
Run "RUN" { & $tz run -s $serial -p $appId }
"`nLog: $log" | Tee-Object -FilePath $log -Append
