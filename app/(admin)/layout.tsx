import { redirect } from 'next/navigation';
import AdminSidebar from '@/components/AdminSidebar';
import { getServerSession } from '@/lib/authSession';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Validación real de la sesión firmada en el servidor. Esto protege TODAS las
  // páginas del panel (incluidas las que leen datos con el service role), no
  // solo el redirect del middleware.
  const session = await getServerSession();
  if (!session) {
    redirect('/login');
  }

  return (
    <div className="brand-bg min-h-screen lg:flex">
      <AdminSidebar />
      {/* pt-14: espacio para la barra superior fija en móvil; en desktop no se necesita */}
      <main className="flex-1 overflow-auto pt-14 lg:pt-0">
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
