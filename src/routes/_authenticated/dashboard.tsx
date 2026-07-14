import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DollarSign,
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { brl, nfmt } from "@/lib/format";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const dashboardQuery = queryOptions({
  queryKey: ["dashboard"],
  queryFn: async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const start7d = new Date(); start7d.setDate(start7d.getDate() - 7);
    const start30d = new Date(); start30d.setDate(start30d.getDate() - 30);

    const [salesToday, sales7d, sales30d, products, customers, lowStock] = await Promise.all([
      supabase.from("sales").select("total, created_at").gte("created_at", startOfDay.toISOString()).eq("status", "concluida"),
      supabase.from("sales").select("total, created_at").gte("created_at", start7d.toISOString()).eq("status", "concluida"),
      supabase.from("sales").select("total, created_at").gte("created_at", start30d.toISOString()).eq("status", "concluida"),
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("products").select("id, name, stock, stock_min").lte("stock", 10).order("stock", { ascending: true }).limit(5),
    ]);

    const sumToday = (salesToday.data ?? []).reduce((s, x) => s + Number(x.total), 0);
    const sum7d = (sales7d.data ?? []).reduce((s, x) => s + Number(x.total), 0);
    const sum30d = (sales30d.data ?? []).reduce((s, x) => s + Number(x.total), 0);

    // Series últimos 7 dias
    const days: { label: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const day = (sales7d.data ?? []).filter(
        (s) => new Date(s.created_at) >= d && new Date(s.created_at) < next,
      ).reduce((sum, s) => sum + Number(s.total), 0);
      days.push({ label: d.toLocaleDateString("pt-BR", { weekday: "short" }), total: day });
    }

    // Top vendedores/produtos por categoria
    const { data: catData } = await supabase
      .from("sale_items")
      .select("total, product:products(category:categories(name, color))")
      .limit(500);
    const byCat = new Map<string, { name: string; value: number; color: string }>();
    (catData ?? []).forEach((row) => {
      const cat = row.product?.category;
      const name = cat?.name ?? "Outros";
      const color = cat?.color ?? "#94a3b8";
      const cur = byCat.get(name) ?? { name, value: 0, color };
      cur.value += Number(row.total);
      byCat.set(name, cur);
    });

    return {
      sumToday,
      sum7d,
      sum30d,
      countSalesToday: salesToday.data?.length ?? 0,
      countSales30d: sales30d.data?.length ?? 0,
      avgTicket: (sales30d.data?.length ?? 0) > 0 ? sum30d / (sales30d.data?.length ?? 1) : 0,
      productsCount: products.count ?? 0,
      customersCount: customers.count ?? 0,
      lowStock: lowStock.data ?? [],
      days,
      byCategory: Array.from(byCat.values()).sort((a, b) => b.value - a.value).slice(0, 6),
    };
  },
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Mercado JC ERP" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery),
  component: Dashboard,
});

function KpiCard({ icon: Icon, label, value, hint, tone = "primary" }: {
  icon: typeof DollarSign; label: string; value: string; hint?: string; tone?: "primary" | "success" | "warning" | "info";
}) {
  const toneClass = {
    primary: "from-primary/15 to-primary/5 text-primary",
    success: "from-success/15 to-success/5 text-success",
    warning: "from-warning/15 to-warning/5 text-warning",
    info: "from-info/15 to-info/5 text-info",
  }[tone];
  return (
    <Card className="shadow-card overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${toneClass}`}>
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { data } = useSuspenseQuery(dashboardQuery);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral do Mercado JC</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={DollarSign} label="Faturamento hoje" value={brl(data.sumToday)} hint={`${data.countSalesToday} venda(s)`} tone="primary" />
        <KpiCard icon={TrendingUp} label="Últimos 7 dias" value={brl(data.sum7d)} tone="success" />
        <KpiCard icon={ShoppingCart} label="Vendas (30d)" value={nfmt(data.countSales30d)} hint={`Ticket médio ${brl(data.avgTicket)}`} tone="info" />
        <KpiCard icon={Users} label="Clientes" value={nfmt(data.customersCount)} hint={`${data.productsCount} produtos`} tone="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-card">
          <CardHeader><CardTitle>Vendas dos últimos 7 dias</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.days} margin={{ left: -10, right: 10, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                <Tooltip
                  contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                  formatter={(v: number) => brl(v)}
                />
                <Area type="monotone" dataKey="total" stroke="var(--color-primary)" fill="url(#g1)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle>Vendas por categoria</CardTitle></CardHeader>
          <CardContent className="h-72">
            {data.byCategory.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados ainda</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.byCategory} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {data.byCategory.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => brl(v)} contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" />
            Estoque baixo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.lowStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto com estoque baixo. 🎉</p>
          ) : (
            <div className="divide-y">
              {data.lowStock.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-warning/15 text-warning">
                      <Package className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">Mínimo: {nfmt(p.stock_min)}</p>
                    </div>
                  </div>
                  <div className="text-sm font-bold text-warning">{nfmt(p.stock)} un</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
