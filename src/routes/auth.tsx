import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Store, Loader2, Mail, Lock, User, EyeIcon, EyeOffIcon, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Mode = "login" | "signup" | "recover";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Mercado JC ERP" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [submitting, setSubmitting] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoverSent, setRecoverSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setErrors({});
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate, mode]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if ((mode === "login" || mode === "signup" || mode === "recover") && !email.trim()) {
      next.email = "Informe seu e-mail";
    } else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "E-mail inválido";
    }
    if ((mode === "login" || mode === "signup") && !password) {
      next.password = "Informe sua senha";
    } else if (password && password.length < 6) {
      next.password = "Senha deve ter ao menos 6 caracteres";
    }
    if (mode === "signup") {
      if (!name.trim()) next.name = "Informe seu nome";
      if (!confirmPassword) next.confirmPassword = "Confirme a senha";
      else if (confirmPassword !== password) next.confirmPassword = "Senhas não coincidem";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const tr = (err: unknown): string => {
    if (!(err instanceof Error)) return "Erro desconhecido. Tente novamente.";
    const msg = err.message.toLowerCase();
    if (msg.includes("invalid login")) return "E-mail ou senha incorretos.";
    if (msg.includes("invalid_credentials")) return "E-mail ou senha incorretos.";
    if (msg.includes("user already registered")) return "Já existe uma conta com este e-mail.";
    if (msg.includes("email not confirmed")) return "E-mail ainda não confirmado. Verifique sua caixa de entrada.";
    if (msg.includes("email rate limit")) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    if (msg.includes("password")) return "Verifique sua senha (mínimo 6 caracteres).";
    return err.message;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success("Bem-vindo de volta!", { description: "Redirecionando..." });
        navigate({ to: "/dashboard", replace: true });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: name.trim() },
          },
        });
        if (error) throw error;
        toast.success("Conta criada!", {
          description: "Confirme seu e-mail para ativar a conta. Se o e-mail de confirmação não chegar, entre em contato com o administrador.",
        });
        setMode("login");
        setConfirmPassword("");
        setPassword("");
        setName("");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth?tab=recover`,
        });
        if (error) throw error;
        setRecoverSent(true);
        toast.success("E-mail enviado!", {
          description: "Verifique sua caixa de entrada para redefinir sua senha.",
        });
      }
    } catch (err) {
      toast.error(tr(err));
    } finally {
      setSubmitting(false);
    }
  };

  const backToLogin = () => {
    setMode("login");
    setRecoverSent(false);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-subtle relative overflow-hidden">
      <div className="absolute inset-0 -z-10 opacity-60">
        <div className="absolute -top-40 -left-32 size-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-32 size-96 bg-emerald-500/20 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-elegant mb-4">
            <Store className="size-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Mercado JC</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "recover" ? "Recupere sua senha" : "Sistema de gestão do supermercado"}
          </p>
        </div>

        {mode === "recover" ? (
          <Card className="shadow-elegant backdrop-blur-sm bg-card/80">
            <CardHeader>
              <Button
                variant="ghost"
                size="sm"
                className="self-start -ml-2 mb-2 text-muted-foreground"
                onClick={backToLogin}
              >
                <ArrowLeft className="size-4 mr-1" /> Voltar
              </Button>
              <CardTitle className="text-xl">Recuperar senha</CardTitle>
              <CardDescription>
                Digite seu e-mail cadastrado. Enviaremos um link para criar uma nova senha.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recoverSent ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-4">
                    <CheckCircle2 className="size-8" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">E-mail enviado!</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Verifique sua caixa de entrada e spam. Clique no link recebido para redefinir sua senha.
                  </p>
                  <Button variant="outline" className="w-full" onClick={backToLogin}>
                    Voltar para login
                  </Button>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        className={`pl-10 ${errors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        placeholder="voce@mercadojc.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Enviar link de recuperação
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-elegant backdrop-blur-sm bg-card/80">
            <CardHeader>
              <CardTitle className="text-xl">
                {mode === "login" ? "Acesse sua conta" : "Crie sua conta"}
              </CardTitle>
              <CardDescription>
                {mode === "login"
                  ? "Entre com suas credenciais para continuar"
                  : "Preencha os dados abaixo para criar seu acesso"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="login">Entrar</TabsTrigger>
                  <TabsTrigger value="signup">Cadastrar</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form onSubmit={submit} className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">E-mail</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                          id="login-email"
                          type="email"
                          autoComplete="email"
                          className={`pl-10 ${errors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          placeholder="voce@mercadojc.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                      {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="login-password">Senha</Label>
                        <button
                          type="button"
                          onClick={() => setMode("recover")}
                          className="text-xs text-primary hover:underline"
                        >
                          Esqueceu a senha?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                          id="login-password"
                          type={showPwd ? "text" : "password"}
                          autoComplete="current-password"
                          minLength={6}
                          className={`pl-10 pr-10 ${errors.password ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                          onClick={() => setShowPwd((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground hover:text-foreground"
                        >
                          {showPwd ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                        </button>
                      </div>
                      {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                    </div>

                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                      Entrar no sistema
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup">
                  <form onSubmit={submit} className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Nome completo</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                          id="signup-name"
                          autoComplete="name"
                          className={`pl-10 ${errors.name ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          placeholder="Ex.: João da Silva"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                      {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-email">E-mail</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                          id="signup-email"
                          type="email"
                          autoComplete="email"
                          className={`pl-10 ${errors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          placeholder="voce@mercadojc.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                      {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Senha (mín. 6 caracteres)</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                          id="signup-password"
                          type={showPwd ? "text" : "password"}
                          autoComplete="new-password"
                          minLength={6}
                          className={`pl-10 pr-10 ${errors.password ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                          onClick={() => setShowPwd((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground hover:text-foreground"
                        >
                          {showPwd ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                        </button>
                      </div>
                      {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-confirm">Confirmar senha</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                          id="signup-confirm"
                          type={showPwd ? "text" : "password"}
                          autoComplete="new-password"
                          minLength={6}
                          className={`pl-10 ${errors.confirmPassword ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                      </div>
                      {errors.confirmPassword && (
                        <p className="text-xs text-destructive">{errors.confirmPassword}</p>
                      )}
                    </div>

                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                      Criar conta
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
            <CardFooter className="flex-col items-start gap-1 pt-0 text-xs text-muted-foreground">
              <p>
                • A conta é criada com perfil padrão de <strong>Caixa</strong>. Fale com um administrador para ganhar permissões adicionais.
              </p>
              <p>• Protegido por autenticação Supabase.</p>
            </CardFooter>
          </Card>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Mercado JC ERP • CNPJ 35.269.764/0001-61
        </p>
      </div>
    </div>
  );
}
