import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

// Admin pages
import LoginPage        from './pages/LoginPage';
import DashboardPage    from './pages/admin/DashboardPage';
import CampaignsPage    from './pages/admin/CampaignsPage';
import CampaignDetail   from './pages/admin/CampaignDetail';
import CampaignBuilder  from './pages/admin/CampaignBuilder';
import LeadsPage        from './pages/admin/LeadsPage';
import StatsPage        from './pages/admin/StatsPage';
import BrokersPage      from './pages/admin/BrokersPage';
import ScriptsPage      from './pages/admin/ScriptsPage';
import AdminLayout      from './components/Admin/AdminLayout';

// Agent pages
import AgentDashboard   from './pages/agent/AgentDashboard';
import AgentLayout      from './components/Agent/AgentLayout';

function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role === 'agent' && user.role !== 'agent') return <Navigate to="/" replace />;
  if (role === 'admin' && user.role === 'agent') return <Navigate to="/agent" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Admin Panel */}
      <Route path="/" element={
        <ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>
      }>
        <Route index element={<DashboardPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="campaigns/new" element={<CampaignBuilder />} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="brokers" element={<BrokersPage />} />
        <Route path="scripts" element={<ScriptsPage />} />
        <Route path="stats" element={<StatsPage />} />
      </Route>

      {/* Agent Panel */}
      <Route path="/agent" element={
        <ProtectedRoute role="agent"><AgentLayout /></ProtectedRoute>
      }>
        <Route index element={<AgentDashboard />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
