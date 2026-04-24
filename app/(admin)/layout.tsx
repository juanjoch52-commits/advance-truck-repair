import AdminSidebar from '@/components/AdminSidebar';
import ClientProviders from '@/components/ClientProviders';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientProviders>
      <div className="brand-bg min-h-screen flex">
        <AdminSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </ClientProviders>
  );
}
