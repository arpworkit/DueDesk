const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();

// JWT Secret - In production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'duedesk-admin-secret-key';

const app = express();
const PORT = 4000;

app.use(cors());
app.use(bodyParser.json());

// Initialize SQLite DB
const db = new sqlite3.Database('./customers.db', (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

// Create customers table with enhanced structure
db.run(`CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  number TEXT NOT NULL,
  email TEXT NOT NULL,
  amountToPay REAL NOT NULL DEFAULT 0,
  amountPaid REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active',
  cycle INTEGER NOT NULL DEFAULT 1,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Create transaction history table with payment mode support
db.run(`CREATE TABLE IF NOT EXISTS transaction_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  cycle INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  amount REAL NOT NULL,
  previous_amount_paid REAL NOT NULL DEFAULT 0,
  new_amount_paid REAL NOT NULL DEFAULT 0,
  payment_mode TEXT DEFAULT 'cash',
  transaction_id TEXT,
  payment_status TEXT DEFAULT 'completed',
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
)`);

// Create payment cycles table for historical tracking
db.run(`CREATE TABLE IF NOT EXISTS payment_cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  amount_to_pay REAL NOT NULL,
  amount_paid REAL NOT NULL,
  status TEXT NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
)`);

// Create admin users table
db.run(`CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
)`);
// Email logs table
db.run(`CREATE TABLE IF NOT EXISTS email_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  email TEXT,
  subject TEXT,
  body TEXT,
  status TEXT,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL
)`);

// Create reusable transporter using SMTP
function createMailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === 'true';
  if (!host || !user || !pass) {
    throw new Error('SMTP configuration missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS');
  }
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

async function sendReminderEmail(transporter, customer) {
  const pending = Math.max(0, customer.amountToPay - customer.amountPaid);
  const status = customer.amountPaid === 0 ? 'Not Paid' : (pending > 0 ? 'Partially Paid' : 'Paid');
  if (status === 'Paid') return { skipped: true };

  const subject = `Payment Reminder - Pending Amount ${pending > 0 ? '₹' + pending.toFixed(2) : ''}`;
  const body = `Hello ${customer.name},\n\n` +
    `This is a friendly reminder that your payment status is "${status}".\n` +
    `- Total Amount: ₹${customer.amountToPay.toFixed(2)}\n` +
    `- Amount Paid: ₹${customer.amountPaid.toFixed(2)}\n` +
    `- Amount Pending: ₹${pending.toFixed(2)}\n\n` +
    `You can pay online or visit our store to pay in cash.\n` +
    `If you have already completed the payment, please ignore this message.\n\n` +
    `Thank you,\nDueDesk`;

  const mailOptions = {
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: customer.email,
    subject,
    text: body
  };

  await transporter.sendMail(mailOptions);

  return { skipped: false, subject, body };
}

// Protected endpoint to send reminders to Not Paid or Partially Paid customers
app.post('/api/customers/send-reminders', verifyToken, async (req, res) => {
  let transporter;
  try {
    transporter = createMailTransporter();
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  db.all('SELECT * FROM customers', [], async (err, customers) => {
    if (err) return res.status(500).json({ success: false, error: err.message });

    const targets = customers.filter(c => (c.amountToPay - c.amountPaid) > 0 && c.email);
    const results = [];

    for (const c of targets) {
      try {
        const r = await sendReminderEmail(transporter, c);
        if (!r.skipped) {
          db.run('INSERT INTO email_logs (customer_id, email, subject, body, status) VALUES (?,?,?,?,?)',
            [c.id, c.email, r.subject, r.body, 'sent']);
        }
        results.push({ customerId: c.id, email: c.email, status: r.skipped ? 'skipped' : 'sent' });
      } catch (e) {
        db.run('INSERT INTO email_logs (customer_id, email, subject, body, status, error) VALUES (?,?,?,?,?,?)',
          [c.id, c.email, null, null, 'failed', String(e)]);
        results.push({ customerId: c.id, email: c.email, status: 'failed', error: String(e) });
      }
    }

    res.json({ success: true, count: results.length, results });
  });
});

// Wait for all tables to be created before creating admin user
setTimeout(() => {
  // Create default admin user if none exists
  db.get('SELECT COUNT(*) as count FROM admin_users', [], (err, result) => {
    if (err) {
      console.error('Error checking admin users:', err);
      return;
    }
    
    if (result.count === 0) {
      const defaultPassword = 'admin123';
      const hashedPassword = bcrypt.hashSync(defaultPassword, 10);
      
      db.run(
        'INSERT INTO admin_users (username, email, password, full_name) VALUES (?, ?, ?, ?)',
        ['admin', 'admin@duedesk.com', hashedPassword, 'Default Administrator'],
        function(err) {
          if (err) {
            console.error('Error creating default admin user:', err);
          } else {
            console.log('✅ Default admin user created:');
            console.log('   Username: admin');
            console.log('   Password: admin123');
            console.log('   Email: admin@duedesk.com');
            console.log('   Please change the password after first login!');
          }
        }
      );
    } else {
      console.log('✅ Admin user already exists');
    }
  });
}, 1000);

// Database migration: Add missing columns if they don't exist
function runMigrations() {
  // Add cycle column
  db.run(`ALTER TABLE customers ADD COLUMN cycle INTEGER DEFAULT 1`, (err) => {
    if (err && err.message.includes('duplicate column name')) {
      console.log('Cycle column already exists, updating NULL values...');
      db.run(`UPDATE customers SET cycle = 1 WHERE cycle IS NULL OR cycle = 0`, (updateErr) => {
        if (updateErr) {
          console.error('Migration update error for cycle:', updateErr);
        } else {
          console.log('Database migration completed: Updated cycle values for existing customers');
        }
      });
    } else if (err && !err.message.includes('duplicate column name')) {
      console.error('Migration error adding cycle column:', err);
    } else {
      console.log('Database migration completed: Added cycle column to customers table');
    }
  });
  
  // Add status column
  db.run(`ALTER TABLE customers ADD COLUMN status TEXT DEFAULT 'Active'`, (err) => {
    if (err && err.message.includes('duplicate column name')) {
      console.log('Status column already exists, updating NULL values...');
      db.run(`UPDATE customers SET status = 'Active' WHERE status IS NULL OR status = ''`, (updateErr) => {
        if (updateErr) {
          console.error('Migration update error for status:', updateErr);
        } else {
          console.log('Database migration completed: Updated status values for existing customers');
        }
      });
    } else if (err && !err.message.includes('duplicate column name')) {
      console.error('Migration error adding status column:', err);
    } else {
      console.log('Database migration completed: Added status column to customers table');
    }
  });
}

// Run migrations
runMigrations();

// Helper function to log transaction history with payment mode support
function logTransaction(customerId, customerName, customerEmail, cycle, transactionType, amount, previousAmount, newAmount, paymentMode = 'cash', transactionId = null, paymentStatus = 'completed', description = null) {
  const stmt = db.prepare(`
    INSERT INTO transaction_history 
    (customer_id, customer_name, customer_email, cycle, transaction_type, amount, previous_amount_paid, new_amount_paid, payment_mode, transaction_id, payment_status, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  // Ensure cycle is never null or undefined, default to 1
  const safeCycle = cycle || 1;
  
  stmt.run(customerId, customerName, customerEmail, safeCycle, transactionType, amount, previousAmount, newAmount, paymentMode, transactionId, paymentStatus, description);
  stmt.finalize();
}

