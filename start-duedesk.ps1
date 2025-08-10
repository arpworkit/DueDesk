# Enhanced DueDesk Application Launcher
# This script provides options to start backend, frontend, database explorer, or all services

Write-Host "" -ForegroundColor White
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "     🚀 Welcome to DueDesk Enhanced!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "" -ForegroundColor White

# Function to check if a port is in use
function Test-Port {
    param([int]$Port)
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
        $listener.Start()
        $listener.Stop()
        return $false
    }
    catch {
        return $true
    }
}

# Function to check database
function Test-Database {
    $dbPath = "E:\GenAI\Userstory\duedesk-backend\customers.db"
    if (Test-Path $dbPath) {
        Write-Host "✓ Database found: $dbPath" -ForegroundColor Green
        return $true
    } else {
        Write-Host "⚠ Database not found: $dbPath" -ForegroundColor Yellow
        Write-Host "  Database will be created when backend starts." -ForegroundColor Gray
        return $false
    }
}

# Function to setup SMTP .env if missing
function Setup-SMTP {
    $envPath = "E:\GenAI\Userstory\duedesk-backend\.env"
    if (Test-Path $envPath) {
        Write-Host "✓ SMTP configuration found (.env)" -ForegroundColor Green
        return
    }

    Write-Host "`n✉️  SMTP is not configured. Let's set it up now (values are stored in duedesk-backend/.env)." -ForegroundColor Yellow
    Write-Host "Choose provider:" -ForegroundColor White
    Write-Host "[1] Gmail (App Password)" -ForegroundColor Yellow
    Write-Host "[2] Outlook / Microsoft 365" -ForegroundColor Yellow
    Write-Host "[3] SendGrid SMTP" -ForegroundColor Yellow
    Write-Host "[4] Custom" -ForegroundColor Yellow
    $prov = Read-Host "Enter choice (1-4)"

    $defaultHost = "smtp.gmail.com"
    $defaultPort = 587
    $defaultSecure = "false"
    switch ($prov) {
        "2" { $defaultHost = "smtp.office365.com"; $defaultPort = 587; $defaultSecure = "false" }
        "3" { $defaultHost = "smtp.sendgrid.net"; $defaultPort = 587; $defaultSecure = "false" }
        default { }
    }

    $hostIn = Read-Host "SMTP host [$defaultHost]"
    if ([string]::IsNullOrWhiteSpace($hostIn)) { $hostIn = $defaultHost }

    $portIn = Read-Host "SMTP port [$defaultPort]"
    if ([string]::IsNullOrWhiteSpace($portIn)) { $portIn = $defaultPort }

    $secureIn = Read-Host "SMTP secure (true/false) [$defaultSecure]"
    if ([string]::IsNullOrWhiteSpace($secureIn)) { $secureIn = $defaultSecure }

    if ($prov -eq "3") {
        Write-Host "For SendGrid, use 'apikey' as username and your API key as password." -ForegroundColor Gray
    }

    $userIn = Read-Host "SMTP username (email or 'apikey')"
    $passIn = Read-Host "SMTP password (app password or API key)"
    $fromIn = Read-Host "MAIL_FROM (e.g., DueDesk <no-reply@yourdomain.com>)"
    if ([string]::IsNullOrWhiteSpace($fromIn)) { $fromIn = "DueDesk <no-reply@yourdomain.com>" }

    $lines = @(
        "SMTP_HOST=$hostIn",
        "SMTP_PORT=$portIn",
        "SMTP_SECURE=$secureIn",
        "SMTP_USER=$userIn",
        "SMTP_PASS=$passIn",
        "MAIL_FROM=$fromIn"
    )
    $dir = Split-Path $envPath -Parent
    if (!(Test-Path $dir)) { New-Item -Path $dir -ItemType Directory | Out-Null }
    Set-Content -Path $envPath -Value $lines -Encoding UTF8
    Write-Host "✓ SMTP .env created at $envPath" -ForegroundColor Green
}

# Function to start backend
function Start-Backend {
    Write-Host "`n🔧 Starting Backend Server..." -ForegroundColor Blue
    Setup-SMTP
    $backendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "& 'E:\GenAI\Userstory\start-backend.bat'" -PassThru
    Start-Sleep -Seconds 2
    Write-Host "✓ Backend server started on http://localhost:4000" -ForegroundColor Green
    return $backendProcess
}

# Function to start frontend
function Start-Frontend {
    Write-Host "`n🎨 Starting Frontend Dashboard..." -ForegroundColor Blue
    $frontendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "& 'E:\GenAI\Userstory\start-frontend.bat'" -PassThru
    Start-Sleep -Seconds 2
    Write-Host "✓ Frontend dashboard started on http://localhost:3000" -ForegroundColor Green
    return $frontendProcess
}

# Function to open database explorer
function Start-DatabaseExplorer {
    Write-Host "`n🗄️ Opening Database Explorer..." -ForegroundColor Blue
    Start-Process cmd -ArgumentList "/k", "E:\GenAI\Userstory\explore-database.bat"
    Write-Host "✓ Database explorer opened" -ForegroundColor Green
}

