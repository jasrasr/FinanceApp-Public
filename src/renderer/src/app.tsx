export const App = (): React.JSX.Element => {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white px-8 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Debt Tracker</h1>
          <span className="text-sm text-slate-500">Local desktop application</span>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-73px)] max-w-7xl grid-cols-[240px_1fr]">
        <nav
          aria-label="Primary navigation"
          className="border-r border-slate-200 bg-slate-50 px-5 py-8"
        >
          <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
            Navigation
          </p>
          <ul aria-label="Navigation items" className="mt-5" />
        </nav>

        <main className="p-10">
          <section
            aria-labelledby="home-heading"
            className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500">Home</p>
            <h2
              id="home-heading"
              className="mt-2 text-3xl font-semibold tracking-tight"
            >
              Application foundation
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-slate-600">
              The application shell is ready. Debt-management workflows will be added in
              later phases.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
};
