#Requires -Version 5.1
<#
  FinanceApp bootstrap: installs Chocolatey/Node.js/Git only if missing,
  clones the repo (or pulls if already present), installs npm deps,
  fetches the Electron binary if needed, and launches `npm run dev`.

  Intended to be run via:
    irm https://jasr.me/financeapp | iex
#>

$ErrorActionPreference = 'Stop'

function Update-SessionPath {
    $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$RepoUrl = 'https://github.com/matthewcaras/financeapp.git'
$DestDir = Join-Path $HOME 'Documents\Github\FinanceApp'
$BootstrapUrl = 'https://jasr.me/financeapp'

$needChoco = -not (Get-Command choco -ErrorAction SilentlyContinue)
$needNode  = -not (Get-Command node  -ErrorAction SilentlyContinue)
$needGit   = -not (Get-Command git   -ErrorAction SilentlyContinue)

if ($needChoco -or $needNode -or $needGit) {
    if (-not (Test-IsAdmin)) {
        Write-Host "Missing prerequisites (choco/node/git). Relaunching elevated to install them..." -ForegroundColor Yellow
        Start-Process powershell -Verb RunAs -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
            "irm $BootstrapUrl | iex"
        )
        return
    }

    if ($needChoco) {
        Write-Host "Installing Chocolatey..." -ForegroundColor Cyan
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        Update-SessionPath
    }

    if ($needNode) {
        Write-Host "Installing Node.js LTS..." -ForegroundColor Cyan
        choco install nodejs-lts -y
        Update-SessionPath
    }

    if ($needGit) {
        Write-Host "Installing Git..." -ForegroundColor Cyan
        choco install git -y
        Update-SessionPath
    }
}

Update-SessionPath

if (Test-Path (Join-Path $DestDir '.git')) {
    Write-Host "FinanceApp already cloned, pulling latest..." -ForegroundColor Cyan
    Push-Location $DestDir
    git pull
}
else {
    Write-Host "Cloning FinanceApp..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path (Split-Path $DestDir) | Out-Null
    git clone $RepoUrl $DestDir
    Push-Location $DestDir
}

Write-Host "Installing npm dependencies..." -ForegroundColor Cyan
npm install --ignore-scripts

$electronExe = Join-Path $DestDir 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electronExe)) {
    Write-Host "Fetching Electron binary..." -ForegroundColor Cyan
    node node_modules\electron\install.js
}

Write-Host "Starting FinanceApp..." -ForegroundColor Green
npm run dev

Pop-Location