# Check system status
Write-Host "System Status Check:" -ForegroundColor White
if (Test-Port 4000) {
    Write-Host "⚠ Port 4000 is already in use. Backend might be running." -ForegroundColor Yellow
    Write-Host "  Check: http://localhost:4000/api/health" -ForegroundColor Cyan
} else {
    Write-Host "✓ Port 4000 is available for backend" -ForegroundColor Green
}

if (Test-Port 3000) {
    Write-Host "⚠ Port 3000 is already in use. Frontend might be running." -ForegroundColor Yellow
    Write-Host "  Check: http://localhost:3000" -ForegroundColor Cyan
} else {
    Write-Host "✓ Port 3000 is available for frontend" -ForegroundColor Green
}

Test-Database | Out-Null

# Menu system
do {
    Write-Host "`n==========================================" -ForegroundColor Cyan
    Write-Host "Choose your option:" -ForegroundColor White
    Write-Host "" -ForegroundColor White
    Write-Host "[1] Start Backend Server Only" -ForegroundColor Yellow
    Write-Host "[2] Start Frontend Dashboard Only" -ForegroundColor Yellow
    Write-Host "[3] Start Both Backend + Frontend" -ForegroundColor Yellow
    Write-Host "[4] Open Database Explorer" -ForegroundColor Yellow
    Write-Host "[5] Start Everything (Backend + Frontend + DB Explorer)" -ForegroundColor Yellow
    Write-Host "[6] Check System Status" -ForegroundColor Yellow
    Write-Host "[Q] Quit" -ForegroundColor Red
    Write-Host "" -ForegroundColor White
    
    $choice = Read-Host "Enter your choice (1-6 or Q)"
    
    switch ($choice.ToUpper()) {
        "1" {
            $backendProcess = Start-Backend
            Write-Host "`n✅ Backend service started!" -ForegroundColor Green
            Write-Host "Backend API: http://localhost:4000" -ForegroundColor Cyan
            Write-Host "Health Check: http://localhost:4000/api/health" -ForegroundColor Cyan
            Write-Host "Process ID: $($backendProcess.Id)" -ForegroundColor Gray
            break
        }
        "2" {
            $frontendProcess = Start-Frontend
            Write-Host "`n✅ Frontend service started!" -ForegroundColor Green
            Write-Host "Frontend Dashboard: http://localhost:3000" -ForegroundColor Cyan
            Write-Host "Process ID: $($frontendProcess.Id)" -ForegroundColor Gray
            break
        }
        "3" {
            $backendProcess = Start-Backend
            Start-Sleep -Seconds 3
            $frontendProcess = Start-Frontend
            
            Write-Host "`n✅ Both services started!" -ForegroundColor Green
            Write-Host "Backend API: http://localhost:4000" -ForegroundColor Cyan
            Write-Host "Frontend Dashboard: http://localhost:3000" -ForegroundColor Cyan
            Write-Host "Backend PID: $($backendProcess.Id)" -ForegroundColor Gray
            Write-Host "Frontend PID: $($frontendProcess.Id)" -ForegroundColor Gray
            break
        }
        "4" {
            Start-DatabaseExplorer
            Write-Host "`n✅ Database explorer opened!" -ForegroundColor Green
            Write-Host "Available tables: customers, transaction_history, payment_cycles" -ForegroundColor Cyan
            break
        }
        "5" {
            $backendProcess = Start-Backend
            Start-Sleep -Seconds 3
            $frontendProcess = Start-Frontend
            Start-Sleep -Seconds 2
            Start-DatabaseExplorer
            
            Write-Host "`n✅ All services started!" -ForegroundColor Green
            Write-Host "Backend API: http://localhost:4000" -ForegroundColor Cyan
            Write-Host "Frontend Dashboard: http://localhost:3000" -ForegroundColor Cyan
            Write-Host "Database: SQLite Explorer" -ForegroundColor Cyan
            Write-Host "Backend PID: $($backendProcess.Id)" -ForegroundColor Gray
            Write-Host "Frontend PID: $($frontendProcess.Id)" -ForegroundColor Gray
            break
        }
        "6" {
            Write-Host "`n🔍 Checking System Status..." -ForegroundColor Blue
            if (Test-Port 4000) {
                Write-Host "Backend: RUNNING on port 4000" -ForegroundColor Green
            } else {
                Write-Host "Backend: NOT RUNNING" -ForegroundColor Red
            }
            
            if (Test-Port 3000) {
                Write-Host "Frontend: RUNNING on port 3000" -ForegroundColor Green
            } else {
                Write-Host "Frontend: NOT RUNNING" -ForegroundColor Red
            }
            
            Test-Database | Out-Null
            continue
        }
        "Q" {
            Write-Host "`n👋 Goodbye!" -ForegroundColor Green
            exit
        }
        default {
            Write-Host "`n❌ Invalid choice. Please try again." -ForegroundColor Red
            continue
        }
    }
    
    Write-Host "`n==========================================" -ForegroundColor Cyan
    Write-Host "Services have been started in separate windows." -ForegroundColor White
    Write-Host "Close those windows to stop the services." -ForegroundColor Gray
    Write-Host "" -ForegroundColor White
    
    $continue = Read-Host "Start more services? (y/n)"
    if ($continue.ToLower() -ne "y") {
        break
    }
} while ($true)

Write-Host "`n🎉 DueDesk Enhanced is ready to use!" -ForegroundColor Green
Write-Host "Thank you for using DueDesk!" -ForegroundColor Cyan
