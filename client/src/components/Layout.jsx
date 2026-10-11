import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { outbox, syncOutbox } from '../offline.js';
import SyncStatus from './SyncStatus.jsx';

export default function Layout({ children }) {
  const { user, business, logout } = useAuth();

  // Send queued sales when we start, when the network returns, and every 30 seconds while any are waiting
  useEffect(() => {
    syncOutbox();
    const onOnline = () => syncOutbox();
    const timer = setInterval(() => { if (outbox.all().some(e => e.status !== 'failed')) syncOutbox(); }, 30000);
    window.addEventListener('online', onOnline);
    return () => { window.removeEventListener('online', onOnline); clearInterval(timer); };
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">{business?.name || 'FarmLink'}<small>FarmLink</small></div>
        <nav>
          <NavLink to="/" end>Record sales</NavLink>
          <NavLink to="/customers">Customers</NavLink>
          {user.role === 'admin' && <>
            <NavLink to="/dashboard">Dashboard</NavLink>
            <NavLink to="/products">Products and stock</NavLink>
            <NavLink to="/reports">Reports</NavLink>
            <NavLink to="/users">Users</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </>}
        </nav>
        <div className="who">
          <SyncStatus />
          <span>{user.fullName}</span>
          <button className="btn btn--ghost" onClick={logout}>Log out</button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
