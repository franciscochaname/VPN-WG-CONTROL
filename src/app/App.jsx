import Dashboard from "../features/dashboard/Dashboard.jsx";
import Header from "../features/layout/Header.jsx";
import OperationsPanel from "../features/layout/OperationsPanel.jsx";
import Sidebar from "../features/layout/Sidebar.jsx";

function App() {
  return (
    <main className="min-h-screen overflow-hidden bg-warm-canvas text-warm-ink">
      <div className="pointer-events-none fixed inset-0 soft-grid" />
      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-5 lg:px-8">
        <Header />

        <div className="grid flex-1 grid-cols-1 gap-5 py-5 lg:grid-cols-[260px_minmax(0,1fr)_310px]">
          <Sidebar />
          <Dashboard />
          <OperationsPanel />
        </div>
      </section>
    </main>
  );
}

export default App;
