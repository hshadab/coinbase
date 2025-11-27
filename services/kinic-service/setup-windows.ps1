# Kinic AI Memory - Windows Setup Script
# Run this in PowerShell as Administrator

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Kinic AI Memory - Windows Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Python
Write-Host "[1/5] Checking Python..." -ForegroundColor Yellow
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "  Python not found. Installing via winget..." -ForegroundColor Red
    winget install Python.Python.3.11
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    Write-Host "  Python found: $($python.Source)" -ForegroundColor Green
}

# Check/Install dfx
Write-Host ""
Write-Host "[2/5] Checking dfx (Internet Computer SDK)..." -ForegroundColor Yellow
$dfx = Get-Command dfx -ErrorAction SilentlyContinue
if (-not $dfx) {
    Write-Host "  dfx not found. Downloading..." -ForegroundColor Red
    $dfxVersion = "0.25.0"
    $dfxUrl = "https://github.com/dfinity/sdk/releases/download/$dfxVersion/dfx-$dfxVersion-x86_64-windows.exe"
    $dfxPath = "$env:LOCALAPPDATA\dfinity\dfx"

    # Create directory
    New-Item -ItemType Directory -Force -Path $dfxPath | Out-Null

    # Download
    Write-Host "  Downloading dfx $dfxVersion..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $dfxUrl -OutFile "$dfxPath\dfx.exe"

    # Add to PATH
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$dfxPath*") {
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$dfxPath", "User")
        $env:Path = "$env:Path;$dfxPath"
    }

    Write-Host "  dfx installed to $dfxPath" -ForegroundColor Green
} else {
    Write-Host "  dfx found: $($dfx.Source)" -ForegroundColor Green
}

# Install Python dependencies
Write-Host ""
Write-Host "[3/5] Installing Python dependencies..." -ForegroundColor Yellow
pip install git+https://github.com/ICME-Lab/kinic-cli.git --quiet
pip install fastapi uvicorn pydantic python-dotenv --quiet
Write-Host "  Dependencies installed" -ForegroundColor Green

# Setup dfx identity
Write-Host ""
Write-Host "[4/5] Setting up dfx identity..." -ForegroundColor Yellow
$identityName = "jolt-atlas"

# Check if identity exists
$identities = dfx identity list 2>$null
if ($identities -match $identityName) {
    Write-Host "  Identity '$identityName' already exists" -ForegroundColor Green
    dfx identity use $identityName
} else {
    Write-Host "  Creating new identity '$identityName'..." -ForegroundColor Yellow
    dfx identity new $identityName
    dfx identity use $identityName
}

# Get principal
$principal = dfx identity get-principal
Write-Host "  Principal: $principal" -ForegroundColor Cyan

# Create .env file
Write-Host ""
Write-Host "[5/5] Creating .env file..." -ForegroundColor Yellow
$envContent = @"
# Kinic AI Memory Configuration
KINIC_IDENTITY=$identityName
KINIC_USE_IC=true
PORT=3002
"@

$envContent | Out-File -FilePath ".env" -Encoding UTF8
Write-Host "  .env file created" -ForegroundColor Green

# Done!
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Your Kinic Principal:" -ForegroundColor Cyan
Write-Host "  $principal" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Send KINIC tokens to the principal above"
Write-Host "  2. Run the service:"
Write-Host "     python main.py" -ForegroundColor White
Write-Host ""
Write-Host "  3. Test the API:"
Write-Host "     curl http://localhost:3002/health" -ForegroundColor White
Write-Host ""
