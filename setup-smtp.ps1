# DueDesk SMTP Configuration Script
$envPath = "E:\GenAI\Userstory\duedesk-backend\.env"

Write-Host "=== DueDesk SMTP Configuration ===" -ForegroundColor Cyan
Write-Host ""

# SMTP Host
Write-Host "SMTP host (e.g., smtp.gmail.com): " -NoNewline -ForegroundColor Yellow
$smtpHost = Read-Host
if (-not $smtpHost) {
    Write-Host "SMTP host is required!" -ForegroundColor Red
    exit 1
}

# SMTP Port
Write-Host "SMTP port [587]: " -NoNewline -ForegroundColor Yellow
$port = Read-Host
if (-not $port) { $port = "587" }

# SMTP Secure
Write-Host "SMTP secure (true/false) [false]: " -NoNewline -ForegroundColor Yellow
$secure = Read-Host
if (-not $secure) { $secure = "false" }

# SMTP Username
Write-Host "SMTP username (email or apikey): " -NoNewline -ForegroundColor Yellow
$user = Read-Host
if (-not $user) {
    Write-Host "SMTP username is required!" -ForegroundColor Red
    exit 1
}

# SMTP Password
Write-Host "SMTP password (app password or API key): " -NoNewline -ForegroundColor Yellow
$pass = Read-Host
if (-not $pass) {
    Write-Host "SMTP password is required!" -ForegroundColor Red
    exit 1
}

# MAIL_FROM
Write-Host "MAIL_FROM (e.g., DueDesk <no-reply@yourdomain.com>) [DueDesk <no-reply@yourdomain.com>]: " -NoNewline -ForegroundColor Yellow
$from = Read-Host
if (-not $from) { $from = "DueDesk <no-reply@yourdomain.com>" }

# Create .env file
$lines = @(
    "SMTP_HOST=$smtpHost",
    "SMTP_PORT=$port",
    "SMTP_SECURE=$secure",
    "SMTP_USER=$user",
    "SMTP_PASS=$pass",
    "MAIL_FROM=$from"
)

try {
    Set-Content -Path $envPath -Value $lines -Encoding UTF8
    Write-Host ""
    Write-Host "SMTP configuration saved to $envPath" -ForegroundColor Green
    Write-Host ""
    Write-Host "Configuration:" -ForegroundColor Cyan
    Write-Host "  Host: $smtpHost" -ForegroundColor White
    Write-Host "  Port: $port" -ForegroundColor White
    Write-Host "  Secure: $secure" -ForegroundColor White
    Write-Host "  User: $user" -ForegroundColor White
    Write-Host "  From: $from" -ForegroundColor White
} catch {
    Write-Host "Failed to create .env file: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
