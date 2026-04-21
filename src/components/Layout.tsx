import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, ClipboardList, PlusCircle, FileSpreadsheet, Wrench, LogOut, Menu, X, ShoppingCart } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

export function Layout({ children }: { children: React.ReactNode }) {
  const { profile, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/', roles: ['admin', 'technician', 'storekeeper'] },
    { label: 'Inventory', icon: Package, path: '/inventory', roles: ['admin', 'storekeeper', 'technician'] },
    { label: 'Add Product', icon: PlusCircle, path: '/add-product', roles: ['admin', 'storekeeper', 'technician'] },
    { label: 'Tool Register', icon: Wrench, path: '/tools', roles: ['admin', 'technician', 'storekeeper'] },
    { label: 'Maintenance', icon: ClipboardList, path: '/maintenance', roles: ['admin', 'technician', 'storekeeper'] },
    { label: 'Reports', icon: FileSpreadsheet, path: '/reports', roles: ['admin', 'storekeeper', 'technician'] },
    { label: 'Stock Orders', icon: ShoppingCart, path: '/orders', roles: ['admin', 'storekeeper', 'technician'] },
  ];

  const filteredNavItems = navItems.filter(item => 
    profile && item.roles.includes(profile.role)
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden bg-white border-b border-zinc-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <h1 className="text-xl font-bold text-zinc-900">FixIt</h1>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-zinc-500">
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-0 z-40 bg-white border-r border-zinc-200 w-64 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0",
        isMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          <div className="p-6 hidden md:block">
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">FixIt <span className="text-zinc-400 font-normal">Inventory</span></h1>
          </div>

          <nav className="flex-1 px-4 py-4 space-y-1">
            {filteredNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                  location.pathname === item.path
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100"
                )}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="p-4 border-t border-zinc-100">
            <div className="flex items-center gap-3 px-4 py-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-600 font-bold uppercase">
                {profile?.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 truncate">{profile?.name}</p>
                <p className="text-xs text-zinc-500 capitalize">{profile?.role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
