'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Search, X, AlertTriangle, ShieldAlert, Trash2, SquareMinus } from 'lucide-react';

export default function Home() {
  const [device, setDevice] = useState(null);
  const [packages, setPackages] = useState({ system: [], user: [] });
  const [selectedPackages, setSelectedPackages] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [pane, setPane] = useState('loading'); // 'loading', 'alert', 'app-list'
  const [alertInfo, setAlertInfo] = useState({ title: '', message: '' });
  const [loadingText, setLoadingText] = useState('Scanning for ADB devices...');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [systemScrolled, setSystemScrolled] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);

  // Modals state
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isProgressOpen, setIsProgressOpen] = useState(false);

  // Progress state
  const [progressTitle, setProgressTitle] = useState('Uninstalling Packages...');
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStatus, setProgressStatus] = useState('Preparing...');
  const [successCount, setSuccessCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [consoleLog, setConsoleLog] = useState([]);
  const [isProgressDone, setIsProgressDone] = useState(false);

  const searchInputRef = useRef(null);
  const consoleLogRef = useRef(null);
  const eventSourceRef = useRef(null);

  // Keep device ref updated to avoid stale closure in polling loop
  const deviceRef = useRef(device);
  useEffect(() => {
    deviceRef.current = device;
  }, [device]);

  // Initial load and background polling loop
  useEffect(() => {
    refreshAll(true);

    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/device');
        const data = await response.json();
        
        const wasConnected = !!deviceRef.current;
        const isConnected = data.success;
        const serialChanged = wasConnected && isConnected && deviceRef.current.serial !== data.device.serial;
        
        if (!wasConnected && isConnected) {
          setDevice(data.device);
          refreshAll(false);
        } else if (wasConnected && !isConnected) {
          setDevice(null);
          setPackages({ system: [], user: [] });
          setSelectedPackages(new Set());
          showConnectionError('Device Disconnected', 'Please re-connect your Android device via USB.');
        } else if (serialChanged) {
          setDevice(data.device);
          refreshAll(false);
        }
      } catch (e) {
        console.warn('Failed to poll device status', e);
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  // Global hotkeys handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (e.key === 'Escape') {
        if (isConfirmOpen) {
          setIsConfirmOpen(false);
        } else if (searchQuery) {
          setSearchQuery('');
          searchInputRef.current?.focus();
        } else {
          setSelectedPackages(new Set());
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isConfirmOpen, searchQuery]);

  // Scroll console log to bottom on changes
  useEffect(() => {
    if (consoleLogRef.current) {
      consoleLogRef.current.scrollTop = consoleLogRef.current.scrollHeight;
    }
  }, [consoleLog]);

  const showConnectionError = (title, message) => {
    setAlertInfo({ title, message });
    setPane('alert');
  };

  const refreshAll = async (showLoading = true) => {
    if (showLoading) {
      setPane('loading');
      setLoadingText('Scanning for ADB devices...');
    }
    setIsRefreshing(true);

    try {
      const deviceResponse = await fetch('/api/device');
      const deviceData = await deviceResponse.json();

      if (!deviceData.success) {
        setDevice(null);
        showConnectionError('No Device Found', deviceData.error || 'Ensure your device is connected with USB Debugging enabled.');
        setIsRefreshing(false);
        return;
      }

      setDevice(deviceData.device);

      if (showLoading) {
        setLoadingText('Loading installed packages from device...');
      }

      const pkgsResponse = await fetch('/api/packages');
      const pkgsData = await pkgsResponse.json();

      if (!pkgsData.success) {
        showConnectionError('Failed to Load Packages', pkgsData.error || 'An error occurred while loading application list.');
        setIsRefreshing(false);
        return;
      }

      const sysPkgs = pkgsData.sysPackages || [];
      const userPkgs = pkgsData.userPackages || [];
      setPackages({ system: sysPkgs, user: userPkgs });

      // Clean selected packages that no longer exist
      const allPkgs = new Set([...sysPkgs, ...userPkgs]);
      setSelectedPackages(prev => {
        const next = new Set(prev);
        for (const pkg of next) {
          if (!allPkgs.has(pkg)) {
            next.delete(pkg);
          }
        }
        return next;
      });

      setPane('app-list');
    } catch (e) {
      showConnectionError('Connection Error', 'Could not communicate with the local SACA backend API.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter visible items
  const q = searchQuery.trim().toLowerCase();
  const visibleSystemPackages = packages.system.filter(pkg => pkg.toLowerCase().includes(q));
  const visibleUserPackages = packages.user.filter(pkg => pkg.toLowerCase().includes(q));

  // Toggle selection on a single package
  const togglePackage = (pkg) => {
    setSelectedPackages(prev => {
      const next = new Set(prev);
      if (next.has(pkg)) {
        next.delete(pkg);
      } else {
        next.add(pkg);
      }
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectedPackages(new Set());
  };

  // Human-friendly package name formatter
  const getFriendlyName = (pkgName) => {
    const parts = pkgName.split('.');
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const prev = parts[parts.length - 2];
      let name = last;
      if (['android', 'google', 'sec', 'samsung', 'huawei', 'xiaomi', 'miui'].includes(last)) {
        name = prev;
      }
      return name.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }
    return pkgName;
  };


  // Log to progress console
  const logConsole = (message, type = 'info') => {
    setConsoleLog(prev => [...prev, { text: message, type }]);
  };

  // Progress modal done
  const handleProgressDone = () => {
    setIsProgressOpen(false);
    refreshAll(false); // Reload package lists
  };

  // Perform SSE uninstallation
  const startUninstallation = () => {
    setIsConfirmOpen(false);
    
    const targetPackages = Array.from(selectedPackages);
    if (targetPackages.length === 0) return;

    // Reset progress state
    setProgressTitle('Uninstalling Packages...');
    setProgressPercent(0);
    setProgressStatus('Starting connection...');
    setSuccessCount(0);
    setFailCount(0);
    setConsoleLog([{ text: 'Establishing connection to ADB server...', type: 'info' }]);
    setIsProgressDone(false);
    setIsProgressOpen(true);

    const packagesParam = encodeURIComponent(JSON.stringify(targetPackages));
    const sseUrl = `/api/uninstall?packages=${packagesParam}`;
    
    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('start', (e) => {
      const data = JSON.parse(e.data);
      logConsole(`Target: Uninstalling ${data.total} packages.`, 'info');
      setProgressStatus(`Starting removal of ${data.total} packages...`);
    });

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      const percent = Math.round((data.index / data.total) * 100);
      setProgressPercent(percent);

      if (data.status === 'uninstalling') {
        setProgressStatus(`Uninstalling: ${data.package} (${data.index}/${data.total})`);
      } else if (data.status === 'success') {
        logConsole(`[✓] SUCCESS: ${data.package}`, 'success');
        setSuccessCount(prev => prev + 1);
      } else if (data.status === 'fail') {
        logConsole(`[✗] FAILED:  ${data.package}${data.error ? ` (${data.error})` : ''}`, 'error');
        setFailCount(prev => prev + 1);
      }
    });

    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      logConsole(`\n========================================`, 'info');
      logConsole(`UNINSTALLATION COMPLETE`, 'info');
      logConsole(`Total Packages: ${data.total}`, 'info');
      logConsole(`Succeeded:      ${data.successCount}`, 'success');
      logConsole(`Failed:         ${data.failCount}`, data.failCount > 0 ? 'error' : 'info');
      logConsole(`========================================`, 'info');

      setProgressStatus('Removal complete!');
      setProgressTitle('Uninstallation Complete');
      setIsProgressDone(true);
      setSelectedPackages(new Set());
      eventSource.close();
    });

    eventSource.addEventListener('error', (e) => {
      logConsole('\n[!] Connection lost or error occurred.', 'error');
      if (e.data) {
        try {
          const errorData = JSON.parse(e.data);
          logConsole(`Error details: ${errorData.message}`, 'error');
        } catch (err) {}
      }
      setProgressStatus('Process halted due to connection error.');
      setIsProgressDone(true);
      eventSource.close();
    });
  };


  // Circular progress ring parameters
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="main-header">
        <div className="logo-container">
          <h1 className="logo-text">SACA</h1>
        </div>

        <div className={`device-panel ${device ? 'connected' : 'disconnected'}`}>
          <div className="status-indicator">
            <span className="pulse-dot"></span>
            <span className="status-text">{device ? 'Connected' : 'No Device'}</span>
          </div>
          {device && (
            <div className="device-details">
              <span className="device-name">{`${device.brand || ''} ${device.model || ''}`.trim() || 'Unknown'}</span>
              <span className="separator">|</span>
              <span className="device-version">Android {device.androidVersion}</span>
              <span className="separator">|</span>
              <span className="device-serial">{device.serial}</span>
            </div>
          )}
          <button 
            className={`btn-icon ${isRefreshing ? 'spinning' : ''}`} 
            onClick={() => refreshAll(true)}
            title="Refresh connection and package lists"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">

        {/* Loading Pane */}
        {pane === 'loading' && (
          <section className="loading-pane">
            <div className="spinner"></div>
            <p>{loadingText}</p>
          </section>
        )}

        {/* Device Alert Pane */}
        {pane === 'alert' && (
          <section className="alert-pane">
            <div className="alert-card">
              <AlertTriangle size={48} style={{ color: '#ef4444', marginBottom: '8px' }} />
              <h2>{alertInfo.title}</h2>
              <p>{alertInfo.message}</p>
              <div className="alert-actions">
                <button className="btn btn-primary" onClick={() => refreshAll(true)}>Scan for Devices</button>
              </div>
            </div>
          </section>
        )}

        {/* Split Pane View */}
        {pane === 'app-list' && (
          <div className="split-container">
            {/* System Apps Column */}
            <section className="column-panel system-column">
              <div className={`column-header ${systemScrolled ? 'scrolled' : ''}`}>
                <h2>System Apps <span className="badge">{packages.system.length}</span></h2>
              </div>

              {visibleSystemPackages.length > 0 ? (
                <div className="package-list" onScroll={(e) => setSystemScrolled(e.target.scrollTop > 0)}>
                  {visibleSystemPackages.map((pkg) => {
                    const isSelected = selectedPackages.has(pkg);
                    return (
                      <div 
                        key={pkg}
                        className={`package-card ${isSelected ? 'selected' : ''} system-app`}
                        onClick={() => togglePackage(pkg)}
                      >
                        <div className="card-checkbox">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => togglePackage(pkg)}
                            onClick={e => e.stopPropagation()}
                            className="default-checkbox"
                          />
                        </div>
                        <div className="card-info">
                          <div className="card-pkg-friendly">{getFriendlyName(pkg)}</div>
                          <div className="card-pkg-name" title={pkg}>{pkg}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <Search size={36} style={{ color: '#9ca3af', marginBottom: '8px' }} />
                  <h3>No matching system apps</h3>
                </div>
              )}
            </section>

            {/* User Apps Column */}
            <section className="column-panel user-column">
              <div className={`column-header ${userScrolled ? 'scrolled' : ''}`}>
                <h2>User Apps <span className="badge">{packages.user.length}</span></h2>
              </div>

              {visibleUserPackages.length > 0 ? (
                <div className="package-list" onScroll={(e) => setUserScrolled(e.target.scrollTop > 0)}>
                  {visibleUserPackages.map((pkg) => {
                    const isSelected = selectedPackages.has(pkg);
                    return (
                      <div 
                        key={pkg}
                        className={`package-card ${isSelected ? 'selected' : ''} user-app`}
                        onClick={() => togglePackage(pkg)}
                      >
                        <div className="card-checkbox">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => togglePackage(pkg)}
                            onClick={e => e.stopPropagation()}
                            className="default-checkbox"
                          />
                        </div>
                        <div className="card-info">
                          <div className="card-pkg-friendly">{getFriendlyName(pkg)}</div>
                          <div className="card-pkg-name" title={pkg}>{pkg}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <Search size={36} style={{ color: '#9ca3af', marginBottom: '8px' }} />
                  <h3>No matching user apps</h3>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Footer Toolbar */}
      {pane === 'app-list' && (
        <footer className="footer-toolbar">
          <div className="search-box">
            <Search size={18} className="search-icon" style={{ color: 'var(--text-muted)' }} />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search packages (press '/' to focus)..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
            />
            {searchQuery && (
              <button className="btn-clear" onClick={() => setSearchQuery('')}><X size={16} /></button>
            )}
          </div>

          {selectedPackages.size > 0 && (
            <div className="header-selection-bar">
              <span className="selection-count"><strong>{selectedPackages.size}</strong> selected</span>
              <button className="btn-icon" onClick={handleDeselectAll} title="Deselect All">
                <SquareMinus size={18} />
              </button>
              <button className="btn-icon" onClick={() => setIsConfirmOpen(true)} title="Uninstall Selected">
                <Trash2 size={18} />
              </button>
            </div>
          )}
        </footer>
      )}


      {/* Confirmation Modal */}
      <div className={`modal-overlay ${isConfirmOpen ? 'visible' : ''}`}>
        <div className="modal-card">
          <div className="modal-header">
            <h2>Confirm Uninstallation</h2>
            <button className="modal-close" onClick={() => setIsConfirmOpen(false)}><X size={20} /></button>
          </div>
          <div className="modal-body">
            <div className="warning-banner">
              <ShieldAlert size={24} style={{ color: '#b45309', flexShrink: 0 }} />
              <div className="warning-text">
                <strong>Warning:</strong> You are about to disable/uninstall system packages. 
                Removing essential system files could cause device instability or boot loops. Proceed with care.
              </div>
            </div>
            <p>You have selected <strong>{selectedPackages.size}</strong> package(s) for removal:</p>
            <div className="confirm-packages-list">
              {Array.from(selectedPackages).map(pkg => (
                <div key={pkg} className="confirm-pkg-item">{pkg}</div>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setIsConfirmOpen(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={startUninstallation}>Yes, Uninstall</button>
          </div>
        </div>
      </div>

      {/* Progress modal */}
      <div className={`modal-overlay progress-overlay ${isProgressOpen ? 'visible' : ''}`}>
        <div className="modal-card progress-card">
          <div className="modal-header">
            <h2>{progressTitle}</h2>
          </div>
          <div className="modal-body">
            <div className="progress-meter-container">
              <div className="progress-ring-wrapper">
                <svg className="progress-ring" width="120" height="120">
                  <circle className="progress-ring-circle-bg" stroke="rgba(0,0,0,0.05)" strokeWidth="8" fill="transparent" r="50" cx="60" cy="60"/>
                  <circle 
                    className="progress-ring-circle" 
                    stroke="var(--accent-green)" 
                    strokeWidth="8" 
                    strokeDasharray={circumference} 
                    strokeDashoffset={strokeDashoffset} 
                    strokeLinecap="round" 
                    fill="transparent" 
                    r="50" 
                    cx="60" 
                    cy="60"
                  />
                </svg>
                <div className="progress-percentage-text">{progressPercent}%</div>
              </div>
            </div>

            <div className="progress-status-container">
              <div className="status-detail-text">{progressStatus}</div>
              <div className="progress-numbers">
                <span className="stat-success">{successCount} Succeeded</span>
                <span className="stat-separator">•</span>
                <span className="stat-fail">{failCount} Failed</span>
              </div>
            </div>

            <div className="console-log-header">Execution Log</div>
            <div ref={consoleLogRef} className="console-log">
              {consoleLog.map((log, index) => (
                <div key={index} className={`console-line ${log.type}`}>
                  {log.text}
                </div>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            {isProgressDone && (
              <button className="btn btn-primary" onClick={handleProgressDone}>Done</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
