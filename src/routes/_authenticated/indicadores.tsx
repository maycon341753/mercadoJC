import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { brl, nfmt, dateFmt } from "@/lib/format";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  Trophy,
  CalendarDays,
  Users,
  Ticket,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Package,
  ShoppingBag,
  Clock,
} from "lucide-react";

type SaleRow = {
  id: string;
  total: number | string;
  created_at: string;
  customer_id: string | null;
};
type ItemRow = {
  quantity: number | string;
  total: number | string;
  product_id: string | null;
  product: { name: string; unit: string } | null;
  sale: { created_at: string } | null;
};

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const indicadoresQuery = queryOptions({
  queryKey: ["indicadores"],
  queryFn: async () => {
    const now = new Date();
    const start2yAgo = new Date(now.getFullYear() - 2, 0, 1);
    const in60d = new Date(now.getTime() + 60 * 864e5);

    const [salesRes, itemsRes, expiryRes, customersRes, productsRes] = await Promise.all([
      supabase
        .from("sales")
        .select("id, total, created_at, customer_id")
        .eq("status", "concluida")
        .gte("created_at", start2yAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("sale_items")
        .select("quantity, total, product_id, product:products(name, unit), sale:sales!inner(created_at, status)")
        .eq("sale.status", "concluida")
        .gte("sale.created_at", start2yAgo.toISOString())
        .limit(10000),
      supabase
        .from("products")
        .select("id, name, stock, expiry_date, unit")
        .not("expiry_date", "is", null)
        .lte("expiry_date", in60d.toISOString().slice(0, 10))
        .order("expiry_date", { ascending: true })
        .limit(50),
      supabase.from("customers").select("id, created_at").order("created_at", { ascending: false }),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true),
    ]);

    const sales = (salesRes.data ?? []) as SaleRow[];
    const items = (itemsRes.data ?? []) as unknown as ItemRow[];
    const expiring = expiryRes.data ?? [];
    const customers = customersRes.data ?? [];

    // ============ TOP 10 PRODUTOS ============
    const byProduct = new Map<string, { name: string; qty: number; total: number; unit: string }>();
    items.forEach((i) => {
      const key = i.product_id ?? "sem";
      const cur = byProduct.get(key) ?? { name: i.product?.name ?? "Produto removido", qty: 0, total: 0, unit: i.product?.unit ?? "un" };
      cur.qty += Number(i.quantity);
      cur.total += Number(i.total);
      byProduct.set(key, cur);
    });
    const topProdutosQty = Array.from(byProduct.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
    const topProdutosFat = Array.from(byProduct.values()).sort((a, b) => b.total - a.total).slice(0, 10);

    // ============ DIA DA SEMANA ============
    const weekday = Array.from({ length: 7 }, (_, i) => ({ dia: WEEKDAYS[i], transacoes: 0, faturamento: 0 }));
    sales.forEach((s) => {
      const d = new Date(s.created_at).getDay();
      weekday[d].transacoes += 1;
      weekday[d].faturamento += Number(s.total);
    });
    const bestWeekday = [...weekday].sort((a, b) => b.transacoes - a.transacoes)[0];

    // ============ HORA DO DIA ============
    const hourly = Array.from({ length: 24 }, (_, h) => ({ hora: `${h.toString().padStart(2, "0")}h`, transacoes: 0 }));
    sales.forEach((s) => { hourly[new Date(s.created_at).getHours()].transacoes += 1; });
    const bestHour = [...hourly].sort((a, b) => b.transacoes - a.transacoes)[0];

    // ============ MÊS COM MAIOR MOVIMENTO (histórico) ============
    const monthMap = new Map<string, { label: string; transacoes: number; faturamento: number; sort: string }>();
    sales.forEach((s) => {
      const d = new Date(s.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = `${MONTHS[d.getMonth()]}/${d.getFullYear().toString().slice(2)}`;
      const cur = monthMap.get(key) ?? { label, transacoes: 0, faturamento: 0, sort: key };
      cur.transacoes += 1;
      cur.faturamento += Number(s.total);
      monthMap.set(key, cur);
    });
    const monthsSorted = Array.from(monthMap.values()).sort((a, b) => a.sort.localeCompare(b.sort));
    const bestMonth = [...monthsSorted].sort((a, b) => b.transacoes - a.transacoes)[0];

    // ============ COMPARATIVOS ============
    const monthNow = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const nextMonthNow = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthPrev = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthYearAgo = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);

    const inRange = (d: Date, start: Date, end: Date) => d >= start && d < end;
    const bucket = (start: Date, end: Date) => {
      let count = 0, total = 0;
      sales.forEach((s) => {
        const d = new Date(s.created_at);
        if (inRange(d, start, end)) { count += 1; total += Number(s.total); }
      });
      return { count, total };
    };

    const cur = bucket(monthNow, nextMonthNow);
    const prev = bucket(monthPrev, nextMonthPrev);
    const yearAgo = bucket(monthYearAgo, nextMonthYearAgo);

    const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100);

    // ============ CLIENTES ============
    const start30d = new Date(now.getTime() - 30 * 864e5);
    const newCustomers30d = customers.filter((c) => new Date(c.created_at) >= start30d).length;
    const uniqueBuyers30d = new Set(
      sales.filter((s) => new Date(s.created_at) >= start30d && s.customer_id).map((s) => s.customer_id),
    ).size;

    // Top clientes
    const byCustomer = new Map<string, { total: number; count: number }>();
    sales.forEach((s) => {
      if (!s.customer_id) return;
      const c = byCustomer.get(s.customer_id) ?? { total: 0, count: 0 };
      c.total += Number(s.total);
      c.count += 1;
      byCustomer.set(s.customer_id, c);
    });
    const topCustIds = Array.from(byCustomer.entries()).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
    let topCustomers: { name: string; total: number; count: number }[] = [];
    if (topCustIds.length) {
      const { data: custData } = await supabase.from("customers").select("id, name").in("id", topCustIds.map((x) => x[0]));
      const nameMap = new Map((custData ?? []).map((c) => [c.id, c.name]));
      topCustomers = topCustIds.map(([id, v]) => ({ name: nameMap.get(id) ?? "—", total: v.total, count: v.count }));
    }

    // ============ TICKET MÉDIO ============
    const salesLast30d = sales.filter((s) => new Date(s.created_at) >= start30d);
    const avgTicket30 = salesLast30d.length ? salesLast30d.reduce((a, s) => a + Number(s.total), 0) / salesLast30d.length : 0;
    const avgTicketAll = sales.length ? sales.reduce((a, s) => a + Number(s.total), 0) / sales.length : 0;

    // ============ SÉRIE MENSAL PARA GRÁFICO (últimos 12 meses) ============
    const last12: { label: string; atual: number; anterior: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const yKey = `${d.getFullYear() - 1}-${d.getMonth()}`;
      last12.push({
        label: `${MONTHS[d.getMonth()]}/${d.getFullYear().toString().slice(2)}`,
        atual: monthMap.get(key)?.transacoes ?? 0,
        anterior: monthMap.get(yKey)?.transacoes ?? 0,
      });
      void end;
    }

    return {
      topProdutosQty,
      topProdutosFat,
      weekday,
      bestWeekday,
      hourly,
      bestHour,
      monthsSorted: monthsSorted.slice(-12),
      bestMonth,
      compareCurr: cur,
      comparePrev: prev,
      compareYearAgo: yearAgo,
      pctVsPrev: pct(cur.total, prev.total),
      pctCountVsPrev: pct(cur.count, prev.count),
      pctVsYear: pct(cur.total, yearAgo.total),
      pctCountVsYear: pct(cur.count, yearAgo.count),
      newCustomers30d,
      uniqueBuyers30d,
      totalCustomers: customers.length,
      topCustomers,
      avgTicket30,
      avgTicketAll,
      expiring,
      last12,
      productsActive: productsRes.count ?? 0,
      totalSales: sales.length,
    };
  },
});

