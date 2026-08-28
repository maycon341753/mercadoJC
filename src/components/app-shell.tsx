import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Receipt,
  LogOut,
  Store,
  Bell,
  Wallet,
  Boxes,
  ShieldCheck,
  FileBarChart,
  BarChart3,
  Tags,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type NavItem = { title: string; url: string; icon: typeof LayoutDashboard };

const mainNav: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "PDV", url: "/pdv", icon: ShoppingCart },
];

const catalogoNav: NavItem[] = [
  { title: "Produtos", url: "/produtos", icon: Package },
  { title: "Categorias", url: "/categorias", icon: Tags },
  { title: "Estoque", url: "/estoque", icon: Boxes },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Vendas", url: "/vendas", icon: Receipt },
];

const gestaoNav: NavItem[] = [
  { title: "Financeiro", url: "/financeiro", icon: Wallet },
  { title: "Indicadores", url: "/indicadores", icon: BarChart3 },
  { title: "Relatórios", url: "/relatorios", icon: FileBarChart },
  { title: "Auditoria", url: "/auditoria", icon: ShieldCheck },
];

function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (u: string) => pathname === u || pathname.startsWith(u + "/");

  const renderGroup = (label: string, items: NavItem[]) => (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                <Link to={item.url} className="flex items-center gap-3">
                  <item.icon className="size-4 shrink-0" />
                  {!collapsed && <span>{item.title}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-primary shadow-elegant">
            <Store className="size-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-bold text-sidebar-foreground">Mercado JC</span>
              <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">ERP</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {renderGroup("Operação", mainNav)}
        {renderGroup("Cadastros", catalogoNav)}
        {renderGroup("Gestão", gestaoNav)}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed && (
          <div className="px-2 py-2 text-[10px] text-sidebar-foreground/50">
            v2.0.0 • Completo
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

function TopBar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
      <SidebarTrigger />
      <div className="flex-1" />
      <Button variant="ghost" size="icon" aria-label="Notificações">
        <Bell className="size-4" />
      </Button>
      <ThemeToggle />
      <div className="flex items-center gap-2 rounded-full border pl-1 pr-3 py-1">
        <Avatar className="size-7">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
        </Avatar>
        <span className="hidden text-xs font-medium sm:inline max-w-[160px] truncate">{user?.email}</span>
        <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sair" className="size-7">
          <LogOut className="size-3.5" />
        </Button>
      </div>
    </header>
  );
}

export function AppShell() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gradient-subtle">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <TopBar />
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
