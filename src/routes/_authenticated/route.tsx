import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedShell,
});

/** Rotas liberadas sem login (operação de caixa). */
const PUBLIC_PATHS = ["/pdv"];

function AuthenticatedShell() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  useEffect(() => {
    if (loading || isPublic) return;
    if (!user) navigate({ to: "/auth", replace: true });
  }, [user, loading, isPublic, navigate]);

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

  return <AppShell />;
}