export const Route = createFileRoute("/_authenticated/indicadores")({
  head: () => ({
    meta: [
      { title: "Indicadores — Mercado JC ERP" },
      { name: "description", content: "KPIs, top produtos, sazonalidade e comparativos de vendas do Mercado JC" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(indicadoresQuery),
  component: IndicadoresPage,
});

function Delta({ value }: { value: number }) {
  if (!isFinite(value)) return <span className="text-muted-foreground text-xs">—</span>;
  const Icon = value > 0.5 ? TrendingUp : value < -0.5 ? TrendingDown : Minus;
  const tone = value > 0.5 ? "text-success" : value < -0.5 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${tone}`}>
      <Icon className="size-3.5" />
      {value > 0 ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

function Kpi({ icon: Icon, label, value, hint, tone = "primary", delta }: {
  icon: typeof Trophy; label: string; value: string; hint?: string;
  tone?: "primary" | "success" | "warning" | "info"; delta?: number;
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
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold truncate">{value}</p>
            <div className="mt-1 flex items-center gap-2">
              {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
              {typeof delta === "number" && <Delta value={delta} />}
            </div>
          </div>
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${toneClass}`}>
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function IndicadoresPage() {
  const { data: d } = useSuspenseQuery(indicadoresQuery);
  const today = new Date();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Indicadores</h1>
        <p className="text-sm text-muted-foreground">
          Métricas estratégicas do Mercado JC — top produtos, sazonalidade, clientes e comparativos.
        </p>
      </div>

      {/* KPIs principais */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={CalendarDays}
          label="Melhor dia da semana"
          value={d.bestWeekday?.dia ?? "—"}
          hint={`${nfmt(d.bestWeekday?.transacoes ?? 0)} transações`}
          tone="primary"
        />
        <Kpi
          icon={Clock}
          label="Horário de pico"
          value={d.bestHour?.hora ?? "—"}
          hint={`${nfmt(d.bestHour?.transacoes ?? 0)} vendas`}
          tone="info"
        />
        <Kpi
          icon={Ticket}
          label="Ticket médio (30d)"
          value={brl(d.avgTicket30)}
          hint={`Histórico: ${brl(d.avgTicketAll)}`}
          tone="success"
        />
        <Kpi
          icon={Trophy}
          label="Mês recorde"
          value={d.bestMonth?.label ?? "—"}
          hint={`${nfmt(d.bestMonth?.transacoes ?? 0)} vendas • ${brl(d.bestMonth?.faturamento ?? 0)}`}
          tone="warning"
        />
      </div>

      <Tabs defaultValue="produtos" className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto justify-start">
          <TabsTrigger value="produtos">Top Produtos</TabsTrigger>
          <TabsTrigger value="sazonalidade">Sazonalidade</TabsTrigger>
          <TabsTrigger value="comparativo">Comparativos</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="alertas">Alertas</TabsTrigger>
        </TabsList>

        {/* ============ TOP PRODUTOS ============ */}
        <TabsContent value="produtos" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShoppingBag className="size-4 text-primary" /> Top 10 — mais vendidos (quantidade)</CardTitle>
                <CardDescription>Unidades vendidas nos últimos 24 meses</CardDescription>
              </CardHeader>
              <CardContent>
                {d.topProdutosQty.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem vendas registradas ainda.</p>
                ) : (
                  <ol className="space-y-2">
                    {d.topProdutosQty.map((p, i) => (
                      <li key={i} className="flex items-center gap-3 rounded-lg border p-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                          {i + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{brl(p.total)}</p>
                        </div>
                        <Badge variant="secondary" className="shrink-0">{nfmt(p.qty)} {p.unit}</Badge>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Trophy className="size-4 text-warning" /> Top 10 — maior faturamento</CardTitle>
                <CardDescription>Produtos que mais geraram receita</CardDescription>
              </CardHeader>
              <CardContent>
                {d.topProdutosFat.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem vendas registradas ainda.</p>
                ) : (
                  <ol className="space-y-2">
                    {d.topProdutosFat.map((p, i) => (
                      <li key={i} className="flex items-center gap-3 rounded-lg border p-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning font-bold text-sm">
                          {i + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{nfmt(p.qty)} {p.unit}</p>
                        </div>
                        <Badge className="shrink-0 bg-success text-success-foreground">{brl(p.total)}</Badge>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============ SAZONALIDADE ============ */}
        <TabsContent value="sazonalidade" className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Transações por dia da semana</CardTitle>
              <CardDescription>Distribuição do fluxo de vendas</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.weekday}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="dia" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                    formatter={(v: number, n) => (n === "faturamento" ? brl(v) : nfmt(v))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="transacoes" fill="var(--color-primary)" radius={[6, 6, 0, 0]} name="Transações" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Distribuição por hora do dia</CardTitle>
              <CardDescription>Identifique horários de pico</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="hora" stroke="var(--color-muted-foreground)" fontSize={10} interval={1} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                    formatter={(v: number) => nfmt(v)}
                  />
                  <Bar dataKey="transacoes" fill="var(--color-info)" radius={[4, 4, 0, 0]} name="Transações" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Evolução mensal (últimos 12 meses)</CardTitle>
              <CardDescription>Transações — mês atual vs. mesmo mês do ano anterior</CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.last12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                    formatter={(v: number) => nfmt(v)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="atual" stroke="var(--color-primary)" strokeWidth={2} name="Este ano" dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="anterior" stroke="var(--color-muted-foreground)" strokeWidth={2} strokeDasharray="5 5" name="Ano anterior" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ COMPARATIVOS ============ */}
        <TabsContent value="comparativo" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-sm">Mês atual</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{brl(d.compareCurr.total)}</p>
                <p className="text-xs text-muted-foreground mt-1">{nfmt(d.compareCurr.count)} transações</p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  Mês passado <Delta value={d.pctVsPrev} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{brl(d.comparePrev.total)}</p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                  {nfmt(d.comparePrev.count)} transações <Delta value={d.pctCountVsPrev} />
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  Ano anterior <Delta value={d.pctVsYear} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{brl(d.compareYearAgo.total)}</p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                  {nfmt(d.compareYearAgo.count)} transações <Delta value={d.pctCountVsYear} />
                </p>
              </CardContent>
            </Card>
          </div>

          {d.compareYearAgo.count === 0 && d.comparePrev.count === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Ainda não há histórico suficiente para comparativos ricos. Os dados vão se acumular conforme as vendas forem registradas.
              </CardContent>
            </Card>
          )}

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Faturamento mensal</CardTitle>
              <CardDescription>Últimos meses com movimento</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {d.monthsSorted.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.monthsSorted}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip
                      contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                      formatter={(v: number) => brl(v)}
                    />
                    <Bar dataKey="faturamento" fill="var(--color-primary)" radius={[6, 6, 0, 0]} name="Faturamento" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ CLIENTES ============ */}
        <TabsContent value="clientes" className="space-y-4">
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Users} label="Base total" value={nfmt(d.totalCustomers)} tone="primary" />
            <Kpi icon={Users} label="Novos (30d)" value={nfmt(d.newCustomers30d)} tone="success" />
            <Kpi icon={ShoppingBag} label="Compradores (30d)" value={nfmt(d.uniqueBuyers30d)} tone="info" />
            <Kpi icon={Package} label="Produtos ativos" value={nfmt(d.productsActive)} tone="warning" />
          </div>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Top 10 clientes por faturamento</CardTitle>
              <CardDescription>Clientes identificados nas vendas</CardDescription>
            </CardHeader>
            <CardContent>
              {d.topCustomers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma venda vinculada a cliente ainda.</p>
              ) : (
                <ol className="space-y-2">
                  {d.topCustomers.map((c, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{nfmt(c.count)} compra(s)</p>
                      </div>
                      <Badge className="shrink-0 bg-success text-success-foreground">{brl(c.total)}</Badge>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ ALERTAS ============ */}
        <TabsContent value="alertas" className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-warning" /> Vencimentos próximos (60 dias)
              </CardTitle>
              <CardDescription>Produtos com data de validade se aproximando</CardDescription>
            </CardHeader>
            <CardContent>
              {d.expiring.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum produto com vencimento próximo. 🎉</p>
              ) : (
                <div className="divide-y">
                  {d.expiring.map((p) => {
                    const days = Math.ceil((new Date(p.expiry_date!).getTime() - today.getTime()) / 864e5);
                    const tone = days < 0 ? "destructive" : days <= 15 ? "warning" : "info";
                    const toneClass = {
                      destructive: "bg-destructive/15 text-destructive",
                      warning: "bg-warning/15 text-warning",
                      info: "bg-info/15 text-info",
                    }[tone];
                    return (
                      <div key={p.id} className="flex items-center justify-between py-3 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
                            <Package className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Vence em {dateFmt(p.expiry_date)} • Estoque: {nfmt(Number(p.stock))} {p.unit}
                            </p>
                          </div>
                        </div>
                        <Badge variant={days < 0 ? "destructive" : "secondary"} className="shrink-0">
                          {days < 0 ? `Vencido há ${Math.abs(days)}d` : `${days} dias`}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardContent className="p-4 text-xs text-muted-foreground">
              Cadastre a data de validade nos produtos em{" "}
              <Link to="/produtos" className="text-primary underline">Produtos</Link>
              {" "}para receber alertas automáticos aqui.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
