import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Pos from './pages/Pos.jsx';
import Products from './pages/Products.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Reports from './pages/Reports.jsx';
import Customers from './pages/Customers.jsx';
import Users from './pages/Users.jsx';
import Register from './pages/Register.jsx';
import Settings from './pages/Settings.jsx';

function Protected({ children, admin }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="boot">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/change-password" element={<ChangePassword />} />
      <Route path="/" element={<Protected><Pos /></Protected>} />
      <Route path="/products" element={<Protected admin><Products /></Protected>} />
      <Route path="/dashboard" element={<Protected admin><Dashboard /></Protected>} />
      <Route path="/reports" element={<Protected admin><Reports /></Protected>} />
      <Route path="/customers" element={<Protected><Customers /></Protected>} />
      <Route path="/users" element={<Protected admin><Users /></Protected>} />
      <Route path="/settings" element={<Protected admin><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
