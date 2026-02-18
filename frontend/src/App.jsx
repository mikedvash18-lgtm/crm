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
import LeadDetail       from './pages/admin/LeadDetail';
import LeadPoolPage     from './pages/admin/LeadPoolPage';
import StatsPage        from './pages/admin/StatsPage';
import BrokersPage      from './pages/admin/BrokersPage';
import BrokerRoutesPage from './pages/admin/BrokerRoutesPage';
import ScriptsPage      from './pages/admin/ScriptsPage';
import VoximplantAccountsPage from './pages/admin/VoximplantAccountsPage';
import AgentsPage       from './pages/admin/AgentsPage';
import HotLeadsPage     from './pages/admin/HotLeadsPage';
import AdminLayout      from './components/Admin/AdminLayout';

// Agent pages
import AgentDashboard   from './pages/agent/AgentDashboard';
import AgentMyLeads     from './pages/agent/AgentMyLeads';
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
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="lead-pool" element={<LeadPoolPage />} />
        <Route path="brokers" element={<BrokersPage />} />
        <Route path="brokers/:id/routes" element={<BrokerRoutesPage />} />
        <Route path="scripts" element={<ScriptsPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="hot-leads" element={<HotLeadsPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="voximplant" element={<VoximplantAccountsPage />} />
      </Route>

      {/* Agent Panel */}
      <Route path="/agent" element={
        <ProtectedRoute role="agent"><AgentLayout /></ProtectedRoute>
      }>
        <Route index element={<AgentDashboard />} />
        <Route path="leads" element={<AgentMyLeads />} />
        <Route path="hot-leads" element={<HotLeadsPage />} />
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
