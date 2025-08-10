import React, { useState, useEffect, useMemo } from 'react';
import './App.css';
import Login from './Login';

interface Entry {
  id?: number;
  name: string;
  number: string;
  email: string;
  amountToPay: number;
  amountPaid: number;
  status?: string;
  cycle?: number;
  amountRemaining?: number;
  overpayment?: number;
  paymentStatus?: string;
  paymentPercentage?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface Transaction {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_email: string;
  cycle: number;
  transaction_type: string;
  amount: number;
  previous_amount_paid: number;
  new_amount_paid: number;
  payment_mode?: string;
  transaction_id?: string;
  payment_status?: string;
  description?: string;
  created_at: string;
}

interface PaymentCycle {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_email: string;
  cycle_number: number;
  amount_to_pay: number;
  amount_paid: number;
  status: string;
  started_at: string;
  completed_at?: string;
}

const API_URL = 'http://localhost:4000/api/customers';

function App() {
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [form, setForm] = useState({
    name: '',
    number: '',
    email: '',
    amountToPay: '',
    amountPaid: '',
  });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isPaymentMode, setIsPaymentMode] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Entry | null>(null);
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Entry | null>(null);
  const [customerTransactions, setCustomerTransactions] = useState<Transaction[]>([]);
  const [customerCycles, setCustomerCycles] = useState<PaymentCycle[]>([]);
  const [showReactivateForm, setShowReactivateForm] = useState(false);
  const [reactivateAmount, setReactivateAmount] = useState('');
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetAmount, setResetAmount] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // New state for status filtering
  const [activeDetailsTab, setActiveDetailsTab] = useState('overview'); // New state for customer details tabs
  const [paymentMode, setPaymentMode] = useState('cash'); // New state for payment mode
  const [showPaymentProcessing, setShowPaymentProcessing] = useState(false); // New state for payment processing page
  const [processingPayment, setProcessingPayment] = useState(false); // New state for payment processing status
  const [paymentProcessingData, setPaymentProcessingData] = useState<any>(null); // New state for processing data

  const fetchEntries = async () => {
    setLoading(true);
    setError('');
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const res = await fetch(API_URL, { headers });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const response = await res.json();
      // Extract the data array from the API response
      if (response.success && Array.isArray(response.data)) {
        setEntries(response.data);
      } else {
        throw new Error('Invalid API response format');
      }
    } catch (err) {
      setError('Failed to fetch customers. Please check if the server is running.');
      console.error('Fetch error:', err);
    }
    setLoading(false);
  };

  // Check for existing authentication on component mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('duedesk_token');
      const storedUser = localStorage.getItem('duedesk_user');
      
      if (token && storedUser) {
        try {
          // Verify token with backend
          const response = await fetch('http://localhost:4000/api/auth/verify', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              setAuthToken(token);
              setUser(JSON.parse(storedUser));
              setIsAuthenticated(true);
            } else {
              // Invalid token, clear storage
              localStorage.removeItem('duedesk_token');
              localStorage.removeItem('duedesk_user');
            }
          } else {
            // Invalid token, clear storage
            localStorage.removeItem('duedesk_token');
            localStorage.removeItem('duedesk_user');
          }
        } catch (err) {
          console.error('Auth verification failed:', err);
          // Clear invalid storage
          localStorage.removeItem('duedesk_token');
          localStorage.removeItem('duedesk_user');
        }
      }
      
      setAuthLoading(false);
    };
    
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchEntries();
    }
  }, [isAuthenticated]);

  // Handle login
  const handleLogin = (token: string, userData: any) => {
    setAuthToken(token);
    setUser(userData);
    setIsAuthenticated(true);
    setAuthLoading(false);
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      if (authToken) {
        await fetch('http://localhost:4000/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (err) {
      console.error('Logout request failed:', err);
    } finally {
      // Always clear local state and storage
      localStorage.removeItem('duedesk_token');
      localStorage.removeItem('duedesk_user');
      setAuthToken(null);
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  // Filter entries based on search term and status filter
  const filteredEntries = useMemo(() => {
    // Ensure entries is an array
    if (!Array.isArray(entries)) {
      return [];
    }
    
    let filtered = entries;
    
    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(entry => {
        // Ensure entry has required properties
        if (!entry || typeof entry.name !== 'string' || typeof entry.email !== 'string' || typeof entry.number !== 'string') {
          return false;
        }
        return (
          entry.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          entry.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          entry.number.includes(searchTerm)
        );
      });
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(entry => {
        const pending = entry.amountToPay - entry.amountPaid;
        
        switch (statusFilter) {
          case 'paid':
            return pending <= 0;
          case 'partial':
            return entry.amountPaid > 0 && pending > 0;
          case 'pending':
            return entry.amountPaid === 0;
          default:
            return true;
        }
      });
    }
    
    return filtered;
  }, [entries, searchTerm, statusFilter]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    // Ensure entries is an array and has valid data
    if (!Array.isArray(entries) || entries.length === 0) {
      return {
        totalAmountToPay: 0,
        totalAmountPaid: 0,
        totalPending: 0,
        customersCount: 0,
        fullyPaidCount: 0,
        pendingCount: 0
      };
    }
    
    const totalAmountToPay = entries.reduce((sum, entry) => {
      return sum + (typeof entry.amountToPay === 'number' ? entry.amountToPay : 0);
    }, 0);
    const totalAmountPaid = entries.reduce((sum, entry) => {
      return sum + (typeof entry.amountPaid === 'number' ? entry.amountPaid : 0);
    }, 0);
    const totalPending = Math.max(0, totalAmountToPay - totalAmountPaid);
    const customersCount = entries.length;
    const fullyPaidCount = entries.filter(entry => 
      typeof entry.amountToPay === 'number' && 
      typeof entry.amountPaid === 'number' && 
      entry.amountToPay <= entry.amountPaid
    ).length;
    const pendingCount = entries.filter(entry => 
      typeof entry.amountToPay === 'number' && 
      typeof entry.amountPaid === 'number' && 
      entry.amountToPay > entry.amountPaid
    ).length;
    
    return {
      totalAmountToPay,
      totalAmountPaid,
      totalPending,
      customersCount,
      fullyPaidCount,
      pendingCount
    };
  }, [entries]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    
    // Enhanced client-side validation
    if (!form.name.trim()) {
      setError('Customer name is required');
      return;
    }
    
    if (!form.number.trim()) {
      setError('Phone number is required');
      return;
    }
    
    if (!form.email.trim()) {
      setError('Email address is required');
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) {
      setError('Please enter a valid email address');
      return;
    }
    
    if (parseFloat(form.amountToPay) < 0 || parseFloat(form.amountPaid) < 0) {
      setError('Amounts cannot be negative');
      return;
    }
    if (!isNaN(parseFloat(form.amountPaid)) && parseFloat(form.amountPaid) > parseFloat(form.amountToPay)) {
      setError('Amount paid cannot exceed amount to pay');
      return;
    }
    
    if (isNaN(parseFloat(form.amountToPay))) {
      setError('Amount to pay must be a valid number');
      return;
    }
    
    try {
      const payload = {
        name: form.name.trim(),
        number: form.number.trim(),
        email: form.email.trim(),
        amountToPay: parseFloat(form.amountToPay) || 0,
        amountPaid: parseFloat(form.amountPaid) || 0,
      };
      
      // Use appropriate HTTP method and endpoint based on operation
      const url = isEditMode && editingEntry?.id ? `${API_URL}/${editingEntry.id}` : API_URL;
      const method = isEditMode ? 'PUT' : 'POST';
      
      console.log('Form submission details:', {
        isEditMode,
        editingEntryId: editingEntry?.id,
        method,
        url,
        payload
      });
      
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      console.log('API Response status:', res.status, res.statusText);
      
      if (!res.ok) {
        let errorMessage;
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || `HTTP error! status: ${res.status}`;
        } catch {
          // If response is not JSON (HTML error page), handle it
          errorMessage = `Server error (${res.status}). Please check if the backend server is running correctly.`;
        }
        throw new Error(errorMessage);
      }
      
      let result;
      try {
        result = await res.json();
      } catch {
        // Handle non-JSON responses
        result = { message: isEditMode ? 'Customer updated successfully!' : 'Customer added successfully!' };
      }
      
      clearForm();
      setSuccessMessage(result.message || (isEditMode ? 'Customer updated successfully!' : 'Customer added successfully!'));
      setIsFormVisible(false);
      fetchEntries();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError('Failed to save customer: ' + (err instanceof Error ? err.message : 'Unknown error'));
      console.error('Submit error:', err);
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    
    if (!editingEntry?.id) {
      setError('Invalid customer selected for payment');
      return;
    }
    
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid payment amount greater than 0');
      return;
    }
    
    const remainingAmount = Math.max(0, editingEntry.amountToPay - editingEntry.amountPaid);
    if (amount > remainingAmount) {
      setError(`Payment amount cannot exceed remaining balance of ${formatCurrency(remainingAmount)}`);
      return;
    }
    
    // Set up payment processing data
    setPaymentProcessingData({
      customer: editingEntry,
      amount: amount,
      paymentMode: paymentMode,
      remainingAmount: remainingAmount
    });
    
    // Show payment processing page
    setShowPaymentProcessing(true);
    setIsFormVisible(false);
  };

  const clearForm = () => {
    setForm({ name: '', number: '', email: '', amountToPay: '', amountPaid: '' });
    setError('');
    setSuccessMessage('');
    setEditingEntry(null);
    setIsEditMode(false);
    setIsPaymentMode(false);
    setPaymentAmount('');
    setPaymentMode('cash');
  };

  const handlePaymentClick = (entry: Entry) => {
    console.log('Payment clicked for customer:', entry);
    
    // Validate entry has ID before allowing payment
    if (!entry.id) {
      setError('Cannot process payment: Missing customer ID');
      return;
    }
    
    // Check if customer has any pending amount
    const remainingAmount = Math.max(0, entry.amountToPay - entry.amountPaid);
    if (remainingAmount <= 0) {
      setError('This customer has no pending payment. Payment is already complete!');
      return;
    }
    
    setEditingEntry(entry);
    setIsPaymentMode(true);
    setIsFormVisible(true);
    setPaymentAmount('');
    setPaymentMode('cash'); // Reset to default payment mode
    setError('');
    setSuccessMessage('');
    
    console.log('Payment mode activated for customer ID:', entry.id, 'Remaining amount:', remainingAmount);
  };

  const cancelEdit = () => {
    setEditingEntry(null);
    setIsEditMode(false);
    setIsPaymentMode(false);
    clearForm();
    setIsFormVisible(false);
  };

  const handleAddNew = () => {
    if (isEditMode || isPaymentMode) {
      cancelEdit();
    }
    setIsFormVisible(!isFormVisible);
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (amountToPay: number, amountPaid: number) => {
    const pending = Math.max(0, amountToPay - amountPaid);
    if (pending <= 0) {
      return <span className="status-badge paid">Paid</span>;
    } else if (amountPaid > 0) {
      return <span className="status-badge partial">Partial</span>;
    } else {
      return <span className="status-badge pending">Pending</span>;
    }
  };

  const handleDeleteClick = (entry: Entry) => {
    setCustomerToDelete(entry);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!customerToDelete || !customerToDelete.id) {
      setError('Invalid customer selected for deletion');
      setShowDeleteConfirm(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/${customerToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        let errorMessage;
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || `HTTP error! status: ${res.status}`;
        } catch {
          errorMessage = `Server error (${res.status}). Please check if the backend server is running correctly.`;
        }
        throw new Error(errorMessage);
      }

      const result = await res.json();
      setSuccessMessage(result.message || 'Customer deleted successfully!');
      fetchEntries();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError('Failed to delete customer: ' + (err instanceof Error ? err.message : 'Unknown error'));
      console.error('Delete error:', err);
    }

    setShowDeleteConfirm(false);
    setCustomerToDelete(null);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setCustomerToDelete(null);
  };

  // Fetch customer transaction history
  const fetchCustomerTransactions = async (customerId: number) => {
    try {
      const res = await fetch(`${API_URL}/${customerId}/transactions`);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const response = await res.json();
      if (response.success && Array.isArray(response.data)) {
        setCustomerTransactions(response.data);
      } else {
        throw new Error('Failed to fetch transaction history');
      }
    } catch (err) {
      setError('Failed to fetch transaction history');
      console.error('Transaction fetch error:', err);
    }
  };

  // Fetch customer payment cycles
  const fetchCustomerCycles = async (customerId: number) => {
    try {
      const res = await fetch(`${API_URL}/${customerId}/cycles`);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const response = await res.json();
      if (response.success && Array.isArray(response.data)) {
        setCustomerCycles(response.data);
      } else {
        throw new Error('Failed to fetch payment cycles');
      }
    } catch (err) {
      setError('Failed to fetch payment cycles');
      console.error('Payment cycles fetch error:', err);
    }
  };

  // Handle customer details view
  const handleCustomerDetailsClick = async (entry: Entry) => {
    if (!entry.id) {
      setError('Invalid customer selected');
      return;
    }
    
    setSelectedCustomer(entry);
    setShowCustomerDetails(true);
    setActiveDetailsTab('overview'); // Reset to overview tab
    
    // Fetch transaction history and payment cycles
    await fetchCustomerTransactions(entry.id);
    await fetchCustomerCycles(entry.id);
  };

  // Handle customer reactivation
  const handleReactivateCustomer = async () => {
    if (!selectedCustomer?.id) {
      setError('Invalid customer selected for reactivation');
      return;
    }
    
    const amount = parseFloat(reactivateAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount for reactivation');
      return;
    }
    
    try {
      const res = await fetch(`${API_URL}/${selectedCustomer.id}/reactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newAmountToPay: amount,
          resetAmountPaid: true,
          description: `Customer reactivated with new amount: ₹${amount}`
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to reactivate customer');
      }
      
      const result = await res.json();
      setSuccessMessage(result.message || 'Customer reactivated successfully!');
      setReactivateAmount('');
      setShowReactivateForm(false);
      setShowCustomerDetails(false);
      fetchEntries();
      
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError('Failed to reactivate customer: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  // Handle customer payment reset
  const handleResetCustomer = async () => {
    if (!selectedCustomer?.id) {
      setError('Invalid customer selected for reset');
      return;
    }
    
    const amount = parseFloat(resetAmount) || selectedCustomer.amountToPay;
    
    try {
      const res = await fetch(`${API_URL}/${selectedCustomer.id}/reset`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newAmountToPay: amount,
          description: `Customer payment reset. New amount: ₹${amount}`
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to reset customer');
      }
      
      const result = await res.json();
      setSuccessMessage(result.message || 'Customer payment reset successfully!');
      setResetAmount('');
      setShowResetForm(false);
      setShowCustomerDetails(false);
      fetchEntries();
      
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError('Failed to reset customer: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };


  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get transaction type display
  const getTransactionTypeDisplay = (type: string) => {
    const typeMap: { [key: string]: string } = {
      'PAYMENT_ADDED': 'Payment Added',
      'PAYMENT_SET': 'Payment Set',
      'CUSTOMER_REACTIVATED': 'Reactivated',
      'PAYMENT_RESET': 'Payment Reset'
    };
    return typeMap[type] || type;
  };

  // Show loading spinner while checking authentication
  if (authLoading) {
    return (
      <div className="app-container">
        <div className="auth-loading">
          <div className="loading-spinner"></div>
          <p>Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="app-container">
        <Login onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1>DueDesk Dashboard</h1>
          <p>Manage customer payments with ease</p>
          {user && (
            <div className="user-info">
              <span className="welcome-text">Welcome, {user.full_name || user.username}!</span>
              <button onClick={handleLogout} className="logout-btn" title="Logout">
                🚪 Logout
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="main-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="summary-card">
            <h3>Summary</h3>
            <div className="summary-item">
              <span className="summary-label">👥 Total Customers:</span>
              <span className="summary-value">{summary.customersCount}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">✅ Fully Paid:</span>
              <span className="summary-value paid">{summary.fullyPaidCount}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">⏳ Pending:</span>
              <span className="summary-value pending">{summary.pendingCount}</span>
            </div>
            <hr className="summary-divider" />
            <div className="summary-item total">
              <span className="summary-label">💰 Total to Collect:</span>
              <span className="summary-value">{formatCurrency(summary.totalAmountToPay)}</span>
            </div>
            <div className="summary-item total">
              <span className="summary-label">💳 Total Collected:</span>
              <span className="summary-value">{formatCurrency(summary.totalAmountPaid)}</span>
            </div>
            <div className="summary-item highlight">
              <span className="summary-label">⏳ Amount Pending:</span>
              <span className="summary-value pending-amount">{formatCurrency(summary.totalPending)}</span>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          {/* Action Bar */}
          <div className="action-bar">
            <div className="search-container">
              <input
                type="text"
                placeholder="Search by name, email, or phone number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="clear-search"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={handleAddNew}
                className="add-customer-btn"
              >
                {isFormVisible ? (isPaymentMode ? '❌ Cancel Payment' : isEditMode ? '❌ Cancel Edit' : '❌ Cancel') : '➕ Add Customer'}
              </button>
              <button 
                onClick={async () => {
                  try {
                    setError('');
                    setSuccessMessage('');
                    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
                    const res = await fetch('http://localhost:4000/api/customers/send-reminders', { method: 'POST', headers });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error || `Failed to send emails (status ${res.status})`);
                    }
                    const data = await res.json();
                    setSuccessMessage(`Emails processed: ${data.count}. Sent to ${data.results.filter((r:any)=>r.status==='sent').length}, skipped ${data.results.filter((r:any)=>r.status==='skipped').length}`);
                  } catch (err) {
                    setError('Failed to send emails: ' + (err instanceof Error ? err.message : 'Unknown error'));
                  } finally {
                    setTimeout(() => { setError(''); setSuccessMessage(''); }, 5000);
                  }
                }}
                className="send-emails-btn"
                title="Send reminder emails to all Pending/Partial customers"
              >
                ✉️ Send Emails
              </button>
            </div>
          </div>

          {/* Payment Status Filter Chips - Hide when payment mode or add customer mode is active */}
          {!isPaymentMode && !isFormVisible && (
            <div className="filter-chips-container">
              <span className="filter-label">Filter by status:</span>
              <div className="filter-chips">
                <button 
                  className={`filter-chip ${statusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('all')}
                >
                  📊 All ({entries.length})
                </button>
                <button 
                  className={`filter-chip ${statusFilter === 'paid' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('paid')}
                >
                  ✅ Paid ({summary.fullyPaidCount})
                </button>
                <button 
                  className={`filter-chip ${statusFilter === 'partial' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('partial')}
                >
                  ⚡ Partial ({entries.filter(entry => entry.amountPaid > 0 && entry.amountPaid < entry.amountToPay).length})
                </button>
                <button 
                  className={`filter-chip ${statusFilter === 'pending' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('pending')}
                >
                  ⏳ Pending ({entries.filter(entry => entry.amountPaid === 0).length})
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
                        {error && (
                <div className="message error-message">
                  ⚠️ {error}
                  <button onClick={() => setError('')} className="close-message">✕</button>
                </div>
              )}
              
              {successMessage && (
                <div className="message success-message">
                  ✅ {successMessage}
                  <button onClick={() => setSuccessMessage('')} className="close-message">✕</button>
                </div>
              )}

          {/* Add Customer Form / Payment Form */}
          {isFormVisible && (
            <div className="form-container">
              <h3>{isPaymentMode ? `💳 Make Payment: ${editingEntry?.name}` : isEditMode ? `✏️ Edit Customer: ${editingEntry?.name}` : '➕ Add New Customer'}</h3>
                            {isPaymentMode ? (
                // Payment Form
                <form className="payment-form" onSubmit={handlePayment}>
                   <div className="payment-info">
                     <div className="customer-summary">
                       <h4>💰 Payment Summary</h4>
                       <div className="payment-details">
                         <div className="payment-row">
                           <span>Total Amount:</span>
                           <span className="amount-value">{formatCurrency(editingEntry?.amountToPay || 0)}</span>
                         </div>
                         <div className="payment-row">
                           <span>Already Paid:</span>
                           <span className="amount-value">{formatCurrency(editingEntry?.amountPaid || 0)}</span>
                         </div>
                         <div className="payment-row highlight">
                           <span>Amount Remaining:</span>
                           <span className="amount-value pending-amount">
                              {formatCurrency(Math.max(0, (editingEntry?.amountToPay || 0) - (editingEntry?.amountPaid || 0)))}
                           </span>
                         </div>
                       </div>
                     </div>
                     
                     <div className="payment-input-section">
                       <div className="form-group">
                         <label>💰 Payment Amount *</label>
                         <input
                           type="number"
                           placeholder="Enter payment amount"
                           value={paymentAmount}
                           onChange={(e) => setPaymentAmount(e.target.value)}
                           min="0.01"
                           max={(editingEntry?.amountToPay || 0) - (editingEntry?.amountPaid || 0)}
                           step="0.01"
                           required
                           className="payment-input"
                         />
                         <small className="input-hint">
                            Maximum: {formatCurrency(Math.max(0, (editingEntry?.amountToPay || 0) - (editingEntry?.amountPaid || 0)))}
                         </small>
                       </div>
                       
                       <div className="form-group">
                         <label>💳 Payment Mode *</label>
                         <div className="payment-mode-options">
                           <label className="radio-option">
                             <input
                               type="radio"
                               name="paymentMode"
                               value="cash"
                               checked={paymentMode === 'cash'}
                               onChange={(e) => setPaymentMode(e.target.value)}
                             />
                             <span className="radio-label">Cash</span>
                           </label>
                           <label className="radio-option">
                             <input
                               type="radio"
                               name="paymentMode"
                               value="card"
                               checked={paymentMode === 'card'}
                               onChange={(e) => setPaymentMode(e.target.value)}
                             />
                             <span className="radio-label">Card</span>
                           </label>
                           <label className="radio-option">
                             <input
                               type="radio"
                               name="paymentMode"
                               value="upi"
                               checked={paymentMode === 'upi'}
                               onChange={(e) => setPaymentMode(e.target.value)}
                             />
                             <span className="radio-label">UPI</span>
                           </label>
                         </div>
                        </div>
                      </div>
                    </div>
                  
                  <div className="form-actions">
                    <button type="submit" className="payment-btn">Process Payment</button>
                    <button type="button" onClick={cancelEdit} className="cancel-btn">Cancel</button>
                  </div>
                </form>
              ) : (
                // Regular Customer Form
                <form className="customer-form" onSubmit={handleSubmit}>
                <div className="form-row">
                  <div className="form-group">
                                            <label>👤 Customer Name *</label>
                    <input
                      type="text"
                      name="name"
                      placeholder="Enter full name"
                      value={form.name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                                            <label>📞 Phone Number *</label>
                    <input
                      type="tel"
                      name="number"
                      placeholder="Enter phone number"
                      value={form.number}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group full-width">
                                            <label>📧 Email Address *</label>
                    <input
                      type="email"
                      name="email"
                      placeholder="Enter email address"
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                                            <label>💰 Amount to Pay *</label>
                    <input
                      type="number"
                      name="amountToPay"
                      placeholder="0.00"
                      value={form.amountToPay}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                  <div className="form-group">
                                            <label>💳 Amount Paid</label>
                    <input
                      type="number"
                      name="amountPaid"
                      placeholder="0.00"
                      value={form.amountPaid}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
                <div className="form-actions">
                                          <button type="submit" className="submit-btn">➕ Save Customer</button>
                                      <button type="button" onClick={clearForm} className="clear-btn">🗑️ Clear Form</button>
                </div>
                </form>
              )}
            </div>
          )}

                    {/* Customer Table - Hide when payment mode or add customer form is active */}
          {!isPaymentMode && !isFormVisible && (
            <div className="table-container">
              <div className="table-header">
                <h3>Customer Records</h3>
                <span className="record-count">
                  {filteredEntries.length} of {entries.length} customers
                  {searchTerm && ` (search: "${searchTerm}")`}
                  {statusFilter !== 'all' && ` (${statusFilter} filter active)`}
                </span>
              </div>
              
              {loading ? (
                <div className="loading-state">
                  <div className="loading-spinner"></div>
                  <p>Loading customers...</p>
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="empty-state">
                  {searchTerm ? (
                    <>
                      <p>No customers found matching "{searchTerm}"</p>
                      <button onClick={() => setSearchTerm('')} className="clear-search-btn">
                        🔍 Clear Search
                      </button>
                    </>
                  ) : (
                    <>
                      <p>No customers added yet</p>
                      <button onClick={() => setIsFormVisible(true)} className="add-first-btn">
                        ➕ Add Your First Customer
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="customers-table">
                    <thead>
                      <tr>
                        <th>Customer Info</th>
                        <th>Contact</th>
                        <th>Amount to Pay</th>
                        <th>Amount Paid</th>
                        <th>Pending</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEntries.map((entry) => {
                        const pending = Math.max(0, entry.amountToPay - entry.amountPaid);
                        return (
                          <tr key={entry.id || entry.email} className={pending <= 0 ? 'paid-row' : 'pending-row'}>
                            <td>
                              <div className="customer-info">
                                <strong>{entry.name}</strong>
                              </div>
                            </td>
                            <td>
                              <div className="contact-info">
                                <div>Phone: {entry.number}</div>
                                <div>Email: {entry.email}</div>
                              </div>
                            </td>
                            <td className="amount-cell">{formatCurrency(entry.amountToPay)}</td>
                            <td className="amount-cell">{formatCurrency(entry.amountPaid)}</td>
                            <td className={`amount-cell ${pending > 0 ? 'pending-amount' : 'paid-amount'}`}>
                              {formatCurrency(Math.max(0, pending))}
                            </td>
                            <td>{getStatusBadge(entry.amountToPay, entry.amountPaid)}</td>
                            <td>
                              <div className="action-buttons">
                                <button 
                                  onClick={() => handleCustomerDetailsClick(entry)}
                                  className="details-btn-small"
                                  title="View customer details and history"
                                >
                                  Details
                                </button>
                                {pending > 0 && (
                                  <button 
                                    onClick={() => handlePaymentClick(entry)}
                                    className="custom-pay-btn"
                                    title="Add payment"
                                  >
                                    💳 Pay
                                  </button>
                                )}
                                <button 
                                  onClick={() => handleDeleteClick(entry)}
                                  className="delete-btn-small"
                                  title="Delete customer"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && customerToDelete && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Confirm Delete</h3>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this customer?</p>
              <div className="customer-to-delete">
                <strong>👤 Customer: {customerToDelete?.name}</strong>
                <div>📧 Email: {customerToDelete?.email}</div>
                <div>📞 Phone: {customerToDelete?.number}</div>
                <div className="amount-info">
                  <span>💰 Amount to Pay: {formatCurrency(customerToDelete?.amountToPay || 0)}</span>
                  <span>💳 Amount Paid: {formatCurrency(customerToDelete?.amountPaid || 0)}</span>
                </div>
              </div>
              <p className="warning-text">⚠️ This action cannot be undone!</p>
            </div>
            <div className="modal-actions">
              <button 
                onClick={handleDeleteCancel}
                className="cancel-btn"
              >
                ❌ Cancel
              </button>
              <button 
                onClick={handleDeleteConfirm}
                className="confirm-delete-btn"
              >
                🗑️ Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Details Modal */}
      {showCustomerDetails && selectedCustomer && (
        <div className="modal-overlay">
          <div className="modal-content large-modal">
            <div className="modal-header">
              <h3>Customer Details: {selectedCustomer.name}</h3>
              <button 
                onClick={() => setShowCustomerDetails(false)} 
                className="close-modal-btn"
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body customer-details tabbed">
              {/* Tab Navigation */}
              <div className="tab-navigation">
                <button 
                  className={`tab-btn ${activeDetailsTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setActiveDetailsTab('overview')}
                >
                  🏠 Overview
                </button>
                <button 
                  className={`tab-btn ${activeDetailsTab === 'transactions' ? 'active' : ''}`}
                  onClick={() => setActiveDetailsTab('transactions')}
                >
                  📊 Transactions ({customerTransactions.length})
                </button>
                <button 
                  className={`tab-btn ${activeDetailsTab === 'cycles' ? 'active' : ''}`}
                  onClick={() => setActiveDetailsTab('cycles')}
                >
                  🔄 Payment Cycles ({customerCycles.length})
                </button>
                <button 
                  className={`tab-btn ${activeDetailsTab === 'management' ? 'active' : ''}`}
                  onClick={() => setActiveDetailsTab('management')}
                >
                  🛠️ Management
                </button>
              </div>

              {/* Tab Content */}
              <div className="tab-content">
                {/* Overview Tab */}
                {activeDetailsTab === 'overview' && (
                  <div className="tab-pane overview">
                    <div className="customer-info-section">
                      <div className="info-grid">
                        <div className="info-item">
                          <label>👤 Customer Name:</label>
                          <span>{selectedCustomer.name}</span>
                        </div>
                        <div className="info-item">
                          <label>📧 Email:</label>
                          <span>{selectedCustomer.email}</span>
                        </div>
                        <div className="info-item">
                          <label>📞 Phone:</label>
                          <span>{selectedCustomer.number}</span>
                        </div>
                        <div className="info-item">
                          <label>🔄 Current Cycle:</label>
                          <span>Cycle #{selectedCustomer.cycle || 1}</span>
                        </div>
                        <div className="info-item">
                          <label>📊 Payment Status:</label>
                          <span>{getStatusBadge(selectedCustomer.amountToPay, selectedCustomer.amountPaid)}</span>
                        </div>
                        <div className="info-item">
                          <label>📅 Last Updated:</label>
                          <span>{selectedCustomer.updatedAt ? formatDate(selectedCustomer.updatedAt) : 'N/A'}</span>
                        </div>
                      </div>
                      
                      {/* Payment Summary */}
                      <div className="payment-summary-section">
                        <h4>💰 Current Payment Summary</h4>
                        <div className="payment-grid">
                          <div className="payment-item">
                            <span className="payment-label">💰 Amount to Pay:</span>
                            <span className="payment-value">{formatCurrency(selectedCustomer.amountToPay)}</span>
                          </div>
                          <div className="payment-item">
                            <span className="payment-label">💳 Amount Paid:</span>
                            <span className="payment-value">{formatCurrency(selectedCustomer.amountPaid)}</span>
                          </div>
                          <div className="payment-item highlight">
                            <span className="payment-label">Amount Remaining:</span>
                             <span className="payment-value pending-amount">
                               {formatCurrency(Math.max(0, selectedCustomer.amountToPay - selectedCustomer.amountPaid))}
                             </span>
                          </div>
                          {selectedCustomer.amountPaid > selectedCustomer.amountToPay && (
                            <div className="payment-item overpaid">
                              <span className="payment-label">Overpayment:</span>
                              <span className="payment-value overpaid-amount">
                                {formatCurrency(selectedCustomer.amountPaid - selectedCustomer.amountToPay)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Transactions Tab */}
                {activeDetailsTab === 'transactions' && (
                  <div className="tab-pane transactions">
                    <div className="transaction-history-section">
                      <h4>📊 Transaction History</h4>
                      {customerTransactions.length === 0 ? (
                        <p className="no-data">No transactions found for this customer.</p>
                      ) : (
                        <div className="transactions-table-wrapper">
                          <table className="transactions-table">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Amount</th>
                                <th>Cycle</th>
                                <th>Description</th>
                              </tr>
                            </thead>
                            <tbody>
                              {customerTransactions.map((transaction) => (
                                <tr key={transaction.id}>
                                  <td>{formatDate(transaction.created_at)}</td>
                                  <td>{getTransactionTypeDisplay(transaction.transaction_type)}</td>
                                  <td className="amount-cell">{formatCurrency(transaction.amount)}</td>
                                  <td>#{transaction.cycle}</td>
                                  <td className="description-cell">{transaction.description || 'N/A'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Payment Cycles Tab */}
                {activeDetailsTab === 'cycles' && (
                  <div className="tab-pane cycles">
                    <div className="payment-cycles-section">
                      <h4>🔄 Payment Cycles History</h4>
                      {customerCycles.length === 0 ? (
                        <p className="no-data">No completed payment cycles found for this customer.</p>
                      ) : (
                        <div className="cycles-table-wrapper">
                          <table className="cycles-table">
                            <thead>
                              <tr>
                                <th>Cycle #</th>
                                <th>Amount to Pay</th>
                                <th>Amount Paid</th>
                                <th>Status</th>
                                <th>Started</th>
                                <th>Completed</th>
                              </tr>
                            </thead>
                            <tbody>
                              {customerCycles.map((cycle) => (
                                <tr key={cycle.id}>
                                  <td>#{cycle.cycle_number}</td>
                                  <td className="amount-cell">{formatCurrency(cycle.amount_to_pay)}</td>
                                  <td className="amount-cell">{formatCurrency(cycle.amount_paid)}</td>
                                  <td>
                                    <span className={`cycle-status-badge ${cycle.status.toLowerCase()}`}>
                                      {cycle.status}
                                    </span>
                                  </td>
                                  <td>{formatDate(cycle.started_at)}</td>
                                  <td>{cycle.completed_at ? formatDate(cycle.completed_at) : 'In Progress'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Management Tab */}
                {activeDetailsTab === 'management' && (
                  <div className="tab-pane management">
                    <div className="management-actions">
                      <h4>🛠️ Customer Management</h4>
                      <div className="action-buttons-row">
                        <button 
                          onClick={() => setShowReactivateForm(true)}
                          className="reactivate-btn"
                          title="Start new payment cycle for this customer"
                        >
                          🔄 Reactivate Customer
                        </button>
                        <button 
                          onClick={() => setShowResetForm(true)}
                          className="reset-btn"
                          title="Reset current payment data"
                        >
                          🔄 Reset Payment Data
                        </button>
                      </div>
                      
                      {/* Reactivate Form */}
                      {showReactivateForm && (
                        <div className="inline-form">
                          <h5>🔄 Reactivate Customer for New Cycle</h5>
                          <p>This will complete the current cycle and start a new payment cycle.</p>
                          <div className="form-group">
                                                          <label>💰 New Amount to Pay:</label>
                            <input
                              type="number"
                              placeholder="Enter new amount"
                              value={reactivateAmount}
                              onChange={(e) => setReactivateAmount(e.target.value)}
                              min="0.01"
                              step="0.01"
                              required
                            />
                          </div>
                          <div className="form-actions">
                            <button onClick={handleReactivateCustomer} className="confirm-btn">
                              ✅ Confirm Reactivation
                            </button>
                            <button onClick={() => {
                              setShowReactivateForm(false);
                              setReactivateAmount('');
                            }} className="cancel-btn">
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* Reset Form */}
                      {showResetForm && (
                        <div className="inline-form">
                          <h5>🔄 Reset Payment Data</h5>
                          <p>This will reset the payment amounts while keeping customer information.</p>
                          <div className="form-group">
                                                          <label>💰 New Amount to Pay (optional):</label>
                            <input
                              type="number"
                              placeholder={`Current: ${selectedCustomer.amountToPay}`}
                              value={resetAmount}
                              onChange={(e) => setResetAmount(e.target.value)}
                              min="0"
                              step="0.01"
                            />
                            <small className="input-hint">
                              Leave blank to keep current amount ({formatCurrency(selectedCustomer.amountToPay)})
                            </small>
                          </div>
                          <div className="form-actions">
                            <button onClick={handleResetCustomer} className="confirm-btn">
                              ✅ Confirm Reset
                            </button>
                            <button onClick={() => {
                              setShowResetForm(false);
                              setResetAmount('');
                            }} className="cancel-btn">
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button 
                onClick={() => setShowCustomerDetails(false)}
                className="close-btn"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Payment Processing Modal */}
      {showPaymentProcessing && paymentProcessingData && (
        <div className="modal-overlay">
          <div className="modal-content payment-processing-modal">
            <div className="modal-header">
              <h3>Processing Payment</h3>
            </div>
            <div className="modal-body">
              <PaymentProcessingComponent 
                customer={paymentProcessingData.customer}
                amount={paymentProcessingData.amount}
                paymentMode={paymentProcessingData.paymentMode}
                onSuccess={(result) => {
                  setSuccessMessage(result.message);
                  setShowPaymentProcessing(false);
                  setPaymentProcessingData(null);
                  setEditingEntry(null);
                  setIsPaymentMode(false);
                  setPaymentAmount('');
                  fetchEntries();
                  setTimeout(() => setSuccessMessage(''), 5000);
                }}
                onError={(error) => {
                  setError(error);
                  setShowPaymentProcessing(false);
                  setPaymentProcessingData(null);
                  setTimeout(() => setError(''), 5000);
                }}
                onCancel={() => {
                  setShowPaymentProcessing(false);
                  setPaymentProcessingData(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Payment Processing Component
interface PaymentProcessingProps {
  customer: Entry;
  amount: number;
  paymentMode: string;
  onSuccess: (result: any) => void;
  onError: (error: string) => void;
  onCancel: () => void;
}

const PaymentProcessingComponent: React.FC<PaymentProcessingProps> = ({
  customer,
  amount,
  paymentMode,
  onSuccess,
  onError,
  onCancel
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [transactionResult, setTransactionResult] = useState<any>(null);
  
  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
  const getPaymentModeIcon = (mode: string) => {
    switch (mode) {
      case 'cash': return '💵 Cash';
      case 'card': return '💳 Card';
      case 'upi': return '📱 UPI';
      default: return '💳 Card';
    }
  };
  
  const processPayment = async () => {
    // Handle cash payments instantly without processing step
    if (paymentMode === 'cash') {
      try {
        const response = await fetch(`http://localhost:4000/api/customers/${customer.id}/process-payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentAmount: amount,
            paymentMode: paymentMode,
            description: `Cash payment of ₹${amount} for ${customer.name}`
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Cash payment processing failed');
        }
        
        const result = await response.json();
        setTransactionResult(result);
        setCurrentStep(3); // Skip processing step and go directly to success
        setIsProcessing(false);
        
      } catch (err) {
        setIsProcessing(false);
        const errorMessage = err instanceof Error ? err.message : 'Cash payment processing failed';
        onError(errorMessage);
      }
      return; // Exit early for cash payments
    }
    
    // Handle card and UPI payments with processing step
    setIsProcessing(true);
    setCurrentStep(2);
    setProcessingMessage(`Processing ${paymentMode.toUpperCase()} payment...`);
    
    try {
      const response = await fetch(`http://localhost:4000/api/customers/${customer.id}/process-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentAmount: amount,
          paymentMode: paymentMode,
          description: `${paymentMode.toUpperCase()} payment of ₹${amount} for ${customer.name}`
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Payment processing failed');
      }
      
      const result = await response.json();
      setTransactionResult(result);
      setCurrentStep(3);
      setIsProcessing(false);
      
    } catch (err) {
      setIsProcessing(false);
      const errorMessage = err instanceof Error ? err.message : 'Payment processing failed';
      onError(errorMessage);
    }
  };
  
  const getStepIcon = (step: number) => {
    if (step < currentStep) return '✓';
    if (step === currentStep) return isProcessing ? 'Processing' : '➤';
    return 'Pending';
  };
  
  const getStepClass = (step: number) => {
    if (step < currentStep) return 'completed';
    if (step === currentStep) return isProcessing ? 'processing' : 'active';
    return 'pending';
  };
  
  return (
    <div className="payment-processing">
      {/* Payment Summary */}
      <div className="payment-summary">
        <h4>📄 Payment Details</h4>
        <div className="summary-grid">
          <div className="summary-item">
            <span className="label">👤 Customer:</span>
            <span className="value">{customer.name}</span>
          </div>
          <div className="summary-item">
            <span className="label">💰 Amount:</span>
            <span className="value amount">{formatCurrency(amount)}</span>
          </div>
          <div className="summary-item">
            <span className="label">💳 Payment Mode:</span>
            <span className="value">{getPaymentModeIcon(paymentMode)}</span>
          </div>
        </div>
      </div>
      
      {/* Progress Steps */}
      <div className="progress-steps">
        <div className={`step ${getStepClass(1)}`}>
          <div className="step-icon">{getStepIcon(1)}</div>
          <div className="step-label">Confirm Details</div>
        </div>
        <div className="step-connector"></div>
        <div className={`step ${getStepClass(2)}`}>
          <div className="step-icon">{getStepIcon(2)}</div>
          <div className="step-label">
            {paymentMode === 'cash' ? 'Instant Processing' : 'Processing Payment'}
          </div>
        </div>
        <div className="step-connector"></div>
        <div className={`step ${getStepClass(3)}`}>
          <div className="step-icon">{getStepIcon(3)}</div>
          <div className="step-label">Complete</div>
        </div>
      </div>
      
      {/* Step Content */}
      <div className="step-content">
        {currentStep === 1 && (
          <div className="confirm-step">
            <p>Please confirm the payment details above. Click "Process Payment" to continue.</p>
            <div className="action-buttons">
              <button 
                onClick={processPayment} 
                className="process-btn"
                disabled={isProcessing}
              >
                💳 Process Payment
              </button>
              <button onClick={onCancel} className="cancel-btn">
                ❌ Cancel
              </button>
            </div>
          </div>
        )}
        
        {currentStep === 2 && (
          <div className="processing-step">
            <div className="processing-spinner"></div>
            <p className="processing-message">{processingMessage}</p>
            <p className="processing-hint">
              {paymentMode === 'cash' 
                ? 'Confirming cash payment...' 
                : paymentMode === 'card'
                ? 'Please wait while we process your card payment...'
                : 'Processing UPI transaction...'}
            </p>
          </div>
        )}
        
        {currentStep === 3 && transactionResult && (
          <div className="success-step">
            <div className="success-icon">✓</div>
            <h4>Payment Successful!</h4>
            <div className="transaction-details">
              {transactionResult.transactionId && (
                <div className="detail-item">
                  <span className="label">Transaction ID:</span>
                  <span className="value transaction-id">{transactionResult.transactionId}</span>
                </div>
              )}
              <div className="detail-item">
                <span className="label">Amount Processed:</span>
                <span className="value amount">{formatCurrency(amount)}</span>
              </div>
              <div className="detail-item">
                <span className="label">Payment Mode:</span>
                <span className="value">{transactionResult.paymentMode}</span>
              </div>
              <div className="detail-item">
                <span className="label">New Balance:</span>
                <span className="value">
                  Paid: {formatCurrency(transactionResult.data.amountPaid)} / 
                  Total: {formatCurrency(transactionResult.data.amountToPay)}
                </span>
              </div>
            </div>
            <div className="action-buttons">
              <button 
                onClick={() => onSuccess(transactionResult)} 
                className="success-btn"
              >
                Complete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
