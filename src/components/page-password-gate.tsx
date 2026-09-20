import { useState } from "react";
import { Lock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  email: string;
  onUnlock: () => void;
};

export function PagePasswordGate({ email, onUnlock }: Props) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      setError("Senha incorreta. Tente novamente.");
      setPassword("");
      return;
    }
    onUnlock();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
      <Card className="w-full max-w-sm shadow-elegant">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-gradient-primary">
            <Lock className="size-6 text-primary-foreground" />
          </div>
          <CardTitle>Área protegida</CardTitle>
          <CardDescription className="truncate">
            Confirme a senha de {email} para acessar esta página.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gate-password">Senha</Label>
              <Input
                id="gate-password"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={loading || !password}>
              {loading ? "Verificando..." : "Desbloquear"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={signOut}>
              <LogOut className="size-4" /> Sair
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