// Helper function to complete payment cycle and create history record
function completePaymentCycle(customer, callback) {
  const stmt = db.prepare(`
    INSERT INTO payment_cycles 
    (customer_id, customer_name, customer_email, cycle_number, amount_to_pay, amount_paid, status, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  
  const status = customer.amountPaid >= customer.amountToPay ? 'Completed' : 'Incomplete';
  // Ensure cycle is never null or undefined, default to 1
  const cycleNumber = customer.cycle || 1;
  
  stmt.run(customer.id, customer.name, customer.email, cycleNumber, customer.amountToPay, customer.amountPaid, status, callback);
  stmt.finalize();
}

// Helper function to calculate remaining amount and payment status
function calculateCustomerDetails(customer) {
  const amountRemaining = Math.max(0, customer.amountToPay - customer.amountPaid);
  const overpayment = Math.max(0, customer.amountPaid - customer.amountToPay);
  
  let paymentStatus;
  if (customer.amountPaid === 0) {
    paymentStatus = 'Not Paid';
  } else if (customer.amountPaid >= customer.amountToPay) {
    paymentStatus = customer.amountPaid > customer.amountToPay ? 'Overpaid' : 'Paid';
  } else {
    paymentStatus = 'Partially Paid';
  }
  
  return {
    ...customer,
    amountRemaining,
    overpayment,
    paymentStatus,
    paymentPercentage: customer.amountToPay > 0 ? Math.min(100, (customer.amountPaid / customer.amountToPay) * 100) : 0
  };
}

// Middleware to verify JWT token
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ 
      success: false,
      error: 'Access token is required' 
    });
  }
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ 
        success: false,
        error: 'Invalid or expired token' 
      });
    }
    
    req.user = decoded;
    next();
  });
}

// Admin login endpoint
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required'
    });
  }
  
  // Find admin user by username or email
  db.get(
    'SELECT * FROM admin_users WHERE (username = ? OR email = ?) AND is_active = 1',
    [username, username],
    (err, user) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database error during login'
        });
      }
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }
      
      // Verify password
      bcrypt.compare(password, user.password, (err, isMatch) => {
        if (err) {
          return res.status(500).json({
            success: false,
            error: 'Error verifying password'
          });
        }
        
        if (!isMatch) {
          return res.status(401).json({
            success: false,
            error: 'Invalid credentials'
          });
        }
        
        // Update last login time
        db.run(
          'UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
          [user.id],
          (updateErr) => {
            if (updateErr) {
              console.error('Error updating last login:', updateErr);
            }
          }
        );
        
        // Generate JWT token
        const token = jwt.sign(
          {
            userId: user.id,
            username: user.username,
            email: user.email,
            fullName: user.full_name,
            role: user.role
          },
          JWT_SECRET,
          { expiresIn: '8h' }
        );
        
        res.json({
          success: true,
          message: 'Login successful',
          data: {
            token,
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
              fullName: user.full_name,
              role: user.role,
              lastLogin: user.last_login
            }
          }
        });
      });
    }
  );
});

// Verify token endpoint
app.get('/api/auth/verify', verifyToken, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    data: {
      user: req.user
    }
  });
});

// Admin profile endpoint
app.get('/api/auth/profile', verifyToken, (req, res) => {
  db.get(
    'SELECT id, username, email, full_name, role, created_at, last_login FROM admin_users WHERE id = ?',
    [req.user.userId],
    (err, user) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Error fetching profile'
        });
      }
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.full_name,
            role: user.role,
            createdAt: user.created_at,
            lastLogin: user.last_login
          }
        }
      });
    }
  );
});

// Change password endpoint
app.post('/api/auth/change-password', verifyToken, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      error: 'Current password and new password are required'
    });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'New password must be at least 6 characters long'
    });
  }
  
  // Get current user
  db.get(
    'SELECT * FROM admin_users WHERE id = ?',
    [req.user.userId],
    (err, user) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database error'
        });
      }
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Verify current password
      bcrypt.compare(currentPassword, user.password, (err, isMatch) => {
        if (err) {
          return res.status(500).json({
            success: false,
            error: 'Error verifying current password'
          });
        }
        
        if (!isMatch) {
          return res.status(401).json({
            success: false,
            error: 'Current password is incorrect'
          });
        }
        
        // Hash new password
        const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
        
        // Update password
        db.run(
          'UPDATE admin_users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [hashedNewPassword, req.user.userId],
          function(err) {
            if (err) {
              return res.status(500).json({
                success: false,
                error: 'Error updating password'
              });
            }
            
            res.json({
              success: true,
              message: 'Password changed successfully'
            });
          }
        );
      });
    }
  );
});

// Admin logout endpoint (client-side token removal)
app.post('/api/auth/logout', verifyToken, (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful. Please remove the token from client storage.'
  });
});

// Add new customer
app.post('/api/customers', (req, res) => {
  const { name, number, email, amountToPay = 0, amountPaid = 0 } = req.body;
  
  // Basic input validation
  if (!name || !number || !email) {
    return res.status(400).json({ 
      success: false,
      error: 'Name, number, and email are required' 
    });
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      success: false,
      error: 'Please provide a valid email address' 
    });
  }
  
  if (typeof amountToPay !== 'number' || typeof amountPaid !== 'number') {
    return res.status(400).json({ 
      success: false,
      error: 'Amounts must be numbers' 
    });
  }
  
  if (amountToPay < 0 || amountPaid < 0) {
    return res.status(400).json({ 
      success: false,
      error: 'Amounts cannot be negative' 
    });
  }

  // Enforce business rule: amountPaid cannot exceed amountToPay
  if (amountPaid > amountToPay) {
    return res.status(400).json({
      success: false,
      error: 'Amount paid cannot exceed amount to pay'
    });
  }

  // Check if email already exists
  db.get('SELECT * FROM customers WHERE email = ?', [email], (err, row) => {
    if (err) return res.status(500).json({ 
      success: false,
      error: err.message 
    });
    
    if (row) {
      // Email already exists, return error
      return res.status(409).json({ 
        success: false,
        error: 'Customer with this email already exists' 
      });
    }
    
    // Insert new customer
    db.run(
      'INSERT INTO customers (name, number, email, amountToPay, amountPaid) VALUES (?, ?, ?, ?, ?)',
      [name, number, email, amountToPay, amountPaid],
      function (err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ 
              success: false,
              error: 'Customer with this email already exists' 
            });
          }
          return res.status(500).json({ 
            success: false,
            error: err.message 
          });
        }
        
        // Get the created customer with calculated details
        db.get('SELECT * FROM customers WHERE id = ?', [this.lastID], (err, newCustomer) => {
          if (err) return res.status(500).json({ 
            success: false,
            error: err.message 
          });
          
          const customerWithDetails = calculateCustomerDetails(newCustomer);
          
          res.status(201).json({ 
            success: true,
            data: customerWithDetails,
            message: 'Customer created successfully'
          });
        });
      }
    );
  });
});

// Update existing customer by ID
app.put('/api/customers/:id', (req, res) => {
  const customerId = parseInt(req.params.id);
  const { name, number, email, amountToPay, amountPaid } = req.body;
  
  // Basic input validation
  if (!customerId || isNaN(customerId)) {
    return res.status(400).json({ 
      success: false,
      error: 'Valid customer ID is required' 
    });
  }
  
  if (!name || !number || !email) {
    return res.status(400).json({ 
      success: false,
      error: 'Name, number, and email are required' 
    });
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      success: false,
      error: 'Please provide a valid email address' 
    });
  }
  
  if (typeof amountToPay !== 'number' || typeof amountPaid !== 'number') {
    return res.status(400).json({ 
      success: false,
      error: 'Amounts must be numbers' 
    });
  }
  
  if (amountToPay < 0 || amountPaid < 0) {
    return res.status(400).json({ 
      success: false,
      error: 'Amounts cannot be negative' 
    });
  }

  // Enforce business rule: amountPaid cannot exceed amountToPay
  if (amountPaid > amountToPay) {
    return res.status(400).json({
      success: false,
      error: 'Amount paid cannot exceed amount to pay'
    });
  }

  // Check if customer exists
  db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, row) => {
    if (err) return res.status(500).json({ 
      success: false,
      error: err.message 
    });
    
    if (!row) {
      return res.status(404).json({ 
        success: false,
        error: 'Customer not found' 
      });
    }

    // Check if email is being changed and if it conflicts with another customer
    if (row.email !== email) {
      db.get('SELECT * FROM customers WHERE email = ? AND id != ?', [email, customerId], (err, conflictRow) => {
        if (err) return res.status(500).json({ 
          success: false,
          error: err.message 
        });
        
        if (conflictRow) {
          return res.status(409).json({ 
            success: false,
            error: 'Email already exists for another customer' 
          });
        }
        
        // Update the customer
        updateCustomer();
      });
    } else {
      // Email hasn't changed, safe to update
      updateCustomer();
    }
    
    function updateCustomer() {
      db.run(
        'UPDATE customers SET name=?, number=?, email=?, amountToPay=?, amountPaid=?, updatedAt=CURRENT_TIMESTAMP WHERE id=?',
        [name, number, email, amountToPay, amountPaid, customerId],
        function (err) {
          if (err) {
            if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
              return res.status(409).json({ 
                success: false,
                error: 'Email already exists for another customer' 
              });
            }
            return res.status(500).json({ 
              success: false,
              error: err.message 
            });
          }
          
          if (this.changes === 0) {
            return res.status(404).json({ 
              success: false,
              error: 'Customer not found' 
            });
          }
          
          // Get the updated customer with calculated details
          db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, updatedCustomer) => {
            if (err) return res.status(500).json({ 
              success: false,
              error: err.message 
            });
            
            const customerWithDetails = calculateCustomerDetails(updatedCustomer);
            
            res.json({ 
              success: true,
              data: customerWithDetails,
              message: 'Customer updated successfully'
            });
          });
        }
      );
    }
  });
});

// Get all customers with enhanced details and filtering options
app.get('/api/customers', (req, res) => {
  const { status, sortBy = 'name', order = 'ASC', limit, offset = 0 } = req.query;
  
  let query = 'SELECT * FROM customers';
  let params = [];
  
  // Add filtering by payment status if requested
  if (status) {
    // We'll filter on the client side since SQLite doesn't have direct status calculation
  }
  
  // Add sorting
  const validSortFields = ['name', 'email', 'amountToPay', 'amountPaid', 'createdAt', 'updatedAt'];
  const validOrder = ['ASC', 'DESC'];
  
  if (validSortFields.includes(sortBy) && validOrder.includes(order.toUpperCase())) {
    query += ` ORDER BY ${sortBy} ${order.toUpperCase()}`;
  }
  
  // Add pagination
  if (limit) {
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
  }
  
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ 
      success: false,
      error: err.message 
    });
    
    // Calculate enhanced details for each customer
    let customersWithDetails = rows.map(customer => calculateCustomerDetails(customer));
    
    // Apply status filtering if requested
    if (status) {
      const validStatuses = ['Not Paid', 'Partially Paid', 'Paid', 'Overpaid'];
      if (validStatuses.includes(status)) {
        customersWithDetails = customersWithDetails.filter(customer => customer.paymentStatus === status);
      }
    }
    
    // Calculate summary statistics
    const totalCustomers = customersWithDetails.length;
    const totalAmountToPay = customersWithDetails.reduce((sum, c) => sum + c.amountToPay, 0);
    const totalAmountPaid = customersWithDetails.reduce((sum, c) => sum + c.amountPaid, 0);
    const totalAmountRemaining = customersWithDetails.reduce((sum, c) => sum + c.amountRemaining, 0);
    const totalOverpayment = customersWithDetails.reduce((sum, c) => sum + c.overpayment, 0);
    
    const statusCounts = {
      'Not Paid': customersWithDetails.filter(c => c.paymentStatus === 'Not Paid').length,
      'Partially Paid': customersWithDetails.filter(c => c.paymentStatus === 'Partially Paid').length,
      'Paid': customersWithDetails.filter(c => c.paymentStatus === 'Paid').length,
      'Overpaid': customersWithDetails.filter(c => c.paymentStatus === 'Overpaid').length
    };
    
    res.json({
      success: true,
      data: customersWithDetails,
      summary: {
        totalCustomers,
        totalAmountToPay: Math.round(totalAmountToPay * 100) / 100,
        totalAmountPaid: Math.round(totalAmountPaid * 100) / 100,
        totalAmountRemaining: Math.round(totalAmountRemaining * 100) / 100,
        totalOverpayment: Math.round(totalOverpayment * 100) / 100,
        statusCounts
      },
      pagination: {
        offset: parseInt(offset),
        limit: limit ? parseInt(limit) : totalCustomers,
        total: totalCustomers
      }
    });
  });
});

// Get a specific customer by ID
app.get('/api/customers/:id', (req, res) => {
  const customerId = parseInt(req.params.id);
  
  if (!customerId || isNaN(customerId)) {
    return res.status(400).json({ 
      success: false,
      error: 'Valid customer ID is required' 
    });
  }
  
  db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, row) => {
    if (err) return res.status(500).json({ 
      success: false,
      error: err.message 
    });
    
    if (!row) {
      return res.status(404).json({ 
        success: false,
        error: 'Customer not found' 
      });
    }
    
    const customerWithDetails = calculateCustomerDetails(row);
    
    res.json({
      success: true,
      data: customerWithDetails
    });
  });
});
// Update payment for a customer (partial payment endpoint) with payment mode support
app.patch('/api/customers/:id/payment', (req, res) => {
  const customerId = parseInt(req.params.id);
  const { paymentAmount, paymentType = 'add', paymentMode = 'cash', description } = req.body; // 'add' or 'set'
  
  if (!customerId || isNaN(customerId)) {
    return res.status(400).json({ 
      success: false,
      error: 'Valid customer ID is required' 
    });
  }
  
  if (typeof paymentAmount !== 'number' || paymentAmount <= 0) {
    return res.status(400).json({ 
      success: false,
      error: 'Payment amount must be a positive number' 
    });
  }
  
  // Validate payment mode
  const validPaymentModes = ['cash', 'card', 'upi'];
  if (!validPaymentModes.includes(paymentMode.toLowerCase())) {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid payment mode. Must be cash, card, or upi' 
    });
  }
  
  // Get current customer data
  db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, customer) => {
    if (err) return res.status(500).json({ 
      success: false,
      error: err.message 
    });
    
    if (!customer) {
      return res.status(404).json({ 
        success: false,
        error: 'Customer not found' 
      });
    }
    
      const previousAmount = customer.amountPaid;
  let newAmountPaid;
  if (paymentType === 'set') {
    newAmountPaid = paymentAmount;
  } else { // 'add'
    newAmountPaid = customer.amountPaid + paymentAmount;
  }
  
  // Check if customer is already fully paid or overpaid
  if (customer.amountPaid >= customer.amountToPay) {
    return res.status(400).json({ 
      success: false,
      error: `Customer is already fully paid (₹${customer.amountPaid} paid out of ₹${customer.amountToPay}). No additional payment needed.`,
      currentStatus: customer.amountPaid > customer.amountToPay ? 'Overpaid' : 'Fully Paid'
    });
  }
  
  // Validate that new amount paid doesn't exceed amount to pay
  if (newAmountPaid > customer.amountToPay) {
    return res.status(400).json({ 
      success: false,
      error: `Payment amount would exceed the total amount to pay (₹${customer.amountToPay}). Maximum allowed payment: ₹${customer.amountToPay - customer.amountPaid}`,
      maxAllowedPayment: customer.amountToPay - customer.amountPaid
    });
  }
  
  // Update the payment
    db.run(
      'UPDATE customers SET amountPaid = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [newAmountPaid, customerId],
      function (err) {
        if (err) return res.status(500).json({ 
          success: false,
          error: err.message 
        });
        
        // Generate transaction ID for card/UPI payments
        const transactionId = paymentMode !== 'cash' ? `TXN_${Date.now()}_${customerId}` : null;
        
        // Log transaction history with payment mode
        logTransaction(
          customer.id,
          customer.name,
          customer.email,
          customer.cycle || 1,
          paymentType === 'add' ? 'PAYMENT_ADDED' : 'PAYMENT_SET',
          paymentAmount,
          previousAmount,
          newAmountPaid,
          paymentMode.toLowerCase(),
          transactionId,
          'completed',
          description || `${paymentType === 'add' ? 'Added' : 'Set'} payment of ₹${paymentAmount} via ${paymentMode.toUpperCase()}`
        );
        
        // Get updated customer data
        db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, updatedCustomer) => {
          if (err) return res.status(500).json({ 
            success: false,
            error: err.message 
          });
          
          const customerWithDetails = calculateCustomerDetails(updatedCustomer);
          
          res.json({
            success: true,
            data: customerWithDetails,
            transactionId: transactionId,
            paymentMode: paymentMode.toUpperCase(),
            message: `Payment ${paymentType === 'add' ? 'added' : 'updated'} successfully via ${paymentMode.toUpperCase()}`
          });
        });
      }
    );
  });
});

// Delete a customer
app.delete('/api/customers/:id', (req, res) => {
  const customerId = parseInt(req.params.id);
  
  if (!customerId || isNaN(customerId)) {
    return res.status(400).json({ 
      success: false,
      error: 'Valid customer ID is required' 
    });
  }
  
  // Check if customer exists first
  db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, customer) => {
    if (err) return res.status(500).json({ 
      success: false,
      error: err.message 
    });
    
    if (!customer) {
      return res.status(404).json({ 
        success: false,
        error: 'Customer not found' 
      });
    }
    
    // Delete the customer
    db.run('DELETE FROM customers WHERE id = ?', [customerId], function (err) {
      if (err) return res.status(500).json({ 
        success: false,
        error: err.message 
      });
      
      res.json({
        success: true,
        message: 'Customer deleted successfully',
        deletedCustomer: calculateCustomerDetails(customer)
      });
    });
  });
});

// Get dashboard summary
app.get('/api/dashboard/summary', (req, res) => {
  db.all('SELECT * FROM customers', [], (err, rows) => {
    if (err) return res.status(500).json({ 
      success: false,
      error: err.message 
    });
    
    const customersWithDetails = rows.map(customer => calculateCustomerDetails(customer));
    
    const summary = {
      totalCustomers: customersWithDetails.length,
      totalAmountToPay: customersWithDetails.reduce((sum, c) => sum + c.amountToPay, 0),
      totalAmountPaid: customersWithDetails.reduce((sum, c) => sum + c.amountPaid, 0),
      totalAmountRemaining: customersWithDetails.reduce((sum, c) => sum + c.amountRemaining, 0),
      totalOverpayment: customersWithDetails.reduce((sum, c) => sum + c.overpayment, 0),
      statusCounts: {
        'Not Paid': customersWithDetails.filter(c => c.paymentStatus === 'Not Paid').length,
        'Partially Paid': customersWithDetails.filter(c => c.paymentStatus === 'Partially Paid').length,
        'Paid': customersWithDetails.filter(c => c.paymentStatus === 'Paid').length,
        'Overpaid': customersWithDetails.filter(c => c.paymentStatus === 'Overpaid').length
      },
      recentCustomers: customersWithDetails
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5),
      overdueCustomers: customersWithDetails.filter(c => c.paymentStatus === 'Not Paid' && c.amountToPay > 0),
      collectionEfficiency: customersWithDetails.length > 0 ? 
        (customersWithDetails.reduce((sum, c) => sum + c.paymentPercentage, 0) / customersWithDetails.length) : 0
    };
    
    // Round monetary values
    ['totalAmountToPay', 'totalAmountPaid', 'totalAmountRemaining', 'totalOverpayment'].forEach(key => {
      summary[key] = Math.round(summary[key] * 100) / 100;
    });
    summary.collectionEfficiency = Math.round(summary.collectionEfficiency * 100) / 100;
    
    res.json({
      success: true,
      data: summary
    });
  });
});

// Get transaction history for a customer
app.get('/api/customers/:id/transactions', (req, res) => {
  const customerId = parseInt(req.params.id);
  const { limit = 50, offset = 0 } = req.query;
  
  if (!customerId || isNaN(customerId)) {
    return res.status(400).json({ 
      success: false,
      error: 'Valid customer ID is required' 
    });
  }
  
  db.all(
    'SELECT * FROM transaction_history WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [customerId, parseInt(limit), parseInt(offset)],
    (err, transactions) => {
      if (err) return res.status(500).json({ 
        success: false,
        error: err.message 
      });
      
      res.json({
        success: true,
        data: transactions,
        pagination: {
          offset: parseInt(offset),
          limit: parseInt(limit),
          total: transactions.length
        }
      });
    }
  );
});

// Get payment cycle history for a customer
app.get('/api/customers/:id/cycles', (req, res) => {
  const customerId = parseInt(req.params.id);
  
  if (!customerId || isNaN(customerId)) {
    return res.status(400).json({ 
      success: false,
      error: 'Valid customer ID is required' 
    });
  }
  
  db.all(
    'SELECT * FROM payment_cycles WHERE customer_id = ? ORDER BY cycle_number DESC',
    [customerId],
    (err, cycles) => {
      if (err) return res.status(500).json({ 
        success: false,
        error: err.message 
      });
      
      res.json({
        success: true,
        data: cycles
      });
    }
  );
});

// Complete current payment cycle and start a new one (Reactivate customer)
app.post('/api/customers/:id/reactivate', (req, res) => {
  const customerId = parseInt(req.params.id);
  const { newAmountToPay, resetAmountPaid = true, description } = req.body;
  
  if (!customerId || isNaN(customerId)) {
    return res.status(400).json({ 
      success: false,
      error: 'Valid customer ID is required' 
    });
  }
  
  if (typeof newAmountToPay !== 'number' || newAmountToPay < 0) {
    return res.status(400).json({ 
      success: false,
      error: 'New amount to pay must be a positive number' 
    });
  }
  
  // Get current customer data
  db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, customer) => {
    if (err) return res.status(500).json({ 
      success: false,
      error: err.message 
    });
    
    if (!customer) {
      return res.status(404).json({ 
        success: false,
        error: 'Customer not found' 
      });
    }
    
    // Complete current payment cycle
    completePaymentCycle(customer, (err) => {
      if (err) return res.status(500).json({ 
        success: false,
        error: 'Failed to complete payment cycle: ' + err.message 
      });
      
      // Start new cycle
      const newCycle = (customer.cycle || 1) + 1;
      const newAmountPaid = resetAmountPaid ? 0 : customer.amountPaid;
      
      db.run(
        'UPDATE customers SET cycle = ?, amountToPay = ?, amountPaid = ?, status = "Active", updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [newCycle, newAmountToPay, newAmountPaid, customerId],
        function (err) {
          if (err) return res.status(500).json({ 
            success: false,
            error: err.message 
          });
          
          // Log reactivation transaction
          logTransaction(
            customer.id,
            customer.name,
            customer.email,
            newCycle,
            'CUSTOMER_REACTIVATED',
            newAmountToPay,
            customer.amountPaid,
            newAmountPaid,
            description || `Customer reactivated for cycle ${newCycle} with new amount: $${newAmountToPay}`
          );
          
          // Get updated customer data
          db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, updatedCustomer) => {
            if (err) return res.status(500).json({ 
              success: false,
              error: err.message 
            });
            
            const customerWithDetails = calculateCustomerDetails(updatedCustomer);
            
            res.json({
              success: true,
              data: customerWithDetails,
              message: `Customer reactivated successfully for cycle ${newCycle}`
            });
          });
        }
      );
    });
  });
});

// Reset customer payment data (clear payments but keep customer info)
app.patch('/api/customers/:id/reset', (req, res) => {
  const customerId = parseInt(req.params.id);
  const { newAmountToPay, description } = req.body;
  
  if (!customerId || isNaN(customerId)) {
    return res.status(400).json({ 
      success: false,
      error: 'Valid customer ID is required' 
    });
  }
  
  // Get current customer data
  db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, customer) => {
    if (err) return res.status(500).json({ 
      success: false,
      error: err.message 
    });
    
    if (!customer) {
      return res.status(404).json({ 
        success: false,
        error: 'Customer not found' 
      });
    }
    
    const resetAmountToPay = newAmountToPay !== undefined ? newAmountToPay : customer.amountToPay;
    
    if (typeof resetAmountToPay !== 'number' || resetAmountToPay < 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Amount to pay must be a positive number' 
      });
    }
    
    // Reset payment data
    db.run(
      'UPDATE customers SET amountToPay = ?, amountPaid = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [resetAmountToPay, customerId],
      function (err) {
        if (err) return res.status(500).json({ 
          success: false,
          error: err.message 
        });
        
        // Log reset transaction
        logTransaction(
          customer.id,
          customer.name,
          customer.email,
          customer.cycle || 1,
          'PAYMENT_RESET',
          resetAmountToPay,
          customer.amountPaid,
          0,
          description || `Payment data reset. New amount to pay: $${resetAmountToPay}`
        );
        
        // Get updated customer data
        db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, updatedCustomer) => {
          if (err) return res.status(500).json({ 
            success: false,
            error: err.message 
          });
          
          const customerWithDetails = calculateCustomerDetails(updatedCustomer);
          
          res.json({
            success: true,
            data: customerWithDetails,
            message: 'Customer payment data reset successfully'
          });
        });
      }
    );
  });
});

// Get all transaction history (admin view)
app.get('/api/transactions', (req, res) => {
  const { limit = 100, offset = 0, customerId, transactionType } = req.query;
  
  let query = 'SELECT * FROM transaction_history WHERE 1=1';
  let params = [];
  
  if (customerId) {
    query += ' AND customer_id = ?';
    params.push(parseInt(customerId));
  }
  
  if (transactionType) {
    query += ' AND transaction_type = ?';
    params.push(transactionType);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  db.all(query, params, (err, transactions) => {
    if (err) return res.status(500).json({ 
      success: false,
      error: err.message 
    });
    
    res.json({
      success: true,
      data: transactions,
      pagination: {
        offset: parseInt(offset),
        limit: parseInt(limit),
        total: transactions.length
      }
    });
  });
});

// Process payment endpoint with transaction simulation
app.post('/api/customers/:id/process-payment', (req, res) => {
  const customerId = parseInt(req.params.id);
  const { paymentAmount, paymentMode, description } = req.body;
  
  if (!customerId || isNaN(customerId)) {
    return res.status(400).json({ 
      success: false,
      error: 'Valid customer ID is required' 
    });
  }
  
  if (typeof paymentAmount !== 'number' || paymentAmount <= 0) {
    return res.status(400).json({ 
      success: false,
      error: 'Payment amount must be a positive number' 
    });
  }
  
  // Validate payment mode
  const validPaymentModes = ['cash', 'card', 'upi'];
  if (!validPaymentModes.includes(paymentMode.toLowerCase())) {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid payment mode. Must be cash, card, or upi' 
    });
  }
  
  // Get customer data first
  db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, customer) => {
    if (err) return res.status(500).json({ 
      success: false,
      error: err.message 
    });
    
    if (!customer) {
      return res.status(404).json({ 
        success: false,
        error: 'Customer not found' 
      });
    }
    
    // Handle instant cash payments vs processed payments
    if (paymentMode === 'cash') {
      // Cash payments are processed instantly without delay
      const previousAmount = customer.amountPaid;
      const newAmountPaid = customer.amountPaid + paymentAmount;
      
      // Check if customer is already fully paid or overpaid
      if (customer.amountPaid >= customer.amountToPay) {
        return res.status(400).json({ 
          success: false,
          error: `Customer is already fully paid (₹${customer.amountPaid} paid out of ₹${customer.amountToPay}). No additional payment needed.`,
          currentStatus: customer.amountPaid > customer.amountToPay ? 'Overpaid' : 'Fully Paid'
        });
      }
      
      // Validate that new amount paid doesn't exceed amount to pay
      if (newAmountPaid > customer.amountToPay) {
        return res.status(400).json({ 
          success: false,
          error: `Payment amount would exceed the total amount to pay (₹${customer.amountToPay}). Maximum allowed payment: ₹${customer.amountToPay - customer.amountPaid}`,
          maxAllowedPayment: customer.amountToPay - customer.amountPaid
        });
      }
      
      // Update customer payment immediately
      db.run(
        'UPDATE customers SET amountPaid = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [newAmountPaid, customerId],
        function (updateErr) {
          if (updateErr) return res.status(500).json({ 
            success: false,
            error: updateErr.message 
          });
          
          // Log cash transaction (no transaction ID for cash)
          logTransaction(
            customer.id,
            customer.name,
            customer.email,
            customer.cycle || 1,
            'CASH_PAYMENT',
            paymentAmount,
            previousAmount,
            newAmountPaid,
            'cash',
            null, // No transaction ID for cash
            'completed',
            description || `Cash payment of ₹${paymentAmount}`
          );
          
          // Get updated customer data
          db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, updatedCustomer) => {
            if (err) return res.status(500).json({ 
              success: false,
              error: err.message 
            });
            
            const customerWithDetails = calculateCustomerDetails(updatedCustomer);
            
            res.json({
              success: true,
              data: customerWithDetails,
              transactionId: null,
              paymentMode: 'CASH',
              processingTime: 0,
              status: 'completed',
              instant: true, // Flag for instant processing
              message: `Cash payment of ₹${paymentAmount} processed instantly`
            });
          });
        }
      );
      return; // Exit early for cash payments
    }
    
    // For card and UPI, simulate processing delay
    const processingDelay = paymentMode === 'card' ? 2000 : 1500;
    
    setTimeout(() => {
      // Simulate transaction success/failure (95% success rate) for card/UPI
      const isSuccess = Math.random() > 0.05;
      
      if (!isSuccess && paymentMode !== 'cash') {
        // Transaction failed for card/UPI
        const transactionId = `TXN_FAILED_${Date.now()}_${customerId}`;
        
        // Log failed transaction
        logTransaction(
          customer.id,
          customer.name,
          customer.email,
          customer.cycle || 1,
          'PAYMENT_FAILED',
          paymentAmount,
          customer.amountPaid,
          customer.amountPaid, // No change in amount
          paymentMode.toLowerCase(),
          transactionId,
          'failed',
          description || `Failed ${paymentMode.toUpperCase()} payment of ₹${paymentAmount}`
        );
        
        return res.status(400).json({
          success: false,
          error: 'Transaction failed. Please try again.',
          transactionId: transactionId,
          paymentMode: paymentMode.toUpperCase(),
          status: 'failed'
        });
      }
      
      // Transaction successful
      const previousAmount = customer.amountPaid;
      const newAmountPaid = customer.amountPaid + paymentAmount;
      
      // Check if customer is already fully paid or overpaid
      if (customer.amountPaid >= customer.amountToPay) {
        return res.status(400).json({ 
          success: false,
          error: `Customer is already fully paid (₹${customer.amountPaid} paid out of ₹${customer.amountToPay}). No additional payment needed.`,
          currentStatus: customer.amountPaid > customer.amountToPay ? 'Overpaid' : 'Fully Paid'
        });
      }
      
      // Validate that new amount paid doesn't exceed amount to pay
      if (newAmountPaid > customer.amountToPay) {
        return res.status(400).json({ 
          success: false,
          error: `Payment amount would exceed the total amount to pay (₹${customer.amountToPay}). Maximum allowed payment: ₹${customer.amountToPay - customer.amountPaid}`,
          maxAllowedPayment: customer.amountToPay - customer.amountPaid
        });
      }
      
      const transactionId = paymentMode !== 'cash' ? `TXN_${Date.now()}_${customerId}` : null;
      
      // Update customer payment
      db.run(
        'UPDATE customers SET amountPaid = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [newAmountPaid, customerId],
        function (updateErr) {
          if (updateErr) return res.status(500).json({ 
            success: false,
            error: updateErr.message 
          });
          
          // Log successful transaction
          logTransaction(
            customer.id,
            customer.name,
            customer.email,
            customer.cycle || 1,
            'PAYMENT_PROCESSED',
            paymentAmount,
            previousAmount,
            newAmountPaid,
            paymentMode.toLowerCase(),
            transactionId,
            'completed',
            description || `Processed ${paymentMode.toUpperCase()} payment of ₹${paymentAmount}`
          );
          
          // Get updated customer data
          db.get('SELECT * FROM customers WHERE id = ?', [customerId], (err, updatedCustomer) => {
            if (err) return res.status(500).json({ 
              success: false,
              error: err.message 
            });
            
            const customerWithDetails = calculateCustomerDetails(updatedCustomer);
            
            res.json({
              success: true,
              data: customerWithDetails,
              transactionId: transactionId,
              paymentMode: paymentMode.toUpperCase(),
              processingTime: processingDelay,
              status: 'completed',
              message: `Payment of ₹${paymentAmount} processed successfully via ${paymentMode.toUpperCase()}`
            });
          });
        }
      );
    }, processingDelay);
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'DueDesk API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API endpoints available:`);
  console.log(`- GET /api/health - Health check`);
  console.log(`- GET /api/customers - Get all customers with enhanced details`);
  console.log(`- GET /api/customers/:id - Get specific customer`);
  console.log(`- POST /api/customers - Create new customer`);
  console.log(`- PUT /api/customers/:id - Update customer`);
  console.log(`- PATCH /api/customers/:id/payment - Update payment`);
  console.log(`- DELETE /api/customers/:id - Delete customer`);
  console.log(`- GET /api/dashboard/summary - Get dashboard summary`);
  console.log(`- GET /api/customers/:id/transactions - Get customer transaction history`);
  console.log(`- GET /api/customers/:id/cycles - Get customer payment cycles`);
  console.log(`- POST /api/customers/:id/reactivate - Reactivate customer for new cycle`);
  console.log(`- PATCH /api/customers/:id/reset - Reset customer payment data`);
  console.log(`- GET /api/transactions - Get all transaction history`);
  console.log(`- POST /api/customers/send-reminders - Send email reminders (auth required)`);
});
