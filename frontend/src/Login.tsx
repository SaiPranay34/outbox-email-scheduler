export default function Login() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="w-full max-w-[350px] rounded-lg border border-slate-200 px-10 py-10 text-center">
        <h1 className="mb-6 text-3xl font-semibold">Login</h1>
        <a
          href="/api/auth/google"
          className="flex items-center justify-center gap-3 rounded-lg bg-mint py-3 text-sm"
        >
          <span className="text-lg font-bold text-blue-500">G</span> Login with Google
        </a>
      </section>
    </main>
  );
}
