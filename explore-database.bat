@echo off
title DueDesk Database Explorer
echo.
echo ========================================
echo    🗄️ DueDesk Database Explorer
echo ========================================
echo.
echo This will open a SQLite command-line interface
echo to explore the DueDesk database directly.
echo.
echo Available tables:
echo - customers
echo - transaction_history
echo - payment_cycles
echo.
echo Common queries:
echo SELECT * FROM customers;
echo SELECT * FROM transaction_history;
echo SELECT * FROM payment_cycles;
echo.
echo Type ".exit" to quit SQLite
echo.
pause
cd /d "E:\GenAI\Userstory\duedesk-backend"
sqlite3 customers.db
