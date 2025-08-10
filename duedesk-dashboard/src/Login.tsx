import React, { useState, useEffect } from 'react';
import './Login.css';

interface LoginProps {
  onLogin: (token: string, user: any) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Clear error when user starts typing
    if (error) {
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Basic validation
    if (!formData.username.trim()) {
      setError('Username is required');
      setIsLoading(false);
      return;
    }

    if (!formData.password) {
      setError('Password is required');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('http://localhost:4000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username.trim(),
          password: formData.password
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.success && data.data.token) {
        // Store token in localStorage
        localStorage.setItem('duedesk_token', data.data.token);
        localStorage.setItem('duedesk_user', JSON.stringify(data.data.user));
        
        // Call the onLogin callback
        onLogin(data.data.token, data.data.user);
      } else {
        throw new Error('Invalid response from server');
      }

    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Check for stored credentials on component mount
  useEffect(() => {
    const storedToken = localStorage.getItem('duedesk_token');
    const storedUser = localStorage.getItem('duedesk_user');
    
    if (storedToken && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        onLogin(storedToken, user);
      } catch (err) {
        // Clear invalid stored data
        localStorage.removeItem('duedesk_token');
        localStorage.removeItem('duedesk_user');
      }
    }
  }, [onLogin]);

  return (
    <div className="login-container">
      <div className="login-background">
        <div className="login-card">
          <div className="login-header">
            <div className="login-logo">
              <div className="logo-icon">💳</div>
              <h1 className="logo-text">DueDesk</h1>
            </div>
            <h2 className="login-title">Administrator Login</h2>
            <p className="login-subtitle">Access your payment management dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="username" className="form-label">
                👤 Username or Email
              </label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Enter your username or email"
                className="form-input"
                required
                disabled={isLoading}
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">
                🔐 Password
              </label>
              <div className="password-input-container">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  className="form-input password-input"
                  required
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '👁️' : '🙈'}
                </button>
              </div>
            </div>

            {error && (
              <div className="error-message">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              className={`login-button ${isLoading ? 'loading' : ''}`}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="loading-spinner"></div>
                  Signing In...
                </>
              ) : (
                <>
                  🚀 Sign In
                </>
              )}
            </button>
          </form>

          <div className="login-footer">
            <div className="default-credentials">
              <h4>Default Credentials:</h4>
              <p><strong>Username:</strong> admin</p>
              <p><strong>Password:</strong> admin123</p>
              <small>⚠️ Please change the password after first login</small>
            </div>
          </div>
        </div>
      </div>
      
      <div className="login-background-pattern"></div>
    </div>
  );
};

export default Login;
