import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PagePasswordGate } from "@/components/page-password-gate";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedShell,
});

/** Rotas liberadas sem login (operação de caixa). */
const PUBLIC_PATHS = ["/pdv", "/produtos"];

function AuthenticatedShell() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const [unlockedPath, setUnlockedPath] = useState<string | null>(null);

  useEffect(() => {
    if (loading || isPublic) return;
    if (!user) navigate({ to: "/auth", replace: true });
  }, [user, loading, isPublic, navigate]);

  // Cada nova página protegida volta a exigir a senha.
  useEffect(() => {
    if (isPublic) return;
    setUnlockedPath((prev) => (prev === pathname ? prev : null));
  }, [pathname, isPublic]);

  if (!isPublic && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  if (!isPublic && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Redirecionando para login...</p>
        </div>
      </div>
    );
  }

  if (!isPublic && user && unlockedPath !== pathname) {
    return <PagePasswordGate email={user.email ?? ""} onUnlock={() => setUnlockedPath(pathname)} />;
  }

  return <AppShell />;
}
